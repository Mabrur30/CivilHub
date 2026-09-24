// Mirrors the server limits in server/src/middleware/upload.middleware.ts.
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const AUDIO_MAX_SECONDS = 5 * 60;

export const ATTACHMENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
];

export const ATTACHMENT_ACCEPT = [
  ...ATTACHMENT_TYPES,
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".txt",
  ".csv",
].join(",");

export type MessageType = "text" | "file" | "audio";

export interface MessageAttachment {
  url: string;
  name: string;
  mimeType: string;
  size: number | null;
  durationSeconds: number | null;
}

export const isMessageAttachment = (
  value: unknown,
): value is MessageAttachment => {
  if (typeof value !== "object" || value === null) return false;
  const attachment = value as Record<string, unknown>;
  return (
    typeof attachment.url === "string" &&
    typeof attachment.name === "string" &&
    typeof attachment.mimeType === "string" &&
    (typeof attachment.size === "number" || attachment.size === null) &&
    (typeof attachment.durationSeconds === "number" ||
      attachment.durationSeconds === null)
  );
};

export const validateAttachmentFile = (file: File): string => {
  if (!ATTACHMENT_TYPES.includes(file.type)) {
    return "Only images, PDF, Word, Excel, TXT and CSV files can be attached.";
  }
  if (file.size > ATTACHMENT_MAX_BYTES) {
    return "Attachments must be 10 MB or smaller.";
  }
  return "";
};

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const formatDuration = (totalSeconds: number): string => {
  const seconds = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

export const getFileExtensionLabel = (name: string, mimeType: string) => {
  const extension = name.includes(".") ? name.split(".").pop() : "";
  if (extension) return extension.toUpperCase();
  return mimeType.split("/").pop()?.toUpperCase() ?? "FILE";
};

export interface UploadResult {
  ok: boolean;
  status: number;
  body: unknown;
}

// fetch cannot report upload progress, so attachment sends use XHR.
export const postFormWithProgress = (
  url: string,
  formData: FormData,
  onProgress: (fraction: number) => void,
): Promise<UploadResult> =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = null;
      }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, body });
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(formData);
  });
