"use client"

import maplibregl from "@/lib/maplibre"
import { ArrayBufferTarget, Muxer } from "mp4-muxer"
import { loadFonts, loadImage, openOffscreenMap, settled } from "./offscreen-map"
import { brandName, tripSummaryText, type Lang } from "./i18n"
import type { Trip } from "./types"

// Видео-пролёт по поездке. Собирается целиком в браузере:
//  1. невидимая карта MapLibre того же стиля, что в приложении;
//  2. камера ставится покадрово по сценарию (интро → перелёты → остановки →
//     общий план), каждый кадр ждём, пока догрузятся тайлы — поэтому видео
//     плавное, даже если компьютер медленный;
//  3. поверх карты на canvas дорисовываются маршрут, точки и карточки городов;
//  4. кадры кодируются в H.264 (WebCodecs) и пакуются в MP4.
// Telegram показывает беззвучное MP4 как гифку — крутится само.

export const VIDEO_W = 720
export const VIDEO_H = 900
const FPS = 30
const ACCENT = "#fb2c36"
const SPACE = "#0c0b0a" // тот же тон, что у затемнений сверху и снизу — без видимых границ
const FONT = "Onest, 'Space Grotesk', system-ui, sans-serif"

export function videoSupported() {
  return typeof window !== "undefined" && "VideoEncoder" in window && "VideoFrame" in window
}

type Cam = { lng: number; lat: number; zoom: number; pitch: number; bearing: number }
type Seg =
  | { kind: "intro"; t0: number; dur: number; from: Cam; to: Cam }
  | { kind: "fly"; t0: number; dur: number; from: Cam; to: Cam; dest: number; arc: number }
  | { kind: "hold"; t0: number; dur: number; city: number; cam: Cam }
  | { kind: "outro"; t0: number; dur: number; from: Cam; to: Cam }
  | { kind: "end"; t0: number; dur: number; cam: Cam }
type SegIn = Seg extends unknown ? (Seg extends infer S ? (S extends Seg ? Omit<S, "t0"> : never) : never) : never

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)

function distKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371, toR = Math.PI / 180
  const dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// Сценарий ролика: последовательность отрезков с длительностями
export function buildTimeline(trip: Trip, overview: { lng: number; lat: number; zoom: number }) {
  const cities = trip.cities
  const n = cities.length
  const zCity = trip.kind === "country" ? 4.6 : 8.2
  const hold = n > 10 ? 1.25 : 1.75
  const cityCam = (i: number, bearing = 0): Cam => ({ lng: cities[i].lng, lat: cities[i].lat, zoom: zCity, pitch: 42, bearing })
  const segs: Seg[] = []
  let t = 0
  const push = (s: SegIn) => { segs.push({ ...(s as Seg), t0: t }); t += s.dur }

  const first = cities[0]
  const globeFrom: Cam = { lng: first.lng + 50, lat: clamp(first.lat * 0.6, -50, 50), zoom: 1.45, pitch: 0, bearing: 0 }
  const globeTo: Cam = { ...globeFrom, lng: first.lng + 22 }
  push({ kind: "intro", dur: 1.8, from: globeFrom, to: globeTo })
  push({ kind: "fly", dur: 2.8, from: globeTo, to: cityCam(0, -6), dest: 0, arc: 0 })

  for (let i = 0; i < n; i++) {
    push({ kind: "hold", dur: hold, city: i, cam: cityCam(i, -6) })
    if (i < n - 1) {
      const d = distKm(cities[i], cities[i + 1])
      const dur = clamp(1.1 + 0.32 * Math.log2(1 + d / 60), 1.1, 3)
      // чем дальше перелёт, тем выше «подпрыгивает» камера посередине
      const arc = clamp(Math.log2(1 + d / 40) * 0.85, 0, zCity - 2.2)
      push({ kind: "fly", dur, from: cityCam(i, 6), to: cityCam(i + 1, -6), dest: i + 1, arc })
    }
  }
  const last = cityCam(n - 1, 6)
  const over: Cam = { lng: overview.lng, lat: overview.lat, zoom: Math.min(overview.zoom, zCity - 1), pitch: 18, bearing: 0 }
  push({ kind: "outro", dur: 1.8, from: last, to: over })
  push({ kind: "end", dur: 2.6, cam: over })
  return { segs, duration: t }
}

type Frame = {
  cam: Cam
  route: number          // пройдено отрезков маршрута (дробное — середина перелёта)
  current: number        // активный город (-1 — нет)
  cardAlpha: number
  cardIn: number         // 0..1 — выезд карточки
  introAlpha: number
  dotsAlpha: number
  endAlpha: number
  pulse: number
}

export function frameAt(segs: Seg[], time: number, n: number): Frame {
  const seg = segs.find((s) => time < s.t0 + s.dur) || segs[segs.length - 1]
  const u = clamp((time - seg.t0) / seg.dur)
  const f: Frame = { cam: { lng: 0, lat: 0, zoom: 1, pitch: 0, bearing: 0 }, route: 0, current: -1, cardAlpha: 0, cardIn: 0, introAlpha: 0, dotsAlpha: 1, endAlpha: 0, pulse: (time * 1.4) % 1 }
  const mix = (a: Cam, b: Cam, e: number): Cam => {
    let bl = b.lng
    if (bl - a.lng > 180) bl -= 360
    if (a.lng - bl > 180) bl += 360
    return { lng: lerp(a.lng, bl, e), lat: lerp(a.lat, b.lat, e), zoom: lerp(a.zoom, b.zoom, e), pitch: lerp(a.pitch, b.pitch, e), bearing: lerp(a.bearing, b.bearing, e) }
  }
  switch (seg.kind) {
    case "intro":
      f.cam = mix(seg.from, seg.to, u)
      f.introAlpha = clamp(u / 0.35)
      f.dotsAlpha = 0
      break
    case "fly": {
      const e = ease(u)
      f.cam = mix(seg.from, seg.to, e)
      f.cam.zoom -= seg.arc * Math.sin(Math.PI * u)
      // на коротких перелётах камера почти не «кивает», на длинных — смотрит сверху
      f.cam.pitch = Math.max(0, f.cam.pitch - 22 * clamp(seg.arc / 2.5) * Math.sin(Math.PI * u))
      if (seg.dest === 0) {
        f.introAlpha = 1 - clamp(u / 0.4)
        f.dotsAlpha = clamp((u - 0.5) / 0.5)
      } else {
        f.route = seg.dest - 1 + e
        // карточка прошлого города уходит в начале перелёта
        f.current = seg.dest - 1
        f.cardAlpha = 1 - clamp(u / 0.22)
        f.cardIn = 1
      }
      break
    }
    case "hold":
      f.cam = mix(seg.cam, { ...seg.cam, bearing: seg.cam.bearing + 12 }, u)
      f.route = seg.city
      f.current = seg.city
      f.cardIn = easeOut(clamp(u / 0.28))
      f.cardAlpha = clamp(u / 0.18)
      break
    case "outro":
      f.cam = mix(seg.from, seg.to, ease(u))
      f.route = n - 1
      f.endAlpha = clamp((u - 0.45) / 0.55)
      break
    case "end":
      f.cam = seg.cam
      f.cam = { ...seg.cam, bearing: seg.cam.bearing + 4 * u }
      f.route = n - 1
      f.endAlpha = 1
      break
  }
  return f
}

/* ---------- отрисовка поверх карты ---------- */

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number) {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ""
  for (const w of words) {
    const test = line ? line + " " + w : w
    if (ctx.measureText(test).width <= maxW) line = test
    else {
      if (line) lines.push(line)
      line = w
      if (lines.length === maxLines) break
    }
  }
  if (lines.length < maxLines && line) lines.push(line)
  if (lines.length === maxLines && words.join(" ") !== lines.join(" ")) {
    let last = lines[maxLines - 1]
    while (last.length && ctx.measureText(last + "…").width > maxW) last = last.slice(0, -1)
    lines[maxLines - 1] = last.replace(/[\s,.;:]+$/, "") + "…"
  }
  return lines
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight)
  const sw = w / s, sh = h / s
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h)
}

export function drawOverlay(ctx: CanvasRenderingContext2D, map: maplibregl.Map, trip: Trip, fr: Frame, photos: (HTMLImageElement | null)[], progress: number, lang: Lang = "ru") {
  const summary = (t: Trip) => tripSummaryText(lang, t)
  const W = VIDEO_W, H = VIDEO_H, n = trip.cities.length

  // затемнение сверху и снизу — чтобы текст читался на любой карте
  let g = ctx.createLinearGradient(0, 0, 0, 180)
  g.addColorStop(0, "rgba(12,11,10,.75)"); g.addColorStop(1, "rgba(12,11,10,0)")
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 180)
  g = ctx.createLinearGradient(0, H - 380, 0, H)
  g.addColorStop(0, "rgba(12,11,10,0)"); g.addColorStop(1, "rgba(12,11,10,.85)")
  ctx.fillStyle = g; ctx.fillRect(0, H - 380, W, 380)

  // маршрут: пройденные отрезки + растущий текущий
  const pts = trip.cities.map((c) => map.project([c.lng, c.lat]))
  if (n > 1 && fr.route > 0) {
    const full = Math.floor(fr.route), frac = fr.route - full
    ctx.save()
    ctx.lineCap = "round"; ctx.lineJoin = "round"
    ctx.strokeStyle = ACCENT; ctx.lineWidth = 4.5
    ctx.shadowColor = "rgba(251,44,54,.65)"; ctx.shadowBlur = 14
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i <= Math.min(full, n - 1); i++) ctx.lineTo(pts[i].x, pts[i].y)
    if (full < n - 1 && frac > 0) ctx.lineTo(lerp(pts[full].x, pts[full + 1].x, frac), lerp(pts[full].y, pts[full + 1].y, frac))
    ctx.stroke()
    ctx.restore()
  }

  // точки: пройденные — акцентные, впереди — бледные
  ctx.save()
  ctx.globalAlpha = fr.dotsAlpha
  for (let i = 0; i < n; i++) {
    const p = pts[i]
    const reached = i <= Math.floor(fr.route + 1e-3) || i === fr.current
    if (i === fr.current && fr.cardAlpha > 0) {
      const r = 10 + 18 * fr.pulse
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(251,44,54,${0.55 * (1 - fr.pulse)})`; ctx.lineWidth = 3; ctx.stroke()
    }
    ctx.beginPath(); ctx.arc(p.x, p.y, reached ? 7 : 4.5, 0, Math.PI * 2)
    ctx.fillStyle = reached ? ACCENT : "rgba(255,255,255,.4)"; ctx.fill()
    if (reached) { ctx.lineWidth = 2.5; ctx.strokeStyle = "#fff"; ctx.stroke() }
  }
  ctx.restore()

  // шапка: марка, счётчик, полоска прогресса
  ctx.fillStyle = ACCENT
  ctx.fillRect(0, 0, W * progress, 4)
  ctx.font = `500 15px ${FONT}`
  ctx.textBaseline = "alphabetic"
  ctx.fillStyle = ACCENT
  ctx.letterSpacing = "4px"
  ctx.fillText(brandName(lang), 36, 52)
  ctx.fillStyle = "rgba(244,241,236,.75)"
  const head = fr.current >= 0 && fr.endAlpha === 0 ? `${String(fr.current + 1).padStart(2, "0")} / ${String(n).padStart(2, "0")}` : String(trip.year)
  ctx.textAlign = "right"
  ctx.fillText(head, W - 36, 52)
  ctx.textAlign = "left"
  ctx.letterSpacing = "0px"

  // интро: название поездки
  if (fr.introAlpha > 0) {
    ctx.save()
    ctx.globalAlpha = fr.introAlpha
    const y = H - 150 + (1 - fr.introAlpha) * 20
    ctx.fillStyle = "#f4f1ec"
    ctx.font = `300 72px ${FONT}`
    ctx.fillText(trip.title, 36, y, W - 72)
    ctx.font = `400 22px ${FONT}`
    ctx.fillStyle = "rgba(244,241,236,.7)"
    ctx.fillText(summary(trip), 38, y + 44, W - 72)
    ctx.restore()
  }

  // карточка города
  if (fr.current >= 0 && fr.cardAlpha > 0) {
    const city = trip.cities[fr.current]
    const entry = city.entries?.find((e) => e.text) || city.entries?.[0]
    const img = photos[fr.current]
    const pad = 22, x = 28, w = W - 56
    const ph = img ? 150 : 0
    const tx = x + pad + (img ? ph + 20 : 0), tw = w - pad * 2 - (img ? ph + 20 : 0)
    ctx.font = `400 18px ${FONT}`
    const note = entry?.text ? wrap(ctx, entry.text, tw, 2) : []
    const textH = 22 + 50 + (city.date && city.date !== "—" ? 26 : 0) + note.length * 25 + (note.length ? 8 : 0)
    const h = Math.max(ph, textH) + pad * 2
    const y = H - 40 - h + (1 - fr.cardIn) * 40
    ctx.save()
    ctx.globalAlpha = fr.cardAlpha
    roundRect(ctx, x, y, w, h, 28)
    ctx.fillStyle = "rgba(18,17,16,.82)"; ctx.fill()
    ctx.strokeStyle = "rgba(255,255,255,.08)"; ctx.lineWidth = 1; ctx.stroke()
    if (img) {
      ctx.save()
      roundRect(ctx, x + pad, y + pad, ph, ph, 18)
      ctx.clip()
      drawCover(ctx, img, x + pad, y + pad, ph, ph)
      ctx.restore()
    }
    let ty = y + pad + 16
    ctx.font = `500 14px ${FONT}`
    ctx.letterSpacing = "3px"
    ctx.fillStyle = ACCENT
    ctx.fillText(`${String(fr.current + 1).padStart(2, "0")} / ${String(n).padStart(2, "0")}`, tx, ty)
    ctx.letterSpacing = "0px"
    ty += 46
    ctx.font = `300 44px ${FONT}`
    ctx.fillStyle = "#f4f1ec"
    ctx.fillText(city.name, tx - 2, ty, tw)
    if (city.date && city.date !== "—") {
      ty += 28
      ctx.font = `400 18px ${FONT}`
      ctx.fillStyle = "rgba(244,241,236,.6)"
      ctx.fillText(city.date, tx, ty, tw)
    }
    if (note.length) {
      ty += 8
      ctx.font = `400 18px ${FONT}`
      ctx.fillStyle = "rgba(244,241,236,.85)"
      for (const line of note) { ty += 25; ctx.fillText(line, tx, ty, tw) }
    }
    ctx.restore()
  }

  // финал: итог поездки и цепочка городов
  if (fr.endAlpha > 0) {
    ctx.save()
    ctx.globalAlpha = fr.endAlpha
    const y = H - 170 + (1 - fr.endAlpha) * 20
    ctx.fillStyle = "#f4f1ec"
    ctx.font = `300 60px ${FONT}`
    ctx.fillText(trip.title, 36, y, W - 72)
    ctx.font = `400 21px ${FONT}`
    ctx.fillStyle = "rgba(244,241,236,.7)"
    ctx.fillText(summary(trip), 38, y + 40, W - 72)
    ctx.font = `400 18px ${FONT}`
    ctx.fillStyle = "rgba(244,241,236,.55)"
    const chain = wrap(ctx, trip.cities.map((c) => c.name).join(" → "), W - 72, 2)
    chain.forEach((l, i) => ctx.fillText(l, 38, y + 78 + i * 25))
    ctx.restore()
  }
}

/* ---------- сборка ---------- */

async function pickCodec(): Promise<string | null> {
  for (const codec of ["avc1.42001f", "avc1.4d001f", "avc1.640028", "avc1.42002a"]) {
    try {
      const r = await VideoEncoder.isConfigSupported({ codec, width: VIDEO_W, height: VIDEO_H, bitrate: 5_000_000, framerate: FPS })
      if (r.supported) return codec
    } catch {}
  }
  return null
}

export async function renderTripVideo(
  trip: Trip,
  { onProgress, signal, lang = "ru" }: { onProgress?: (phase: "prepare" | "render", p: number) => void; signal?: AbortSignal; lang?: Lang } = {}
): Promise<Blob> {
  if (!videoSupported()) throw new Error("unsupported")
  if (!trip.cities.length) throw new Error("empty")
  const codec = await pickCodec()
  if (!codec) throw new Error("unsupported")
  onProgress?.("prepare", 0)

  await loadFonts()
  const photos = await Promise.all(trip.cities.map((c) => {
    const src = c.entries?.find((e) => e.photo)?.photo
    return src ? loadImage(src) : Promise.resolve(null)
  }))

  const first = trip.cities[0]
  const { map, dispose } = await openOffscreenMap(VIDEO_W, VIDEO_H, { center: [first.lng, first.lat], zoom: 1.5, projection: "globe" })

  let encoder: VideoEncoder | null = null
  try {

    // общий план для финала — так, чтобы влез весь маршрут
    const bounds = new maplibregl.LngLatBounds()
    trip.cities.forEach((c) => bounds.extend([c.lng, c.lat]))
    const fit = trip.cities.length > 1
      ? map.cameraForBounds(bounds, { padding: { top: 140, bottom: 300, left: 70, right: 70 } })
      : null
    const center = fit?.center ? maplibregl.LngLat.convert(fit.center) : bounds.getCenter()
    const overview = { lng: center.lng, lat: center.lat, zoom: fit?.zoom ?? 5.5 }

    const { segs, duration } = buildTimeline(trip, overview)
    const total = Math.ceil(duration * FPS)

    const out = document.createElement("canvas")
    out.width = VIDEO_W
    out.height = VIDEO_H
    const ctx = out.getContext("2d")!

    const target = new ArrayBufferTarget()
    const muxer = new Muxer({ target, video: { codec: "avc", width: VIDEO_W, height: VIDEO_H, frameRate: FPS }, fastStart: "in-memory" })
    let encodeError: unknown = null
    encoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { encodeError = e } })
    encoder.configure({ codec, width: VIDEO_W, height: VIDEO_H, bitrate: 5_000_000, framerate: FPS, avc: { format: "avc" } })

    const n = trip.cities.length
    for (let i = 0; i < total; i++) {
      if (signal?.aborted) throw new DOMException("aborted", "AbortError")
      if (encodeError) throw encodeError
      const fr = frameAt(segs, i / FPS, n)
      map.jumpTo({ center: [fr.cam.lng, fr.cam.lat], zoom: fr.cam.zoom, pitch: fr.cam.pitch, bearing: fr.cam.bearing })
      await settled(map)
      // вокруг глобуса карта прозрачная — без заливки сквозь неё просвечивали
      // бы прошлые кадры (шлейфы точек, накопленное затемнение)
      ctx.fillStyle = SPACE
      ctx.fillRect(0, 0, VIDEO_W, VIDEO_H)
      ctx.drawImage(map.getCanvas(), 0, 0, VIDEO_W, VIDEO_H)
      drawOverlay(ctx, map, trip, fr, photos, (i + 1) / total, lang)
      const frame = new VideoFrame(out, { timestamp: Math.round((i * 1e6) / FPS), duration: Math.round(1e6 / FPS) })
      encoder.encode(frame, { keyFrame: i % (FPS * 2) === 0 })
      frame.close()
      while (encoder.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 4))
      onProgress?.("render", (i + 1) / total)
    }
    await encoder.flush()
    if (encodeError) throw encodeError
    muxer.finalize()
    return new Blob([target.buffer], { type: "video/mp4" })
  } finally {
    try { if (encoder && encoder.state !== "closed") encoder.close() } catch {}
    dispose()
  }
}
