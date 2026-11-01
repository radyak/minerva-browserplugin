import { defineConfig } from "vitest/config";
import { WxtVitest } from "wxt/testing/vitest-plugin";

/**
 * Unit and controller tests. WxtVitest() applies wxt.config.ts and replaces the
 * extension API (`wxt/browser`, `browser`) with WXT's in-memory `fakeBrowser`.
 * Tests run in Node and build their own jsdom documents where they need one;
 * the panel test (React) runs in a jsdom environment (`@vitest-environment`).
 */
export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    include: ["test/**/*.test.{ts,tsx}"],
    environment: "node",
    restoreMocks: true,
  },
});
