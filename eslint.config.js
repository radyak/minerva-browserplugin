import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["dist/", "build/", ".poc/", "node_modules/"] },
  js.configs.recommended,
  {
    files: ["src/**/*.js"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.webextensions, __TARGET__: "readonly" },
    },
  },
  {
    files: ["test/**/*.mjs", "scripts/**/*.mjs", "*.config.js"],
    languageOptions: { globals: globals.node },
  },
];
