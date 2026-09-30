import { evidenceFlags, parseExifDate, readPhotoFacts } from "../utils/evidence";
import { jpegWithExif } from "./helpers/exifJpeg";

describe("Reading a photo's camera data", () => {
  test("reads when, where and with what a photo was taken", async () => {
    const photo = jpegWithExif({
      takenAt: "2026:09:30 14:22:01",
      lat: 23.8103,
      lng: 90.4125,
      make: "samsung",
      model: "SM-A546E",
    });
    const facts = await readPhotoFacts(photo, "image/jpeg");
    // No offset recorded, so it's read as Dhaka time (UTC+6).
    expect(facts.takenAt?.toISOString()).toBe("2026-09-30T08:22:01.000Z");
    expect(facts.location?.lat).toBeCloseTo(23.8103, 3);
    expect(facts.location?.lng).toBeCloseTo(90.4125, 3);
    expect(facts.camera).toBe("samsung SM-A546E");
  });

  test("uses the offset the camera recorded", async () => {
    const facts = await readPhotoFacts(jpegWithExif({ takenAt: "2026:09:30 14:22:01", offset: "+00:00" }), "image/jpeg");
    expect(facts.takenAt?.toISOString()).toBe("2026-09-30T14:22:01.000Z");
    expect(facts.location).toBeNull();
  });

  test("anything else gives nothing, without failing", async () => {
    expect(await readPhotoFacts(Buffer.from("not a photo"), "image/jpeg")).toEqual({ takenAt: null, location: null, camera: null });
    expect(await readPhotoFacts(Buffer.from("%PDF-1.4"), "application/pdf")).toEqual({ takenAt: null, location: null, camera: null });
    expect(parseExifDate("0000:00:00 00:00:00", undefined)).toBeNull();
  });
});

describe("Warnings about evidence", () => {
  const uploadedAt = new Date("2026-09-30T10:00:00Z");
  const start = { at: new Date("2026-09-20T00:00:00Z"), flag: "Taken before the project started." };
  const site = { lat: 23.8103, lng: 90.4125 };

  test("a photo taken on site after work began raises nothing", () => {
    const flags = evidenceFlags(
      { uploadedAt, takenAt: new Date("2026-09-29T09:00:00Z"), location: { lat: 23.811, lng: 90.413 }, resourceType: "image" },
      { notBefore: [start], site },
    );
    expect(flags).toEqual([]);
  });

  test("old, far-away or unlabelled photos are flagged", () => {
    const flags = evidenceFlags(
      { uploadedAt, takenAt: new Date("2026-09-01T09:00:00Z"), location: { lat: 22.3569, lng: 91.7832 }, resourceType: "image" },
      { notBefore: [start], site, siteLabel: "the project site" },
    );
    expect(flags).toEqual([
      "Taken before the project started.",
      "Taken 29 days before it was uploaded.",
      expect.stringMatching(/^Taken \d+ km from the project site\.$/),
    ]);
    expect(evidenceFlags({ uploadedAt, takenAt: null, resourceType: "image" })).toEqual([
      "No camera data. Many apps remove it, so this is a hint, not proof.",
    ]);
    expect(evidenceFlags({ uploadedAt: null, resourceType: "image" })).toHaveLength(1);
    // Documents aren't photos; there's no camera to check.
    expect(evidenceFlags({ uploadedAt, takenAt: null, resourceType: "raw" })).toEqual([]);
  });
});
