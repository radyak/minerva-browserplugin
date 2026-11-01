import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  { ignores: ["dist/", ".output/", ".wxt/", ".poc/", "node_modules/"] },
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    extends: [tseslint.configs.recommended],
  },
  {
    // The side panel: rules of hooks and complete effect dependencies.
    files: ["src/panel/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat.recommended],
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.webextensions },
    },
  },
  {
    files: ["test/**/*.{ts,tsx}", "*.config.{js,ts}"],
    languageOptions: { globals: globals.node },
  },
  {
    // Fakes and fixtures are deliberately loose.
    files: ["test/**/*.{ts,tsx}"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
]);
