// Запуск собранного приложения для e2e: каждый прогон — с чистой базой
import { spawn } from "node:child_process"
import { rmSync } from "node:fs"
import path from "node:path"

const port = process.argv[2] || "3210"
const dir = path.join(process.cwd(), ".data", "e2e")
rmSync(dir, { recursive: true, force: true })

const child = spawn("npx", ["next", "start", "-p", port], {
  stdio: "inherit",
  env: { ...process.env, ADMIN_PASSWORD: "e2e-password", PGLITE_DIR: dir, DATABASE_URL: "", NEXT_TELEMETRY_DISABLED: "1" },
})
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig))
child.on("exit", (code) => process.exit(code ?? 0))
