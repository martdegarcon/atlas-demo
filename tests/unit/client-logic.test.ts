import { describe, expect, it, vi } from "vitest"

// Модули импортируют браузерные библиотеки — для чистой логики они не нужны
vi.mock("maplibre-gl", () => ({ default: {} }))
vi.mock("mp4-muxer", () => ({}))
vi.mock("gsap", () => ({ default: {} }))

const { parseGoogleMapsUrl, isShortLink } = await import("@/components/add-place")
const { normalizeBackup } = await import("@/components/editors")
const { buildTimeline, frameAt } = await import("@/lib/export-video")
const { applyPalette, buildStyle, PALETTE_DARK, PALETTE_LIGHT } = await import("@/lib/map-style")
const { demoTrips } = await import("@/lib/demo-data")

describe("разбор ссылок Google Maps", () => {
  it("точная метка !3d!4d важнее центра карты", () => {
    const url = "https://www.google.com/maps/place/Fushimi+Inari+Taisha/@34.9671,135.7727,17z/data=!4m6!3m5!1s0x0:0x0!8m2!3d34.9676945!4d135.7791876"
    expect(parseGoogleMapsUrl(url)).toEqual({ name: "Fushimi Inari Taisha", lat: 34.9676945, lng: 135.7791876 })
  })
  it("центр карты @lat,lng", () => {
    expect(parseGoogleMapsUrl("https://www.google.com/maps/@41.7151,44.8271,13z")).toEqual({ name: undefined, lat: 41.7151, lng: 44.8271 })
  })
  it("?q=lat,lng и отрицательные координаты", () => {
    expect(parseGoogleMapsUrl("https://maps.google.com/?q=-33.8688,151.2093")).toMatchObject({ lat: -33.8688, lng: 151.2093 })
    expect(parseGoogleMapsUrl("https://www.google.com/maps/@-22.9068,-43.1729,12z")).toMatchObject({ lat: -22.9068, lng: -43.1729 })
  })
  it("кириллица и битое кодирование в названии", () => {
    expect(parseGoogleMapsUrl("https://www.google.com/maps/place/%D0%9A%D0%B8%D0%BE%D1%82%D0%BE/@35.01,135.76,12z")?.name).toBe("Киото")
    expect(parseGoogleMapsUrl("https://www.google.com/maps/place/Bad%E0name/@1.5,2.5,3z")?.name).toBe("Bad%E0name")
  })
  it("без координат — null", () => {
    expect(parseGoogleMapsUrl("https://maps.app.goo.gl/AbCdEf")).toBeNull()
    expect(parseGoogleMapsUrl("not a link")).toBeNull()
  })
  it("распознаёт короткие ссылки", () => {
    expect(isShortLink("https://maps.app.goo.gl/AbCdEf")).toBe(true)
    expect(isShortLink("https://goo.gl/maps/x")).toBe(true)
    expect(isShortLink("https://www.google.com/maps")).toBe(false)
    expect(isShortLink("мусор")).toBe(false)
  })
})

describe("normalizeBackup", () => {
  it("принимает бэкап этого приложения и голый массив", () => {
    expect(normalizeBackup({ trips: demoTrips })).toHaveLength(3)
    expect(normalizeBackup(demoTrips)).toHaveLength(3)
  })
  it("переносит бэкап из HTML-превью: без isPublic, с data:-фото", () => {
    const old = [{ id: "x", title: "Старое", year: "2023", cities: [{ id: "c", name: "Город", lat: 1, lng: 2, entries: [{ id: "e", text: "привет", photo: "data:image/jpeg;base64,AAA" }, { id: "e2", photo: "data:image/png;base64,BBB" }] }] }]
    const [trip] = normalizeBackup(old)!
    expect(trip.isPublic).toBe(true)
    expect(trip.year).toBe(2023)
    expect(trip.country).toBe("Старое")
    expect(trip.cities[0].date).toBe("—")
    // фото из браузера не переносятся, пустая после этого заметка выбрасывается
    expect(trip.cities[0].entries).toEqual([{ id: "e", text: "привет", time: undefined, photo: undefined }])
  })
  it("чинит негодные id и выкидывает пустые поездки", () => {
    const out = normalizeBackup([{ id: "bad id!", title: "T", cities: [{ id: "../x", name: "A", lat: 0, lng: 0 }] }, { title: "Пусто", cities: [] }])!
    expect(out).toHaveLength(1)
    expect(out[0].id).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(out[0].cities[0].id).toMatch(/^[A-Za-z0-9_-]+$/)
  })
  it("отклоняет мусор", () => {
    for (const junk of [null, 1, "x", { foo: 1 }, [{ title: 1 }], [{ title: "a", cities: [{ name: "b", lat: "1", lng: 0 }] }]]) expect(normalizeBackup(junk)).toBeNull()
  })
})

describe("сценарий видео-пролёта", () => {
  const overview = (trip: (typeof demoTrips)[number]) => ({ lng: trip.cities[0].lng, lat: trip.cities[0].lat, zoom: 6 })
  const FPS = 30

  it.each(demoTrips.map((t) => [t.title, t] as const))("%s: плавно, без NaN, каждый город с карточкой", (_n, trip) => {
    const { segs, duration } = buildTimeline(trip, overview(trip))
    expect(duration).toBeGreaterThan(8)
    expect(duration).toBeLessThan(40)
    const shown = new Set<number>()
    let prev: ReturnType<typeof frameAt> | null = null
    for (let i = 0; i < Math.ceil(duration * FPS); i++) {
      const f = frameAt(segs, i / FPS, trip.cities.length)
      for (const v of [f.cam.lng, f.cam.lat, f.cam.zoom, f.cam.pitch, f.cam.bearing, f.route]) expect(Number.isFinite(v)).toBe(true)
      expect(f.cam.zoom).toBeGreaterThanOrEqual(1)
      expect(f.route).toBeGreaterThanOrEqual(0)
      expect(f.route).toBeLessThanOrEqual(trip.cities.length - 1)
      if (prev) {
        expect(Math.abs(f.cam.zoom - prev.cam.zoom)).toBeLessThan(0.7) // нет рывков камеры
        expect(f.route).toBeGreaterThanOrEqual(prev.route - 1e-9) // маршрут только растёт
      }
      if (f.cardAlpha > 0.95) shown.add(f.current)
      prev = f
    }
    expect([...shown].sort((a, b) => a - b)).toEqual(trip.cities.map((_, i) => i))
    const last = frameAt(segs, duration - 0.01, trip.cities.length)
    expect(last.endAlpha).toBe(1)
  })

  it("интро в начале, финал в конце", () => {
    const trip = demoTrips[0]
    const { segs, duration } = buildTimeline(trip, overview(trip))
    expect(frameAt(segs, 1, 6).introAlpha).toBe(1)
    expect(frameAt(segs, 1, 6).dotsAlpha).toBe(0)
    expect(frameAt(segs, duration + 5, 6).endAlpha).toBe(1) // за концом — последний кадр
  })

  it("перелёт через линию перемены дат идёт коротким путём", () => {
    const trip = { ...demoTrips[0], cities: [
      { id: "a", name: "Фиджи", lat: -17.7, lng: 178.0, date: "" },
      { id: "b", name: "Самоа", lat: -13.8, lng: -172.1, date: "" },
    ] }
    const { segs } = buildTimeline(trip, { lng: 180, lat: -15, zoom: 4 })
    const fly = segs.find((s) => s.kind === "fly" && s.dest === 1)!
    for (let u = 0; u <= 1; u += 0.1) {
      const f = frameAt(segs, fly.t0 + fly.dur * u, 2)
      const lng = ((f.cam.lng + 540) % 360) - 180
      expect(Math.abs(lng)).toBeGreaterThan(170) // не летит через весь глобус
    }
  })

  it("длинные поездки укорачивают остановки", () => {
    const many = { ...demoTrips[0], cities: Array.from({ length: 14 }, (_, i) => ({ id: "c" + i, name: "C" + i, lat: 35 + i * 0.1, lng: 135 + i * 0.1, date: "" })) }
    const holds = buildTimeline(many, overview(many)).segs.filter((s) => s.kind === "hold")
    expect(holds[0].dur).toBeLessThan(1.5)
  })
})

describe("палитры карты", () => {
  it("стиль строится и у слоёв есть цвета палитры", () => {
    const style = buildStyle(PALETTE_DARK)
    const bg = style.layers.find((l) => l.id === "background") as unknown as { paint: Record<string, string> }
    expect(bg.paint["background-color"]).toBe(PALETTE_DARK.bg)
    expect(style.layers.map((l) => l.id)).toContain("label-city")
  })
  it("applyPalette перекрашивает только существующие слои", () => {
    const calls: [string, string, unknown][] = []
    const map = { getLayer: (id: string) => id !== "rail", setPaintProperty: (id: string, p: string, v: unknown) => { calls.push([id, p, v]) } }
    applyPalette(map, PALETTE_LIGHT)
    expect(calls).toContainEqual(["background", "background-color", PALETTE_LIGHT.bg])
    expect(calls).toContainEqual(["label-city", "text-halo-color", PALETTE_LIGHT.halo])
    expect(calls.some(([id]) => id === "rail")).toBe(false)
  })
  it("в палитрах одинаковый набор цветов", () => {
    expect(Object.keys(PALETTE_LIGHT).sort()).toEqual(Object.keys(PALETTE_DARK).sort())
  })
})
