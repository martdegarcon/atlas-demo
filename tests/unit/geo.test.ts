import { afterEach, describe, expect, it, vi } from "vitest"
import { citiesWithoutCountry, reverseCountry, withCountries } from "@/lib/geo"
import { makeTrip } from "../fixtures"

afterEach(() => vi.unstubAllGlobals())

describe("страна по координатам", () => {
  it("берёт код и название страны, язык — как у названия тура", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ address: { country: "Грузия", country_code: "GE" } })))
    vi.stubGlobal("fetch", fetchMock)
    expect(await reverseCountry(41.7, 44.8, "ru")).toEqual({ country: "Грузия", countryCode: "ge" })
    const url = String((fetchMock.mock.calls[0] as unknown[])[0])
    expect(url).toContain("zoom=3")
    expect(url).toContain("accept-language=ru")
  })
  it("нет страны (океан) или ошибка — null", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Unable to geocode" }))))
    expect(await reverseCountry(0, -30, "en")).toBeNull()
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 429 })))
    expect(await reverseCountry(0, 0, "en")).toBeNull()
  })
  it("какие точки досчитать и как вписать результат, не трогая остальное", () => {
    const t = makeTrip()
    t.cities[0] = { ...t.cities[0], country: "Грузия", countryCode: "ge" }
    const todo = citiesWithoutCountry([t])
    expect(todo.map((x) => x.city.id)).toEqual([t.cities[1].id, t.cities[2].id])
    expect(todo[0].lang).toBe("ru")
    const { trips, changed } = withCountries([t], new Map([[t.cities[1].id, { country: "Грузия", countryCode: "ge" }]]))
    expect(changed).toEqual([t.id])
    expect(trips[0].cities[1]).toMatchObject({ name: t.cities[1].name, countryCode: "ge" })
    expect(trips[0].cities[2].countryCode).toBeUndefined()
    // уже известную страну не перезаписываем
    expect(withCountries(trips, new Map([[t.cities[0].id, { countryCode: "xx" }]])).changed).toEqual([])
  })
})
