import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { PGlite } from "@electric-sql/pglite"
import { PGLiteSocketServer } from "@electric-sql/pglite-socket"
import { makeTrip, TINY_JPEG } from "../fixtures"

// В проде данные лежат в настоящем Postgres (Neon, свой сервер) через драйвер
// postgres.js. Чтобы проверить именно эту ветку, поднимаем Postgres-совместимый
// сервер по сети (PGlite + протокол Postgres) и ходим в него как в обычную базу.
const PORT = 54000 + Math.floor(Math.random() * 1000)
let server: PGLiteSocketServer
let pg: PGlite

beforeAll(async () => {
  pg = await PGlite.create()
  server = new PGLiteSocketServer({ db: pg, port: PORT, host: "127.0.0.1", maxConnections: 10 })
  await server.start()
  // строка как у Neon: с параметрами, которые понимает только libpq
  vi.stubEnv("DATABASE_URL", `postgres://postgres:postgres@127.0.0.1:${PORT}/postgres?channel_binding=require`)
  vi.stubEnv("SEED_DEMO", "1")
  const { __resetDbForTests } = await import("@/lib/db")
  __resetDbForTests()
})

afterAll(async () => {
  vi.unstubAllEnvs()
  await server?.stop()
  await pg?.close()
})

describe("драйвер postgres.js (как в продакшене)", () => {
  it("создаёт схему, заполняет демо и отдаёт поездки", async () => {
    const { listTrips } = await import("@/lib/trips-repo")
    const trips = await listTrips({ includePrivate: true })
    expect(trips.map((t) => t.slug)).toEqual(["japan-2025", "portugal-2024", "turkey-2023"])
    // типы колонок приходят как надо: числа — числами, даты — ISO-строками
    expect(typeof trips[0].cities[0].lat).toBe("number")
    expect(trips[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it("сохраняет и удаляет поездку в транзакции", async () => {
    const { upsertTrip, deleteTrip, getTripBySlug } = await import("@/lib/trips-repo")
    const saved = await upsertTrip(makeTrip())
    expect(saved.slug).toBe("gruziya-2026")
    expect(saved.cities[0].entries?.[0].text).toBe("Серные бани.")
    expect(await getTripBySlug("gruziya-2026", { includePrivate: false })).not.toBeNull()
    expect(await deleteTrip("georgia")).toBe(true)
    expect(await getTripBySlug("gruziya-2026", { includePrivate: true })).toBeNull()
  })

  it("откатывает транзакцию при ошибке", async () => {
    const { upsertTrip, getTripById } = await import("@/lib/trips-repo")
    await upsertTrip(makeTrip())
    const broken = makeTrip({ title: "Сломано" })
    broken.cities = [broken.cities[0], { ...broken.cities[1], id: "tbilisi" }]
    await expect(upsertTrip(broken)).rejects.toThrow()
    expect((await getTripById("georgia", { includePrivate: true }))?.title).toBe("Грузия")
  })

  it("фото: bytea туда и обратно без искажений", async () => {
    const { insertPhoto, getPhoto } = await import("@/lib/trips-repo")
    await insertPhoto("pg-photo", "image/jpeg", TINY_JPEG)
    const p = await getPhoto("pg-photo")
    expect(Buffer.from(p!.data).equals(TINY_JPEG)).toBe(true)
  })

  it("замена всего набора", async () => {
    const { replaceAllTrips } = await import("@/lib/trips-repo")
    expect(await replaceAllTrips([])).toEqual([])
    expect(await replaceAllTrips([makeTrip()])).toHaveLength(1)
  })
})
