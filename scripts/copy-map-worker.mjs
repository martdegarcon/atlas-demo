// MapLibre 6 грузит фоновый воркер отдельным файлом, а сборщик Next его не
// отдаёт. Кладём файл в public/ — он будет доступен по /maplibre-gl-worker.mjs.
// Запускается сам перед dev и build (npm-скрипты predev/prebuild).
import { copyFileSync, mkdirSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"

const require = createRequire(import.meta.url)
const src = path.join(path.dirname(require.resolve("maplibre-gl/package.json")), "dist", "maplibre-gl-worker.mjs")
mkdirSync("public", { recursive: true })
copyFileSync(src, path.join("public", "maplibre-gl-worker.mjs"))
