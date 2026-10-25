import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["dist/", ".output/", ".wxt/", ".poc/", "node_modules/"] },
  js.configs.recommended,
  {
    files: ["src/**/*.js"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.webextensions },
    },
  },
  {
    files: ["test/**/*.mjs", "scripts/**/*.mjs", "*.config.js"],
    languageOptions: { globals: globals.node },
  },
];
