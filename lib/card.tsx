import { readFile } from "node:fs/promises"
import path from "node:path"
import { ImageResponse } from "next/og"
import { getPhoto } from "./trips-repo"
import { tripSummaryText } from "./i18n"
import type { Trip } from "./types"

// Карточка поездки — постер для Telegram/соцсетей и OG-превью ссылки.
// Рисуется на сервере через next/og: маршрут — по настоящим координатам,
// обложка — первое фото поездки.

const ACCENT = "#fb2c36"
const BG = "#0c0b0a"
const FG = "#f4f1ec"
const MUTED = "#9a958c"

let fontsPromise: Promise<{ name: string; data: Buffer; weight: 300 | 400 | 500; style: "normal" }[]> | null = null
function loadFonts() {
  if (!fontsPromise) {
    const dir = path.join(process.cwd(), "assets", "fonts")
    fontsPromise = Promise.all(
      ([300, 400, 500] as const).flatMap((weight) =>
        (["latin", "cyrillic"] as const).map(async (subset) => ({
          name: subset === "latin" ? "Onest" : "Onest Cyr",
          data: await readFile(path.join(dir, `onest-${subset}-${weight}-normal.woff`)),
          weight,
          style: "normal" as const,
        }))
      )
    )
  }
  return fontsPromise
}

// Превью ссылок и серверная карточка — на русском (основная аудитория)
export const tripSummary = (trip: Trip) => tripSummaryText("ru", trip)

// Обложка как data:URL — своё фото берём прямо из базы, внешнее скачиваем
// (с таймаутом: без картинки карточка всё равно соберётся)
async function coverDataUrl(trip: Trip): Promise<string | null> {
  const src = trip.cities.flatMap((c) => c.entries || []).find((e) => e.photo)?.photo
  if (!src) return null
  try {
    const own = src.match(/^\/api\/photos\/([A-Za-z0-9-]+)$/)
    if (own) {
      const p = await getPhoto(own[1])
      if (!p || !/jpeg|png/.test(p.mime)) return null
      return `data:${p.mime};base64,${Buffer.from(p.data).toString("base64")}`
    }
    const url = new URL(src)
    if (url.hostname === "images.unsplash.com") {
      url.searchParams.delete("auto")
      url.searchParams.set("fm", "jpg")
    }
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) })
    const type = res.headers.get("content-type") || ""
    if (!res.ok || !/image\/(jpeg|png)/.test(type)) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > 6 * 1024 * 1024) return null
    return `data:${type.split(";")[0]};base64,${buf.toString("base64")}`
  } catch {
    return null
  }
}

// Проекция точек маршрута в прямоугольник: равнопромежуточная с поправкой на
// широту — для масштаба одной поездки этого более чем достаточно
function projectRoute(trip: Trip, w: number, h: number, pad: number) {
  const pts = trip.cities.map((c) => ({ x: c.lng, y: c.lat }))
  const midLat = pts.reduce((s, p) => s + p.y, 0) / pts.length
  const k = Math.cos((midLat * Math.PI) / 180)
  const xs = pts.map((p) => p.x * k), ys = pts.map((p) => -p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  const spanX = Math.max(maxX - minX, 1e-6), spanY = Math.max(maxY - minY, 1e-6)
  const scale = pts.length > 1 ? Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY) : 1
  const offX = (w - spanX * scale) / 2, offY = (h - spanY * scale) / 2
  return xs.map((x, i) => (pts.length > 1 ? { x: offX + (x - minX) * scale, y: offY + (ys[i] - minY) * scale } : { x: w / 2, y: h / 2 }))
}

function RouteMap({ trip, w, h }: { trip: Trip; w: number; h: number }) {
  const pts = projectRoute(trip, w, h, Math.round(Math.min(w, h) * 0.14))
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")
  const dot = Math.max(30, Math.round(Math.min(w, h) * 0.06))
  // фон — сетка точек, как на штурманской карте
  const grid: { x: number; y: number }[] = []
  const step = Math.round(Math.min(w, h) / 12)
  for (let x = step / 2; x < w; x += step) for (let y = step / 2; y < h; y += step) grid.push({ x, y })
  return (
    <div style={{ position: "relative", width: w, height: h, display: "flex" }}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position: "absolute", left: 0, top: 0 }}>
        {grid.map((g, i) => <circle key={i} cx={g.x} cy={g.y} r={1.6} fill="#2a2724" />)}
        {pts.length > 1 && <path d={d} fill="none" stroke={ACCENT} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" strokeOpacity={0.85} />}
        {pts.map((p, i) => <circle key={"g" + i} cx={p.x} cy={p.y} r={dot * 0.85} fill={ACCENT} fillOpacity={0.14} />)}
      </svg>
      {pts.map((p, i) => (
        <div key={i} style={{
          position: "absolute", left: p.x - dot / 2, top: p.y - dot / 2, width: dot, height: dot, borderRadius: dot,
          background: i === 0 ? FG : ACCENT, color: i === 0 ? BG : "#fff", display: "flex", alignItems: "center",
          justifyContent: "center", fontSize: Math.round(dot * 0.46), fontWeight: 500,
        }}>{i + 1}</div>
      ))}
    </div>
  )
}

function CityList({ trip, size, max }: { trip: Trip; size: number; max: number }) {
  const shown = trip.cities.slice(0, max)
  const rest = trip.cities.length - shown.length
  return (
    <div style={{ display: "flex", flexWrap: "wrap", width: "100%" }}>
      {shown.map((c, i) => (
        <div key={c.id} style={{ display: "flex", alignItems: "baseline", width: "50%", paddingBottom: size * 0.55, paddingRight: 24 }}>
          <div style={{ color: ACCENT, fontSize: size * 0.7, width: size * 1.6, display: "flex" }}>{String(i + 1).padStart(2, "0")}</div>
          <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            <div style={{ fontSize: size, color: FG, lineHeight: 1.1 }}>{c.name}</div>
            {c.date && c.date !== "—" && <div style={{ fontSize: size * 0.62, color: MUTED, marginTop: 4 }}>{c.date}</div>}
          </div>
        </div>
      ))}
      {rest > 0 && <div style={{ fontSize: size * 0.7, color: MUTED, width: "100%" }}>{`и ещё ${rest}`}</div>}
    </div>
  )
}

export async function renderCard(trip: Trip, format: "story" | "og"): Promise<ImageResponse> {
  const fonts = await loadFonts()
  const cover = await coverDataUrl(trip)
  const font = { fontFamily: "Onest, 'Onest Cyr'", fontWeight: 300 as const }

  if (format === "og") {
    const W = 1200, H = 630
    return new ImageResponse(
      (
        <div style={{ width: W, height: H, display: "flex", background: BG, color: FG, ...font }}>
          {cover && <img src={cover} width={W} height={H} style={{ position: "absolute", left: 0, top: 0, width: W, height: H, objectFit: "cover", opacity: 0.32 }} />}
          <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, display: "flex", background: "linear-gradient(90deg, rgba(12,11,10,.96) 0%, rgba(12,11,10,.82) 55%, rgba(12,11,10,.55) 100%)" }} />
          <div style={{ display: "flex", flexDirection: "column", width: 640, padding: "56px 0 48px 64px" }}>
            <div style={{ display: "flex", fontSize: 22, letterSpacing: 6, color: ACCENT, fontWeight: 500 }}>АТЛАС</div>
            <div style={{ display: "flex", fontSize: trip.title.length > 14 ? 72 : 96, lineHeight: 1, marginTop: 40, letterSpacing: -2 }}>{trip.title}</div>
            <div style={{ display: "flex", fontSize: 30, color: MUTED, marginTop: 20 }}>{tripSummary(trip)}</div>
            <div style={{ display: "flex", marginTop: "auto" }}><CityList trip={trip} size={28} max={6} /></div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: W - 640, height: H }}>
            <RouteMap trip={trip} w={500} h={520} />
          </div>
        </div>
      ),
      { width: W, height: H, fonts }
    )
  }

  const W = 1080, H = 1350
  const coverH = cover ? 560 : 0
  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", flexDirection: "column", background: BG, color: FG, ...font }}>
        {cover && (
          <div style={{ position: "absolute", left: 0, top: 0, width: W, height: coverH + 160, display: "flex" }}>
            <img src={cover} width={W} height={coverH + 160} style={{ width: W, height: coverH + 160, objectFit: "cover" }} />
            <div style={{ position: "absolute", left: 0, top: 0, width: W, height: coverH + 160, display: "flex", background: "linear-gradient(180deg, rgba(12,11,10,.35) 0%, rgba(12,11,10,.15) 40%, rgba(12,11,10,1) 100%)" }} />
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "64px 72px 0", fontSize: 26, letterSpacing: 7, fontWeight: 500 }}>
          <div style={{ display: "flex", color: ACCENT }}>АТЛАС</div>
          <div style={{ display: "flex", color: cover ? FG : MUTED }}>{String(trip.year)}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", padding: "0 72px", marginTop: cover ? coverH - 250 : 90 }}>
          <div style={{ display: "flex", fontSize: trip.title.length > 12 ? 100 : 136, lineHeight: 1, letterSpacing: -3 }}>{trip.title}</div>
          <div style={{ display: "flex", fontSize: 36, color: MUTED, marginTop: 22 }}>{tripSummary(trip)}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "center", marginTop: 24 }}>
          <RouteMap trip={trip} w={W - 144} h={cover ? 380 : 620} />
        </div>
        <div style={{ display: "flex", padding: "0 72px", marginTop: "auto", marginBottom: 64 }}>
          <CityList trip={trip} size={34} max={cover ? 6 : 8} />
        </div>
      </div>
    ),
    { width: W, height: H, fonts }
  )
}
