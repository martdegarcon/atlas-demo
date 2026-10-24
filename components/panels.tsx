"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import gsap from "gsap"
import { citiesTag, countLabel, languages, t, type Lang } from "@/lib/i18n"
import { findCity, type City, type Entry, type Trip } from "@/lib/types"
import { cn } from "./editors"
import { Photo, usePostViewer, type ViewerItem } from "./photo"
import { Segmented } from "./ui"
import {
  CaretLeftIcon, CaretRightIcon, DownloadIcon, LockIcon, MapPinIcon, PencilIcon, PlusIcon, ShareIcon, UploadIcon, XIcon,
} from "./icons"

function useReveal(deps: unknown[], scrollTop = true) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    if (scrollTop) root.scrollTo({ top: 0 })
    const items = root.querySelectorAll<HTMLElement>("[data-reveal]")
    if (!items.length) return
    gsap.fromTo(items, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out", stagger: 0.045, overwrite: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return ref
}

const iconBtn = "focus-ring glass-tile grid size-11 shrink-0 place-items-center rounded-full active:scale-95"
const eyebrowCls = "text-[10px] uppercase tracking-[0.2em] text-muted-foreground"

function PrivateBadge({ lang }: { lang: Lang }) {
  return (
    <span className="glass-tile inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
      <LockIcon size={10} />{t(lang, "privateBadge")}
    </span>
  )
}

/* ---------- Карта: мир → страна → поездка → город ---------- */

export function MapPanel(p: {
  open: boolean
  trips: Trip[]
  activeCountry: string | null
  activeTripId: string | null
  selectedCityId: string | null
  lang: Lang
  canEdit: boolean
  onSelectTrip: (id: string) => void
  onSelectCity: (id: string) => void
  onBack: () => void
  onShare: (tripId: string, cityId: string | null) => void
  onEditCity: (id: string) => void
  onEditTrip: (id: string) => void
  onAddEntry: (cityId: string) => void
  onEditEntry: (cityId: string, entryId: string) => void
  // большой экран: город открыт в отдельной колонке справа, а здесь остаётся маршрут поездки
  cityAside?: boolean
}) {
  const { trips, activeCountry, activeTripId, selectedCityId, lang, canEdit } = p
  const trip = activeTripId ? trips.find((x) => x.id === activeTripId) || null : null
  const city = selectedCityId && !p.cityAside ? findCity(trips, selectedCityId)?.city || null : null
  const countryTrips = activeCountry ? trips.filter((x) => x.country === activeCountry) : trips
  const countries = new Set(trips.map((x) => x.country)).size
  const cityCount = trips.reduce((s, x) => s + x.cities.length, 0)
  const scrollRef = useReveal([activeCountry, activeTripId, p.cityAside ? null : selectedCityId, trips])

  let eyebrow = "", title = t(lang, "atlasTitle"), sub = ""
  const index = trip && city ? trip.cities.findIndex((c) => c.id === city.id) : -1
  if (city && trip) { eyebrow = `${trip.title} · ${trip.year}`; title = city.name; sub = city.date === "—" ? "" : city.date }
  else if (trip) { eyebrow = t(lang, "tripEyebrow"); title = trip.title; sub = [trip.period, trip.year].filter(Boolean).join(" · ") }
  else if (activeCountry) {
    title = activeCountry
    sub = `${countLabel(lang, countryTrips.length, "trip")} · ${countLabel(lang, countryTrips.reduce((s, x) => s + x.cities.length, 0), "city")}`
  }
  const countryLevel = !!activeCountry && !trip

  return (
    <>
      <div className="flex shrink-0 items-center gap-3 px-4 pb-3">
        {activeCountry && (
          <button type="button" onClick={p.onBack} aria-label={t(lang, "backAria")} className={iconBtn}><CaretLeftIcon className="size-5" /></button>
        )}
        <div className="min-w-0 flex-1">
          {eyebrow && <div className={cn("flex items-center gap-2 truncate", eyebrowCls)}>{eyebrow}{trip && !trip.isPublic && !city && <PrivateBadge lang={lang} />}</div>}
          {countryLevel ? (
            <div className="flex items-baseline justify-between gap-3">
              <h1 className="min-w-0 truncate text-3xl leading-tight font-light tracking-tight">{title}</h1>
              {sub && <div className="shrink-0 whitespace-nowrap text-sm text-muted-foreground">{sub}</div>}
            </div>
          ) : (
            <>
              <h1 className="truncate text-3xl leading-tight font-light tracking-tight">
                {title}
                {!activeCountry && <sup className="ml-1 align-super text-xs text-muted-foreground">({trips.length})</sup>}
              </h1>
              {sub && <div className="truncate text-sm text-muted-foreground">{sub}</div>}
            </>
          )}
        </div>
        {trip && canEdit && (
          <button type="button" onClick={() => (city ? p.onEditCity(city.id) : p.onEditTrip(trip.id))} aria-label={t(lang, "edit")} className={iconBtn}><PencilIcon className="size-4" /></button>
        )}
        {trip && (canEdit || trip.isPublic) && (
          <button type="button" onClick={() => p.onShare(trip.id, city ? city.id : null)} aria-label={t(lang, "shareAria")} className={iconBtn}><ShareIcon className="size-4" /></button>
        )}
      </div>

      <div ref={scrollRef} className={cn("no-scrollbar scroll-fade min-h-0 flex-1 overscroll-contain px-3 pb-8", p.open ? "overflow-y-auto" : "overflow-hidden")}>
        {city && trip ? (
          <PlaceCard city={city} next={trip.cities[index + 1]} lang={lang} canEdit={canEdit}
            onSelectCity={p.onSelectCity} onAddEntry={() => p.onAddEntry(city.id)} onEditEntry={(entryId) => p.onEditEntry(city.id, entryId)} />
        ) : trip ? (
          <Timeline trip={trip} selectedCityId={selectedCityId} onSelectCity={p.onSelectCity} />
        ) : activeCountry ? (
          <div className="flex flex-col gap-6">
            {countryTrips.map((tr) => (
              <section key={tr.id} data-reveal>
                <button type="button" onClick={() => p.onSelectTrip(tr.id)} className="focus-ring mb-3 flex w-full items-center justify-between gap-3 px-2 text-left">
                  <span>
                    <span className="flex items-center gap-2 text-lg leading-tight font-light">{tr.title} · {tr.year}{!tr.isPublic && <PrivateBadge lang={lang} />}</span>
                    <span className={cn("block", eyebrowCls)}>{tr.period}</span>
                  </span>
                  <CaretRightIcon className="size-4 shrink-0 text-muted-foreground" />
                </button>
                <Timeline trip={tr} selectedCityId={selectedCityId} onSelectCity={p.onSelectCity} />
              </section>
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 pb-3">
              <Stat value={countries} label={countLabel(lang, countries, "country")} />
              <Stat value={cityCount} label={countLabel(lang, cityCount, "city")} />
            </div>
            <h2 className={cn("px-2 pb-2", eyebrowCls)}>{t(lang, "tripsHeader")}</h2>
            {!trips.length && <div data-reveal className="glass-tile rounded-[22px] p-5 text-sm text-muted-foreground">{t(lang, canEdit ? "emptyAtlas" : "emptyAtlasPublic")}</div>}
            <ul className="flex flex-col gap-2">
              {trips.map((tr) => <li key={tr.id} data-reveal><TripCard trip={tr} lang={lang} onSelect={() => p.onSelectTrip(tr.id)} /></li>)}
            </ul>
          </>
        )}
      </div>
    </>
  )
}

function tripCoverPhoto(trip: Trip) {
  for (const c of trip.cities) for (const e of c.entries || []) if (e.photo) return e.photo
  return undefined
}

export function TripsPanel({ trips, lang, onSelectTrip }: { trips: Trip[]; lang: Lang; onSelectTrip: (id: string) => void }) {
  const ref = useReveal([trips])
  return (
    <>
      <div className="flex shrink-0 items-center gap-3 px-4 pb-3">
        <h1 className="truncate text-3xl leading-tight font-light tracking-tight">{t(lang, "tripsHeader")}<sup className="ml-1 align-super text-xs text-muted-foreground">({trips.length})</sup></h1>
      </div>
      <div ref={ref} className="no-scrollbar scroll-fade min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-8">
        {trips.length ? (
          <div className="flex flex-col gap-3">
            {trips.map((trip) => {
              const cover = tripCoverPhoto(trip)
              return (
                <button key={trip.id} type="button" data-reveal onClick={() => onSelectTrip(trip.id)} className="focus-ring glass-tile block w-full overflow-hidden rounded-[22px] text-left">
                  {cover && (
                    <div className="relative aspect-[16/9] w-full overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={cover} alt="" loading="lazy" className="size-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0" />
                    </div>
                  )}
                  <div className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-lg leading-tight font-light">{trip.title}{!trip.isPublic && <PrivateBadge lang={lang} />}</div>
                        <div className="mt-0.5 text-sm text-muted-foreground">{[trip.period, trip.year].filter(Boolean).join(" · ")}</div>
                      </div>
                      <CaretRightIcon className="size-4 shrink-0 text-muted-foreground" />
                    </div>
                    <div className={cn("mt-3", eyebrowCls)}>{citiesTag(lang, trip)}</div>
                  </div>
                </button>
              )
            })}
          </div>
        ) : (
          <div data-reveal className="glass-tile rounded-[28px] p-5 text-sm text-muted-foreground">{t(lang, "tripsEmpty")}</div>
        )}
      </div>
    </>
  )
}

export function NotesPanel({ trips, lang, onSelectCity }: { trips: Trip[]; lang: Lang; onSelectCity: (id: string) => void }) {
  const items = trips.flatMap((trip) => trip.cities.flatMap((city) => (city.entries || []).map((entry) => ({ trip, city, entry }))))
  const ref = useReveal([trips])
  const posts = useMemo<ViewerItem[]>(() => items.map(({ trip, city, entry }) => ({
    id: entry.id, photo: entry.photo, text: entry.text, time: entry.time, place: `${city.name} · ${trip.title}`, onPlace: () => onSelectCity(city.id),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [trips, onSelectCity])
  const viewer = usePostViewer(posts, lang)
  return (
    <>
      <div className="flex shrink-0 items-center gap-3 px-4 pb-3">
        <h1 className="truncate text-3xl leading-tight font-light tracking-tight">{t(lang, "notesHeader")}<sup className="ml-1 align-super text-xs text-muted-foreground">({items.length})</sup></h1>
      </div>
      <div ref={ref} className="no-scrollbar scroll-fade min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-8">
        {items.length ? (
          <div className="flex flex-col gap-3">
            {items.map(({ trip, city, entry }) => (
              <article key={entry.id} data-reveal className="glass-slab rounded-[28px] p-4">
                <button type="button" onClick={() => onSelectCity(city.id)} className={cn("focus-ring -mx-1 mb-2 flex max-w-full items-center gap-1 rounded-full px-1 py-1 text-left transition-colors hover:text-foreground", eyebrowCls)}>
                  <MapPinIcon size={12} className="shrink-0" />
                  <span className="truncate">{city.name} · {trip.title}{entry.time ? ` · ${entry.time}` : ""}</span>
                </button>
                {entry.photo && <Photo src={entry.photo} className="mb-3" label={t(lang, "openPost")} onOpen={() => viewer.open(entry.id)} />}
                {entry.text && (
                  <button type="button" onClick={() => viewer.open(entry.id)} className="focus-ring block w-full rounded-[12px] text-left">
                    <p className="line-clamp-6 pb-1 text-base leading-relaxed whitespace-pre-line text-foreground/90">{entry.text}</p>
                  </button>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div data-reveal className="glass-tile rounded-[28px] p-5 text-sm text-muted-foreground">{t(lang, "notesEmpty")}</div>
        )}
      </div>
      {viewer.viewer}
    </>
  )
}

/* ---------- Ещё: настройки, вход, данные ---------- */

export function MorePanel(p: {
  trips: Trip[]
  lang: Lang
  theme: "light" | "dark" | "system"
  isAdmin: boolean
  loginEnabled: boolean
  onTheme: (t: "light" | "dark" | "system") => void
  onLang: (l: Lang) => void
  onLogin: () => void
  onLogout: () => void
  onExport: () => void
  onImport: (f: File) => void
}) {
  const { trips, lang } = p
  const fileRef = useRef<HTMLInputElement>(null)
  const ref = useReveal([p.isAdmin], false)
  const countries = new Set(trips.map((x) => x.country)).size
  const cities = trips.reduce((s, x) => s + x.cities.length, 0)

  const row = "focus-ring flex w-full items-center justify-between gap-3 px-4 py-3 text-left disabled:opacity-40"

  return (
    <>
      <div className="flex shrink-0 items-center gap-3 px-4 pb-3">
        <h1 className="truncate text-3xl leading-tight font-light tracking-tight">{t(lang, "moreHeader")}</h1>
      </div>
      <div ref={ref} className="no-scrollbar scroll-fade min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-8">
        <div className="flex flex-col gap-3">
          <div data-reveal className="glass-tile grid grid-cols-3 gap-3 rounded-[22px] p-4 text-center">
            {[[trips.length, "statTripsLabel"], [countries, "statCountriesLabel"], [cities, "statCitiesLabel"]].map(([v, k]) => (
              <div key={k as string}>
                <div className="text-2xl font-light">{v as number}</div>
                <div className={cn("mt-0.5", eyebrowCls)}>{t(lang, k as "statTripsLabel")}</div>
              </div>
            ))}
          </div>

          <div data-reveal className="glass-tile rounded-[22px] p-4">
            <div className={cn("pb-3", eyebrowCls)}>{t(lang, "settingsHeader")}</div>
            <div className="mb-1.5 px-1 text-xs text-muted-foreground">{t(lang, "themeLabel")}</div>
            <Segmented label={t(lang, "themeLabel")} value={p.theme} onChange={p.onTheme}
              options={(["light", "dark", "system"] as const).map((o) => ({ id: o, label: t(lang, o === "light" ? "themeLight" : o === "dark" ? "themeDark" : "themeSystem") }))} />
            <div className="mt-3 mb-1.5 px-1 text-xs text-muted-foreground">{t(lang, "languageLabel")}</div>
            <Segmented label={t(lang, "languageLabel")} value={lang} onChange={p.onLang} options={languages.map((l) => ({ id: l.id, label: l.label }))} />
          </div>

          {p.isAdmin && (
            <div data-reveal className="glass-tile overflow-hidden rounded-[22px]">
              <div className={cn("px-4 pt-4 pb-1", eyebrowCls)}>{t(lang, "dataHeader")}</div>
              <button type="button" onClick={p.onExport} disabled={!trips.length} className={row}>
                <span><span className="block text-base">{t(lang, "exportAction")}</span><span className="block text-xs text-muted-foreground">{t(lang, "exportHint")}</span></span>
                <DownloadIcon className="size-4 shrink-0 text-muted-foreground" />
              </button>
              <button type="button" onClick={() => fileRef.current?.click()} className={row + " pb-4"}>
                <span><span className="block text-base">{t(lang, "importAction")}</span><span className="block text-xs text-muted-foreground">{t(lang, "importHint")}</span></span>
                <UploadIcon className="size-4 shrink-0 text-muted-foreground" />
              </button>
              <input ref={fileRef} type="file" accept="application/json,.json" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) p.onImport(f) }} />
            </div>
          )}

          <div data-reveal className="glass-tile overflow-hidden rounded-[22px]">
            {p.isAdmin ? (
              <div className="flex items-center justify-between gap-3 p-4">
                <span className="text-sm">{t(lang, "ownerSignedIn")}</span>
                <button type="button" onClick={p.onLogout} className="focus-ring rounded-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">{t(lang, "logout")}</button>
              </div>
            ) : (
              <>
                <p className="px-4 pt-4 text-sm text-muted-foreground">{t(lang, "ownerHint")}</p>
                {p.loginEnabled && (
                  <button type="button" onClick={p.onLogin} className={row + " pb-4"}>
                    <span className="text-base">{t(lang, "ownerLogin")}</span>
                    <CaretRightIcon className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                )}
                {!p.loginEnabled && <div className="pb-4" />}
              </>
            )}
          </div>

        </div>
      </div>
    </>
  )
}

/* ---------- мелкие части ---------- */

function Stat({ value, label }: { value: number; label: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const from = { v: 0 }
    const tween = gsap.to(from, { v: value, duration: 1.1, ease: "power3.out", onUpdate: () => { el.textContent = String(Math.round(from.v)) } })
    return () => { tween.kill() }
  }, [value])
  return (
    <div data-reveal className="glass-tile rounded-[24px] p-4">
      <span ref={ref} className="block text-4xl leading-none font-light tabular-nums">0</span>
      <span className={cn("mt-1.5 block", eyebrowCls)}>{label}</span>
    </div>
  )
}

function EntryCard({ entry, lang, onEdit, onOpen }: { entry: Entry; lang: Lang; onEdit?: () => void; onOpen: () => void }) {
  return (
    <article data-reveal className="glass-slab rounded-[28px] p-4">
      {(entry.time || onEdit) && (
        <div className="flex items-center justify-between gap-3 pb-3">
          <p className={cn("min-w-0 truncate", eyebrowCls)}>{entry.time || ""}</p>
          {onEdit && (
            <button type="button" onClick={onEdit} aria-label={t(lang, "editEntry")} className="focus-ring glass-tile -my-1 grid size-8 shrink-0 place-items-center rounded-full active:scale-95"><PencilIcon size={14} /></button>
          )}
        </div>
      )}
      {entry.photo && <Photo src={entry.photo} className="mb-3" label={t(lang, "openPhoto")} onOpen={onOpen} />}
      {entry.text && <p className="pb-1 text-base leading-relaxed whitespace-pre-line text-foreground/90">{entry.text}</p>}
    </article>
  )
}

function PlaceCard({ city, next, lang, canEdit, onSelectCity, onAddEntry, onEditEntry }: {
  city: City; next?: City; lang: Lang; canEdit: boolean
  onSelectCity: (id: string) => void; onAddEntry: () => void; onEditEntry: (entryId: string) => void
}) {
  const posts = useMemo<ViewerItem[]>(() => (city.entries || []).map((e) => ({ id: e.id, photo: e.photo, text: e.text, time: e.time, place: city.name })), [city])
  const viewer = usePostViewer(posts, lang)
  return (
    <div className="flex flex-col gap-3">
      {viewer.viewer}
      {city.entries?.length ? city.entries.map((e) => <EntryCard key={e.id} entry={e} lang={lang} onOpen={() => viewer.open(e.id)} onEdit={canEdit ? () => onEditEntry(e.id) : undefined} />) : (
        <div data-reveal className="glass-tile rounded-[28px] p-5 text-sm text-muted-foreground">{t(lang, "noEntriesForCity")}</div>
      )}
      {canEdit && (
        <button type="button" data-reveal onClick={onAddEntry}
          className="focus-ring flex h-12 items-center justify-center gap-2 rounded-[22px] border border-dashed text-sm text-muted-foreground transition-colors hover:text-foreground"
          style={{ borderColor: "rgb(var(--atlas-accent-rgb) / .4)" }}>
          <PlusIcon size={16} />{t(lang, "addEntry")}
        </button>
      )}
      {next && (
        <button type="button" data-reveal onClick={() => onSelectCity(next.id)} className="focus-ring glass-tile flex items-center justify-between gap-3 rounded-[22px] p-4 text-left">
          <span>
            <span className={cn("block", eyebrowCls)}>{t(lang, "next")}</span>
            <span className="block text-lg leading-tight font-light">{next.name}</span>
            <span className="block text-[11px] uppercase tracking-[0.15em] text-muted-foreground">{next.date}</span>
          </span>
          <CaretRightIcon className="size-5 shrink-0 text-muted-foreground" />
        </button>
      )}
    </div>
  )
}

function TripCard({ trip, lang, onSelect }: { trip: Trip; lang: Lang; onSelect: () => void }) {
  const n = trip.cities.length
  return (
    <button type="button" onClick={onSelect} className="focus-ring glass-tile w-full rounded-[22px] p-4 text-left">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-lg leading-tight font-light">{trip.title}{!trip.isPublic && <PrivateBadge lang={lang} />}</div>
          <div className="mt-0.5 text-sm text-muted-foreground">{[trip.period, trip.year].filter(Boolean).join(" · ")}</div>
        </div>
        <CaretRightIcon className="size-4 shrink-0 text-muted-foreground" />
      </div>
      {n > 1 && (
        <div className="relative mt-4 flex items-center justify-between" aria-hidden="true">
          <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-current opacity-15" />
          {trip.cities.map((c) => <span key={c.id} className="relative z-10 size-1.5 shrink-0 rounded-full bg-[var(--atlas-accent)]" />)}
        </div>
      )}
      <div className={cn("mt-3", eyebrowCls)}>{citiesTag(lang, trip)}</div>
    </button>
  )
}

function Timeline({ trip, selectedCityId, onSelectCity }: { trip: Trip; selectedCityId: string | null; onSelectCity: (id: string) => void }) {
  const n = trip.cities.length
  return (
    <ol className="flex flex-col">
      {trip.cities.map((c, i) => {
        const on = selectedCityId === c.id
        const note = c.entries?.[0]?.text
        return (
          <li key={c.id} data-reveal>
            <button type="button" onClick={() => onSelectCity(c.id)} aria-current={on ? "true" : undefined} className="focus-ring block w-full rounded-2xl px-2 text-left">
              <span className="flex items-center gap-3 py-1.5">
                <span aria-hidden="true" className={cn("size-2.5 shrink-0 rounded-full bg-[var(--atlas-accent)]", on && "ring-4 ring-[rgb(var(--atlas-accent-rgb)/0.3)]")} />
                <span className={cn("text-lg leading-tight font-light", on && "text-[var(--atlas-accent)]")}>{c.name}</span>
              </span>
              <span className="flex gap-3">
                <span className="flex w-2.5 shrink-0 flex-col items-center" aria-hidden="true">
                  {i < n - 1 && <span className="w-px flex-1 bg-current opacity-15" />}
                </span>
                <span className="flex-1 pb-4">
                  <span className="block text-[11px] uppercase tracking-[0.15em] text-muted-foreground">{c.date}</span>
                  {note && <span className="mt-1 line-clamp-2 block text-sm text-foreground/70">{note}</span>}
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

/* ---------- Большой экран: город в отдельной колонке ---------- */

export function PlacePanel({ trip, city, lang, canEdit, onClose, onSelectCity, onEdit, onShare, onAddEntry, onEditEntry }: {
  trip: Trip
  city: City
  lang: Lang
  canEdit: boolean
  onClose: () => void
  onSelectCity: (id: string) => void
  onEdit: () => void
  onShare: () => void
  onAddEntry: () => void
  onEditEntry: (entryId: string) => void
}) {
  const index = trip.cities.findIndex((c) => c.id === city.id)
  const ref = useReveal([city.id, city.entries?.length])
  return (
    <section aria-label={city.name} className="atlas-sheet glass-panel absolute top-4 right-4 bottom-4 z-20 flex w-[420px] flex-col overflow-hidden rounded-[32px]">
      <div className="flex shrink-0 items-start gap-3 px-5 pt-5 pb-4">
        <div className="min-w-0 flex-1">
          <div className={cn("truncate", eyebrowCls)}>{trip.title} · {trip.year} · {String(index + 1).padStart(2, "0")} / {String(trip.cities.length).padStart(2, "0")}</div>
          <h2 className="truncate text-4xl leading-tight font-light tracking-tight">{city.name}</h2>
          {city.date && city.date !== "—" && <div className="text-sm text-muted-foreground">{city.date}</div>}
        </div>
        {canEdit && <button type="button" onClick={onEdit} aria-label={t(lang, "edit")} className={iconBtn}><PencilIcon className="size-4" /></button>}
        {(canEdit || trip.isPublic) && <button type="button" onClick={onShare} aria-label={t(lang, "shareAria")} className={iconBtn}><ShareIcon className="size-4" /></button>}
        <button type="button" onClick={onClose} aria-label={t(lang, "closeAria")} className={iconBtn}><XIcon className="size-4" /></button>
      </div>
      <div ref={ref} className="no-scrollbar scroll-fade min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-8">
        <PlaceCard city={city} next={trip.cities[index + 1]} lang={lang} canEdit={canEdit}
          onSelectCity={onSelectCity} onAddEntry={onAddEntry} onEditEntry={onEditEntry} />
      </div>
    </section>
  )
}
