// Fails the build when a file in dist/ is over the Cloudflare Pages per-file limit, when the
// dev-only pixel-kit gallery leaked into the build (SPEC-pixel-kit AC 45), when a file taken off
// the site comes back (follow-up 21), or when a photo carries EXIF, XMP or IPTC metadata
// (ADR-0003 (c), docs/adr/0003-public-repo.md).
// Usage (runs after `vite build`): node scripts/check-dist.ts
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export const PAGES_FILE_LIMIT = 25 * 1024 * 1024;

/** The dev gallery's marker: px-gallery.html and its code must never ship. */
export const GALLERY_MARKER = 'px-gallery';

export function oversized(
  files: { path: string; size: number }[],
  limit = PAGES_FILE_LIMIT,
): string[] {
  return files
    .filter((f) => f.size > limit)
    .map((f) => `${f.path} (${(f.size / 1024 / 1024).toFixed(1)} MiB)`);
}

/** Paths whose contents (or names) contain the gallery marker. */
export function galleryLeaks(files: { path: string; bytes: Uint8Array }[]): string[] {
  return files
    .filter((f) => f.path.includes(GALLERY_MARKER) || Buffer.from(f.bytes).includes(GALLERY_MARKER))
    .map((f) => f.path);
}

/** Paths whose SHA-256 (lowercase hex) is in `hashes`. Matching bytes, not names, catches a rename. */
export function retiredFiles(
  files: { path: string; bytes: Uint8Array }[],
  hashes: readonly string[],
): string[] {
  const retired = new Set(hashes);
  return files
    .filter((f) => retired.has(createHash('sha256').update(f.bytes).digest('hex')))
    .map((f) => f.path);
}

const ascii = (b: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...b.subarray(start, end));

/**
 * Walks the segments before SOS (start of scan; image data follows it). APP1 holds Exif or XMP
 * and APP13 holds IPTC, so either one counts.
 */
function jpegHasMetadata(b: Uint8Array): boolean {
  let i = 2; // after SOI
  while (i + 1 < b.length && b[i] === 0xff) {
    const marker = b[i + 1]!;
    if (marker === 0xff) {
      i += 1; // a fill byte before the marker
    } else if (marker === 0xda || marker === 0xd9) {
      return false; // SOS or EOI: no more metadata segments
    } else if (marker === 0xe1 || marker === 0xed) {
      return true;
    } else if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2; // a marker with no length field
    } else {
      i += 2 + ((b[i + 2] ?? 0) << 8) + (b[i + 3] ?? 0); // the length counts its own 2 bytes
    }
  }
  return false;
}

/** Walks the RIFF chunks after the 12-byte header: EXIF and 'XMP ' are the metadata chunks. */
function webpHasMetadata(b: Uint8Array): boolean {
  for (let i = 12; i + 8 <= b.length;) {
    const fourCC = ascii(b, i, i + 4);
    if (fourCC === 'EXIF' || fourCC === 'XMP ') return true;
    const size = (b[i + 4]! | (b[i + 5]! << 8) | (b[i + 6]! << 16) | (b[i + 7]! << 24)) >>> 0;
    i += 8 + size + (size % 2); // a chunk is padded to an even length
  }
  return false;
}

/** Paths of JPEGs and WebPs, told apart by their first bytes, that carry EXIF, XMP or IPTC. */
export function photoMetadata(files: { path: string; bytes: Uint8Array }[]): string[] {
  return files
    .filter(({ bytes: b }) => {
      if (b[0] === 0xff && b[1] === 0xd8) return jpegHasMetadata(b);
      if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP') return webpHasMetadata(b);
      return false;
    })
    .map((f) => f.path);
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

if (import.meta.main) {
  const root = join(import.meta.dirname, '..');
  const paths = walk(join(root, 'dist'));
  const bad = oversized(paths.map((p) => ({ path: relative(root, p), size: statSync(p).size })));
  if (bad.length) {
    console.error(`dist/ has files over the 25 MiB Cloudflare Pages limit:\n  ${bad.join('\n  ')}`);
    process.exit(1);
  }
  const files = paths.map((p) => ({ path: relative(root, p), bytes: readFileSync(p) }));
  const leaks = galleryLeaks(files);
  if (leaks.length) {
    console.error(`dist/ contains the dev-only pixel-kit gallery:\n  ${leaks.join('\n  ')}`);
    process.exit(1);
  }
  const { sha256 } = JSON.parse(
    readFileSync(join(import.meta.dirname, 'retired-files.json'), 'utf8'),
  ) as { sha256: string[] };
  const retired = retiredFiles(files, sha256);
  if (retired.length) {
    console.error(
      `dist/ contains files that were taken off the site (scripts/retired-files.json):\n  ${retired.join('\n  ')}`,
    );
    process.exit(1);
  }
  const tagged = photoMetadata(files);
  if (tagged.length) {
    console.error(
      `dist/ has photos with EXIF, XMP or IPTC metadata; strip it before they go public:\n  ${tagged.join('\n  ')}`,
    );
    process.exit(1);
  }
}
