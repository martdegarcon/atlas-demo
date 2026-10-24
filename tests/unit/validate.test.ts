import { describe, expect, it } from "vitest"
import { parseBulk, parseTrip } from "@/lib/validate"
import { demoTrips } from "@/lib/demo-data"
import { makeTrip } from "../fixtures"

describe("parseTrip", () => {
  it("принимает нормальную поездку", () => {
    const trip = parseTrip(makeTrip())
    expect(trip?.title).toBe("Грузия")
    expect(trip?.cities).toHaveLength(3)
  })

  it("принимает все демо-поездки", () => {
    for (const t of demoTrips) expect(parseTrip(t)).not.toBeNull()
  })

  it("подставляет значения по умолчанию", () => {
    const raw = makeTrip() as Record<string, unknown>
    delete raw.isPublic
    delete raw.period
    const trip = parseTrip(raw)!
    expect(trip.isPublic).toBe(true)
    expect(trip.period).toBe("")
  })

  it("обрезает пробелы и отбрасывает лишние поля", () => {
    const trip = parseTrip({ ...makeTrip({ title: "  Грузия  " }), hacker: "x", updatedAt: "2020-01-01" }) as Record<string, unknown>
    expect(trip.title).toBe("Грузия")
    expect(trip.hacker).toBeUndefined()
    expect(trip.updatedAt).toBeUndefined()
  })

  it.each([
    ["пустое название", { title: "   " }],
    ["нет городов", { cities: [] }],
    ["год вне диапазона", { year: 1200 }],
    ["дробный год", { year: 2025.5 }],
    ["год из далёкого будущего", { year: new Date().getFullYear() + 2 }],
    ["слишком длинное название", { title: "а".repeat(81) }],
    ["плохой id", { id: "../../etc" }],
    ["неизвестный kind", { kind: "planet" }],
  ])("отклоняет: %s", (_name, patch) => {
    expect(parseTrip(makeTrip(patch as never))).toBeNull()
  })

  it.each([
    ["широта > 90", { lat: 91 }],
    ["долгота < -180", { lng: -181 }],
    ["координаты строкой", { lat: "41" }],
    ["пустое имя города", { name: "" }],
    ["слишком длинное имя", { name: "x".repeat(200) }],
  ])("отклоняет город: %s", (_name, patch) => {
    const trip = makeTrip()
    trip.cities[0] = { ...trip.cities[0], ...(patch as object) }
    expect(parseTrip(trip)).toBeNull()
  })

  it.each([
    ["свои загрузки", "/api/photos/0b1c2d3e-aaaa-bbbb-cccc-1234567890ab", true],
    ["https", "https://images.unsplash.com/photo-1?w=800", true],
    ["http", "http://example.com/a.jpg", false],
    ["javascript:", "javascript:alert(1)", false],
    ["data:", "data:image/png;base64,AAAA", false],
    ["кавычки внутри", 'https://x.com/a.jpg" onerror="alert(1)', false],
    ["чужой путь api", "/api/trips/1", false],
  ])("фото: %s", (_name, photo, ok) => {
    const trip = makeTrip()
    trip.cities[0].entries = [{ id: "e1", photo }]
    expect(parseTrip(trip) !== null).toBe(ok)
  })

  it("ограничивает длину заметки", () => {
    const trip = makeTrip()
    trip.cities[0].entries = [{ id: "e1", text: "a".repeat(5001) }]
    expect(parseTrip(trip)).toBeNull()
  })

  it("не падает на мусоре", () => {
    for (const junk of [null, undefined, 42, "trip", [], { cities: "x" }]) expect(parseTrip(junk)).toBeNull()
  })
})

describe("parseBulk", () => {
  it("принимает набор и пустой набор", () => {
    expect(parseBulk({ trips: demoTrips })).toHaveLength(3)
    expect(parseBulk({ trips: [] })).toEqual([])
  })
  it("отклоняет дубли id поездок, городов и заметок", () => {
    const a = makeTrip()
    expect(parseBulk({ trips: [a, a] })).toBeNull()
    expect(parseBulk({ trips: [a, makeTrip({ id: "other" })] })).toBeNull() // те же id городов
    const b = makeTrip({ id: "b", cities: [{ id: "x1", name: "X", lat: 1, lng: 1, date: "", entries: [{ id: "tb-1", text: "dup" }] }] })
    expect(parseBulk({ trips: [a, b] })).toBeNull()
  })
  it("отклоняет неверную форму", () => {
    expect(parseBulk(demoTrips)).toBeNull()
    expect(parseBulk({ trips: "nope" })).toBeNull()
  })
})
