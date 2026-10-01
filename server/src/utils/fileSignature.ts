/**
 * Checks that an upload's bytes match the type it claims. The declared type
 * comes from the uploader's browser and can say anything; the first bytes of
 * the file can't be faked without also breaking the file.
 */

const startsWith = (buffer: Buffer, bytes: number[], offset = 0): boolean =>
  buffer.length >= offset + bytes.length && bytes.every((byte, index) => buffer[offset + index] === byte);

const ascii = (text: string): number[] => [...text].map((char) => char.charCodeAt(0));

const isJpeg = (buffer: Buffer): boolean => startsWith(buffer, [0xff, 0xd8, 0xff]);
const isPng = (buffer: Buffer): boolean => startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const isWebp = (buffer: Buffer): boolean => startsWith(buffer, ascii("RIFF")) && startsWith(buffer, ascii("WEBP"), 8);
const isPdf = (buffer: Buffer): boolean => startsWith(buffer, ascii("%PDF-"));
/** .docx and .xlsx are ZIP archives. */
const isZip = (buffer: Buffer): boolean => startsWith(buffer, [0x50, 0x4b, 0x03, 0x04]);
/** Older .doc and .xls are OLE compound files. */
const isOle = (buffer: Buffer): boolean => startsWith(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const isWebm = (buffer: Buffer): boolean => startsWith(buffer, [0x1a, 0x45, 0xdf, 0xa3]);
const isOgg = (buffer: Buffer): boolean => startsWith(buffer, ascii("OggS"));
const isMp4 = (buffer: Buffer): boolean => startsWith(buffer, ascii("ftyp"), 4);
const isMp3 = (buffer: Buffer): boolean =>
  startsWith(buffer, ascii("ID3")) || (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);

/** Plain text and CSV: valid UTF-8 with no NUL bytes (a binary file renamed .txt fails). */
const isText = (buffer: Buffer): boolean => {
  if (buffer.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
};

const CHECKS: Record<string, (buffer: Buffer) => boolean> = {
  "image/jpeg": isJpeg,
  "image/png": isPng,
  "image/webp": isWebp,
  "application/pdf": isPdf,
  "application/msword": isOle,
  "application/vnd.ms-excel": isOle,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": isZip,
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": isZip,
  "text/plain": isText,
  "text/csv": isText,
  "audio/webm": isWebm,
  "audio/ogg": isOgg,
  "audio/mp4": isMp4,
  "audio/mpeg": isMp3,
};

/** True when the bytes look like `mimeType`. Unknown types are refused. */
export const matchesDeclaredType = (buffer: Buffer, mimeType: string): boolean => {
  const check = CHECKS[mimeType.split(";")[0].trim().toLowerCase()];
  return check ? check(buffer) : false;
};

/** "a JPEG image", for error messages. */
export const describeType = (mimeType: string): string => {
  const base = mimeType.split(";")[0].trim().toLowerCase();
  if (base.startsWith("image/")) return "an image";
  if (base === "application/pdf") return "a PDF";
  if (base.startsWith("audio/")) return "a voice message";
  if (base.startsWith("text/")) return "a text file";
  return "a document";
};
