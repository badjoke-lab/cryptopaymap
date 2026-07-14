import { describe, expect, it } from 'vitest';
import { inspectPhotoImage } from '../src/submissions/photo-image-inspection';

function uint32Be(value: number): number[] {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function uint32Le(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

function ascii(value: string): number[] {
  return [...value].map((character) => character.charCodeAt(0));
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: number[]): number[] {
  const typeBytes = ascii(type);
  const checksum = crc32(Uint8Array.from([...typeBytes, ...data]));
  return [...uint32Be(data.length), ...typeBytes, ...data, ...uint32Be(checksum)];
}

function png(width: number, height: number): Uint8Array {
  const ihdr = [
    ...uint32Be(width),
    ...uint32Be(height),
    8,
    2,
    0,
    0,
    0,
  ];
  return Uint8Array.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...pngChunk('IHDR', ihdr),
    ...pngChunk('IDAT', [0x00]),
    ...pngChunk('IEND', []),
  ]);
}

function jpeg(width: number, height: number): Uint8Array {
  return Uint8Array.from([
    0xff,
    0xd8,
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    (height >>> 8) & 0xff,
    height & 0xff,
    (width >>> 8) & 0xff,
    width & 0xff,
    0x03,
    0x01,
    0x11,
    0x00,
    0x02,
    0x11,
    0x00,
    0x03,
    0x11,
    0x00,
    0xff,
    0xda,
    0x00,
    0x0c,
    0x03,
    0x01,
    0x00,
    0x02,
    0x11,
    0x03,
    0x11,
    0x00,
    0x3f,
    0x00,
    0x00,
    0xff,
    0xd9,
  ]);
}

function webp(width: number, height: number, animated = false): Uint8Array {
  const payload = [
    animated ? 0x02 : 0x00,
    0,
    0,
    0,
    ...uint32Le(width - 1).slice(0, 3),
    ...uint32Le(height - 1).slice(0, 3),
  ];
  const body = [...ascii('VP8X'), ...uint32Le(payload.length), ...payload];
  return Uint8Array.from([
    ...ascii('RIFF'),
    ...uint32Le(4 + body.length),
    ...ascii('WEBP'),
    ...body,
  ]);
}

function box(type: string, payload: number[]): number[] {
  return [...uint32Be(8 + payload.length), ...ascii(type), ...payload];
}

function heif(width: number, height: number, brand: 'heic' | 'mif1'): Uint8Array {
  const ftyp = box('ftyp', [...ascii(brand), 0, 0, 0, 0, ...ascii('mif1'), ...ascii(brand)]);
  const ispe = box('ispe', [0, 0, 0, 0, ...uint32Be(width), ...uint32Be(height)]);
  const ipco = box('ipco', ispe);
  const iprp = box('iprp', ipco);
  const meta = box('meta', [0, 0, 0, 0, ...iprp]);
  return Uint8Array.from([...ftyp, ...meta]);
}

describe('P5-05D photo image inspection', () => {
  it('structurally decodes JPEG, PNG, WebP, HEIC, and HEIF dimensions', () => {
    expect(inspectPhotoImage(jpeg(640, 480))).toEqual({
      mimeType: 'image/jpeg',
      width: 640,
      height: 480,
      animated: false,
    });
    expect(inspectPhotoImage(png(320, 240))).toEqual({
      mimeType: 'image/png',
      width: 320,
      height: 240,
      animated: false,
    });
    expect(inspectPhotoImage(webp(800, 600))).toEqual({
      mimeType: 'image/webp',
      width: 800,
      height: 600,
      animated: false,
    });
    expect(inspectPhotoImage(heif(1024, 768, 'heic'))).toEqual({
      mimeType: 'image/heic',
      width: 1024,
      height: 768,
      animated: false,
    });
    expect(inspectPhotoImage(heif(1280, 720, 'mif1'))).toEqual({
      mimeType: 'image/heif',
      width: 1280,
      height: 720,
      animated: false,
    });
  });

  it('rejects corrupted PNG checksums and incomplete JPEG files', () => {
    const corrupted = png(20, 10);
    corrupted[corrupted.length - 1] = (corrupted[corrupted.length - 1] ?? 0) ^ 0xff;
    expect(() => inspectPhotoImage(corrupted)).toThrowError(
      expect.objectContaining({ code: 'corrupt_file' }),
    );

    expect(() => inspectPhotoImage(jpeg(20, 10).slice(0, -2))).toThrowError(
      expect.objectContaining({ code: 'corrupt_file' }),
    );
  });

  it('rejects animated WebP and unsafe pixel dimensions', () => {
    expect(() => inspectPhotoImage(webp(100, 100, true))).toThrowError(
      expect.objectContaining({ code: 'animated_media' }),
    );
    expect(() => inspectPhotoImage(png(20_001, 10))).toThrowError(
      expect.objectContaining({ code: 'unsafe_dimensions' }),
    );
  });

  it('rejects executable, archive, document, and unknown signatures', () => {
    for (const bytes of [
      Uint8Array.from([0x4d, 0x5a, 0, 0]),
      Uint8Array.from([0x50, 0x4b, 0x03, 0x04]),
      Uint8Array.from([0x25, 0x50, 0x44, 0x46]),
    ]) {
      expect(() => inspectPhotoImage(bytes)).toThrowError(
        expect.objectContaining({
          code: 'unsafe_file_type',
        }),
      );
    }
    expect(() => inspectPhotoImage(Uint8Array.from([1, 2, 3, 4]))).toThrowError(
      expect.objectContaining({
        code: 'unsupported_format',
      }),
    );
  });
});
