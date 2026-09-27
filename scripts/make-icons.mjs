#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/**
 * Generates the extension icons by scaling icons/base.png down to every size
 * the manifests use. Run with `npm run icons`; the PNGs are committed so a
 * plain `npm run build` needs no image tooling.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = path.join(ROOT, "icons", "base.png");
const SIZES = [16, 32, 48, 64, 128];

for (const size of SIZES) {
  const file = path.join(ROOT, "icons", `icon-${size}.png`);
  await sharp(BASE)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(file);
  console.log(`wrote icons/icon-${size}.png`);
}
