"use client"

import dynamic from "next/dynamic"
import { useCallback, useEffect, useRef, useState } from "react"
import gsap from "gsap"
import { api, ApiError } from "@/lib/api-client"
import { reloadPage } from "@/lib/browser"
import { STORAGE_LANG_KEY, t, type DictKey, type Lang } from "@/lib/i18n"
import { citiesWithoutCountry, reverseCountry, withCountries } from "@/lib/geo"
import { findCity, sortTrips, type City, type Entry, type Trip } from "@/lib/types"
import { AddPlace } from "./add-place"
import { cn, CityForm, EntryForm, normalizeBackup, Sheet, TripForm } from "./editors"
import { Button, TextField, useFitVisualViewport } from "./ui"
import { LIMITS } from "@/lib/limits"
import { CaretLeftIcon, CaretRightIcon, DotsIcon, GlobeIcon, MagnifyingGlassIcon, MapPinIcon, NoteIcon, PathIcon, PlusIcon, XIcon } from "./icons"
import { MapPanel, MorePanel, NotesPanel, PlacePanel, TripsPanel } from "./panels"
import { ShareSheet } from "./share-sheet"

const Globe = dynamic(() => import("./globe").then((m) => m.Globe), {
  ssr: false,
  loading: () => <div className="absolute inset-0" style={{ background: "var(--space)" }} />,
})

const NAV_HEIGHT = 64
const NAV_OFFSET = NAV_HEIGHT + 16
const PEEK = 212
const SHEET_VH = 0.55

const tabs = [
  { id: "map", label: "navMap", Icon: GlobeIcon },
  { id: "trips", label: "navTrips", Icon: PathIcon },
  { id: "notes", label: "navNotes", Icon: NoteIcon },
  { id: "more", label: "navMore", Icon: DotsIcon },
] as const
type Tab = (typeof tabs)[number]["id"]

type Editor =
  | { type: "trip"; tripId: string }
  | { type: "city"; cityId: string }
  | { type: "entry"; cityId: string; entryId: string | null }
  | { type: "share"; tripId: string; cityId: string | null }
  | { type: "login" }
  | null

type Toast = { id: number; text: string; action?: { label: string; fn: () => void } } | null

// Медиазапрос в JS — для того, что нельзя сделать одним CSS: отступы камеры
// и третья колонка на больших экранах. Сама раскладка — на CSS, без мигания.
function useMedia(query: string) {
  const [match, setMatch] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const update = () => setMatch(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [query])
  return match
}

function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark" | "system">("dark")
  const [resolved, setResolved] = useState<"light" | "dark">("dark")
  useEffect(() => {
    try {
      const saved = localStorage.getItem("atlas-theme")
      if (saved === "light" || saved === "dark" || saved === "system") setTheme(saved)
    } catch {}
  }, [])
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const apply = () => {
      const r = theme === "system" ? (mq.matches ? "dark" : "light") : theme
      document.documentElement.classList.toggle("dark", r === "dark")
      setResolved(r)
    }
    apply()
    try { localStorage.setItem("atlas-theme", theme) } catch {}
    if (theme === "system") {
      mq.addEventListener("change", apply)
      return () => mq.removeEventListener("change", apply)
    }
  }, [theme])
  return [theme, setTheme, resolved] as const
}

export function AtlasApp({ initialTrips, isAdmin, loginEnabled, initialTripId = null, initialCityId = null, startWithLogin = false }: {
  initialTrips: Trip[]
  isAdmin: boolean
  loginEnabled: boolean
  initialTripId?: string | null
  initialCityId?: string | null
  // адрес /admin: сразу окно входа
  startWithLogin?: boolean
}) {
  const initialTrip = initialTripId ? initialTrips.find((x) => x.id === initialTripId) : null
  const [trips, setTrips] = useState<Trip[]>(initialTrips)
  const [lang, setLang] = useState<Lang>("ru")
  const [theme, setTheme, resolvedTheme] = useTheme()
  const [tab, setTab] = useState<Tab>("map")
  const [open, setOpen] = useState(!!initialTrip)
  // Панель убрана совсем — на экране только глобус (и вкладки, чтобы вернуть её)
  const [hidden, setHidden] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [editor, setEditor] = useState<Editor>(startWithLogin && !isAdmin ? { type: "login" } : null)
  const [activeTripId, setActiveTripId] = useState<string | null>(initialTrip ? initialTrip.id : null)
  const [activeCountry, setActiveCountry] = useState<string | null>(initialTrip ? initialTrip.country : null)
  const [selectedCityId, setSelectedCityId] = useState<string | null>(initialCityId)
  const [viewportH, setViewportH] = useState(800)
  const [toast, setToast] = useState<Toast>(null)
  // отметка «интерфейс ожил» (после гидрации) — по ней e2e-тесты понимают, что можно кликать
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Сохранения идут строго по очереди, чтобы быстрые правки не обгоняли друг друга
  const queue = useRef<Promise<unknown>>(Promise.resolve())

  const tr = useCallback((k: DictKey) => t(lang, k), [lang])
  // ≥768 — колонка слева и карта; ≥1024 — колонка шире; ≥1440 — город в отдельной колонке справа
  const isDesktop = useMedia("(min-width: 768px)")
  const isLarge = useMedia("(min-width: 1024px)")
  const isWide = useMedia("(min-width: 1440px)")

  const showToast = useCallback((text: string, action?: { label: string; fn: () => void }) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ id: Date.now(), text, action })
    toastTimer.current = setTimeout(() => setToast(null), action ? 5000 : 2400)
  }, [])

  useEffect(() => {
    const update = () => setViewportH(window.innerHeight)
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])
  useEffect(() => {
    try { const l = localStorage.getItem(STORAGE_LANG_KEY); if (l === "ru" || l === "en") setLang(l) } catch {}
  }, [])
  useEffect(() => { try { localStorage.setItem(STORAGE_LANG_KEY, lang) } catch {} }, [lang])
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

  /* ---------- синхронизация с сервером ---------- */

  function failed(err: unknown, prev: Trip[]) {
    setTrips(prev)
    showToast(err instanceof ApiError && err.status === 401 ? tr("sessionExpired") : tr("saveError"))
  }

  // Применить новое состояние: сразу на экране, затем на сервере. ids — какие
  // поездки затронуты: есть в новом состоянии → сохранить, нет → удалить.
  function apply(next: Trip[], ids: string[], message?: string) {
    const prev = trips
    const sorted = sortTrips(next)
    setTrips(sorted)
    queue.current = queue.current.then(async () => {
      try {
        for (const id of ids) {
          const trip = sorted.find((x) => x.id === id)
          if (trip) {
            const saved = await api.saveTrip(trip)
            setTrips((cur) => cur.map((x) => (x.id === saved.id ? { ...x, slug: saved.slug, createdAt: saved.createdAt, updatedAt: saved.updatedAt } : x)))
          } else {
            await api.deleteTrip(id)
          }
        }
      } catch (err) {
        failed(err, prev)
      }
    })
    if (message) showToast(message, { label: tr("undo"), fn: () => applyRaw(prev, sorted, ids) })
  }

  // То же для «Отменить»: возвращает прошлое состояние без нового тоста
  function applyRaw(target: Trip[], from: Trip[], ids: string[]) {
    setTrips(target)
    queue.current = queue.current.then(async () => {
      try {
        for (const id of ids) {
          const trip = target.find((x) => x.id === id)
          if (trip) await api.saveTrip(trip)
          else await api.deleteTrip(id)
        }
      } catch (err) {
        failed(err, from)
      }
    })
  }

  // Замена всего набора (импорт, демо, очистка) — одним запросом
  function applyAll(next: Trip[], message: string, undoable = true) {
    const prev = trips
    setTrips(sortTrips(next))
    queue.current = queue.current.then(async () => {
      try {
        setTrips(sortTrips(await api.replaceAll(next)))
      } catch (err) {
        failed(err, prev)
      }
    })
    showToast(message, undoable ? { label: tr("undo"), fn: () => applyAll(prev, tr("saved"), false) } : undefined)
  }

  /* ---------- страна у старых точек ----------
     Раньше страна хранилась только у тура, а тур может идти через несколько
     стран. Новые точки получают страну сразу из поиска, а у старых владельцу
     в фоне её досчитывает геокодер — по одной точке в секунду (его лимит). */
  const tripsRef = useRef(trips)
  tripsRef.current = trips
  useEffect(() => {
    if (!isAdmin) return
    const ctrl = new AbortController()
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
    ;(async () => {
      await wait(4000)
      const todo = citiesWithoutCountry(tripsRef.current)
      let found = new Map<string, Pick<City, "country" | "countryCode">>()
      // сохраняем потуро — через общую очередь, по свежему состоянию
      const flush = () => {
        if (!found.size) return
        const batch = found
        found = new Map()
        queue.current = queue.current.then(async () => {
          if (ctrl.signal.aborted) return
          const { trips: next, changed } = withCountries(tripsRef.current, batch)
          if (!changed.length) return
          tripsRef.current = next
          setTrips(next)
          for (const id of changed) {
            const trip = next.find((x) => x.id === id)
            if (trip) await api.saveTrip(trip).catch(() => {})
          }
        })
      }
      let prevTrip: string | null = null
      for (const item of todo) {
        if (ctrl.signal.aborted) return
        if (prevTrip && item.tripId !== prevTrip) flush()
        prevTrip = item.tripId
        try {
          const r = await reverseCountry(item.city.lat, item.city.lng, item.lang, ctrl.signal)
          if (r) found.set(item.city.id, r)
        } catch {
          if (ctrl.signal.aborted) return
        }
        await wait(1100)
      }
      flush()
    })()
    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])

  /* ---------- навигация ---------- */

  const bottomInset = NAV_OFFSET + (hidden ? 0 : open ? Math.round(viewportH * SHEET_VH) : PEEK)
  function clearFocus() { setActiveCountry(null); setActiveTripId(null); setSelectedCityId(null) }
  function selectCountry(country: string) { setActiveCountry(country); setActiveTripId(null); setSelectedCityId(null); settle(true) }
  function selectTrip(id: string) {
    const trip = trips.find((x) => x.id === id)
    if (!trip) return
    setActiveCountry(trip.country); setActiveTripId(id); setSelectedCityId(null); settle(true)
  }
  function selectCity(cityId: string) {
    const found = findCity(trips, cityId)
    if (!found) return
    setActiveCountry(found.trip.country); setActiveTripId(found.trip.id); setSelectedCityId(cityId); settle(true)
  }
  function goBack() { if (selectedCityId) setSelectedCityId(null); else if (activeTripId) setActiveTripId(null); else setActiveCountry(null) }
  function goToTrip(id: string) { setTab("map"); selectTrip(id) }
  function goToCity(id: string) { setTab("map"); selectCity(id) }

  /* ---------- правки ---------- */

  function addCity(city: City, tripId: string | null, newTrip: Trip | null) {
    if (tripId) {
      const trip = trips.find((x) => x.id === tripId)
      if (!trip) return
      // «Страна без городов» — заглушка: первый настоящий город её заменяет
      const updated: Trip = trip.kind === "country"
        ? { ...trip, kind: undefined, cities: [city] }
        : { ...trip, cities: [...trip.cities, city] }
      apply(trips.map((x) => (x.id === tripId ? updated : x)), [tripId])
      setActiveCountry(trip.country); setActiveTripId(tripId)
    } else if (newTrip) {
      apply([...trips, newTrip], [newTrip.id])
      setActiveCountry(newTrip.country); setActiveTripId(newTrip.id)
    }
    setSelectedCityId(city.id); settle(true); setAddOpen(false)
  }

  function updateCities(fn: (c: City) => City, tripId: string) {
    return trips.map((x) => (x.id === tripId ? { ...x, cities: x.cities.map(fn) } : x))
  }

  function saveCity(cityId: string, patch: Partial<City>) {
    const found = findCity(trips, cityId)
    if (!found) return
    apply(updateCities((c) => (c.id === cityId ? { ...c, ...patch } : c), found.trip.id), [found.trip.id])
    setEditor(null); showToast(tr("saved"))
  }

  function deleteCity(cityId: string) {
    const found = findCity(trips, cityId)
    if (!found) return
    const rest = found.trip.cities.filter((c) => c.id !== cityId)
    const next = rest.length ? trips.map((x) => (x.id === found.trip.id ? { ...x, cities: rest } : x)) : trips.filter((x) => x.id !== found.trip.id)
    setEditor(null)
    if (selectedCityId === cityId) setSelectedCityId(null)
    if (!rest.length) {
      setActiveTripId(null)
      if (!next.some((x) => x.country === found.trip.country)) setActiveCountry(null)
    }
    apply(next, [found.trip.id], tr("deleted"))
  }

  function saveTrip(tripId: string, patch: Partial<Trip>) {
    apply(trips.map((x) => (x.id === tripId ? { ...x, ...patch } : x)), [tripId])
    if (activeTripId === tripId && patch.country) setActiveCountry(patch.country)
    setEditor(null); showToast(tr("saved"))
  }

  function deleteTrip(tripId: string) {
    const trip = trips.find((x) => x.id === tripId)
    if (!trip) return
    const next = trips.filter((x) => x.id !== tripId)
    setEditor(null); setSelectedCityId(null); setActiveTripId(null)
    if (!next.some((x) => x.country === trip.country)) setActiveCountry(null)
    apply(next, [tripId], tr("deleted"))
  }

  function saveEntry(cityId: string, entry: Entry) {
    const found = findCity(trips, cityId)
    if (!found) return
    apply(updateCities((c) => {
      if (c.id !== cityId) return c
      const list = c.entries || []
      return { ...c, entries: list.some((e) => e.id === entry.id) ? list.map((e) => (e.id === entry.id ? entry : e)) : [...list, entry] }
    }, found.trip.id), [found.trip.id])
    setEditor(null); showToast(tr("saved"))
  }

  function deleteEntry(cityId: string, entryId: string) {
    const found = findCity(trips, cityId)
    if (!found) return
    apply(updateCities((c) => {
      if (c.id !== cityId) return c
      const list = (c.entries || []).filter((e) => e.id !== entryId)
      return { ...c, entries: list.length ? list : undefined }
    }, found.trip.id), [found.trip.id], tr("deleted"))
    setEditor(null)
  }

  function exportData() {
    const payload = { app: "atlas", version: 2, exportedAt: new Date().toISOString(), trips }
    const href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }))
    const a = document.createElement("a")
    a.href = href
    a.download = `atlas-backup-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(href), 1000)
  }

  function importData(file: File) {
    file.text().then((txt) => {
      let data: Trip[] | null = null
      try { data = normalizeBackup(JSON.parse(txt)) } catch {}
      if (!data || !data.length) { showToast(tr("importError")); return }
      clearFocus()
      applyAll(data, tr("importDone"))
    }).catch(() => showToast(tr("importError")))
  }

  async function logout() {
    try { await api.logout() } catch {}
    reloadPage()
  }

  /* ---------- шторка: перетаскивание без «залипаний» ----------
     Раньше состояние перетаскивания жило в React-стейте, и быстрый тап
     попадал в обработчик со старым значением — панель иногда не реагировала.
     Теперь жест ведётся в ref, а стейт только рисует высоту. */
  const openHeight = Math.round(viewportH * SHEET_VH)
  const [animH, setAnimH] = useState<number | null>(null)
  const sheetHeight = animH ?? (hidden ? 0 : open ? openHeight : PEEK)
  const heightRef = useRef(sheetHeight)
  heightRef.current = sheetHeight
  const openRef = useRef(open)
  openRef.current = open
  const hiddenRef = useRef(hidden)
  hiddenRef.current = hidden
  const tween = useRef<gsap.core.Tween | null>(null)
  const gesture = useRef<{ startY: number; startH: number; dy: number } | null>(null)

  // Положения шторки: true — развёрнута, false — свёрнута до заголовка, "hidden" — убрана
  function settle(next: boolean | "hidden") {
    tween.current?.kill()
    const from = heightRef.current
    const to = next === "hidden" ? 0 : next ? Math.round(window.innerHeight * SHEET_VH) : PEEK
    setHidden(next === "hidden")
    setOpen(next === true)
    // на компьютере панель — колонка, её высота не анимируется (сдвиг делает CSS)
    if (Math.abs(from - to) < 1 || window.matchMedia("(min-width: 768px)").matches) { setAnimH(null); return }
    const s = { h: from }
    setAnimH(from)
    tween.current = gsap.to(s, { h: to, duration: next === "hidden" ? 0.35 : 0.5, ease: next === "hidden" ? "power2.in" : "back.out(1.3)", onUpdate: () => setAnimH(s.h), onComplete: () => setAnimH(null) })
  }
  useEffect(() => () => { tween.current?.kill() }, [])

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    tween.current?.kill()
    gesture.current = { startY: e.clientY, startH: heightRef.current, dy: 0 }
    // захват указателя — удобство (палец может уйти с ручки), а не условие жеста:
    // если браузер откажет, тап всё равно сработает
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
    setAnimH(heightRef.current)
  }
  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const g = gesture.current
    if (!g) return
    g.dy = e.clientY - g.startY
    // ниже свёрнутого положения — можно, так панель убирается совсем
    setAnimH(Math.min(Math.max(g.startH - g.dy, 0), openHeight))
  }
  function onPointerUp() {
    const g = gesture.current
    if (!g) return
    gesture.current = null
    const h = heightRef.current
    if (Math.abs(g.dy) < 6) settle(!openRef.current)
    // утянули ниже свёрнутого положения — убрать совсем
    else if (h < PEEK * 0.75) settle("hidden")
    else if (g.dy < -30) settle(true)
    else if (g.dy > 30) settle(g.startH <= PEEK + 1 ? "hidden" : false)
    else settle(h > (PEEK + openHeight) / 2)
  }

  /* ---------- шторки-редакторы ---------- */
  const close = () => setEditor(null)
  let editorNode: React.ReactNode = null
  if (editor?.type === "trip") {
    const trip = trips.find((x) => x.id === editor.tripId)
    if (trip) editorNode = (
      <Sheet title={tr("editTrip")} lang={lang} onClose={close}>
        <TripForm key={trip.id} trip={trip} lang={lang} onSave={(p) => saveTrip(trip.id, p)} onDelete={() => deleteTrip(trip.id)} />
      </Sheet>
    )
  } else if (editor?.type === "city" || editor?.type === "entry") {
    const found = findCity(trips, editor.cityId)
    if (found && editor.type === "city") editorNode = (
      <Sheet title={tr("editCity")} lang={lang} onClose={close}>
        <CityForm key={found.city.id} city={found.city} lang={lang} onSave={(p) => saveCity(found.city.id, p)} onDelete={() => deleteCity(found.city.id)} />
      </Sheet>
    )
    if (found && editor.type === "entry") {
      const entry = editor.entryId ? found.city.entries?.find((e) => e.id === editor.entryId) || null : null
      editorNode = (
        <Sheet title={tr(entry ? "editEntry" : "newEntry")} lang={lang} onClose={close}>
          <EntryForm key={entry ? entry.id : "new"} entry={entry} lang={lang} onSave={(e) => saveEntry(found.city.id, e)}
            onDelete={entry ? () => deleteEntry(found.city.id, entry.id) : null} />
        </Sheet>
      )
    }
  } else if (editor?.type === "share") {
    const trip = trips.find((x) => x.id === editor.tripId)
    if (trip) editorNode = (
      <ShareSheet trip={trip} cityId={editor.cityId} lang={lang} isAdmin={isAdmin} onClose={close} onToast={(s) => showToast(s)}
        onMakePublic={() => apply(trips.map((x) => (x.id === trip.id ? { ...x, isPublic: true } : x)), [trip.id])} />
    )
  } else if (editor?.type === "login") {
    editorNode = <Sheet title={tr("loginTitle")} lang={lang} onClose={close}>{loginEnabled ? <LoginForm lang={lang} /> : <p className="px-1 pb-2 text-sm leading-relaxed text-muted-foreground">{tr("loginSetupHint")}</p>}</Sheet>
  }

  // Город в правой колонке (большой экран)
  const aside = isWide && tab === "map" && selectedCityId ? findCity(trips, selectedCityId) : null
  const sidebarW = isLarge ? 420 : 380
  const globePadding = isDesktop
    ? { top: 0, bottom: 0, left: hidden ? 0 : sidebarW + 32, right: aside ? 452 : 0 }
    : { top: 0, bottom: bottomInset, left: 0, right: 0 }

  // Колонка слева на планшете/ноутбуке: поиск, вкладки и панель — одна стопка на всю высоту
  const col = "md:inset-x-auto md:left-4 md:w-[380px] lg:w-[420px]"

  return (
    <main className="fixed inset-0 overflow-hidden" style={{ background: "var(--space)" }} data-hydrated={hydrated || undefined}>
      <Globe trips={trips} activeTripId={activeTripId} activeCountry={activeCountry} selectedCityId={selectedCityId}
        onSelectCity={selectCity} onSelectCountry={selectCountry} padding={globePadding} dark={resolvedTheme === "dark"} lang={lang} />

      <button type="button" onClick={() => setSearchOpen(true)}
        className={cn("focus-ring glass absolute inset-x-3 top-[calc(env(safe-area-inset-top)+12px)] z-20 flex h-12 items-center gap-2.5 px-4 text-sm text-foreground/70 md:top-4", col)}>
        <MagnifyingGlassIcon className="size-4" />
        {tr("searchPlaceholder")}
      </button>

      {isAdmin && (
        <button type="button" aria-label={tr("addPlaceAria")}
          onClick={(e) => { gsap.fromTo(e.currentTarget, { scale: 0.82 }, { scale: 1, duration: 0.5, ease: "elastic.out(1, 0.5)" }); setAddOpen(true) }}
          className={cn("focus-ring glass absolute right-4 bottom-[var(--plus-bottom)] z-20 flex size-12 items-center justify-center rounded-full text-foreground md:right-6 md:bottom-6 md:size-14", aside && "min-[1440px]:right-[460px]")}
          style={{ "--plus-bottom": `calc(${NAV_OFFSET + 20}px + env(safe-area-inset-bottom) + ${sheetHeight}px)` } as React.CSSProperties}>
          <PlusIcon className="size-5" strokeWidth={2.2} />
        </button>
      )}

      <section aria-label={tr("panelAria")} aria-hidden={hidden || undefined} inert={hidden && animH === null ? true : undefined}
        data-sheet={animH !== null ? "moving" : hidden ? "hidden" : isDesktop || open ? "open" : "closed"}
        className={cn("glass-panel absolute inset-x-3 bottom-[var(--sheet-bottom)] z-20 flex h-[var(--sheet-h)] flex-col overflow-hidden rounded-[32px] md:top-[148px] md:bottom-4 md:h-auto md:transition-[transform,opacity] md:duration-500 md:ease-[cubic-bezier(.2,.8,.2,1)]", col,
          hidden && "md:pointer-events-none md:-translate-x-[calc(100%+24px)] md:opacity-0", hidden && animH === null && "max-md:invisible")}
        style={{ "--sheet-bottom": `calc(${NAV_OFFSET + 8}px + env(safe-area-inset-bottom))`, "--sheet-h": `${sheetHeight}px` } as React.CSSProperties}>
        <button type="button" aria-label={open ? tr("panelCollapseAria") : tr("panelExpandAria")} aria-expanded={open}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
          onClick={(e) => { if (e.detail === 0) settle(!open) }}
          className="flex h-11 w-full shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing md:hidden">
          <span className="h-1 w-10 rounded-full bg-current opacity-30" />
        </button>
        <div className="hidden h-5 shrink-0 md:block" />


        {tab === "map" ? (
          <MapPanel open={open || isDesktop} trips={trips} activeCountry={activeCountry} activeTripId={activeTripId} selectedCityId={selectedCityId}
            lang={lang} canEdit={isAdmin} onSelectTrip={selectTrip} onSelectCity={selectCity} onBack={goBack} cityAside={!!aside}
            onShare={(tripId, cityId) => setEditor({ type: "share", tripId, cityId })}
            onEditCity={(cityId) => setEditor({ type: "city", cityId })}
            onEditTrip={(tripId) => setEditor({ type: "trip", tripId })}
            onAddEntry={(cityId) => setEditor({ type: "entry", cityId, entryId: null })}
            onEditEntry={(cityId, entryId) => setEditor({ type: "entry", cityId, entryId })} />
        ) : tab === "trips" ? (
          <TripsPanel trips={trips} lang={lang} onSelectTrip={goToTrip} />
        ) : tab === "notes" ? (
          <NotesPanel trips={trips} lang={lang} onSelectCity={goToCity} />
        ) : (
          <MorePanel trips={trips} lang={lang} theme={theme} isAdmin={isAdmin} loginEnabled={loginEnabled}
            onTheme={setTheme} onLang={setLang} onLogin={() => setEditor({ type: "login" })} onLogout={logout}
            onExport={exportData} onImport={importData} />
        )}
      </section>

      {/* компьютер: язычок у правого края колонки — убрать панель */}
      {!hidden && (
        <button type="button" onClick={() => settle("hidden")} aria-label={tr("panelHideAria")} title={tr("panelHideAria")}
          className="focus-ring glass absolute top-[156px] left-[404px] z-20 hidden size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground md:grid lg:left-[444px]">
          <CaretLeftIcon size={15} />
        </button>
      )}

      {/* панель убрана — кнопка вернуть: на телефоне над вкладками (можно и потянуть вверх), на компьютере на месте колонки */}
      {hidden && animH === null && (
        <button type="button" onClick={(e) => { if (e.detail === 0) settle(false) }} aria-label={tr("panelShowAria")}
          onPointerDown={(e) => { gesture.current = { startY: e.clientY, startH: 0, dy: 0 } }}
          // тап — вернуть свёрнутой, потянуть вверх — сразу развернуть
          onPointerUp={(e) => { const g = gesture.current; gesture.current = null; if (g) settle(g.startY - e.clientY > 30 ? true : false) }}
          className={cn("atlas-backdrop focus-ring glass absolute bottom-[var(--sheet-bottom)] left-1/2 z-20 flex h-10 -translate-x-1/2 touch-none items-center gap-2 rounded-full px-4 text-[11px] uppercase tracking-[0.18em] text-foreground/80",
            "md:top-[148px] md:bottom-auto md:left-4 md:translate-x-0")}
          style={{ "--sheet-bottom": `calc(${NAV_OFFSET + 8}px + env(safe-area-inset-bottom))` } as React.CSSProperties}>
          <span className="h-1 w-6 rounded-full bg-current opacity-40 md:hidden" />
          {tr("atlasTitle")}
          <CaretRightIcon size={14} className="hidden md:block" />
        </button>
      )}

      <nav aria-label={tr("navAria")} className={cn("glass absolute inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+8px)] z-30 rounded-[32px] md:top-[76px] md:bottom-auto md:rounded-full", col)}>
        <ul className="grid grid-cols-4 gap-1 p-1">
          {tabs.map(({ id, label, Icon }) => {
            const active = tab === id
            return (
              <li key={id}>
                <button type="button" onClick={() => { setTab(id); if (hiddenRef.current) settle(false) }} aria-current={active ? "page" : undefined}
                  className={cn("focus-ring relative flex h-14 w-full flex-col items-center justify-center gap-1 rounded-[26px] text-[10px] uppercase tracking-widest transition-colors md:h-10 md:flex-row md:gap-1.5 md:rounded-full md:tracking-wider", active ? "glass-capsule text-foreground" : "text-muted-foreground hover:text-foreground")}>
                  <Icon className={cn("size-5 md:size-4", active && "text-[var(--atlas-accent)]")} strokeWidth={active ? 2.1 : 1.75} />
                  {tr(label)}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      {aside && (
        <PlacePanel key={aside.city.id} trip={aside.trip} city={aside.city} lang={lang} canEdit={isAdmin}
          onClose={() => setSelectedCityId(null)} onSelectCity={selectCity}
          onEdit={() => setEditor({ type: "city", cityId: aside.city.id })}
          onShare={() => setEditor({ type: "share", tripId: aside.trip.id, cityId: aside.city.id })}
          onAddEntry={() => setEditor({ type: "entry", cityId: aside.city.id, entryId: null })}
          onEditEntry={(entryId) => setEditor({ type: "entry", cityId: aside.city.id, entryId })} />
      )}

      {isAdmin && <AddPlace open={addOpen} trips={trips} lang={lang} onClose={() => setAddOpen(false)} onAddCity={addCity} />}
      {searchOpen && <QuickSearch trips={trips} lang={lang} onClose={() => setSearchOpen(false)} onSelectCity={goToCity} onSelectTrip={goToTrip} />}
      {editorNode}

      {toast && (
        <div key={toast.id} role="status" className="atlas-toast glass-panel fixed inset-x-0 top-[calc(env(safe-area-inset-top)+12px)] z-[60] mx-auto flex w-fit max-w-[calc(100%-24px)] items-center gap-3 rounded-full py-1.5 pr-1.5 pl-4 text-xs text-foreground">
          <span className={toast.action ? "" : "py-1 pr-2.5"}>{toast.text}</span>
          {toast.action && (
            <button type="button" onClick={() => { toast.action!.fn(); setToast(null) }} className="focus-ring shrink-0 rounded-full bg-[var(--atlas-accent)] px-3 py-1.5 text-white">{toast.action.label}</button>
          )}
        </div>
      )}
    </main>
  )
}

function LoginForm({ lang }: { lang: Lang }) {
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!password || busy) return
    setBusy(true)
    setError(null)
    try {
      await api.login(password)
      reloadPage()
    } catch (err) {
      const code = err instanceof ApiError ? err.code : ""
      setError(t(lang, code === "too_many_attempts" ? "loginBlocked" : code === "not_configured" ? "loginNotConfigured" : "loginWrong"))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <TextField label={t(lang, "passwordLabel")} type="password" autoFocus autoComplete="current-password" maxLength={LIMITS.password}
        value={password} onChange={(e) => { setPassword(e.target.value); setError(null) }} error={error} />
      <Button type="submit" className="mt-1" disabled={!password || busy}>{t(lang, "loginAction")}</Button>
    </form>
  )
}

function QuickSearch({ trips, lang, onClose, onSelectCity, onSelectTrip }: {
  trips: Trip[]; lang: Lang; onClose: () => void; onSelectCity: (id: string) => void; onSelectTrip: (id: string) => void
}) {
  const [q, setQ] = useState("")
  const boxRef = useRef<HTMLDivElement>(null)
  useFitVisualViewport(boxRef)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeRef.current() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])
  const query = q.trim().toLowerCase()
  const cityResults = query ? trips.flatMap((trip) => trip.cities.filter((c) => c.name.toLowerCase().includes(query)).map((city) => ({ trip, city }))) : []
  const tripResults = query ? trips.filter((x) => x.title.toLowerCase().includes(query) || x.country.toLowerCase().includes(query)) : []
  const item = "focus-ring glass-tile flex items-center gap-2.5 rounded-[18px] p-3 text-left"
  return (
    <div ref={boxRef} className="atlas-backdrop fixed inset-0 z-50 flex flex-col bg-black/25 backdrop-blur-sm dark:bg-black/50" onClick={onClose}>
      <div className="atlas-sheet glass-panel glass-modal mx-3 mt-[calc(env(safe-area-inset-top)+12px)] flex max-h-[70vh] flex-col overflow-hidden rounded-[28px] md:mx-auto md:mt-[12vh] md:w-[560px]" onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center gap-2.5 p-3">
          <MagnifyingGlassIcon className="size-4 shrink-0 text-muted-foreground" />
          <input autoFocus value={q} maxLength={80} onChange={(e) => setQ(e.target.value)} placeholder={t(lang, "searchPlaceholder")} className="min-w-0 flex-1 bg-transparent text-base outline-none md:text-sm placeholder:text-muted-foreground" />
          <button type="button" onClick={onClose} aria-label={t(lang, "closeAria")} className="focus-ring glass-tile grid size-8 shrink-0 place-items-center rounded-full"><XIcon size={14} /></button>
        </div>
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          {!query ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">{t(lang, "quickSearchHint")}</p>
          ) : !cityResults.length && !tripResults.length ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">{t(lang, "noResults")}</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {cityResults.map(({ trip, city }) => (
                <button key={city.id} type="button" onClick={() => { onSelectCity(city.id); onClose() }} className={item}>
                  <MapPinIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0"><span className="block truncate text-sm">{city.name}</span><span className="block truncate text-xs text-muted-foreground">{trip.title} · {trip.year}</span></span>
                </button>
              ))}
              {tripResults.map((trip) => (
                <button key={trip.id} type="button" onClick={() => { onSelectTrip(trip.id); onClose() }} className={item}>
                  <PathIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0"><span className="block truncate text-sm">{trip.title}</span><span className="block truncate text-xs text-muted-foreground">{trip.country} · {trip.year}</span></span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
