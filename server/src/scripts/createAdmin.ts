import "dotenv/config";
import bcrypt from "bcryptjs";
import dns from "dns";
import mongoose from "mongoose";
import { Admin } from "../models/Admin.model";

/**
 * The only way to make or disable an admin account. There is no signup for
 * admins, on purpose.
 *
 *   npm run admin:create -- --email you@civilhub.com --name "Your Name"
 *       asks for a password (typed twice, not shown), then creates the admin,
 *       or resets the password and re-enables an existing one.
 *   npm run admin:create -- --email you@civilhub.com --disable
 *       signs that admin out everywhere and blocks further sign-ins.
 */

const MIN_PASSWORD_LENGTH = 12;

try {
  dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]);
} catch {
  // Keep the system resolver if these can't be set.
}

const argValue = (flag: string): string | undefined => {
  const index = process.argv.indexOf(flag);
  const value = index === -1 ? undefined : process.argv[index + 1];
  return value && !value.startsWith("--") ? value : undefined;
};

/** Reads a line from the terminal without echoing it. */
const askHidden = (prompt: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      reject(new Error("Run this in a terminal so the password can be typed privately."));
      return;
    }
    process.stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const onData = (char: string): void => {
      if (char === "\r" || char === "\n") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off("data", onData);
        process.stdout.write("\n");
        resolve(value);
      } else if (char === "\u0003") {
        process.stdout.write("\n");
        process.exit(130);
      } else if (char === "\u007f" || char === "\b") {
        value = value.slice(0, -1);
      } else {
        value += char;
      }
    };
    stdin.on("data", onData);
  });

const run = async (): Promise<void> => {
  const email = argValue("--email")?.trim().toLowerCase();
  const name = argValue("--name")?.trim();
  const disable = process.argv.includes("--disable");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Pass the admin\'s email: --email you@civilhub.com');
  }

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error("MONGODB_URI is not defined in environment variables.");
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 15000 });
  await Admin.syncIndexes();

  const existing = await Admin.findOne({ email }).exec();

  if (disable) {
    if (!existing) throw new Error(`No admin with the email ${email}.`);
    existing.isActive = false;
    await existing.save();
    console.log(`Disabled ${email}. Their session ends on their next request.`);
    return;
  }

  if (!existing && !name) {
    throw new Error('A new admin needs a name: --name "Your Name"');
  }

  const password = await askHidden("Password: ");
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if ((await askHidden("Type it again: ")) !== password) {
    throw new Error("The two passwords don't match.");
  }
  const passwordHash = await bcrypt.hash(password, 12);

  if (existing) {
    existing.passwordHash = passwordHash;
    existing.isActive = true;
    if (name) existing.name = name;
    await existing.save();
    console.log(`Updated ${email}: new password set, account enabled.`);
  } else {
    await Admin.create({ name, email, passwordHash, isActive: true });
    console.log(`Created admin ${name} <${email}>.`);
  }
};

run()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
