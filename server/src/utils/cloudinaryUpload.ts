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

export const deleteCloudinaryAsset = async (
  publicId: string,
  resourceType: "image" | "raw",
): Promise<void> => {
  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
};
