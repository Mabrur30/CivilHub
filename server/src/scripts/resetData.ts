import "dotenv/config";
import dns from "dns";
import readline from "readline/promises";
import mongoose from "mongoose";
import cloudinary from "../config/cloudinary";

/**
 * Wipes every CivilHub record: drops the MongoDB database and deletes all
 * Cloudinary uploads under the civilhub/ prefix. Permanent.
 *
 *   npm run db:reset             asks you to type the database name first
 *   npm run db:reset -- --dry-run  only prints what would be removed
 *   npm run db:reset -- --yes      skips the confirmation prompt
 */

const CLOUDINARY_ROOT = "civilhub";
const RESOURCE_TYPES = ["image", "raw", "video"] as const;

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const skipPrompt = args.has("--yes");

try {
  dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);
} catch {
  // Same fallback as config/db.ts; ignore if custom DNS isn't permitted
}

const hasCloudinary = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET,
);

const countCloudinaryAssets = async (
  resourceType: (typeof RESOURCE_TYPES)[number],
): Promise<number> => {
  let total = 0;
  let nextCursor: string | undefined;
  do {
    const page = await cloudinary.api.resources({
      type: "upload",
      prefix: `${CLOUDINARY_ROOT}/`,
      resource_type: resourceType,
      max_results: 500,
      next_cursor: nextCursor,
    });
    total += page.resources.length;
    nextCursor = page.next_cursor;
  } while (nextCursor);
  return total;
};

const deleteCloudinaryAssets = async (
  resourceType: (typeof RESOURCE_TYPES)[number],
): Promise<number> => {
  let deleted = 0;
  let partial = true;
  while (partial) {
    const result = await cloudinary.api.delete_resources_by_prefix(
      `${CLOUDINARY_ROOT}/`,
      { resource_type: resourceType },
    );
    deleted += Object.keys(result.deleted ?? {}).length;
    partial = Boolean(result.partial);
  }
  return deleted;
};

/** Folder paths under root, deepest first, so each is empty when deleted. */
const listFoldersDeepestFirst = async (root: string): Promise<string[]> => {
  const { folders } = await cloudinary.api.sub_folders(root);
  const nested: string[] = [];
  for (const folder of folders as { path: string }[]) {
    nested.push(...(await listFoldersDeepestFirst(folder.path)));
  }
  return [...nested, root];
};

const deleteCloudinaryFolders = async (): Promise<void> => {
  let folders: string[];
  try {
    folders = await listFoldersDeepestFirst(CLOUDINARY_ROOT);
  } catch {
    return; // Root folder doesn't exist, so there's nothing to tidy up
  }
  for (const folder of folders) {
    try {
      await cloudinary.api.delete_folder(folder);
    } catch (error) {
      console.warn(`  Could not delete folder "${folder}":`, error);
    }
  }
};

const run = async (): Promise<void> => {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI is not defined in environment variables.");
  }

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db!;
  const dbName = db.databaseName;

  console.log(`\nMongoDB:    ${mongoose.connection.host} / ${dbName}`);
  const collections = await db.listCollections().toArray();
  let totalDocs = 0;
  for (const { name } of collections) {
    const count = await db.collection(name).countDocuments();
    totalDocs += count;
    console.log(`  ${name.padEnd(24)} ${count}`);
  }
  console.log(`  ${collections.length} collections, ${totalDocs} documents`);

  const assetCounts: Record<string, number> = {};
  if (hasCloudinary) {
    console.log(
      `\nCloudinary: ${process.env.CLOUDINARY_CLOUD_NAME} / ${CLOUDINARY_ROOT}/`,
    );
    for (const type of RESOURCE_TYPES) {
      assetCounts[type] = await countCloudinaryAssets(type);
      console.log(`  ${type.padEnd(24)} ${assetCounts[type]}`);
    }
  } else {
    console.log("\nCloudinary: not configured, skipping");
  }

  if (dryRun) {
    console.log("\nDry run, nothing was deleted.");
    return;
  }

  if (!skipPrompt) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const answer = await rl.question(
      `\nThis permanently deletes everything above. Type "${dbName}" to continue: `,
    );
    rl.close();
    if (answer.trim() !== dbName) {
      console.log("Name didn't match, nothing was deleted.");
      return;
    }
  }

  await mongoose.connection.dropDatabase();
  console.log(
    `\nDropped "${dbName}": ${collections.length} collections, ${totalDocs} documents.`,
  );

  if (hasCloudinary) {
    for (const type of RESOURCE_TYPES) {
      const deleted = await deleteCloudinaryAssets(type);
      console.log(`Deleted ${deleted} Cloudinary ${type} assets.`);
    }
    await deleteCloudinaryFolders();
  }

  console.log("\nDone. Restart the server to rebuild indexes.");
};

run()
  .catch((error) => {
    console.error("\nReset failed:", error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
