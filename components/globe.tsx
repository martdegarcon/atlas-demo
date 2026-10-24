"use client"

import { useEffect, useRef, useState } from "react"
import maplibregl from "@/lib/maplibre"
import { applyPalette, buildStyle, PALETTE_DARK, PALETTE_LIGHT } from "@/lib/map-style"
import type { Trip } from "@/lib/types"

const HOME_CENTER: [number, number] = [30, 28]
const HOME_ZOOM = 1.3

type Props = {
  trips: Trip[]
  activeTripId: string | null
  activeCountry: string | null
  selectedCityId: string | null
  onSelectCity: (id: string) => void
  onSelectCountry: (country: string) => void
  // сколько места по краям занято панелями — камера центрирует маршрут в свободной части
  padding: { top: number; bottom: number; left: number; right: number }
  dark: boolean
}

type Pin = { marker: maplibregl.Marker; el: HTMLButtonElement; tripId: string; cityId: string }

export function Globe({ trips, activeTripId, activeCountry, selectedCityId, onSelectCity, onSelectCountry, padding, dark }: Props) {
  const [visible, setVisible] = useState(false)
  const [status, setStatus] = useState("")
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const readyRef = useRef(false)
  const spinRef = useRef(true)
  const activeRef = useRef<string | null>(null)
  const padRef = useRef(padding)
  const prevActiveRef = useRef<string | null>(null)
  const pinsRef = useRef<Pin[]>([])
  const onSelectRef = useRef(onSelectCity)
  const onCountryRef = useRef(onSelectCountry)
  const tripsRef = useRef(trips)
  const applyFocusRef = useRef<(() => void) | null>(null)
  const syncRef = useRef<(() => void) | null>(null)
  const darkRef = useRef(dark)

  useEffect(() => { padRef.current = padding }, [padding])
  useEffect(() => { onSelectRef.current = onSelectCity }, [onSelectCity])
  useEffect(() => { onCountryRef.current = onSelectCountry }, [onSelectCountry])
  useEffect(() => {
    darkRef.current = dark
    if (readyRef.current && mapRef.current) applyPalette(mapRef.current, dark ? PALETTE_DARK : PALETTE_LIGHT)
  }, [dark])

  useEffect(() => {
    if (!containerRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildStyle(darkRef.current ? PALETTE_DARK : PALETTE_LIGHT),
      center: HOME_CENTER, zoom: HOME_ZOOM, attributionControl: false, maxPitch: 70,
    })
    mapRef.current = map

    // Медленное вращение глобуса, пока ничего не выбрано и никто не трогает карту
    let idleTimer: ReturnType<typeof setTimeout>
    const spin = () => {
      if (!spinRef.current || map.getZoom() > 3.5) return
      const c = map.getCenter()
      map.easeTo({ center: [c.lng - 45, c.lat], duration: 16000, easing: (x) => x })
    }
    const pause = () => { spinRef.current = false; clearTimeout(idleTimer) }
    const resume = () => {
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => { if (activeRef.current === null) { spinRef.current = true; spin() } }, 6000)
    }
    map.on("mousedown", pause); map.on("touchstart", pause); map.on("wheel", pause)
    map.on("mouseup", resume); map.on("touchend", resume); map.on("wheel", resume)
    map.on("moveend", spin)
    map.on("error", (e) => {
      // ошибки отдельных тайлов не страшны; показываем только если карта так и не загрузилась
      if (!readyRef.current) setStatus("Карта не загрузилась: " + (e.error?.message || "ошибка сети"))
    })

    const syncPlaces = () => {
      const current = tripsRef.current
      const src = map.getSource("routes") as maplibregl.GeoJSONSource | undefined
      src?.setData({
        type: "FeatureCollection",
        features: current.map((trip) => ({
          type: "Feature", properties: { tripId: trip.id },
          geometry: { type: "LineString", coordinates: trip.cities.map((c) => [c.lng, c.lat]) },
        })),
      })
      for (const pin of pinsRef.current) pin.marker.remove()
      pinsRef.current = []
      for (const trip of current) {
        for (const city of trip.cities) {
          const el = document.createElement("button")
          el.type = "button"; el.className = "atlas-pin"; el.dataset.state = "idle"
          el.setAttribute("aria-label", city.name); el.title = city.name
          el.innerHTML = '<span class="atlas-pin-dot"></span>'
          el.addEventListener("click", (e) => { e.stopPropagation(); onSelectRef.current(city.id) })
          const marker = new maplibregl.Marker({ element: el }).setLngLat([city.lng, city.lat]).addTo(map)
          pinsRef.current.push({ marker, el, tripId: trip.id, cityId: city.id })
        }
      }
      applyFocusRef.current?.()
    }
    syncRef.current = syncPlaces

    map.on("style.load", () => {
      map.setProjection({ type: "globe" })
      applyPalette(map, darkRef.current ? PALETTE_DARK : PALETTE_LIGHT)
      const accent = getComputedStyle(document.documentElement).getPropertyValue("--atlas-accent").trim() || "#fb2c36"
      map.addSource("routes", { type: "geojson", data: { type: "FeatureCollection", features: [] } })
      map.addLayer({ id: "routes-line", type: "line", source: "routes", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": accent, "line-width": 1.5, "line-opacity": 0.6 } })

      // Клик по «области» страны на мелком масштабе — выбор страны
      map.on("click", (e) => {
        if (map.getZoom() > 6.5) return
        const { lng, lat } = e.lngLat
        const pad = 2.5
        for (const country of new Set(tripsRef.current.map((t) => t.country))) {
          const cs = tripsRef.current.filter((t) => t.country === country).flatMap((t) => t.cities)
          if (!cs.length) continue
          const inside = lng >= Math.min(...cs.map((c) => c.lng)) - pad && lng <= Math.max(...cs.map((c) => c.lng)) + pad &&
            lat >= Math.min(...cs.map((c) => c.lat)) - pad && lat <= Math.max(...cs.map((c) => c.lat)) + pad
          if (inside) { onCountryRef.current(country); return }
        }
      })

      readyRef.current = true
      syncPlaces()
      const show = () => setVisible(true)
      map.once("idle", show)
      setTimeout(show, 3000)
      spin()
    })

    return () => { clearTimeout(idleTimer); readyRef.current = false; map.remove(); mapRef.current = null }
  }, [])

  const padKey = `${padding.top}:${padding.bottom}:${padding.left}:${padding.right}`
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const p = padRef.current
    // на общем виде глобус центрируется только по горизонтали, при фокусе — с учётом шторки
    const focused = prevActiveRef.current !== null
    map.easeTo({ padding: { top: focused ? p.top : 0, bottom: focused ? p.bottom : 0, left: p.left, right: p.right }, duration: 600 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [padKey])

  useEffect(() => {
    tripsRef.current = trips
    if (readyRef.current) syncRef.current?.()
  }, [trips])

  // Фокус: подсветка точек и маршрутов + перелёт камеры
  useEffect(() => {
    activeRef.current = activeTripId
    const map = mapRef.current
    if (!map) return
    const focusTrips = activeTripId ? [activeTripId] : activeCountry ? trips.filter((t) => t.country === activeCountry).map((t) => t.id) : []
    const apply = () => {
      for (const pin of pinsRef.current) {
        pin.el.dataset.state = pin.cityId === selectedCityId ? "selected" : focusTrips.length === 0 ? "idle" : focusTrips.includes(pin.tripId) ? "active" : "dim"
      }
      if (map.getLayer("routes-line")) {
        const isActive: maplibregl.ExpressionSpecification = ["in", ["get", "tripId"], ["literal", focusTrips]]
        map.setPaintProperty("routes-line", "line-opacity", ["case", isActive, 1, focusTrips.length === 0 ? 0.6 : 0.15])
        map.setPaintProperty("routes-line", "line-width", ["case", isActive, 3, 1.5])
      }
    }
    applyFocusRef.current = apply
    if (readyRef.current) apply()

    const city = trips.flatMap((t) => t.cities).find((c) => c.id === selectedCityId)
    const isPoint = (b: maplibregl.LngLatBounds) => { const sw = b.getSouthWest(), ne = b.getNorthEast(); return sw.lng === ne.lng && sw.lat === ne.lat }
    const p = padRef.current
    const pad = (extra = 0) => ({ top: p.top, bottom: p.bottom + extra, left: p.left, right: p.right })
    try {
      map.stop()
      if (city) {
        spinRef.current = false
        map.flyTo({ center: [city.lng, city.lat], zoom: 8.5, pitch: 40, duration: 2400, padding: pad() })
      } else if (activeTripId || activeCountry) {
        spinRef.current = false
        const bounds = new maplibregl.LngLatBounds()
        for (const t of trips) {
          if (activeTripId ? t.id !== activeTripId : t.country !== activeCountry) continue
          for (const c of t.cities) bounds.extend([c.lng, c.lat])
        }
        if (!bounds.isEmpty()) {
          const maxZoom = activeTripId ? 6.5 : 5.5
          const pitch = activeTripId ? 25 : 15
          if (isPoint(bounds)) map.flyTo({ center: bounds.getCenter(), zoom: maxZoom - 0.5, pitch, duration: 2800, padding: pad(64) })
          else map.fitBounds(bounds, { padding: { top: p.top + 100, bottom: p.bottom + 64, left: p.left + 48, right: p.right + 48 }, maxZoom, duration: 2800, pitch })
        }
      } else if (prevActiveRef.current !== null) {
        spinRef.current = true
        map.flyTo({ center: HOME_CENTER, zoom: HOME_ZOOM, pitch: 0, duration: 2400, padding: { top: 0, bottom: 0, left: p.left, right: p.right } })
      }
    } catch {}
    prevActiveRef.current = activeTripId || activeCountry
  }, [activeTripId, activeCountry, selectedCityId, trips])

  return (
    <div className="absolute inset-0" style={{ background: "var(--space)" }}>
      <div ref={containerRef} className={"h-full w-full transition-opacity duration-700 " + (visible ? "opacity-100" : "opacity-0")} />
      {!visible && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3">
          <div className="flex gap-1.5">
            <span className="atlas-loader-dot" style={{ animationDelay: "0ms" }} />
            <span className="atlas-loader-dot" style={{ animationDelay: "150ms" }} />
            <span className="atlas-loader-dot" style={{ animationDelay: "300ms" }} />
          </div>
          <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Атлас</span>
        </div>
      )}
      {status && (
        <div className="glass-tile pointer-events-none absolute inset-x-3 top-[calc(env(safe-area-inset-top)+72px)] z-10 rounded-2xl px-3 py-2 text-[11px] text-foreground/70 md:right-auto md:left-[calc(50%-220px)] md:w-[440px]">
          {status}
        </div>
      )}
    </div>
  )
}
