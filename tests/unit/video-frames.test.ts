import { describe, expect, it, vi } from "vitest"
import { createCanvas, GlobalFonts, Image } from "@napi-rs/canvas"
import path from "node:path"

vi.mock("maplibre-gl", () => ({ default: {} }))
vi.mock("mp4-muxer", () => ({}))

const { buildTimeline, drawOverlay, frameAt, VIDEO_H, VIDEO_W } = await import("@/lib/export-video")
const { demoTrips } = await import("@/lib/demo-data")
const { TINY_JPEG } = await import("../fixtures")

for (const w of [300, 400, 500]) for (const s of ["latin", "cyrillic"]) {
  GlobalFonts.registerFromPath(path.join(process.cwd(), "assets/fonts", `onest-${s}-${w}-normal.woff`), "Onest")
}

// Отрисовка наложений поверх карты на настоящем canvas (без браузера):
// проекция — простая плоская вокруг камеры
function render(tripIndex: number, time: (d: number, segs: ReturnType<typeof buildTimeline>["segs"]) => number, withPhotos = true) {
  const trip = demoTrips[tripIndex]
  const { segs, duration } = buildTimeline(trip, { lng: trip.cities[0].lng, lat: trip.cities[0].lat, zoom: 6 })
  const t = time(duration, segs)
  const fr = frameAt(segs, t, trip.cities.length)
  const canvas = createCanvas(VIDEO_W, VIDEO_H)
  const ctx = canvas.getContext("2d")
  ctx.fillStyle = "#0c0b0a"
  ctx.fillRect(0, 0, VIDEO_W, VIDEO_H)
  const scale = (2 ** fr.cam.zoom * 256) / 360
  const map = { project: ([lng, lat]: [number, number]) => ({ x: VIDEO_W / 2 + (lng - fr.cam.lng) * scale, y: VIDEO_H / 2 - (lat - fr.cam.lat) * scale }) }
  const img = new Image()
  img.src = TINY_JPEG
  const photos = trip.cities.map(() => (withPhotos ? img : null))
  drawOverlay(ctx as never, map as never, trip, fr, photos as never, t / duration)
  return { ctx, fr, trip }
}

// Доля пикселей в прямоугольнике, похожих на заданный цвет
function share(ctx: ReturnType<typeof render>["ctx"], x: number, y: number, w: number, h: number, test: (r: number, g: number, b: number) => boolean) {
  const d = ctx.getImageData(x, y, w, h).data
  let n = 0
  for (let i = 0; i < d.length; i += 4) if (test(d[i], d[i + 1], d[i + 2])) n++
  return n / (d.length / 4)
}
const isRed = (r: number, g: number, b: number) => r > 180 && g < 100 && b < 110
const isLight = (r: number, g: number, b: number) => r > 190 && g > 190 && b > 190

describe("кадры видео", () => {
  it("интро: крупное название внизу, точек ещё нет", () => {
    const { ctx, fr } = render(0, () => 1.2)
    expect(fr.introAlpha).toBe(1)
    expect(share(ctx, 30, VIDEO_H - 230, 420, 100, isLight)).toBeGreaterThan(0.03) // «Япония»
    expect(share(ctx, 0, 200, VIDEO_W, 400, isRed)).toBe(0)
  })

  it("остановка: карточка города, точка и шапка «02 / 06»", () => {
    const { ctx, fr } = render(0, (_d, segs) => {
      const hold = segs.filter((s) => s.kind === "hold")[1]
      return hold.t0 + hold.dur * 0.7
    })
    expect(fr.current).toBe(1)
    expect(fr.cardAlpha).toBe(1)
    // карточка — тёмная плашка снизу с белым текстом
    expect(share(ctx, 60, VIDEO_H - 200, VIDEO_W - 120, 150, isLight)).toBeGreaterThan(0.005)
    // активная точка в центре кадра — акцентная
    expect(share(ctx, VIDEO_W / 2 - 8, VIDEO_H / 2 - 8, 16, 16, isRed)).toBeGreaterThan(0.2)
    // полоса прогресса сверху
    expect(share(ctx, 0, 0, 40, 4, isRed)).toBeGreaterThan(0.9)
  })

  it("перелёт: маршрут прорисовывается", () => {
    const { ctx } = render(0, (_d, segs) => {
      const fly = segs.filter((s) => s.kind === "fly")[3]
      return fly.t0 + fly.dur * 0.6
    })
    expect(share(ctx, 0, 100, VIDEO_W, VIDEO_H - 300, isRed)).toBeGreaterThan(0.0005)
  })

  it("финал: итог поездки и цепочка городов", () => {
    const { ctx, fr } = render(1, (d) => d - 0.1)
    expect(fr.endAlpha).toBe(1)
    expect(share(ctx, 30, VIDEO_H - 230, 500, 80, isLight)).toBeGreaterThan(0.02)
  })

  it("город без фото и длинная заметка не ломают карточку", () => {
    const trip = { ...demoTrips[0] }
    const long = "Очень длинная заметка ".repeat(30)
    trip.cities = trip.cities.map((c) => ({ ...c, entries: [{ id: "x", text: long }] }))
    const { segs, duration } = buildTimeline(trip, { lng: 135, lat: 35, zoom: 6 })
    const hold = segs.find((s) => s.kind === "hold")!
    const canvas = createCanvas(VIDEO_W, VIDEO_H)
    const ctx = canvas.getContext("2d")
    const fr = frameAt(segs, hold.t0 + hold.dur * 0.8, trip.cities.length)
    expect(() => drawOverlay(ctx as never, { project: () => ({ x: 360, y: 450 }) } as never, trip, fr, trip.cities.map(() => null), 0.5)).not.toThrow()
    expect(duration).toBeGreaterThan(0)
    // текст обрезан многоточием и не выходит за правый край карточки
    expect(share(ctx, VIDEO_W - 30, VIDEO_H - 300, 30, 260, isLight)).toBe(0)
  })

  it("все кадры всех демо-поездок рисуются без ошибок", () => {
    for (let i = 0; i < demoTrips.length; i++) {
      const trip = demoTrips[i]
      const { segs, duration } = buildTimeline(trip, { lng: trip.cities[0].lng, lat: trip.cities[0].lat, zoom: 6 })
      const canvas = createCanvas(VIDEO_W, VIDEO_H)
      const ctx = canvas.getContext("2d")
      for (let t = 0; t < duration; t += 0.25) {
        const fr = frameAt(segs, t, trip.cities.length)
        drawOverlay(ctx as never, { project: () => ({ x: 360, y: 450 }) } as never, trip, fr, trip.cities.map(() => null), t / duration)
      }
    }
  })
})
