import { type UploadApiOptions, type UploadApiResponse } from "cloudinary";
import cloudinary from "../config/cloudinary";

/** Streams an in-memory upload (from multer) to Cloudinary. */
export const uploadBuffer = (
  buffer: Buffer,
  options: UploadApiOptions,
): Promise<UploadApiResponse> =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      options,
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        if (!result) {
          reject(new Error("Cloudinary did not return an upload result"));
          return;
        }
        resolve(result);
      },
    );
    stream.end(buffer);
  });

/**
 * For images anyone can see: Cloudinary stores them re-encoded and upright,
 * and re-encoding drops embedded metadata such as the GPS position of the
 * phone that took the photo. (Evidence facts are read before upload; see
 * factsForUpload.)
 */
export const STRIP_IMAGE_METADATA: Pick<UploadApiOptions, "transformation"> = {
  transformation: [{ angle: "exif", quality: "auto:best" }],
};

/**
 * Uploads every item or none: if one upload fails, the ones that already
 * succeeded are deleted again, so a failed request leaves nothing behind.
 */
export const uploadAllOrNone = async <Item, Uploaded>(
  items: readonly Item[],
  upload: (item: Item) => Promise<Uploaded>,
  discard: (uploaded: Uploaded) => Promise<unknown>,
): Promise<Uploaded[]> => {
  const results = await Promise.allSettled(items.map(upload));
  const failure = results.find((result) => result.status === "rejected");
  if (!failure) {
    return results.map((result) => (result as PromiseFulfilledResult<Uploaded>).value);
  }
  await Promise.allSettled(
    results.flatMap((result) => (result.status === "fulfilled" ? [discard(result.value)] : [])),
  );
  throw (failure as PromiseRejectedResult).reason;
};

export const deleteCloudinaryAsset = async (
  publicId: string,
  resourceType: "image" | "raw",
): Promise<void> => {
  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
};

/**
 * Private files (verification documents) are uploaded with
 * `type: "authenticated"`: they have no public URL, and can only be fetched
 * through a signed link like this one, which stops working after `seconds`.
 */
export const privateDownloadUrl = (
  publicId: string,
  resourceType: "image" | "raw",
  format: string,
  seconds = 600,
): string =>
  cloudinary.utils.private_download_url(publicId, resourceType === "raw" ? "" : format, {
    resource_type: resourceType,
    type: "authenticated",
    expires_at: Math.floor(Date.now() / 1000) + seconds,
  });

export const deletePrivateAsset = async (
  publicId: string,
  resourceType: "image" | "raw",
): Promise<void> => {
  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, type: "authenticated" });
};
