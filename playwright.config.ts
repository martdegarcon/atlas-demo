import { defineConfig, devices } from "@playwright/test"

// E2E в настоящем браузере против собранного приложения (npm run test:e2e).
// Сервер стартует с чистой встроенной базой и тестовым паролем.
// CHROMIUM_PATH — путь к своему Chromium, если браузеры Playwright не скачаны.
const PORT = 3210

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["Pixel 7"],
    // мобильная эмуляция по умолчанию: основной сценарий — телефон
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || undefined,
      // программный WebGL — видео-экспорт работает и на машинах без GPU (CI)
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", ...(process.env.CHROMIUM_ARGS || "").split(" ").filter(Boolean)],
    },
    trace: "retain-on-failure",
  },
  webServer: {
    command: `node e2e/start-server.mjs ${PORT}`,
    url: `http://localhost:${PORT}/api/trips`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
})
