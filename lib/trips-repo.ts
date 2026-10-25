import { getDb, type Query } from "./db"
import { slugify } from "./slug"
import { sortTrips, type City, type Entry, type Trip } from "./types"

type TripRow = {
  id: string; slug: string; title: string; country: string; year: number; period: string
  kind: string | null; is_public: boolean; created_at: Date | string; updated_at: Date | string
}
type CityRow = { id: string; trip_id: string; position: number; name: string; lat: number; lng: number; date: string; country: string | null; country_code: string | null }
type EntryRow = { id: string; city_id: string; position: number; time: string | null; text: string | null; photo: string | null }

const iso = (v: Date | string) => (v instanceof Date ? v.toISOString() : new Date(v).toISOString())

function assemble(trips: TripRow[], cities: CityRow[], entries: EntryRow[]): Trip[] {
  const entriesByCity = new Map<string, Entry[]>()
  for (const e of entries) {
    const list = entriesByCity.get(e.city_id) || []
    const entry: Entry = { id: e.id }
    if (e.time) entry.time = e.time
    if (e.text) entry.text = e.text
    if (e.photo) entry.photo = e.photo
    list.push(entry)
    entriesByCity.set(e.city_id, list)
  }
  const citiesByTrip = new Map<string, City[]>()
  for (const c of cities) {
    const list = citiesByTrip.get(c.trip_id) || []
    const ents = entriesByCity.get(c.id)
    list.push({ id: c.id, name: c.name, lat: Number(c.lat), lng: Number(c.lng), date: c.date, ...(c.country ? { country: c.country } : {}), ...(c.country_code ? { countryCode: c.country_code } : {}), ...(ents ? { entries: ents } : {}) })
    citiesByTrip.set(c.trip_id, list)
  }
  return sortTrips(
    trips.map((t) => ({
      id: t.id,
      slug: t.slug,
      title: t.title,
      country: t.country,
      year: Number(t.year),
      period: t.period,
      ...(t.kind === "country" ? { kind: "country" as const } : {}),
      isPublic: !!t.is_public,
      createdAt: iso(t.created_at),
      updatedAt: iso(t.updated_at),
      cities: citiesByTrip.get(t.id) || [],
    }))
  )
}

// Поездки с городами и заметками. where — условие на таблицу trips (алиас t).
async function load(q: Query, where: string, params: unknown[]): Promise<Trip[]> {
  const trips = await q<TripRow>(`SELECT t.* FROM trips t WHERE ${where}`, params)
  if (!trips.length) return []
  const cities = await q<CityRow>(
    `SELECT c.* FROM cities c JOIN trips t ON t.id = c.trip_id WHERE ${where} ORDER BY c.trip_id, c.position`,
    params
  )
  const entries = await q<EntryRow>(
    `SELECT e.* FROM entries e JOIN cities c ON c.id = e.city_id JOIN trips t ON t.id = c.trip_id
     WHERE ${where} ORDER BY e.city_id, e.position`,
    params
  )
  return assemble(trips, cities, entries)
}

export async function listTrips({ includePrivate }: { includePrivate: boolean }) {
  const db = await getDb()
  return load(db.query, "(t.is_public OR $1)", [includePrivate])
}

export async function getTripBySlug(slug: string, { includePrivate }: { includePrivate: boolean }) {
  const db = await getDb()
  const [trip] = await load(db.query, "t.slug = $1 AND (t.is_public OR $2)", [slug, includePrivate])
  return trip || null
}

export async function getTripById(id: string, { includePrivate }: { includePrivate: boolean }) {
  const db = await getDb()
  const [trip] = await load(db.query, "t.id = $1 AND (t.is_public OR $2)", [id, includePrivate])
  return trip || null
}

async function uniqueSlug(q: Query, trip: Trip): Promise<string> {
  const wanted = trip.slug && /^[a-z0-9-]{1,64}$/.test(trip.slug) ? trip.slug : `${slugify(trip.title)}-${trip.year}`
  const taken = new Set(
    (await q<{ slug: string }>("SELECT slug FROM trips WHERE (slug = $1 OR slug LIKE $2) AND id <> $3", [wanted, `${wanted}-%`, trip.id])).map((r) => r.slug)
  )
  if (!taken.has(wanted)) return wanted
  for (let i = 2; ; i++) if (!taken.has(`${wanted}-${i}`)) return `${wanted}-${i}`
}

// Сохранить поездку целиком (создать или заменить): строка поездки обновляется,
// а города и заметки перезаписываются в том порядке, в каком пришли
export async function saveTrip(q: Query, trip: Trip): Promise<void> {
  const [existing] = await q<{ slug: string }>("SELECT slug FROM trips WHERE id = $1", [trip.id])
  const slug = existing ? existing.slug : await uniqueSlug(q, trip)

  await q(
    `INSERT INTO trips (id, slug, title, country, year, period, kind, is_public, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, now()), now())
     ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, country = EXCLUDED.country, year = EXCLUDED.year,
       period = EXCLUDED.period, kind = EXCLUDED.kind, is_public = EXCLUDED.is_public, updated_at = now()`,
    [trip.id, slug, trip.title, trip.country, trip.year, trip.period || "", trip.kind || null, trip.isPublic, trip.createdAt || null]
  )
  await q("DELETE FROM cities WHERE trip_id = $1", [trip.id])

  if (trip.cities.length) {
    const params: unknown[] = []
    const rows = trip.cities.map((c, i) => {
      params.push(c.id, trip.id, i, c.name, c.lat, c.lng, c.date || "", c.country || null, c.countryCode || null)
      const b = i * 9
      return `(${Array.from({ length: 9 }, (_, k) => `$${b + k + 1}`).join(", ")})`
    })
    await q(
      `INSERT INTO cities (id, trip_id, position, name, lat, lng, date, country, country_code) VALUES ${rows.join(", ")}
       ON CONFLICT (id) DO UPDATE SET trip_id = EXCLUDED.trip_id, position = EXCLUDED.position, name = EXCLUDED.name,
         lat = EXCLUDED.lat, lng = EXCLUDED.lng, date = EXCLUDED.date, country = EXCLUDED.country, country_code = EXCLUDED.country_code`,
      params
    )
  }

  const entries = trip.cities.flatMap((c) => (c.entries || []).map((e, i) => ({ e, cityId: c.id, i })))
  if (entries.length) {
    const params: unknown[] = []
    const rows = entries.map(({ e, cityId, i }, n) => {
      params.push(e.id, cityId, i, e.time || null, e.text || null, e.photo || null)
      const b = n * 6
      return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6})`
    })
    await q(
      `INSERT INTO entries (id, city_id, position, time, text, photo) VALUES ${rows.join(", ")}
       ON CONFLICT (id) DO UPDATE SET city_id = EXCLUDED.city_id, position = EXCLUDED.position, time = EXCLUDED.time,
         text = EXCLUDED.text, photo = EXCLUDED.photo`,
      params
    )
  }
}

export async function upsertTrip(trip: Trip): Promise<Trip> {
  const db = await getDb()
  await db.tx((q) => saveTrip(q, trip))
  await sweepPhotos()
  const [saved] = await load(db.query, "t.id = $1", [trip.id])
  return saved
}

export async function deleteTrip(id: string): Promise<boolean> {
  const db = await getDb()
  const rows = await db.query("DELETE FROM trips WHERE id = $1 RETURNING id", [id])
  await sweepPhotos()
  return rows.length > 0
}

// Полная замена набора поездок: импорт бэкапа, сброс к демо, очистка
export async function replaceAllTrips(trips: Trip[]): Promise<Trip[]> {
  const db = await getDb()
  await db.tx(async (q) => {
    await q("DELETE FROM trips")
    for (const trip of trips) await saveTrip(q, trip)
  })
  await sweepPhotos()
  return load(db.query, "true", [])
}

/* ---------- фото ---------- */

export async function insertPhoto(id: string, mime: string, data: Uint8Array) {
  const db = await getDb()
  await db.query("INSERT INTO photos (id, mime, data) VALUES ($1, $2, $3)", [id, mime, data])
}

export async function getPhoto(id: string) {
  const db = await getDb()
  const [row] = await db.query<{ mime: string; data: Uint8Array }>("SELECT mime, data FROM photos WHERE id = $1", [id])
  return row || null
}

// Уборка фото, на которые больше не ссылается ни одна заметка. Удаляем не
// сразу: свежезагруженное (ещё не сохранённое) фото ждёт час, а «осиротевшее» —
// три дня, чтобы «Отменить» после удаления заметки или поездки не ломал картинки.
export async function sweepPhotos() {
  try {
    const db = await getDb()
    const ref = "EXISTS (SELECT 1 FROM entries e WHERE e.photo = '/api/photos/' || p.id)"
    await db.query(`UPDATE photos p SET orphaned_at = NULL WHERE orphaned_at IS NOT NULL AND ${ref}`)
    await db.query(`UPDATE photos p SET orphaned_at = now() WHERE orphaned_at IS NULL AND created_at < now() - interval '1 hour' AND NOT ${ref}`)
    await db.query("DELETE FROM photos WHERE orphaned_at < now() - interval '3 days'")
  } catch {
    // уборка — не критична, ошибка не должна ломать сохранение
  }
}
