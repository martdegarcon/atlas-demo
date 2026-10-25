import { beforeEach, describe, expect, it } from "vitest"
import { __resetDbForTests, getDb } from "@/lib/db"
import {
  deleteTrip, getPhoto, getTripById, getTripBySlug, insertPhoto, listTrips, replaceAllTrips, sweepPhotos, upsertTrip,
} from "@/lib/trips-repo"
import { demoTrips } from "@/lib/demo-data"
import { makeTrip, TINY_JPEG } from "../fixtures"

// Каждый тест — с чистой базой в памяти (PGLITE_DIR=memory://)
beforeEach(() => __resetDbForTests())

describe("первый запуск", () => {
  it("создаёт схему и заполняет демо-данными", async () => {
    const trips = await listTrips({ includePrivate: true })
    expect(trips.map((t) => t.slug)).toEqual(["japan-2025", "portugal-2024", "turkey-2023"])
    const japan = trips[0]
    expect(japan.cities.map((c) => c.id)).toEqual(demoTrips[0].cities.map((c) => c.id))
    expect(japan.cities[0].entries).toHaveLength(3)
    expect(japan.isPublic).toBe(true)
  })

  it("после «чистого листа» демо не возвращаются при повторном подключении", async () => {
    await replaceAllTrips([])
    const db = await getDb()
    // имитируем рестарт процесса с той же базой: повторный init не должен сидировать
    const seeded = await db.query<{ value: string }>("SELECT value FROM meta WHERE key = 'seeded'")
    expect(seeded).toHaveLength(1)
    expect(await listTrips({ includePrivate: true })).toEqual([])
  })
})

describe("сохранение поездки", () => {
  it("создаёт с slug из названия и года, сохраняет порядок и заметки", async () => {
    const saved = await upsertTrip(makeTrip())
    expect(saved.slug).toBe("gruziya-2026")
    expect(saved.cities.map((c) => c.name)).toEqual(["Тбилиси", "Казбеги", "Батуми"])
    expect(saved.cities[0].entries?.[0]).toEqual({ id: "tb-1", time: "1 мая, 10:00", text: "Серные бани." })
    expect(saved.cities[1].entries).toBeUndefined()
    expect(saved.createdAt).toBe("2026-05-09T00:00:00.000Z")
  })

  it("одинаковые названия получают разные slug", async () => {
    const a = await upsertTrip(makeTrip({ id: "g1" }))
    const b = await upsertTrip({ ...makeTrip({ id: "g2" }), cities: [{ id: "x", name: "X", lat: 1, lng: 1, date: "" }] })
    const c = await upsertTrip({ ...makeTrip({ id: "g3" }), cities: [{ id: "y", name: "Y", lat: 1, lng: 1, date: "" }] })
    expect([a.slug, b.slug, c.slug]).toEqual(["gruziya-2026", "gruziya-2026-2", "gruziya-2026-3"])
  })

  it("slug не меняется при переименовании — отправленные ссылки живут", async () => {
    await upsertTrip(makeTrip())
    const renamed = await upsertTrip(makeTrip({ title: "Сакартвело" }))
    expect(renamed.title).toBe("Сакартвело")
    expect(renamed.slug).toBe("gruziya-2026")
  })

  it("перезаписывает города: удалённые исчезают, порядок обновляется", async () => {
    const trip = makeTrip()
    await upsertTrip(trip)
    const next = { ...trip, cities: [trip.cities[2], trip.cities[0]] }
    const saved = await upsertTrip(next)
    expect(saved.cities.map((c) => c.id)).toEqual(["batumi", "tbilisi"])
    const db = await getDb()
    expect(await db.query("SELECT id FROM cities WHERE id = 'kazbegi'")).toHaveLength(0)
  })

  it("updatedAt растёт при каждом сохранении", async () => {
    const a = await upsertTrip(makeTrip())
    await new Promise((r) => setTimeout(r, 10))
    const b = await upsertTrip(makeTrip({ period: "2–9 мая" }))
    expect(new Date(b.updatedAt!).getTime()).toBeGreaterThan(new Date(a.updatedAt!).getTime())
  })

  it("страна у каждой точки сохраняется (тур через несколько стран)", async () => {
    const t = makeTrip({ id: "multi" })
    t.cities[0] = { ...t.cities[0], country: "Грузия", countryCode: "ge" }
    t.cities[1] = { ...t.cities[1], country: "Армения", countryCode: "am" }
    const saved = await upsertTrip(t)
    expect(saved.cities.map((c) => c.countryCode)).toEqual(["ge", "am", undefined])
    expect(saved.cities[1].country).toBe("Армения")
    expect((await getTripById("multi", { includePrivate: true }))!.cities[0]).toMatchObject({ country: "Грузия", countryCode: "ge" })
  })
  it("страна-отметка сохраняет kind", async () => {
    const saved = await upsertTrip(makeTrip({ id: "fr", title: "Франция", kind: "country", cities: [{ id: "fr-c", name: "Франция", lat: 46, lng: 2, date: "" }] }))
    expect(saved.kind).toBe("country")
  })

  it("сохранение атомарно: при ошибке ничего не меняется", async () => {
    await upsertTrip(makeTrip())
    const broken = makeTrip({ title: "Сломано" })
    broken.cities = [broken.cities[0], { ...broken.cities[1], id: "tbilisi" }] // дубль id внутри одной вставки
    await expect(upsertTrip(broken)).rejects.toThrow()
    const trip = await getTripById("georgia", { includePrivate: true })
    expect(trip?.title).toBe("Грузия")
    expect(trip?.cities).toHaveLength(3)
  })
})

describe("видимость", () => {
  it("скрытые поездки не видны гостю ни в списке, ни по id, ни по slug", async () => {
    await upsertTrip(makeTrip({ isPublic: false }))
    expect((await listTrips({ includePrivate: false })).some((t) => t.id === "georgia")).toBe(false)
    expect(await getTripById("georgia", { includePrivate: false })).toBeNull()
    expect(await getTripBySlug("gruziya-2026", { includePrivate: false })).toBeNull()
    expect(await getTripBySlug("gruziya-2026", { includePrivate: true })).not.toBeNull()
  })
  it("города и заметки скрытой поездки не утекают в публичный список", async () => {
    await upsertTrip(makeTrip({ isPublic: false }))
    const pub = await listTrips({ includePrivate: false })
    expect(JSON.stringify(pub)).not.toContain("Серные бани")
  })
})

describe("удаление и замена", () => {
  it("удаление каскадно убирает города и заметки", async () => {
    await upsertTrip(makeTrip())
    expect(await deleteTrip("georgia")).toBe(true)
    expect(await deleteTrip("georgia")).toBe(false)
    const db = await getDb()
    expect(await db.query("SELECT id FROM cities WHERE trip_id = 'georgia'")).toHaveLength(0)
    expect(await db.query("SELECT id FROM entries WHERE id = 'tb-1'")).toHaveLength(0)
  })
  it("повторное сохранение после удаления возвращает поездку с тем же slug («Отменить»)", async () => {
    const first = await upsertTrip(makeTrip())
    await deleteTrip("georgia")
    const back = await upsertTrip({ ...makeTrip(), slug: first.slug })
    expect(back.slug).toBe(first.slug)
  })
  it("replaceAllTrips заменяет набор целиком", async () => {
    const out = await replaceAllTrips([makeTrip()])
    expect(out.map((t) => t.id)).toEqual(["georgia"])
    const again = await replaceAllTrips(demoTrips)
    expect(again).toHaveLength(3)
  })
})

describe("фото", () => {
  it("сохраняются и читаются байт в байт", async () => {
    await insertPhoto("p1", "image/jpeg", TINY_JPEG)
    const p = await getPhoto("p1")
    expect(p?.mime).toBe("image/jpeg")
    expect(Buffer.from(p!.data).equals(TINY_JPEG)).toBe(true)
    expect(await getPhoto("nope")).toBeNull()
  })

  it("уборка: свежие не трогаем, осиротевшие удаляем через 3 дня, используемые никогда", async () => {
    const db = await getDb()
    await insertPhoto("used", "image/jpeg", TINY_JPEG)
    await insertPhoto("fresh", "image/jpeg", TINY_JPEG)
    await insertPhoto("old", "image/jpeg", TINY_JPEG)
    await db.query("UPDATE photos SET created_at = now() - interval '2 hours' WHERE id IN ('used', 'old')")
    const trip = makeTrip()
    trip.cities[0].entries = [{ id: "e", photo: "/api/photos/used" }]
    await upsertTrip(trip) // внутри — sweepPhotos

    const state = async () => Object.fromEntries((await db.query<{ id: string; orphaned_at: unknown }>("SELECT id, orphaned_at FROM photos")).map((r) => [r.id, r.orphaned_at !== null]))
    expect(await state()).toEqual({ used: false, fresh: false, old: true })

    // через 3 дня «осиротевшее» удаляется
    await db.query("UPDATE photos SET orphaned_at = now() - interval '4 days' WHERE id = 'old'")
    await sweepPhotos()
    expect(Object.keys(await state()).sort()).toEqual(["fresh", "used"])

    // удалили заметку — фото помечено, но живо (успеем «Отменить»)
    await upsertTrip(makeTrip())
    expect((await state()).used).toBe(true)
    expect(await getPhoto("used")).not.toBeNull()
    // вернули заметку — пометка снимается
    await upsertTrip(trip)
    expect((await state()).used).toBe(false)
  })
})
