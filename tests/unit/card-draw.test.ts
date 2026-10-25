import { describe, expect, it, vi } from "vitest"
import { createCanvas, GlobalFonts } from "@napi-rs/canvas"
import path from "node:path"

vi.mock("@/lib/maplibre", () => ({ default: {} }))
vi.mock("@/lib/offscreen-map", () => ({}))

const { CARD_H, CARD_W, cardSummary, drawCard, ROUTE_PADDING } = await import("@/lib/export-card")
const { demoTrips } = await import("@/lib/demo-data")
const { makeTrip } = await import("../fixtures")

for (const w of [300, 400, 500]) for (const s of ["latin", "cyrillic"]) {
  GlobalFonts.registerFromPath(path.join(process.cwd(), "assets/fonts", `onest-${s}-${w}-normal.woff`), "Onest")
}

// Маршрут вписывается в свободную зону между заголовком и списком — как это делает карта
function fitProject(trip: (typeof demoTrips)[number]) {
  const lngs = trip.cities.map((c) => c.lng), lats = trip.cities.map((c) => c.lat)
  const minX = Math.min(...lngs), maxX = Math.max(...lngs), minY = Math.min(...lats), maxY = Math.max(...lats)
  const w = CARD_W - ROUTE_PADDING.left - ROUTE_PADDING.right, h = CARD_H - ROUTE_PADDING.top - ROUTE_PADDING.bottom
  const k = Math.min(w / Math.max(maxX - minX, 1e-6), h / Math.max(maxY - minY, 1e-6))
  return (lng: number, lat: number) => ({ x: ROUTE_PADDING.left + (lng - minX) * k, y: ROUTE_PADDING.top + (maxY - lat) * k })
}

function draw(trip: (typeof demoTrips)[number], map: "yes" | "no" = "no") {
  const canvas = createCanvas(CARD_W, CARD_H)
  const ctx = canvas.getContext("2d")
  let mapImage = null
  if (map === "yes") {
    const m = createCanvas(CARD_W, CARD_H)
    const mc = m.getContext("2d")
    mc.fillStyle = "#2a5d8f" // «вода» — проверим, что карта видна в середине кадра
    mc.fillRect(0, 0, CARD_W, CARD_H)
    mapImage = m
  }
  drawCard(ctx as never, trip, fitProject(trip), mapImage as never)
  return ctx
}

const pixel = (ctx: ReturnType<typeof draw>, x: number, y: number) => Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3))
const share = (ctx: ReturnType<typeof draw>, x: number, y: number, w: number, h: number, test: (r: number, g: number, b: number) => boolean) => {
  const d = ctx.getImageData(x, y, w, h).data
  let n = 0
  for (let i = 0; i < d.length; i += 4) if (test(d[i], d[i + 1], d[i + 2])) n++
  return n / (d.length / 4)
}

describe("карточка на карте", () => {
  it("сводка", () => {
    expect(cardSummary(makeTrip())).toBe("3 места · 1–9 мая · 2026")
    expect(cardSummary(makeTrip({ kind: "country", period: "" }))).toBe("2026")
  })

  it("карта видна в середине, а заголовок и список лежат на затемнении", () => {
    const ctx = draw(demoTrips[0], "yes")
    const [r, g, b] = pixel(ctx, 40, CARD_H / 2) // край кадра в середине — сама карта
    expect(b).toBeGreaterThan(120)
    expect(r).toBeLessThan(80)
    const top = pixel(ctx, CARD_W - 20, 30), bottom = pixel(ctx, CARD_W - 20, CARD_H - 20)
    expect(Math.max(...top)).toBeLessThan(40)
    expect(Math.max(...bottom)).toBeLessThan(40)
  })

  it("маршрут и все точки рисуются в зоне между заголовком и списком", () => {
    const trip = demoTrips[0]
    const ctx = draw(trip)
    const project = fitProject(trip)
    for (const c of trip.cities) {
      const p = project(c.lng, c.lat)
      expect(p.y).toBeGreaterThanOrEqual(ROUTE_PADDING.top - 1)
      expect(p.y).toBeLessThanOrEqual(CARD_H - ROUTE_PADDING.bottom + 1)
      const [r, g] = pixel(ctx, Math.round(p.x + 18), Math.round(p.y))
      // точка: акцентная (или светлая у первого города)
      expect(r).toBeGreaterThan(200)
      expect(g).toBeDefined()
    }
  })

  it("заголовок крупный, длинное название ужимается, список не вылезает за край", () => {
    const long = { ...demoTrips[0], title: "Очень длинное название путешествия по Японии" }
    const ctx = draw(long)
    const light = (r: number, g: number, b: number) => r > 200 && g > 200 && b > 200
    expect(share(ctx, 60, 150, 900, 110, light)).toBeGreaterThan(0.05)
    expect(share(ctx, CARD_W - 50, 150, 50, 110, light)).toBe(0)
  })

  it("одна точка, много городов, пустые даты — без ошибок", () => {
    expect(() => draw({ ...demoTrips[1], kind: "country", cities: [demoTrips[1].cities[0]] })).not.toThrow()
    const many = { ...demoTrips[0], cities: Array.from({ length: 14 }, (_, i) => ({ id: "c" + i, name: "Город " + i, lat: 35 + i * 0.3, lng: 135 + (i % 4), date: i % 2 ? "" : "—" })) }
    expect(() => draw(many)).not.toThrow()
  })
})
