#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Zips every built dist/<target> into build/<name>-<version>-<target>.zip. */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));
const targets = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ["chrome", "firefox"];

await mkdir(path.join(ROOT, "build"), { recursive: true });

for (const target of targets) {
  const zip = path.join(ROOT, "build", `${pkg.name}-${pkg.version}-${target}.zip`);
  await rm(zip, { force: true });
  execFileSync("zip", ["-r", "-q", zip, "."], { cwd: path.join(ROOT, "dist", target) });
  console.log(`packaged ${path.relative(ROOT, zip)}`);
}
