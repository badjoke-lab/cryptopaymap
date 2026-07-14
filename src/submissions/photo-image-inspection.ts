import { z } from 'zod';

export const PHOTO_MAX_PIXEL_DIMENSION = 20_000;
export const PHOTO_MAX_PIXEL_COUNT = 100_000_000;

export const decodedPhotoImageSchema = z
  .object({
    mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']),
    width: z.number().int().positive().max(PHOTO_MAX_PIXEL_DIMENSION),
    height: z.number().int().positive().max(PHOTO_MAX_PIXEL_DIMENSION),
    animated: z.literal(false),
  })
  .strict()
  .superRefine((image, context) => {
    if (image.width * image.height > PHOTO_MAX_PIXEL_COUNT) {
      context.addIssue({
        code: 'custom',
        path: ['width'],
        message: 'Image pixel count exceeds the safe validation limit.',
      });
    }
  });

export type DecodedPhotoImage = z.infer<typeof decodedPhotoImageSchema>;

export class PhotoImageInspectionError extends Error {
  constructor(
    readonly code:
      | 'unsupported_format'
      | 'unsafe_file_type'
      | 'corrupt_file'
      | 'animated_media'
      | 'unsafe_dimensions',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'PhotoImageInspectionError';
  }
}

function ensureRange(bytes: Uint8Array, offset: number, length: number): void {
  if (!Number.isInteger(offset) || !Number.isInteger(length) || offset < 0 || length < 0) {
    throw new PhotoImageInspectionError('corrupt_file', 'Image structure contains an invalid range.');
  }
  if (offset + length > bytes.byteLength) {
    throw new PhotoImageInspectionError('corrupt_file', 'Image structure is truncated.');
  }
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  ensureRange(bytes, offset, length);
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function uint16Be(bytes: Uint8Array, offset: number): number {
  ensureRange(bytes, offset, 2);
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function uint16Le(bytes: Uint8Array, offset: number): number {
  ensureRange(bytes, offset, 2);
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function uint24Le(bytes: Uint8Array, offset: number): number {
  ensureRange(bytes, offset, 3);
  return (
    (bytes[offset] ?? 0) |
    ((bytes[offset + 1] ?? 0) << 8) |
    ((bytes[offset + 2] ?? 0) << 16)
  );
}

function uint32Be(bytes: Uint8Array, offset: number): number {
  ensureRange(bytes, offset, 4);
  return (
    ((bytes[offset] ?? 0) * 0x1000000 +
      ((bytes[offset + 1] ?? 0) << 16) +
      ((bytes[offset + 2] ?? 0) << 8) +
      (bytes[offset + 3] ?? 0)) >>>
    0
  );
}

function uint32Le(bytes: Uint8Array, offset: number): number {
  ensureRange(bytes, offset, 4);
  return (
    ((bytes[offset + 3] ?? 0) * 0x1000000 +
      ((bytes[offset + 2] ?? 0) << 16) +
      ((bytes[offset + 1] ?? 0) << 8) +
      (bytes[offset] ?? 0)) >>>
    0
  );
}

function uint64BeSafe(bytes: Uint8Array, offset: number): number {
  const high = uint32Be(bytes, offset);
  const low = uint32Be(bytes, offset + 4);
  const value = high * 0x100000000 + low;
  if (!Number.isSafeInteger(value)) {
    throw new PhotoImageInspectionError('corrupt_file', 'Image box size exceeds safe integer limits.');
  }
  return value;
}

function assertSafeDimensions(image: Omit<DecodedPhotoImage, 'animated'>): DecodedPhotoImage {
  if (
    image.width <= 0 ||
    image.height <= 0 ||
    image.width > PHOTO_MAX_PIXEL_DIMENSION ||
    image.height > PHOTO_MAX_PIXEL_DIMENSION ||
    image.width * image.height > PHOTO_MAX_PIXEL_COUNT
  ) {
    throw new PhotoImageInspectionError(
      'unsafe_dimensions',
      'Image dimensions exceed the safe validation limit.',
    );
  }
  return decodedPhotoImageSchema.parse({ ...image, animated: false });
}

let crcTable: Uint32Array | null = null;

function pngCrc32(bytes: Uint8Array, start: number, end: number): number {
  if (crcTable === null) {
    crcTable = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      crcTable[index] = value >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let offset = start; offset < end; offset += 1) {
    crc = (crcTable[(crc ^ (bytes[offset] ?? 0)) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function inspectPng(bytes: Uint8Array): DecodedPhotoImage {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (signature.some((value, index) => bytes[index] !== value)) {
    throw new PhotoImageInspectionError('corrupt_file', 'PNG signature is invalid.');
  }

  let offset = 8;
  let width: number | null = null;
  let height: number | null = null;
  let sawIdat = false;
  let sawIend = false;
  let chunkIndex = 0;

  while (offset < bytes.byteLength) {
    ensureRange(bytes, offset, 12);
    const length = uint32Be(bytes, offset);
    const type = ascii(bytes, offset + 4, 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    ensureRange(bytes, dataStart, length + 4);
    const expectedCrc = uint32Be(bytes, dataEnd);
    const actualCrc = pngCrc32(bytes, offset + 4, dataEnd);
    if (actualCrc !== expectedCrc) {
      throw new PhotoImageInspectionError('corrupt_file', 'PNG chunk checksum is invalid.');
    }

    if (chunkIndex === 0 && type !== 'IHDR') {
      throw new PhotoImageInspectionError('corrupt_file', 'PNG IHDR must be the first chunk.');
    }
    if (type === 'IHDR') {
      if (chunkIndex !== 0 || length !== 13 || width !== null) {
        throw new PhotoImageInspectionError('corrupt_file', 'PNG IHDR is invalid.');
      }
      width = uint32Be(bytes, dataStart);
      height = uint32Be(bytes, dataStart + 4);
      const compression = bytes[dataStart + 10];
      const filter = bytes[dataStart + 11];
      const interlace = bytes[dataStart + 12];
      if (compression !== 0 || filter !== 0 || (interlace !== 0 && interlace !== 1)) {
        throw new PhotoImageInspectionError('corrupt_file', 'PNG encoding method is unsupported.');
      }
    } else if (type === 'IDAT') {
      if (length === 0) {
        throw new PhotoImageInspectionError('corrupt_file', 'PNG image data is empty.');
      }
      sawIdat = true;
    } else if (type === 'IEND') {
      if (length !== 0 || !sawIdat) {
        throw new PhotoImageInspectionError('corrupt_file', 'PNG end chunk is invalid.');
      }
      sawIend = true;
      offset = dataEnd + 4;
      break;
    }

    offset = dataEnd + 4;
    chunkIndex += 1;
  }

  if (width === null || height === null || !sawIend || offset !== bytes.byteLength) {
    throw new PhotoImageInspectionError('corrupt_file', 'PNG structure is incomplete.');
  }
  return assertSafeDimensions({ mimeType: 'image/png', width, height });
}

const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function inspectJpeg(bytes: Uint8Array): DecodedPhotoImage {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new PhotoImageInspectionError('corrupt_file', 'JPEG start marker is invalid.');
  }

  let offset = 2;
  let width: number | null = null;
  let height: number | null = null;
  let sawEoi = false;

  while (offset < bytes.byteLength) {
    if (bytes[offset] !== 0xff) {
      throw new PhotoImageInspectionError('corrupt_file', 'JPEG marker stream is invalid.');
    }
    while (bytes[offset] === 0xff) offset += 1;
    ensureRange(bytes, offset, 1);
    const marker = bytes[offset] ?? 0;
    offset += 1;

    if (marker === 0xd9) {
      sawEoi = true;
      break;
    }
    if (marker === 0x00 || marker === 0xd8) {
      throw new PhotoImageInspectionError('corrupt_file', 'JPEG marker ordering is invalid.');
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }

    const length = uint16Be(bytes, offset);
    if (length < 2) {
      throw new PhotoImageInspectionError('corrupt_file', 'JPEG segment length is invalid.');
    }
    ensureRange(bytes, offset, length);

    if (JPEG_SOF_MARKERS.has(marker)) {
      if (length < 8) {
        throw new PhotoImageInspectionError('corrupt_file', 'JPEG frame header is invalid.');
      }
      height = uint16Be(bytes, offset + 3);
      width = uint16Be(bytes, offset + 5);
    }

    const segmentEnd = offset + length;
    if (marker !== 0xda) {
      offset = segmentEnd;
      continue;
    }

    offset = segmentEnd;
    while (offset < bytes.byteLength) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const markerStart = offset;
      while (bytes[offset] === 0xff) offset += 1;
      ensureRange(bytes, offset, 1);
      const entropyMarker = bytes[offset] ?? 0;
      if (entropyMarker === 0x00 || (entropyMarker >= 0xd0 && entropyMarker <= 0xd7)) {
        offset += 1;
        continue;
      }
      if (entropyMarker === 0xd9) {
        sawEoi = true;
        offset += 1;
        break;
      }
      offset = markerStart;
      break;
    }
    if (sawEoi) break;
  }

  if (width === null || height === null || !sawEoi) {
    throw new PhotoImageInspectionError('corrupt_file', 'JPEG structure is incomplete.');
  }
  return assertSafeDimensions({ mimeType: 'image/jpeg', width, height });
}

function inspectWebp(bytes: Uint8Array): DecodedPhotoImage {
  if (ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') {
    throw new PhotoImageInspectionError('corrupt_file', 'WebP container signature is invalid.');
  }
  const riffSize = uint32Le(bytes, 4);
  if (riffSize + 8 !== bytes.byteLength) {
    throw new PhotoImageInspectionError('corrupt_file', 'WebP container length is invalid.');
  }

  let offset = 12;
  let width: number | null = null;
  let height: number | null = null;

  while (offset < bytes.byteLength) {
    ensureRange(bytes, offset, 8);
    const type = ascii(bytes, offset, 4);
    const length = uint32Le(bytes, offset + 4);
    const dataStart = offset + 8;
    ensureRange(bytes, dataStart, length);
    const paddedEnd = dataStart + length + (length % 2);
    if (paddedEnd > bytes.byteLength) {
      throw new PhotoImageInspectionError('corrupt_file', 'WebP chunk is truncated.');
    }

    if (type === 'VP8X') {
      if (length < 10) {
        throw new PhotoImageInspectionError('corrupt_file', 'WebP extended header is invalid.');
      }
      const flags = bytes[dataStart] ?? 0;
      if ((flags & 0x02) !== 0) {
        throw new PhotoImageInspectionError('animated_media', 'Animated WebP is not supported.');
      }
      width = uint24Le(bytes, dataStart + 4) + 1;
      height = uint24Le(bytes, dataStart + 7) + 1;
    } else if (type === 'VP8 ') {
      if (
        length < 10 ||
        bytes[dataStart + 3] !== 0x9d ||
        bytes[dataStart + 4] !== 0x01 ||
        bytes[dataStart + 5] !== 0x2a
      ) {
        throw new PhotoImageInspectionError('corrupt_file', 'WebP VP8 frame header is invalid.');
      }
      width = uint16Le(bytes, dataStart + 6) & 0x3fff;
      height = uint16Le(bytes, dataStart + 8) & 0x3fff;
    } else if (type === 'VP8L') {
      if (length < 5 || bytes[dataStart] !== 0x2f) {
        throw new PhotoImageInspectionError('corrupt_file', 'WebP VP8L frame header is invalid.');
      }
      const packed = uint32Le(bytes, dataStart + 1);
      width = (packed & 0x3fff) + 1;
      height = ((packed >>> 14) & 0x3fff) + 1;
    } else if (type === 'ANIM' || type === 'ANMF') {
      throw new PhotoImageInspectionError('animated_media', 'Animated WebP is not supported.');
    }

    offset = paddedEnd;
  }

  if (width === null || height === null || offset !== bytes.byteLength) {
    throw new PhotoImageInspectionError('corrupt_file', 'WebP image frame is missing.');
  }
  return assertSafeDimensions({ mimeType: 'image/webp', width, height });
}

interface IsoBox {
  type: string;
  start: number;
  payloadStart: number;
  end: number;
}

function readIsoBox(bytes: Uint8Array, offset: number, parentEnd: number): IsoBox {
  ensureRange(bytes, offset, 8);
  let size = uint32Be(bytes, offset);
  const type = ascii(bytes, offset + 4, 4);
  let headerSize = 8;
  if (size === 1) {
    size = uint64BeSafe(bytes, offset + 8);
    headerSize = 16;
  } else if (size === 0) {
    size = parentEnd - offset;
  }
  if (size < headerSize || offset + size > parentEnd) {
    throw new PhotoImageInspectionError('corrupt_file', 'HEIF box size is invalid.');
  }
  return {
    type,
    start: offset,
    payloadStart: offset + headerSize,
    end: offset + size,
  };
}

const ISO_CONTAINER_BOXES = new Set([
  'meta',
  'iprp',
  'ipco',
  'moov',
  'trak',
  'mdia',
  'minf',
  'stbl',
  'dinf',
  'edts',
  'udta',
  'iinf',
  'iref',
]);

function collectIspeDimensions(
  bytes: Uint8Array,
  start: number,
  end: number,
  depth: number,
  dimensions: Array<{ width: number; height: number }>,
): void {
  if (depth > 8) {
    throw new PhotoImageInspectionError('corrupt_file', 'HEIF box nesting is too deep.');
  }
  let offset = start;
  while (offset < end) {
    const box = readIsoBox(bytes, offset, end);
    if (box.type === 'ispe') {
      ensureRange(bytes, box.payloadStart, 12);
      dimensions.push({
        width: uint32Be(bytes, box.payloadStart + 4),
        height: uint32Be(bytes, box.payloadStart + 8),
      });
    } else if (ISO_CONTAINER_BOXES.has(box.type)) {
      const childStart = box.type === 'meta' ? box.payloadStart + 4 : box.payloadStart;
      if (childStart > box.end) {
        throw new PhotoImageInspectionError('corrupt_file', 'HEIF container box is truncated.');
      }
      collectIspeDimensions(bytes, childStart, box.end, depth + 1, dimensions);
    }
    offset = box.end;
  }
  if (offset !== end) {
    throw new PhotoImageInspectionError('corrupt_file', 'HEIF box layout is incomplete.');
  }
}

function inspectHeif(bytes: Uint8Array): DecodedPhotoImage {
  let offset = 0;
  let brands: string[] | null = null;
  const dimensions: Array<{ width: number; height: number }> = [];

  while (offset < bytes.byteLength) {
    const box = readIsoBox(bytes, offset, bytes.byteLength);
    if (box.type === 'ftyp') {
      if (brands !== null || box.end - box.payloadStart < 8) {
        throw new PhotoImageInspectionError('corrupt_file', 'HEIF file-type box is invalid.');
      }
      brands = [ascii(bytes, box.payloadStart, 4)];
      for (let brandOffset = box.payloadStart + 8; brandOffset + 4 <= box.end; brandOffset += 4) {
        brands.push(ascii(bytes, brandOffset, 4));
      }
    }
    if (ISO_CONTAINER_BOXES.has(box.type)) {
      const childStart = box.type === 'meta' ? box.payloadStart + 4 : box.payloadStart;
      if (childStart > box.end) {
        throw new PhotoImageInspectionError('corrupt_file', 'HEIF container box is truncated.');
      }
      collectIspeDimensions(bytes, childStart, box.end, 1, dimensions);
    }
    offset = box.end;
  }

  if (brands === null) {
    throw new PhotoImageInspectionError('corrupt_file', 'HEIF file-type box is missing.');
  }
  const brandSet = new Set(brands);
  if (['msf1', 'hevs', 'hevm'].some((brand) => brandSet.has(brand))) {
    throw new PhotoImageInspectionError('animated_media', 'HEIF image sequences are not supported.');
  }
  const heicBrands = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis'];
  const heifBrands = ['mif1', 'heif'];
  const mimeType = heicBrands.some((brand) => brandSet.has(brand))
    ? 'image/heic'
    : heifBrands.some((brand) => brandSet.has(brand))
      ? 'image/heif'
      : null;
  if (mimeType === null) {
    throw new PhotoImageInspectionError('unsupported_format', 'ISO media file is not supported HEIC or HEIF.');
  }
  const largest = dimensions
    .filter((value) => value.width > 0 && value.height > 0)
    .sort((left, right) => right.width * right.height - left.width * left.height)[0];
  if (largest === undefined) {
    throw new PhotoImageInspectionError('corrupt_file', 'HEIC or HEIF dimensions are missing.');
  }
  return assertSafeDimensions({ mimeType, width: largest.width, height: largest.height });
}

function hasPrefix(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((value, index) => bytes[index] === value);
}

function rejectKnownUnsafeType(bytes: Uint8Array): void {
  if (
    hasPrefix(bytes, [0x4d, 0x5a]) ||
    hasPrefix(bytes, [0x7f, 0x45, 0x4c, 0x46]) ||
    hasPrefix(bytes, [0x50, 0x4b, 0x03, 0x04]) ||
    hasPrefix(bytes, [0x1f, 0x8b]) ||
    hasPrefix(bytes, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]) ||
    hasPrefix(bytes, [0x25, 0x50, 0x44, 0x46])
  ) {
    throw new PhotoImageInspectionError(
      'unsafe_file_type',
      'Executable, archive, and document files are not accepted as photos.',
    );
  }
}

export function inspectPhotoImage(bytes: Uint8Array): DecodedPhotoImage {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    throw new PhotoImageInspectionError('corrupt_file', 'Image bytes are empty.');
  }
  rejectKnownUnsafeType(bytes);

  if (hasPrefix(bytes, [0xff, 0xd8])) return inspectJpeg(bytes);
  if (hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return inspectPng(bytes);
  }
  if (bytes.byteLength >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    return inspectWebp(bytes);
  }
  if (bytes.byteLength >= 12 && ascii(bytes, 4, 4) === 'ftyp') {
    return inspectHeif(bytes);
  }
  throw new PhotoImageInspectionError('unsupported_format', 'Image file signature is not supported.');
}
