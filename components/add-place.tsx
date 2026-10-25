"use client"

import { useEffect, useRef, useState } from "react"
import gsap from "gsap"
import { api } from "@/lib/api-client"
import { t, type Lang } from "@/lib/i18n"
import { newId, type City, type Trip } from "@/lib/types"
import { clip, checkYear, cleanYearInput, LIMITS, validLatLng } from "@/lib/limits"
import { yearMessage } from "./editors"
import { Button, FieldError, Segmented, Select, TextArea, TextField, useFitVisualViewport } from "./ui"
import { CaretLeftIcon, LinkIcon, MagnifyingGlassIcon, MapPinIcon, XIcon } from "./icons"

type GeoResult = {
  place_id: number
  display_name: string
  lat: string
  lon: string
  name?: string
  address?: Record<string, string>
}

// Разбор длинной ссылки Google Maps: точка метки, центр карты или ?q=
export function parseGoogleMapsUrl(url: string): { name?: string; lat: number; lng: number } | null {
  const pin = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)
  const center = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
  const q = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/)
  const match = pin || center || q
  if (!match) return null
  const lat = Number(match[1]), lng = Number(match[2])
  if (!validLatLng(lat, lng)) return null
  const placeMatch = url.match(/\/place\/([^/@]+)/)
  let name: string | undefined
  if (placeMatch) {
    try { name = decodeURIComponent(placeMatch[1].replace(/\+/g, " ")) } catch { name = placeMatch[1].replace(/\+/g, " ") }
  }
  return { name, lat, lng }
}

export function isShortLink(url: string) {
  try { const h = new URL(url).hostname; return h === "maps.app.goo.gl" || h === "goo.gl" } catch { return false }
}

export function AddPlace({ open, trips, lang, onClose, onAddCity }: {
  open: boolean
  trips: Trip[]
  lang: Lang
  onClose: () => void
  onAddCity: (city: City, tripId: string | null, newTrip: Trip | null) => void
}) {
  const [kind, setKind] = useState<"city" | "country">("city")
  const [searchMode, setSearchMode] = useState<"name" | "link">("name")
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<GeoResult[]>([])
  const [loading, setLoading] = useState(false)
  const [picked, setPicked] = useState<GeoResult | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [linkInput, setLinkInput] = useState("")
  const [linkError, setLinkError] = useState<string | null>(null)
  const [linkLoading, setLinkLoading] = useState(false)
  const [tripChoice, setTripChoice] = useState("__new__")
  const [newTitle, setNewTitle] = useState("")
  const [newYear, setNewYear] = useState(String(new Date().getFullYear()))
  const [date, setDate] = useState("")
  const [note, setNote] = useState("")

  function reset() {
    setKind("city"); setSearchMode("name"); setQuery(""); setResults([]); setPicked(null)
    setLinkInput(""); setLinkError(null); setTripChoice("__new__"); setNewTitle("")
    setNewYear(String(new Date().getFullYear())); setDate(""); setNote("")
  }

  // Лист остаётся смонтированным на время анимации закрытия
  const [mounted, setMounted] = useState(open)
  const backdropRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLElement>(null)
  useFitVisualViewport(backdropRef, mounted)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  // Каждое открытие — с чистой формы. Сброс в конце анимации закрытия не
  // успевает сработать, если «+» нажали снова, пока лист ещё уезжал.
  useEffect(() => {
    if (open) {
      reset()
      setMounted(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeRef.current() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])
  useEffect(() => {
    if (!mounted) return
    const backdrop = backdropRef.current, sheet = sheetRef.current
    if (!backdrop || !sheet) return
    gsap.killTweensOf([backdrop, sheet])
    if (open) {
      gsap.set(backdrop, { opacity: 0 }); gsap.set(sheet, { y: 48, opacity: 0 })
      gsap.to(backdrop, { opacity: 1, duration: 0.3, ease: "power2.out" })
      gsap.to(sheet, { y: 0, opacity: 1, duration: 0.55, ease: "back.out(1.4)" })
    } else {
      gsap.to(backdrop, { opacity: 0, duration: 0.25, ease: "power2.in" })
      gsap.to(sheet, { y: 48, opacity: 0, duration: 0.3, ease: "power2.in", onComplete: () => { reset(); setMounted(false) } })
    }
  }, [open, mounted])

  useEffect(() => {
    if (picked || searchMode !== "name") return
    const q = query.trim()
    if (q.length < 2) { setResults([]); return }
    const timer = setTimeout(() => {
      abortRef.current?.abort()
      const ac = new AbortController()
      abortRef.current = ac
      setLoading(true)
      const params = new URLSearchParams({ format: "json", q, "accept-language": lang, limit: "6", addressdetails: "1" })
      if (kind === "country") params.set("featuretype", "country")
      fetch(`https://nominatim.openstreetmap.org/search?${params}`, { signal: ac.signal })
        .then((r) => r.json())
        .then((data) => { if (abortRef.current === ac) setResults(Array.isArray(data) ? data : []) })
        .catch(() => {})
        .finally(() => { if (abortRef.current === ac) setLoading(false) })
    }, 400)
    return () => clearTimeout(timer)
  }, [query, kind, picked, searchMode, lang])

  function pick(r: GeoResult) { setPicked(r); setResults([]) }

  async function resolveLink() {
    const url = linkInput.trim()
    if (!url || linkLoading) return
    setLinkError(null)
    setLinkLoading(true)
    try {
      let parsed = parseGoogleMapsUrl(url)
      // короткую ссылку разворачивает наш сервер — из браузера это невозможно
      if (!parsed && isShortLink(url)) {
        try { parsed = parseGoogleMapsUrl(await api.resolveLink(url)) } catch {}
      }
      if (!parsed) { setLinkError(t(lang, "linkNotFound")); return }
      // Названия в ссылке может не быть — добираем город и страну по координатам
      let rev: { address?: Record<string, string>; display_name?: string; name?: string } | null = null
      try {
        const p = new URLSearchParams({ format: "json", lat: String(parsed.lat), lon: String(parsed.lng), "accept-language": lang, zoom: "10", addressdetails: "1" })
        const res = await fetch("https://nominatim.openstreetmap.org/reverse?" + p)
        if (res.ok) rev = await res.json()
      } catch {}
      const addr = rev?.address
      const fromAddr = addr && (addr.city || addr.town || addr.village || addr.municipality || addr.county || addr.state)
      const name = parsed.name || fromAddr || rev?.name || `${parsed.lat.toFixed(4)}, ${parsed.lng.toFixed(4)}`
      pick({ place_id: Date.now(), display_name: rev?.display_name || name, lat: String(parsed.lat), lon: String(parsed.lng), name, address: addr })
    } finally {
      setLinkLoading(false)
    }
  }

  const shortName = (r: GeoResult) => r.name || r.display_name.split(",")[0]
  const countryName = (r: GeoResult) => r.address?.country || r.display_name.split(",").pop()?.trim() || r.display_name
  // страна и её код — у самой точки: тур может идти через несколько стран
  const countryOf = (r: GeoResult): Pick<City, "country" | "countryCode"> => {
    const code = r.address?.country_code?.toLowerCase()
    return {
      ...(r.address?.country ? { country: clip(r.address.country, LIMITS.country) } : {}),
      ...(code && /^[a-z]{2}$/.test(code) ? { countryCode: code } : {}),
    }
  }

  const yearError = yearMessage(lang, checkYear(newYear))
  const titleOk = newTitle.trim().length > 0
  const cityReady = !!picked && (tripChoice !== "__new__" || (titleOk && !yearError))
  const countryReady = !!picked && !yearError

  function submitCity() {
    if (!picked || !cityReady) return
    const city: City = {
      id: newId(), name: clip(shortName(picked), LIMITS.cityName), lng: Number(picked.lon), lat: Number(picked.lat),
      date: date.trim() || "—",
      ...countryOf(picked),
      ...(note.trim() ? { entries: [{ id: newId(), text: note.trim() }] } : {}),
    }
    if (tripChoice === "__new__") {
      onAddCity(city, null, {
        id: newId(), title: newTitle.trim(), country: clip(countryName(picked), LIMITS.country), year: Number(newYear),
        period: date.trim(), isPublic: true, createdAt: new Date().toISOString(), cities: [city],
      })
    } else onAddCity(city, tripChoice, null)
  }

  // Страна без городов — поездка с одной точкой-отметкой
  function submitCountry() {
    if (!picked || !countryReady) return
    const name = clip(countryName(picked), LIMITS.country)
    const place: City = {
      id: newId(), name, lng: Number(picked.lon), lat: Number(picked.lat), date: "",
      ...countryOf(picked),
      ...(note.trim() ? { entries: [{ id: newId(), text: note.trim() }] } : {}),
    }
    onAddCity(place, null, {
      id: newId(), kind: "country", title: name, country: name, year: Number(newYear),
      period: "", isPublic: true, createdAt: new Date().toISOString(), cities: [place],
    })
  }

  if (!mounted) return null

  const iconBtn = "focus-ring glass-tile grid size-9 shrink-0 place-items-center rounded-full active:scale-95"
  const yearField = (
    <TextField label={t(lang, "yearLabel")} value={newYear} inputMode="numeric" maxLength={4} placeholder={String(new Date().getFullYear())}
      onChange={(e) => setNewYear(cleanYearInput(e.target.value))} error={yearError} messageHidden={kind === "city"} />
  )

  return (
    <div ref={backdropRef} className="fixed inset-0 z-50 flex flex-col justify-end bg-black/25 backdrop-blur-sm dark:bg-black/50 md:justify-center md:p-6" onClick={onClose}>
      <section ref={sheetRef} role="dialog" aria-modal="true" aria-label={t(lang, "addPlaceTitle")}
        className="glass-panel glass-modal relative z-10 flex max-h-[calc(100%-24px)] md:max-h-full flex-col overflow-hidden rounded-t-[32px] pb-[env(safe-area-inset-bottom)] md:mx-auto md:w-[480px] md:rounded-[32px]" onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center gap-3 px-4 pt-4 pb-2">
          {picked ? (
            <button type="button" onClick={() => setPicked(null)} aria-label={t(lang, "addPlaceBackAria")} className={iconBtn}><CaretLeftIcon className="size-4" /></button>
          ) : <span className="size-9" />}
          <h2 className="flex-1 text-center text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{t(lang, "addPlaceTitle")}</h2>
          <button type="button" onClick={onClose} aria-label={t(lang, "closeAria")} className={iconBtn}><XIcon className="size-4" /></button>
        </div>

        {!picked && (
          <div className="shrink-0 px-4 pb-3">
            <Segmented value={kind} onChange={(k) => { setKind(k); setResults([]); if (k === "country") setSearchMode("name") }}
              options={[{ id: "city", label: t(lang, "kindCity") }, { id: "country", label: t(lang, "kindCountry") }]} />
            <p className="px-1 pt-2 text-[11px] leading-snug text-muted-foreground">{kind === "city" ? t(lang, "kindCityHint") : t(lang, "kindCountryHint")}</p>
            {kind === "city" && (
              <div className="mt-3">
                <Segmented size="sm" value={searchMode} onChange={(m) => { setSearchMode(m); setLinkError(null) }}
                  options={[{ id: "name", label: t(lang, "searchModeName") }, { id: "link", label: <><LinkIcon size={13} />{t(lang, "searchModeLink")}</> }]} />
              </div>
            )}
          </div>
        )}

        <div className="no-scrollbar scroll-fade min-h-0 flex-1 overflow-y-auto px-4 pb-6">
          {!picked ? (
            searchMode === "link" ? (
              <div className="flex flex-col gap-3">
                <TextField autoFocus type="url" inputMode="url" value={linkInput} placeholder={t(lang, "linkPlaceholder")} maxLength={2000}
                  onChange={(e) => { setLinkInput(e.target.value); setLinkError(null) }}
                  onKeyDown={(e) => { if (e.key === "Enter") resolveLink() }}
                  error={linkError} hint={t(lang, "linkHint")} />
                <Button onClick={resolveLink} disabled={!linkInput.trim() || linkLoading}>
                  {linkLoading ? t(lang, "linkResolving") : t(lang, "linkSubmit")}
                </Button>
              </div>
            ) : (
              <>
                <label className="glass-tile flex h-12 items-center gap-2.5 rounded-full px-4 text-sm focus-within:outline-2 focus-within:outline-foreground/30">
                  <MagnifyingGlassIcon className="size-4 shrink-0 text-muted-foreground" />
                  <input autoFocus value={query} maxLength={120} onChange={(e) => setQuery(e.target.value)} aria-label={kind === "city" ? t(lang, "cityPlaceholder") : t(lang, "countryPlaceholder")}
                    placeholder={kind === "city" ? t(lang, "cityPlaceholder") : t(lang, "countryPlaceholder")} className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm" />
                </label>
                <ul className="mt-3 flex flex-col gap-1.5">
                  {query.trim().length === 1 && <li className="px-2 py-3 text-xs text-muted-foreground">{t(lang, "searchMinChars")}</li>}
                  {loading && <li className="px-2 py-3 text-xs text-muted-foreground">{t(lang, "searching")}</li>}
                  {!loading && query.trim().length >= 2 && results.length === 0 && <li className="px-2 py-3 text-xs text-muted-foreground">{t(lang, "noResults")}</li>}
                  {results.map((r) => (
                    <li key={r.place_id}>
                      <button type="button" onClick={() => pick(r)} className="focus-ring glass-tile flex w-full items-start gap-2.5 rounded-[20px] p-3 text-left hover:bg-foreground/10">
                        <MapPinIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0"><span className="block truncate text-sm">{shortName(r)}</span><span className="block truncate text-xs text-muted-foreground">{r.display_name}</span></span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )
          ) : (
            <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); if (kind === "city") submitCity(); else submitCountry() }}>
              <div className="glass-tile rounded-[20px] p-3">
                <span className="block truncate text-lg leading-tight font-light">{kind === "city" ? shortName(picked) : countryName(picked)}</span>
                <span className="block truncate text-xs text-muted-foreground">{picked.display_name}</span>
              </div>
              {kind === "city" ? (
                <>
                  <Select label={t(lang, "tripLabel")} value={tripChoice} onChange={(e) => setTripChoice(e.target.value)}>
                    <option value="__new__">{t(lang, "newTripOption")}</option>
                    {trips.filter((tr) => tr.kind !== "country" || tr.cities.length).map((tr) => <option key={tr.id} value={tr.id}>{tr.title} · {tr.year}</option>)}
                  </Select>
                  {tripChoice === "__new__" && (
                    <div className="grid grid-cols-[1fr_96px] items-start gap-2">
                      <TextField label={t(lang, "titleLabel")} value={newTitle} maxLength={LIMITS.title} placeholder={t(lang, "tripTitlePlaceholder")}
                        onChange={(e) => setNewTitle(e.target.value)} />
                      {yearField}
                    </div>
                  )}
                  {tripChoice === "__new__" && <FieldError>{yearError}</FieldError>}
                  <TextField label={t(lang, "dateLabel")} value={date} maxLength={LIMITS.date} placeholder={t(lang, "datePlaceholder")} onChange={(e) => setDate(e.target.value)} />
                </>
              ) : yearField}
              <TextArea label={t(lang, "textLabel")} value={note} maxLength={LIMITS.text} placeholder={t(lang, "notePlaceholder")} onChange={(e) => setNote(e.target.value)} />
              <Button type="submit" className="mt-1" disabled={kind === "city" ? !cityReady : !countryReady}>
                {kind === "city" ? t(lang, "addCityButton") : t(lang, "addCountryButton")}
              </Button>
              {kind === "city" && tripChoice === "__new__" && !titleOk && <p className="-mt-1 px-1 text-center text-[11px] text-muted-foreground">{t(lang, "needTripTitle")}</p>}
            </form>
          )}
        </div>
      </section>
    </div>
  )
}
