import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  test: {
    environment: "jsdom",
    globals: true,
    testTimeout: 15000,
    include: ["src/tests/**/*.test.ts", "src/tests/**/*.test.tsx", "scripts/__tests__/**/*.test.js"],
    exclude: ["scripts/__tests__/**/*.test.cjs"]
  }
});
