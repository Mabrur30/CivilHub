/**
 * The smallest bytes that pass the upload content check for each type: the
 * real file signature followed by filler. Enough for tests; not a real file.
 */
const SIGNATURES: Record<string, number[]> = {
  "image/jpeg": [0xff, 0xd8, 0xff, 0xe0],
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  "image/webp": [...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")],
  "application/pdf": [...Buffer.from("%PDF-1.4\n")],
  "application/msword": [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1],
  "application/vnd.ms-excel": [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [0x50, 0x4b, 0x03, 0x04],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [0x50, 0x4b, 0x03, 0x04],
  "audio/webm": [0x1a, 0x45, 0xdf, 0xa3],
  "audio/ogg": [...Buffer.from("OggS")],
  "audio/mp4": [0, 0, 0, 0x20, ...Buffer.from("ftypM4A ")],
  "audio/mpeg": [...Buffer.from("ID3")],
};

/** Bytes that look like `mimeType` to the upload check. Text types are plain text. */
export const fakeFile = (mimeType: string, filler = "test file body"): Buffer => {
  const base = mimeType.split(";")[0].trim().toLowerCase();
  const signature = SIGNATURES[base];
  return signature ? Buffer.concat([Buffer.from(signature), Buffer.from(filler)]) : Buffer.from(filler);
};
