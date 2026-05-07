import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// SL-16: tests live in src/__tests__/ and co-located *.test.ts files.
// Focused on pure functions that benefit most from regression pinning:
//   - parseDueDate / wallClockToUtc / startOfDayInZone
//   - splitForTelegram (grapheme handling)
//   - uploads helpers (UUID, path containment, filename sanitization)
//   - rate-limit math
//   - escapers (markdownToHtml, escTelegramHtml)
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/__tests__/**/*.test.ts"],
    environment: "node",
    globals: false,
  },
  resolve: {
    alias: {
      // Match the tsconfig path mapping so `@/lib/foo` resolves the same way
      // tests do as production code.
      "@": resolve(__dirname, "./src"),
    },
  },
});
