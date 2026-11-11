import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GALLERY_MARKER,
  galleryLeaks,
  oversized,
  PAGES_FILE_LIMIT,
  photoMetadata,
  retiredFiles,
} from './check-dist';

describe('oversized', () => {
  it('uses the Cloudflare Pages per-file limit of 25 MiB', () => {
    expect(PAGES_FILE_LIMIT).toBe(25 * 1024 * 1024);
  });

  it('lists files over the limit and nothing else', () => {
    const files = [
      { path: 'assets/index.js', size: 210_000 },
      { path: 'assets/ort.wasm', size: 26_861_770 },
      { path: 'exact.bin', size: 25 * 1024 * 1024 },
    ];
    expect(oversized(files)).toEqual(['assets/ort.wasm (25.6 MiB)']);
  });
});

const file = (path: string, text: string) => ({ path, bytes: new TextEncoder().encode(text) });

describe('galleryLeaks (SPEC-pixel-kit AC 45)', () => {
  it('looks for the string px-gallery', () => {
    expect(GALLERY_MARKER).toBe('px-gallery');
  });

  it('lists every file whose contents or name contain px-gallery, and nothing else', () => {
    const files = [
      file('index.html', '<div id="root"></div><script src="/assets/index.js"></script>'),
      file('assets/index.js', 'const a="px-layer",b="px-button";'),
      file('assets/chunk.js', 'document.querySelector(".px-gallery-stage")'),
      file('px-gallery.html', '<!doctype html>'),
      { path: 'assets/model.bin', bytes: new Uint8Array([0, 255, ...Buffer.from('px-gallery')]) },
    ];
    expect(galleryLeaks(files)).toEqual(['assets/chunk.js', 'px-gallery.html', 'assets/model.bin']);
  });

  it('passes a clean build', () => {
    expect(galleryLeaks([file('assets/index.js', 'px-layer px-button px-text')])).toEqual([]);
  });
});

describe('retiredFiles (follow-up 21: the files taken off the site stay off)', () => {
  // Published SHA-256 test vectors, so the check is known to use SHA-256 itself.
  const SHA256_ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
  const SHA256_EMPTY = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

  it('lists exactly the files whose SHA-256 is in the list, whatever their names', () => {
    const files = [
      file('index.html', '<div id="root"></div>'),
      file('x.webp', 'abc'),
      file('samples/wall-a.jpg', 'abcd'),
      file('assets/renamed.bin', 'abc'),
      file('empty.json', ''),
    ];
    expect(retiredFiles(files, [SHA256_ABC, SHA256_EMPTY])).toEqual([
      'x.webp',
      'assets/renamed.bin',
      'empty.json',
    ]);
  });

  it('passes a build with none of them', () => {
    expect(retiredFiles([file('samples/wall-a.jpg', 'abcd')], [SHA256_ABC])).toEqual([]);
  });

  it('reads 28 distinct SHA-256 hashes from retired-files.json (27, plus Wall 1’s photo)', () => {
    const json = join(dirname(fileURLToPath(import.meta.url)), 'retired-files.json');
    const { about, sha256 } = JSON.parse(readFileSync(json, 'utf8')) as {
      about: string;
      sha256: string[];
    };
    expect(about.length).toBeGreaterThan(20);
    expect(sha256).toHaveLength(28);
    expect(new Set(sha256).size).toBe(28);
    for (const h of sha256) expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('photoMetadata (ADR-0003 (c): no EXIF, XMP or IPTC in a public photo)', () => {
  const ascii = (s: string) => [...Buffer.from(s, 'latin1')];
  const le32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, n >>> 24];
  const SOS = [0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0];

  /** SOI, then each [marker, payload] as a segment with its 2-byte length, then SOS, scan data, EOI. */
  const jpeg = (path: string, segments: [number, string][], scan = 'scan') => {
    const head = segments.flatMap(([marker, payload]) => {
      const n = payload.length + 2;
      return [0xff, marker, n >> 8, n & 0xff, ...ascii(payload)];
    });
    return {
      path,
      bytes: new Uint8Array([0xff, 0xd8, ...head, ...SOS, ...ascii(scan), 0xff, 0xd9]),
    };
  };

  /** RIFF/WEBP, then each [fourCC, payload] as a chunk, padded to an even length. */
  const webp = (path: string, chunks: [string, string][]) => {
    const body = chunks.flatMap(([fourCC, payload]) => {
      const pad = payload.length % 2 ? [0] : [];
      return [...ascii(fourCC), ...le32(payload.length), ...ascii(payload), ...pad];
    });
    const riff = [...ascii('RIFF'), ...le32(body.length + 4), ...ascii('WEBP')];
    return { path, bytes: new Uint8Array([...riff, ...body]) };
  };

  const JFIF: [number, string] = [0xe0, 'JFIF\0\x01\x01\0\0\x01\0\x01\0\0'];
  const QUANT: [number, string] = [0xdb, '\0' + 'q'.repeat(64)];
  const VP8X: [string, string] = ['VP8X', '\0'.repeat(10)];

  it('lists a JPEG with an Exif or XMP APP1 segment, or an APP13 (IPTC) segment, before SOS', () => {
    const files = [
      jpeg('exif.jpg', [[0xe1, 'Exif\0\0II*\0'], JFIF, QUANT]),
      jpeg('xmp.jpg', [JFIF, [0xe1, 'http://ns.adobe.com/xap/1.0/\0<x:xmpmeta/>'], QUANT]),
      jpeg('iptc.jpg', [JFIF, QUANT, [0xed, 'Photoshop 3.0\x008BIM']]),
      jpeg('jfif.jpg', [JFIF, QUANT]),
    ];
    expect(photoMetadata(files)).toEqual(['exif.jpg', 'xmp.jpg', 'iptc.jpg']);
  });

  it('lists a WebP with an EXIF or XMP chunk', () => {
    const files = [
      webp('exif.webp', [VP8X, ['VP8 ', 'odd'], ['EXIF', 'II*\0']]),
      webp('xmp.webp', [VP8X, ['VP8 ', 'frame'], ['XMP ', '<x/>']]),
      webp('plain.webp', [['VP8 ', 'frame']]),
    ];
    expect(photoMetadata(files)).toEqual(['exif.webp', 'xmp.webp']);
  });

  it('passes a JFIF-only JPEG, a plain VP8 WebP, and files that only mention Exif', () => {
    const files = [
      // Image data follows SOS, so APP1-like bytes right after it are not a segment.
      jpeg('samples/wall-a.jpg', [JFIF, QUANT], '\xff\xe1\0\x08Exif\0\0 data'),
      webp('learn/crop.webp', [['VP8 ', 'frame with Exif and XMP in it']]),
      file('assets/index.js', 'const tag = "Exif"; const ns = "http://ns.adobe.com/xap/1.0/";'),
      file('favicon.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>'),
    ];
    expect(photoMetadata(files)).toEqual([]);
  });

  it('judges a file by its bytes, not its name', () => {
    const files = [
      jpeg('photo.bin', [[0xe1, 'Exif\0\0MM\0*']]),
      webp('photo', [['EXIF', 'MM\0*']]),
    ];
    expect(photoMetadata(files)).toEqual(['photo.bin', 'photo']);
  });
});
