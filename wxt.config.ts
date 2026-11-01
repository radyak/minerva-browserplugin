import { defineConfig } from "wxt";

import { SITES } from "./src/core/sites/sites.config.ts";
import { matchPatterns } from "./src/core/sites/sites.ts";

const TITLE = "Minerva - Online Auction Assistant";

/**
 * Build configuration for both browsers (`wxt build -b chrome|firefox`).
 *
 * The manifest is generated: version from package.json, background, content
 * script and side panel keys from src/entrypoints/, the rest from here. The
 * only per-browser part is `browser_specific_settings` below; at runtime the
 * difference is confined to src/browser/side-panel.ts.
 */
export default defineConfig({
  srcDir: "src",
  // public/ next to src/, not inside it: files there are copied into the build
  // as is (none at the moment - the icons are generated, see autoIcons).
  publicDir: "public",
  outDir: "dist",
  // dist/chrome, dist/firefox; the dev server writes dist/<browser>-dev.
  outDirTemplate: "{{browser}}{{modeSuffix}}",
  // WXT builds Firefox as MV2 by default.
  manifestVersion: 3,
  // Explicit imports only: every module says where its names come from.
  imports: false,
  // auto-icons scales src/assets/icon.png into icons/<size>.png at build time and
  // sets manifest.icons (greyscale in the dev build); module-react adds Vite's
  // React plugin for the side panel (src/panel/*.tsx).
  modules: ["@wxt-dev/auto-icons", "@wxt-dev/module-react"],
  autoIcons: { sizes: [128, 64, 48, 32, 16] },
  manifest: ({ browser }) => ({
    name: TITLE,
    description: "Assists with online auctions by making effective prices transparent",
    permissions: ["tabs", "storage", "alarms"],
    host_permissions: matchPatterns(SITES),
    action: {
      default_title: TITLE,
      default_icon: { 16: "icons/16.png", 32: "icons/32.png" },
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
    // Dotfiles (.poc/, .private, .wxt/) are left out of the AMO sources zip by
    // default; src/assets/icon.png must stay in, the build generates the icons from it.
  },
});
