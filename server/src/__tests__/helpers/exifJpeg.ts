/**
 * Builds a tiny JPEG carrying EXIF camera data, so evidence checks can be
 * tested without binary fixtures. Only the metadata is real; there's no image.
 */

interface Entry {
  tag: number;
  type: number;
  count: number;
  data: Buffer;
}

const ASCII = 2;
const LONG = 4;
const RATIONAL = 5;

const ascii = (tag: number, text: string): Entry => {
  const data = Buffer.from(`${text}\0`, "ascii");
  return { tag, type: ASCII, count: data.length, data };
};

const long = (tag: number, value: number): Entry => {
  const data = Buffer.alloc(4);
  data.writeUInt32LE(value);
  return { tag, type: LONG, count: 1, data };
};

const rationals = (tag: number, values: Array<[number, number]>): Entry => {
  const data = Buffer.alloc(values.length * 8);
  values.forEach(([numerator, denominator], index) => {
    data.writeUInt32LE(numerator, index * 8);
    data.writeUInt32LE(denominator, index * 8 + 4);
  });
  return { tag, type: RATIONAL, count: values.length, data };
};

const ifdSize = (entries: Entry[]): number =>
  2 + entries.length * 12 + 4 + entries.reduce((sum, entry) => sum + (entry.data.length > 4 ? entry.data.length : 0), 0);

/** Writes an IFD that starts at `start` (an offset into the TIFF block). */
const writeIfd = (entries: Entry[], start: number): Buffer => {
  const sorted = [...entries].sort((a, b) => a.tag - b.tag);
  const table = Buffer.alloc(2 + sorted.length * 12 + 4);
  table.writeUInt16LE(sorted.length, 0);
  let dataOffset = start + table.length;
  const extra: Buffer[] = [];
  sorted.forEach((entry, index) => {
    const at = 2 + index * 12;
    table.writeUInt16LE(entry.tag, at);
    table.writeUInt16LE(entry.type, at + 2);
    table.writeUInt32LE(entry.count, at + 4);
    if (entry.data.length <= 4) {
      entry.data.copy(table, at + 8);
    } else {
      table.writeUInt32LE(dataOffset, at + 8);
      extra.push(entry.data);
      dataOffset += entry.data.length;
    }
  });
  return Buffer.concat([table, ...extra]);
};

const toDms = (value: number): Array<[number, number]> => {
  const absolute = Math.abs(value);
  const degrees = Math.floor(absolute);
  const minutes = Math.floor((absolute - degrees) * 60);
  const seconds = Math.round(((absolute - degrees) * 60 - minutes) * 60 * 1000);
  return [
    [degrees, 1],
    [minutes, 1],
    [seconds, 1000],
  ];
};

export interface ExifOptions {
  /** As the camera writes it: "2026:09:30 14:22:01". */
  takenAt?: string;
  offset?: string;
  lat?: number;
  lng?: number;
  make?: string;
  model?: string;
}

export const jpegWithExif = (options: ExifOptions): Buffer => {
  const exifEntries: Entry[] = [];
  if (options.takenAt) exifEntries.push(ascii(0x9003, options.takenAt));
  if (options.offset) exifEntries.push(ascii(0x9011, options.offset));
  const gpsEntries: Entry[] =
    options.lat !== undefined && options.lng !== undefined
      ? [
          ascii(0x0001, options.lat >= 0 ? "N" : "S"),
          rationals(0x0002, toDms(options.lat)),
          ascii(0x0003, options.lng >= 0 ? "E" : "W"),
          rationals(0x0004, toDms(options.lng)),
        ]
      : [];

  const ifd0Base: Entry[] = [];
  if (options.make) ifd0Base.push(ascii(0x010f, options.make));
  if (options.model) ifd0Base.push(ascii(0x0110, options.model));
  // Pointers are filled in once the IFD sizes are known.
  const pointerCount = (exifEntries.length ? 1 : 0) + (gpsEntries.length ? 1 : 0);
  const ifd0Start = 8;
  const ifd0Length = ifdSize(ifd0Base) + pointerCount * 12;
  const exifStart = ifd0Start + ifd0Length;
  const gpsStart = exifStart + (exifEntries.length ? ifdSize(exifEntries) : 0);
  const ifd0 = [
    ...ifd0Base,
    ...(exifEntries.length ? [long(0x8769, exifStart)] : []),
    ...(gpsEntries.length ? [long(0x8825, gpsStart)] : []),
  ];

  const header = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]);
  const tiff = Buffer.concat([
    header,
    writeIfd(ifd0, ifd0Start),
    ...(exifEntries.length ? [writeIfd(exifEntries, exifStart)] : []),
    ...(gpsEntries.length ? [writeIfd(gpsEntries, gpsStart)] : []),
  ]);
  const app1Body = Buffer.concat([Buffer.from("Exif\0\0", "binary"), tiff]);
  const app1Length = Buffer.alloc(2);
  app1Length.writeUInt16BE(app1Body.length + 2);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe1]),
    app1Length,
    app1Body,
    Buffer.from([0xff, 0xd9]),
  ]);
};
