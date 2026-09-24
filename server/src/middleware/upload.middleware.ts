import multer from "multer";
import { type NextFunction, type Request, type Response } from "express";

interface UploadError extends Error {
  statusCode: number;
}

const createUploadError = (message: string): UploadError => {
  const error = new Error(message) as UploadError;
  error.statusCode = 400;
  return error;
};

const imageTypes = ["image/jpeg", "image/png", "image/webp"];
const certificateTypes = [...imageTypes, "application/pdf"];
export const messageAttachmentTypes = [
  ...imageTypes,
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
];
export const messageAudioTypes = [
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
];

export const MESSAGE_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const MESSAGE_AUDIO_MAX_SECONDS = 5 * 60;

// Browsers append codec parameters to recorded audio (e.g. "audio/webm;codecs=opus").
const getBaseMimeType = (mimeType: string): string =>
  mimeType.split(";")[0].trim().toLowerCase();

const createUploader = (allowedTypes: string[], fileSize: number) =>
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize },
    fileFilter: (_req, file, callback) => {
      if (!allowedTypes.includes(getBaseMimeType(file.mimetype))) {
        callback(createUploadError("Unsupported file type."));
        return;
      }
      callback(null, true);
    },
  });

export const profilePhotoUpload = createUploader(imageTypes, 5 * 1024 * 1024);
export const certificateUpload = createUploader(
  certificateTypes,
  10 * 1024 * 1024,
);
export const portfolioUpload = createUploader(imageTypes, 5 * 1024 * 1024);
export const postImageUpload = createUploader(imageTypes, 5 * 1024 * 1024);
export const equipmentPhotoUpload = createUploader(imageTypes, 5 * 1024 * 1024);
export const bookingConditionPhotoUpload = createUploader(
  imageTypes,
  5 * 1024 * 1024,
);

export const messageAttachmentUpload = createUploader(
  [...messageAttachmentTypes, ...messageAudioTypes],
  MESSAGE_ATTACHMENT_MAX_BYTES,
);

export const handleUploadError = (
  error: unknown,
  _req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  if (error instanceof multer.MulterError) {
    const message =
      error.code === "LIMIT_FILE_SIZE"
        ? "The uploaded file is too large. Images must be 5MB or smaller; certificate PDFs and message attachments must be 10MB or smaller."
        : "The uploaded file could not be processed.";
    next(createUploadError(message));
    return;
  }
  next(error);
};
