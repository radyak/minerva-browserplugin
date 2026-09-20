#!/usr/bin/env node
import { deflateSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Generates the toolbar icons - a red rounded frame, matching what the
 * extension does to the page. Run with `npm run icons`; the PNGs are committed
 * so a plain `npm run build` needs no image tooling.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SIZES = [16, 32, 48, 128];
const RED = [220, 53, 69];

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Signed distance of (x, y) to a rounded rectangle centred in the icon. */
function roundedRectDistance(x, y, size, inset, radius) {
  const half = size / 2 - inset;
  const dx = Math.abs(x - size / 2) - (half - radius);
  const dy = Math.abs(y - size / 2) - (half - radius);
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  return outside + Math.min(Math.max(dx, dy), 0) - radius;
}

function render(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const inset = size * 0.1;
  const stroke = Math.max(2, size * 0.125);
  const radius = size * 0.18;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Supersample 3x3 so the rounded corners do not look ragged.
      let coverage = 0;
      for (let sy = 0; sy < 3; sy++) {
        for (let sx = 0; sx < 3; sx++) {
          const px = x + (sx + 0.5) / 3;
          const py = y + (sy + 0.5) / 3;
          const distance = roundedRectDistance(px, py, size, inset, radius);
          if (distance <= 0 && distance >= -stroke) coverage += 1;
        }
      }
      const offset = (y * size + x) * 4;
      pixels[offset] = RED[0];
      pixels[offset + 1] = RED[1];
      pixels[offset + 2] = RED[2];
      pixels[offset + 3] = Math.round((coverage / 9) * 255);
    }
  }
  return pixels;
}

await mkdir(path.join(ROOT, "icons"), { recursive: true });
for (const size of SIZES) {
  const file = path.join(ROOT, "icons", `icon-${size}.png`);
  await writeFile(file, png(size, render(size)));
  console.log(`wrote icons/icon-${size}.png`);
}
