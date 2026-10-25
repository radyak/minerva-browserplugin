import { defineConfig } from "wxt";

import { SITES } from "./src/core/sites/sites.config.js";

const TITLE = "Minerva - Online Auction Assistant";

/**
 * Build configuration for both browsers (`wxt build -b chrome|firefox`).
 *
 * The manifest is generated: version from package.json, background, content
 * script and side panel keys from src/entrypoints/, the rest from here. The
 * only per-browser part is `browser_specific_settings` below; at runtime the
 * difference is confined to src/browser/side-panel.js.
 */
export default defineConfig({
  srcDir: "src",
  // public/ next to src/, not inside it: icons are copied into the build as is.
  publicDir: "public",
  outDir: "dist",
  // dist/chrome, dist/firefox; the dev server writes dist/<browser>-dev.
  outDirTemplate: "{{browser}}{{modeSuffix}}",
  // WXT builds Firefox as MV2 by default.
  manifestVersion: 3,
  // Explicit imports only, so every module stays loadable by `node --test`.
  imports: false,
  manifest: ({ browser }) => ({
    name: TITLE,
    description: "Assists with online auctions by making effective prices transparent",
    icons: {
      16: "icons/icon-16.png",
      32: "icons/icon-32.png",
      48: "icons/icon-48.png",
      64: "icons/icon-64.png",
      128: "icons/icon-128.png",
    },
    permissions: ["tabs", "storage", "alarms"],
    host_permissions: SITES.matchPatterns(),
    action: {
      default_title: TITLE,
      default_icon: { 16: "icons/icon-16.png", 32: "icons/icon-32.png" },
    },
    ...(browser === "firefox" && {
      browser_specific_settings: {
        gecko: {
          // Changing the ID breaks updates of existing installs.
          id: "element-marker@example.com",
          strict_min_version: "142.0",
          data_collection_permissions: { required: ["none"] },
        },
      },
    }),
  }),
  vite: () => ({
    build: {
      // Content-script CSS cannot use relative URLs into the extension: inline
      // the PNGs it references (content.css) as data: URLs, whatever their size.
      assetsInlineLimit: (file) => (file.endsWith(".png") ? true : undefined),
    },
  }),
  zip: {
    artifactTemplate: "{{name}}-{{packageVersion}}-{{browser}}.zip",
    sourcesTemplate: "{{name}}-{{packageVersion}}-sources.zip",
    // Dotfiles (.poc/, .private, .wxt/) are left out of the AMO sources zip anyway.
    excludeSources: ["icons/base.png"],
  },
});
