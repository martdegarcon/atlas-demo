import path from "node:path"
import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

// Два набора: логика/база/API — в node, компоненты — в jsdom.
// E2E в настоящем браузере — отдельно, через Playwright (npm run test:e2e).
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.dirname(fileURLToPath(import.meta.url)) } },
  test: {
    env: { PGLITE_DIR: "memory://", ADMIN_PASSWORD: "test-password" },
    coverage: {
      provider: "v8",
      include: ["lib/**", "components/**", "app/**"],
      exclude: ["**/*.d.ts"],
      reporter: ["text-summary", "text"],
    },
    projects: [
      {
        extends: true,
        test: { name: "server", environment: "node", include: ["tests/unit/**/*.test.ts", "tests/db/**/*.test.ts", "tests/api/**/*.test.ts"], testTimeout: 30000, hookTimeout: 60000 },
      },
      {
        extends: true,
        test: { name: "ui", environment: "jsdom", include: ["tests/components/**/*.test.tsx"], setupFiles: ["tests/setup-dom.ts"], testTimeout: 20000 },
      },
    ],
  },
})
