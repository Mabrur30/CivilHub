import exifr from "exifr";
import { Schema, Types } from "mongoose";

/**
 * What CivilHub knows about a file offered as evidence: who uploaded it and
 * when, and for photos, when and where the camera says it was taken.
 * Camera data is a hint, not proof. Many apps strip it, and it can be edited,
 * so admins see it next to the photo with plain-language flags.
 */

export interface GeoPosition {
  lat: number;
  lng: number;
}

export interface EvidenceFacts {
  /** Null for files uploaded before CivilHub recorded it, and for admins' files. */
  uploadedBy?: Types.ObjectId | null;
  uploadedAt?: Date | null;
  /** When the camera says the photo was taken; null when it doesn't say. */
  takenAt?: Date | null;
  location?: GeoPosition | null;
  /** e.g. "samsung SM-A546E". */
  camera?: string | null;
}

/** Schema fields for EvidenceFacts, spread into each file schema that keeps them. */
export const evidenceFactFields = {
  uploadedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  uploadedAt: { type: Date, default: null },
  takenAt: { type: Date, default: null },
  location: {
    type: new Schema<GeoPosition>(
      { lat: { type: Number, required: true }, lng: { type: Number, required: true } },
      { _id: false },
    ),
    default: null,
  },
  camera: { type: String, trim: true, maxlength: 120, default: null },
};

/** Photos taken in Bangladesh; camera times without an offset are read as Dhaka time. */
const DEFAULT_OFFSET = "+06:00";

const EXIF_DATE = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/;
const OFFSET = /^([+-])(\d{2}):?(\d{2})$/;

/** "2026:09:30 14:22:01" with "+06:00" → the instant it names. */
export const parseExifDate = (value: unknown, offset: unknown): Date | null => {
  const match = typeof value === "string" ? EXIF_DATE.exec(value.trim()) : null;
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match.map(Number);
  const zone = OFFSET.exec(typeof offset === "string" ? offset.trim() : DEFAULT_OFFSET) ?? OFFSET.exec(DEFAULT_OFFSET)!;
  const offsetMinutes = (zone[1] === "-" ? -1 : 1) * (Number(zone[2]) * 60 + Number(zone[3]));
  const utc = Date.UTC(year, month - 1, day, hour, minute, second) - offsetMinutes * 60_000;
  const date = new Date(utc);
  // Cameras with an unset clock write 0000:00:00 or 1970.
  return Number.isNaN(date.getTime()) || year < 1990 ? null : date;
};

const EMPTY: Required<Pick<EvidenceFacts, "takenAt" | "location" | "camera">> = {
  takenAt: null,
  location: null,
  camera: null,
};

/** Reads a photo's camera data. Anything unreadable, or not a photo, gives nulls. */
export const readPhotoFacts = async (
  buffer: Buffer,
  mimeType: string,
): Promise<Required<Pick<EvidenceFacts, "takenAt" | "location" | "camera">>> => {
  if (!mimeType.toLowerCase().startsWith("image/")) return { ...EMPTY };
  try {
    const tags = (await exifr.parse(buffer, {
      tiff: true,
      exif: true,
      gps: true,
      reviveValues: false,
      translateValues: false,
    })) as Record<string, unknown> | undefined;
    if (!tags) return { ...EMPTY };
    const takenAt =
      parseExifDate(tags.DateTimeOriginal, tags.OffsetTimeOriginal) ??
      parseExifDate(tags.CreateDate, tags.OffsetTimeDigitized) ??
      null;
    const gps = await exifr.gps(buffer).catch(() => undefined);
    const location =
      gps && Number.isFinite(gps.latitude) && Number.isFinite(gps.longitude) && !(gps.latitude === 0 && gps.longitude === 0)
        ? { lat: Math.round(gps.latitude * 1e6) / 1e6, lng: Math.round(gps.longitude * 1e6) / 1e6 }
        : null;
    const camera =
      [tags.Make, tags.Model]
        .filter((part): part is string => typeof part === "string" && part.trim() !== "")
        .map((part) => part.trim())
        .join(" ")
        .slice(0, 120) || null;
    return { takenAt, location, camera };
  } catch {
    return { ...EMPTY };
  }
};

/** Everything to store with a file a user uploads now. */
export const factsForUpload = async (
  file: { buffer: Buffer; mimetype: string },
  uploadedBy: Types.ObjectId | string | null,
  uploadedAt: Date = new Date(),
): Promise<EvidenceFacts> => ({
  uploadedBy: uploadedBy ? new Types.ObjectId(uploadedBy.toString()) : null,
  uploadedAt,
  ...(await readPhotoFacts(file.buffer, file.mimetype)),
});

// ---------------------------------------------------------------- flags

export interface EvidenceContext {
  /** Photos taken before these moments are suspect, e.g. before the rental began. */
  notBefore?: Array<{ at: Date; flag: string }>;
  /** Where the work was; photos taken far from it are flagged. */
  site?: GeoPosition | null;
  siteLabel?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Clock drift and time zones: a day either way isn't worth flagging. */
const GRACE_MS = DAY_MS;
const UPLOAD_LAG_DAYS = 2;
const FAR_KM = 2;

const distanceKm = (a: GeoPosition, b: GeoPosition): number => {
  const toRad = (degrees: number): number => (degrees * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

/**
 * Plain-language warnings about a file, for admins weighing it. Only photos
 * get camera checks; documents are judged on what they say.
 */
export const evidenceFlags = (
  file: EvidenceFacts & { resourceType?: string; mimeType?: string },
  context: EvidenceContext = {},
): string[] => {
  const isPhoto = file.resourceType ? file.resourceType === "image" : (file.mimeType ?? "").startsWith("image/");
  if (!file.uploadedAt) return ["Uploaded before CivilHub recorded who uploaded files and camera data."];
  if (!isPhoto) return [];
  if (!file.takenAt) return ["No camera data. Many apps remove it, so this is a hint, not proof."];
  const flags: string[] = [];
  for (const check of context.notBefore ?? []) {
    if (file.takenAt.getTime() < check.at.getTime() - GRACE_MS) flags.push(check.flag);
  }
  const lagDays = Math.floor((file.uploadedAt.getTime() - file.takenAt.getTime()) / DAY_MS);
  if (lagDays > UPLOAD_LAG_DAYS) flags.push(`Taken ${lagDays} days before it was uploaded.`);
  if (context.site && file.location) {
    const km = distanceKm(context.site, file.location);
    if (km > FAR_KM) flags.push(`Taken ${km < 10 ? km.toFixed(1) : Math.round(km)} km from ${context.siteLabel ?? "the site"}.`);
  }
  return flags;
};

/** What an admin sees about a file next to it: the camera facts and the warnings. */
export const evidenceView = (
  file: EvidenceFacts & { resourceType?: string; mimeType?: string },
  context: EvidenceContext,
) => ({
  uploadedAt: file.uploadedAt?.toISOString() ?? null,
  takenAt: file.takenAt?.toISOString() ?? null,
  location: file.location ? { lat: file.location.lat, lng: file.location.lng } : null,
  camera: file.camera ?? null,
  flags: evidenceFlags(file, context),
});
