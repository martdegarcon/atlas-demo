import { afterEach, describe, expect, it, vi } from "vitest"
import { __resetDbForTests, cleanDatabaseUrl, getDb, shouldSeedDemo } from "@/lib/db"

afterEach(() => {
  vi.unstubAllEnvs()
  __resetDbForTests()
})

describe("настройка базы", () => {
  it.each(["star_wars", "localhost:5432", "mysql://x@y/z"])("понятная ошибка, если DATABASE_URL не адрес Postgres: %s", async (value) => {
    vi.stubEnv("DATABASE_URL", value)
    __resetDbForTests()
    await expect(getDb()).rejects.toThrow(/DATABASE_URL должен быть адресом Postgres/)
  })
  it("пустой DATABASE_URL (и одни пробелы) — встроенная база", async () => {
    vi.stubEnv("DATABASE_URL", "   ")
    __resetDbForTests()
    const db = await getDb()
    expect(await db.query("SELECT 1 AS ok")).toEqual([{ ok: 1 }])
  })
  it("после исправления настройки подключение поднимается заново", async () => {
    vi.stubEnv("DATABASE_URL", "star_wars")
    __resetDbForTests()
    await expect(getDb()).rejects.toThrow()
    vi.stubEnv("DATABASE_URL", "")
    expect(await (await getDb()).query("SELECT 2 AS ok")).toEqual([{ ok: 2 }])
  })
  it("на Vercel без DATABASE_URL — понятная ошибка, а не потеря данных", async () => {
    vi.stubEnv("DATABASE_URL", "")
    vi.stubEnv("VERCEL", "1")
    __resetDbForTests()
    await expect(getDb()).rejects.toThrow(/На Vercel нужна настоящая база/)
  })
  it("строка Neon: лишние для драйвера параметры убираются, sslmode остаётся", () => {
    const u = cleanDatabaseUrl("postgresql://u:p@ep-x-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require")
    expect(u).toBe("postgresql://u:p@ep-x-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require")
  })
  it("демо: локально — да, в настоящей базе — нет, SEED_DEMO решает явно", () => {
    vi.stubEnv("DATABASE_URL", "")
    vi.stubEnv("SEED_DEMO", "")
    expect(shouldSeedDemo()).toBe(true)
    vi.stubEnv("DATABASE_URL", "postgres://x@y/z")
    expect(shouldSeedDemo()).toBe(false)
    vi.stubEnv("SEED_DEMO", "1")
    expect(shouldSeedDemo()).toBe(true)
    vi.stubEnv("DATABASE_URL", "")
    vi.stubEnv("SEED_DEMO", "0")
    expect(shouldSeedDemo()).toBe(false)
  })
})
