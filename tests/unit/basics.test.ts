import { describe, expect, it } from "vitest"
import { slugify } from "@/lib/slug"
import { findCity, newId, sortTrips } from "@/lib/types"
import { citiesTag, countLabel, dict, t } from "@/lib/i18n"
import { demoTrips } from "@/lib/demo-data"
import { makeTrip } from "../fixtures"

describe("slugify", () => {
  it("транслитерирует кириллицу", () => {
    expect(slugify("Япония")).toBe("yaponiya")
    expect(slugify("Щёлково и Жуковский")).toBe("schelkovo-i-zhukovskiy")
  })
  it("чистит пробелы, знаки и диакритику", () => {
    expect(slugify("  São Paulo!!  2025 ")).toBe("sao-paulo-2025")
    expect(slugify("Тбилиси — Казбеги")).toBe("tbilisi-kazbegi")
  })
  it("не возвращает пустую строку", () => {
    expect(slugify("🙂🙂")).toBe("trip")
    expect(slugify("")).toBe("trip")
  })
  it("ограничивает длину", () => {
    expect(slugify("а".repeat(200)).length).toBeLessThanOrEqual(48)
  })
})

describe("sortTrips / findCity / newId", () => {
  it("свежие по году выше, внутри года — недавно добавленные", () => {
    const a = makeTrip({ id: "a", year: 2024, createdAt: "2024-01-01T00:00:00.000Z" })
    const b = makeTrip({ id: "b", year: 2025, createdAt: "2025-01-01T00:00:00.000Z" })
    const c = makeTrip({ id: "c", year: 2025, createdAt: "2025-06-01T00:00:00.000Z" })
    expect(sortTrips([a, b, c]).map((x) => x.id)).toEqual(["c", "b", "a"])
  })
  it("не мутирует исходный массив", () => {
    const list = [makeTrip({ id: "a", year: 2020 }), makeTrip({ id: "b", year: 2030 })]
    sortTrips(list)
    expect(list.map((x) => x.id)).toEqual(["a", "b"])
  })
  it("находит город вместе с поездкой", () => {
    const found = findCity(demoTrips, "kyoto")
    expect(found?.city.name).toBe("Киото")
    expect(found?.trip.id).toBe("japan-2025")
    expect(findCity(demoTrips, "nope")).toBeNull()
  })
  it("newId уникален и подходит под валидацию id", () => {
    const ids = new Set(Array.from({ length: 500 }, newId))
    expect(ids.size).toBe(500)
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]+$/)
  })
})

describe("i18n", () => {
  it("в русском и английском одинаковый набор ключей и нет пустых строк", () => {
    expect(Object.keys(dict.en).sort()).toEqual(Object.keys(dict.ru).sort())
    for (const lang of ["ru", "en"] as const) for (const v of Object.values(dict[lang])) expect(v.trim()).not.toBe("")
  })
  it("t возвращает строку нужного языка", () => {
    expect(t("ru", "navMap")).toBe("Карта")
    expect(t("en", "navMap")).toBe("Map")
  })
  it.each([
    [1, "1 город"], [2, "2 города"], [4, "4 города"], [5, "5 городов"], [11, "11 городов"],
    [12, "12 городов"], [21, "21 город"], [22, "22 города"], [25, "25 городов"], [111, "111 городов"], [0, "0 городов"],
  ])("русское склонение: %i → %s", (n, s) => {
    expect(countLabel("ru", n, "city")).toBe(s)
  })
  it("английское множественное число", () => {
    expect(countLabel("en", 1, "city")).toBe("1 city")
    expect(countLabel("en", 3, "city")).toBe("3 cities")
    expect(countLabel("en", 2, "country")).toBe("2 countries")
    expect(countLabel("en", 2, "trip")).toBe("2 trips")
  })
  it("«без городов» — только у страны-отметки и пустой поездки", () => {
    expect(citiesTag("ru", { cities: [1] })).toBe("1 город")
    expect(citiesTag("ru", { kind: "country", cities: [1] })).toBe("без городов")
    expect(citiesTag("en", { cities: [] })).toBe("no cities")
    expect(citiesTag("ru", { cities: [1, 2, 3] })).toBe("3 города")
  })
})

describe("демо-данные", () => {
  it("корректны: уникальные id, координаты в пределах, есть slug", () => {
    const ids = new Set<string>()
    for (const trip of demoTrips) {
      expect(trip.slug).toMatch(/^[a-z0-9-]+$/)
      for (const c of trip.cities) {
        expect(ids.has(c.id)).toBe(false)
        ids.add(c.id)
        expect(Math.abs(c.lat)).toBeLessThanOrEqual(90)
        expect(Math.abs(c.lng)).toBeLessThanOrEqual(180)
      }
    }
  })
})
