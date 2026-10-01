import multer from "multer";
import { type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { describeType, matchesDeclaredType } from "../utils/fileSignature";

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

/** Every file multer kept on the request, however the route collected them. */
const uploadedFiles = (req: Request): Express.Multer.File[] => {
  if (req.file) return [req.file];
  if (Array.isArray(req.files)) return req.files;
  return req.files ? Object.values(req.files).flat() : [];
};

/**
 * After multer: each file's bytes must match the type its browser declared,
 * so a program renamed to photo.jpg is refused before it's stored anywhere.
 */
const verifyUploadContents: RequestHandler = (req, _res, next) => {
  const mismatch = uploadedFiles(req).find((file) => !matchesDeclaredType(file.buffer, file.mimetype));
  next(
    mismatch
      ? createUploadError(`${mismatch.originalname || "That file"} doesn't look like ${describeType(mismatch.mimetype)}. Check the file and try again.`)
      : undefined,
  );
};

/**
 * Like a multer instance, but each of .single/.array/.fields also checks the
 * files' contents (verifyUploadContents). Routes use them exactly as before.
 */
const createUploader = (allowedTypes: string[], fileSize: number) => {
  const upload = multer({
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
  return {
    single: (field: string): RequestHandler[] => [upload.single(field), verifyUploadContents],
    array: (field: string, maxCount?: number): RequestHandler[] => [upload.array(field, maxCount), verifyUploadContents],
    fields: (fields: multer.Field[]): RequestHandler[] => [upload.fields(fields), verifyUploadContents],
  };
};

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

// Files an engineer hands over with a phase: the same types as message
// attachments (photos, PDFs, documents, spreadsheets), without voice notes.
export const phaseDeliverableUpload = createUploader(
  messageAttachmentTypes,
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
        ? "The uploaded file is too large. Images must be 5MB or smaller; certificate PDFs, message attachments and phase deliverables must be 10MB or smaller."
        : error.code === "LIMIT_UNEXPECTED_FILE" || error.code === "LIMIT_FILE_COUNT"
          ? "Too many files were attached."
          : "The uploaded file could not be processed.";
    next(createUploadError(message));
    return;
  }
  next(error);
};
