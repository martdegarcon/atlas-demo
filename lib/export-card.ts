"use client"

import maplibregl from "@/lib/maplibre"
import { loadFonts, openOffscreenMap, settled } from "./offscreen-map"
import { andMore, brandName, tripSummaryText, type Lang } from "./i18n"
import type { Trip } from "./types"

// Карточка поездки 1080×1350 на настоящей карте: та же карта, что в приложении,
// поверх — маршрут с подписанными точками, название и список городов.
// Собирается в браузере, как и видео.

export const CARD_W = 1080
export const CARD_H = 1350
const ACCENT = "#fb2c36"
const BG = "#0c0b0a"
const FG = "#f4f1ec"
const FONT = "Onest, 'Space Grotesk', system-ui, sans-serif"
// Зона карты, где должен уместиться маршрут: сверху — заголовок, снизу — список
export const ROUTE_PADDING = { top: 400, bottom: 520, left: 130, right: 130 }

type Pt = { x: number; y: number }
type Box = { x: number; y: number; w: number; h: number }
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

export const cardSummary = (trip: Trip, lang: Lang = "ru") => tripSummaryText(lang, trip)

// Все наложения карточки. map — уже нарисованная карта (или null в тестах),
// project — перевод координат в пиксели кадра.
export function drawCard(ctx: CanvasRenderingContext2D, trip: Trip, project: (lng: number, lat: number) => Pt, mapImage: CanvasImageSource | null, lang: Lang = "ru") {
  const W = CARD_W, H = CARD_H
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, W, H)
  if (mapImage) ctx.drawImage(mapImage, 0, 0, W, H)

  // затемнение сверху под заголовок и снизу под список — карта остаётся видна в середине
  let g = ctx.createLinearGradient(0, 0, 0, 470)
  g.addColorStop(0, "rgba(12,11,10,.96)"); g.addColorStop(0.6, "rgba(12,11,10,.72)"); g.addColorStop(1, "rgba(12,11,10,0)")
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 470)
  g = ctx.createLinearGradient(0, H - 600, 0, H)
  g.addColorStop(0, "rgba(12,11,10,0)"); g.addColorStop(0.45, "rgba(12,11,10,.88)"); g.addColorStop(1, "rgba(12,11,10,.98)")
  ctx.fillStyle = g; ctx.fillRect(0, H - 600, W, 600)

  // маршрут
  const pts = trip.cities.map((c) => project(c.lng, c.lat))
  if (pts.length > 1) {
    ctx.save()
    ctx.lineCap = "round"; ctx.lineJoin = "round"
    ctx.strokeStyle = ACCENT; ctx.lineWidth = 7
    ctx.shadowColor = "rgba(251,44,54,.7)"; ctx.shadowBlur = 22
    ctx.beginPath()
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
    ctx.stroke()
    ctx.restore()
  }

  // точки с номерами и подписи городов — подпись справа или слева от точки,
  // а если не помещается ни туда, ни туда — без подписи (номер есть в списке)
  const R = 24
  const placed: Box[] = pts.map((p) => ({ x: p.x - R, y: p.y - R, w: R * 2, h: R * 2 }))
  ctx.font = `400 30px ${FONT}`
  trip.cities.forEach((c, i) => {
    const p = pts[i]
    const w = ctx.measureText(c.name).width + 24, h = 44
    const options: Box[] = [{ x: p.x + R + 8, y: p.y - h / 2, w, h }, { x: p.x - R - 8 - w, y: p.y - h / 2, w, h }]
    const spot = options.find((b) => b.x > 20 && b.x + b.w < W - 20 && b.y > 340 && b.y + b.h < H - 440 && !placed.some((o) => overlaps(o, b)))
    if (!spot) return
    placed.push(spot)
    ctx.fillStyle = "rgba(12,11,10,.72)"
    roundRect(ctx, spot.x, spot.y, spot.w, spot.h, 14); ctx.fill()
    ctx.fillStyle = FG
    ctx.textBaseline = "middle"
    ctx.fillText(c.name, spot.x + 12, spot.y + h / 2 + 1)
  })
  pts.forEach((p, i) => {
    ctx.beginPath(); ctx.arc(p.x, p.y, R + 12, 0, Math.PI * 2)
    ctx.fillStyle = "rgba(251,44,54,.18)"; ctx.fill()
    ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, Math.PI * 2)
    ctx.fillStyle = i === 0 ? FG : ACCENT; ctx.fill()
    ctx.lineWidth = 3; ctx.strokeStyle = i === 0 ? ACCENT : "#fff"; ctx.stroke()
    ctx.fillStyle = i === 0 ? BG : "#fff"
    ctx.font = `500 22px ${FONT}`
    ctx.textAlign = "center"; ctx.textBaseline = "middle"
    ctx.fillText(String(i + 1), p.x, p.y + 1)
    ctx.textAlign = "left"
  })

  // шапка и название
  ctx.textBaseline = "alphabetic"
  ctx.font = `500 26px ${FONT}`
  ctx.letterSpacing = "7px"
  ctx.fillStyle = ACCENT
  ctx.fillText(brandName(lang), 72, 100)
  ctx.fillStyle = "rgba(244,241,236,.8)"
  ctx.textAlign = "right"
  ctx.fillText(String(trip.year), W - 72, 100)
  ctx.textAlign = "left"
  ctx.letterSpacing = "-3px"
  ctx.fillStyle = FG
  let size = 136
  ctx.font = `300 ${size}px ${FONT}`
  while (ctx.measureText(trip.title).width > W - 144 && size > 64) { size -= 8; ctx.font = `300 ${size}px ${FONT}` }
  // совсем длинное название и в минимальном размере не влезает — обрезаем многоточием
  ctx.fillText(fit(ctx, trip.title, W - 144), 66, 250)
  ctx.letterSpacing = "0px"
  ctx.font = `400 36px ${FONT}`
  ctx.fillStyle = "rgba(244,241,236,.68)"
  ctx.fillText(cardSummary(trip, lang), 72, 312)

  // список городов
  const max = 8
  const shown = trip.cities.slice(0, max)
  const rows = Math.ceil(shown.length / 2)
  const rowH = 86
  const top = H - 72 - rows * rowH + 34
  shown.forEach((c, i) => {
    const col = i < rows ? 0 : 1
    const row = col ? i - rows : i
    const x = 72 + col * 470, y = top + row * rowH
    ctx.font = `400 26px ${FONT}`
    ctx.fillStyle = ACCENT
    ctx.fillText(String(i + 1).padStart(2, "0"), x, y)
    ctx.font = `400 36px ${FONT}`
    ctx.fillStyle = FG
    ctx.fillText(fit(ctx, c.name, 360), x + 56, y)
    if (c.date && c.date !== "—") {
      ctx.font = `400 22px ${FONT}`
      ctx.fillStyle = "rgba(244,241,236,.55)"
      ctx.fillText(c.date, x + 56, y + 32)
    }
  })
  if (trip.cities.length > max) {
    ctx.font = `400 24px ${FONT}`
    ctx.fillStyle = "rgba(244,241,236,.55)"
    ctx.fillText(andMore(lang, trip.cities.length - max), 72, H - 40)
  }
}

function fit(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  if (ctx.measureText(text).width <= maxW) return text
  let t = text
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1)
  return t + "…"
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export async function renderTripCard(trip: Trip, lang: Lang = "ru"): Promise<Blob> {
  if (!trip.cities.length) throw new Error("empty")
  await loadFonts()
  const first = trip.cities[0]
  const { map, dispose } = await openOffscreenMap(CARD_W, CARD_H, { center: [first.lng, first.lat], zoom: 5, projection: "mercator" })
  try {
    const bounds = new maplibregl.LngLatBounds()
    trip.cities.forEach((c) => bounds.extend([c.lng, c.lat]))
    const single = trip.cities.length === 1
    // маршрут — в свободную зону между заголовком и списком; одна точка — общим планом вокруг
    const cam = single ? null : map.cameraForBounds(bounds, { padding: ROUTE_PADDING, maxZoom: 9 })
    const center = cam?.center ? maplibregl.LngLat.convert(cam.center) : bounds.getCenter()
    // точку поднимаем к середине свободной зоны: смещение центра карты вниз
    map.jumpTo({ center, zoom: cam?.zoom ?? (trip.kind === "country" ? 4.2 : 7), pitch: 0, bearing: 0, padding: single ? { top: ROUTE_PADDING.top, bottom: ROUTE_PADDING.bottom, left: 0, right: 0 } : undefined })
    await settled(map, 8000)
    const canvas = document.createElement("canvas")
    canvas.width = CARD_W
    canvas.height = CARD_H
    const ctx = canvas.getContext("2d")!
    drawCard(ctx, trip, (lng, lat) => map.project([lng, lat]), map.getCanvas(), lang)
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/png"))
  } finally {
    dispose()
  }
}
