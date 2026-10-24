import { mkdirSync } from "node:fs"
import path from "node:path"

// Тонкая обёртка над двумя драйверами с одинаковым SQL:
// • DATABASE_URL задан → обычный Postgres (Neon на Vercel, свой на VPS);
// • не задан → PGlite, Postgres внутри процесса, данные в папке .data.
// Остальной код видит только query() и tx() и не знает, что под капотом.

export type Query = <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<T[]>
export type Db = { query: Query; tx: <T>(fn: (q: Query) => Promise<T>) => Promise<T> }

const SCHEMA = `
CREATE TABLE IF NOT EXISTS trips (
  id text PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  country text NOT NULL,
  year integer NOT NULL,
  period text NOT NULL DEFAULT '',
  kind text,
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cities (
  id text PRIMARY KEY,
  trip_id text NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  position integer NOT NULL,
  name text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  date text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS cities_trip_idx ON cities(trip_id);
CREATE TABLE IF NOT EXISTS entries (
  id text PRIMARY KEY,
  city_id text NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  position integer NOT NULL,
  time text,
  text text,
  photo text
);
CREATE INDEX IF NOT EXISTS entries_city_idx ON entries(city_id);
CREATE TABLE IF NOT EXISTS photos (
  id text PRIMARY KEY,
  mime text NOT NULL,
  data bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  orphaned_at timestamptz
);
CREATE TABLE IF NOT EXISTS meta (
  key text PRIMARY KEY,
  value text NOT NULL
);
`

// Параметры из строки подключения, которые понимает только libpq (psql и т.п.).
// Neon по умолчанию дописывает channel_binding=require — postgres.js отправил бы
// его серверу как настройку сессии, и подключение упало бы.
const LIBPQ_ONLY = ["channel_binding", "gssencmode", "sslcompression", "sslcert", "sslkey", "sslpassword", "krbsrvname", "target_session_attrs_any"]

// Адрес базы: DATABASE_URL, а если базу подключили через Vercel Storage
// под другим именем — POSTGRES_URL
export const databaseUrl = () => process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim() || ""

export function cleanDatabaseUrl(raw: string): string {
  try {
    const u = new URL(raw)
    for (const k of LIBPQ_ONLY) u.searchParams.delete(k)
    return u.toString()
  } catch {
    return raw
  }
}

// Демо-поездки: по умолчанию только во встроенной базе (локальный запуск).
// В настоящей базе (прод) атлас стартует пустым. SEED_DEMO=1 / 0 — включить / выключить явно.
export function shouldSeedDemo(): boolean {
  const v = process.env.SEED_DEMO?.trim()
  if (v === "1" || v === "true") return true
  if (v === "0" || v === "false") return false
  return !databaseUrl()
}

async function connect(): Promise<Db> {
  const url = databaseUrl()
  // На Vercel диск временный и только для чтения: встроенная база там не
  // сохранит данные — без DATABASE_URL лучше сразу понятная ошибка
  if (!url && process.env.VERCEL) {
    throw new Error(
      "На Vercel нужна настоящая база: добавьте DATABASE_URL (например, из Neon) в Settings → Environment Variables и сделайте Redeploy."
    )
  }
  if (url) {
    // Частая ошибка — вписать сюда пароль или что-то ещё вместо адреса базы
    if (!/^postgres(ql)?:\/\//.test(url)) {
      throw new Error(
        "DATABASE_URL должен быть адресом Postgres вида postgres://user:pass@host/db. " +
          "Для локального запуска оставьте его пустым — данные будут во встроенной базе в папке .data."
      )
    }
    const { default: postgres } = await import("postgres")
    const sql = postgres(cleanDatabaseUrl(url), {
      // на serverless (Vercel) каждое обращение — отдельный короткий процесс,
      // много соединений не нужно; prepare:false — для пулеров вроде pgbouncer
      max: process.env.VERCEL ? 1 : 5,
      prepare: false,
      idle_timeout: 20,
      onnotice: () => {},
    })
    const wrap = (s: typeof sql): Query =>
      (async (text: string, params: unknown[] = []) =>
        (await s.unsafe(text, params as never[])) as unknown[]) as Query
    return {
      query: wrap(sql),
      tx: (fn) => sql.begin((t) => fn(wrap(t as unknown as typeof sql))) as never,
    }
  }

  const { PGlite } = await import("@electric-sql/pglite")
  const dir = process.env.PGLITE_DIR || path.join(process.cwd(), ".data", "pglite")
  // memory:// — база в памяти (для тестов), ей папка не нужна
  if (!dir.startsWith("memory://")) mkdirSync(dir, { recursive: true })
  const db = await PGlite.create(dir)
  const wrap = (d: { query: (t: string, p?: unknown[]) => Promise<{ rows: unknown[] }> }): Query =>
    (async (text: string, params: unknown[] = []) => (await d.query(text, params)).rows) as Query
  return {
    query: wrap(db),
    tx: (fn) => db.transaction((t) => fn(wrap(t))),
  }
}

async function init(): Promise<Db> {
  const db = await connect()
  // Схема создаётся сама при первом обращении — никаких отдельных миграций.
  // На Vercel несколько копий приложения могут проснуться одновременно —
  // блокировка в базе гарантирует, что схему и демо создаст только одна.
  await db.tx(async (q) => {
    await q("SELECT pg_advisory_xact_lock(7240012)")
    for (const stmt of SCHEMA.split(";").map((s) => s.trim()).filter(Boolean)) await q(stmt)
    // Флаг в meta ставится и без демо — чтобы атлас, из которого всё удалили,
    // не заполнился демо заново при следующем запуске
    const seeded = await q<{ value: string }>("SELECT value FROM meta WHERE key = 'seeded'")
    if (seeded.length) return
    if (shouldSeedDemo()) {
      const { demoTrips } = await import("./demo-data")
      const { saveTrip } = await import("./trips-repo")
      for (const trip of demoTrips) await saveTrip(q, trip)
    }
    await q("INSERT INTO meta (key, value) VALUES ('seeded', '1') ON CONFLICT (key) DO NOTHING")
  })
  return db
}

// Одно подключение на процесс (в dev переживает горячую перезагрузку)
const g = globalThis as unknown as { __atlasDb?: Promise<Db> }

// Только для тестов: сбросить подключение, чтобы следующий getDb() поднял чистую базу
export function __resetDbForTests() {
  g.__atlasDb = undefined
}

export function getDb(): Promise<Db> {
  if (!g.__atlasDb) {
    g.__atlasDb = init().catch((err) => {
      g.__atlasDb = undefined
      throw err
    })
  }
  return g.__atlasDb
}
