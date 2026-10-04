/** Build time constant, replaced by esbuild's `define` in scripts/build.mjs. */
declare const __TARGET__: "chrome" | "firefox";

/** Stylesheets imported for their side effect; esbuild bundles them into a .css file. */
declare module "*.css";
