#!/usr/bin/env node
import { context } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PLATFORMS } from "../src/core/config.js";
import { matchPatternFor } from "../src/core/url-matcher.js";

/**
 * Builds one directory per browser target under dist/.
 *
 * Everything shared lives in src/, everything browser specific in
 * platforms/<target>/manifest.json plus the `__TARGET__` build constant that
 * src/platform/panel.js branches on.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGETS = ["chrome", "firefox"];

const args = process.argv.slice(2);
const watch = args.includes("--watch");
const requested = args.find((arg) => arg.startsWith("--target="))?.split("=")[1];
const targets = requested ? requested.split(",") : TARGETS;

for (const target of targets) {
  if (!TARGETS.includes(target)) {
    console.error(`Unknown target "${target}". Known targets: ${TARGETS.join(", ")}`);
    process.exit(1);
  }
}

/** Content script match patterns, one per platform (deduplicated). */
const CONTENT_MATCHES = [
  ...new Set(PLATFORMS.map((platform) => matchPatternFor(platform.platformUrl))),
];

const pkg = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));

/** Replace "$VERSION" / "$CONTENT_MATCHES" placeholders anywhere in the manifest. */
function resolvePlaceholders(value) {
  if (typeof value === "string") {
    if (value === "$CONTENT_MATCHES") return [...CONTENT_MATCHES];
    return value.replaceAll("$VERSION", pkg.version);
  }
  if (Array.isArray(value)) return value.map(resolvePlaceholders);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, resolvePlaceholders(entry)]),
    );
  }
  return value;
}

async function copyStaticAssets(target) {
  const out = path.join(ROOT, "dist", target);
  await mkdir(path.join(out, "panel"), { recursive: true });
  await mkdir(path.join(out, "vendor"), { recursive: true });

  await cp(path.join(ROOT, "icons"), path.join(out, "icons"), { recursive: true });
  await cp(path.join(ROOT, "src/content/content.css"), path.join(out, "content.css"));
  await cp(path.join(ROOT, "src/panel/panel.html"), path.join(out, "panel/panel.html"));
  await cp(path.join(ROOT, "src/panel/panel.css"), path.join(out, "panel/panel.css"));
  await cp(
    path.join(ROOT, "node_modules/bootstrap/dist/css/bootstrap.min.css"),
    path.join(out, "vendor/bootstrap.min.css"),
  );

  const manifest = JSON.parse(
    await readFile(path.join(ROOT, "platforms", target, "manifest.json"), "utf8"),
  );
  await writeFile(
    path.join(out, "manifest.json"),
    `${JSON.stringify(resolvePlaceholders(manifest), null, 2)}\n`,
  );
}

/** esbuild plugin so that `--watch` also refreshes the non-bundled files. */
function staticAssetsPlugin(target) {
  return {
    name: "static-assets",
    setup(build) {
      build.onEnd(async (result) => {
        if (result.errors.length > 0) return;
        await copyStaticAssets(target);
        console.log(`[${target}] built -> dist/${target}`);
      });
    },
  };
}

async function build(target) {
  const out = path.join(ROOT, "dist", target);
  await rm(out, { recursive: true, force: true });

  const ctx = await context({
    entryPoints: {
      background: path.join(ROOT, "src/background/background.js"),
      content: path.join(ROOT, "src/content/content.js"),
      "panel/panel": path.join(ROOT, "src/panel/panel.js"),
    },
    outdir: out,
    bundle: true,
    format: "iife", // content scripts and MV2-style event pages cannot be ES modules
    target: ["chrome114", "firefox115"],
    define: { __TARGET__: JSON.stringify(target) },
    sourcemap: watch ? "inline" : false,
    minify: !watch,
    logLevel: "warning",
    plugins: [staticAssetsPlugin(target)],
  });

  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

await Promise.all(targets.map(build));

if (watch) {
  console.log(`Watching ${targets.join(", ")}… (ctrl+c to stop)`);
}
