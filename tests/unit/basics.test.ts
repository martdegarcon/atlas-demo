import { countCountries, placeCount } from "@/lib/types"
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
    [1, "1 место"], [2, "2 места"], [4, "4 места"], [5, "5 мест"], [11, "11 мест"],
    [12, "12 мест"], [21, "21 место"], [22, "22 места"], [25, "25 мест"], [111, "111 мест"], [0, "0 мест"],
  ])("русское склонение: %i → %s", (n, s) => {
    expect(countLabel("ru", n, "place")).toBe(s)
  })
  it("английское множественное число", () => {
    expect(countLabel("en", 1, "place")).toBe("1 location")
    expect(countLabel("en", 3, "place")).toBe("3 locations")
    expect(countLabel("en", 2, "country")).toBe("2 countries")
    expect(countLabel("en", 2, "trip")).toBe("2 trips")
  })
  it("«без мест» — только у страны-отметки и пустой поездки", () => {
    expect(citiesTag("ru", { cities: [1] })).toBe("1 место")
    expect(citiesTag("ru", { kind: "country", cities: [1] })).toBe("без мест")
    expect(citiesTag("en", { cities: [] })).toBe("no locations")
    expect(citiesTag("ru", { cities: [1, 2, 3] })).toBe("3 места")
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

describe("подсчёт стран и мест", () => {
  const city = (id: string, extra: object = {}) => ({ id, name: id, lat: 0, lng: 0, date: "", ...extra })
  const trip = (id: string, country: string, cities: object[], extra: object = {}) =>
    ({ id, title: id, country, year: 2026, period: "", isPublic: true, cities, ...extra }) as never

  it("тур через несколько стран считается по странам его точек", () => {
    const trips = [
      trip("eu", "Германия", [city("berlin", { country: "Германия", countryCode: "de" }), city("paris", { country: "Франция", countryCode: "fr" }), city("rome", { country: "Италия", countryCode: "it" })]),
      trip("jp", "Япония", [city("tokyo", { country: "Япония", countryCode: "jp" })]),
    ]
    expect(countCountries(trips)).toBe(4)
  })
  it("одна страна под разными названиями и без кода — без дублей", () => {
    const trips = [
      trip("a", "Россия", [city("msk", { country: "Россия", countryCode: "ru" })]),
      trip("b", "Russia", [city("spb", { country: "Russia", countryCode: "ru" })]),
      // старая точка без страны — по названию страны тура, которое уже связано с кодом
      trip("c", "Россия", [city("kzn")]),
    ]
    expect(countCountries(trips)).toBe(1)
  })
  it("старые данные без стран у точек — как раньше, по турам", () => {
    expect(countCountries([trip("a", "Япония", [city("1")]), trip("b", "Япония", [city("2")]), trip("c", "Грузия", [city("3")])])).toBe(2)
  })
  it("места: точки туров, страна-отметка не место", () => {
    expect(placeCount([trip("a", "Япония", [city("1"), city("2")]), trip("b", "Грузия", [city("3")], { kind: "country" })])).toBe(2)
  })
})
