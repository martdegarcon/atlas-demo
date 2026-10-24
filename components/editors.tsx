"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { api, compressImage } from "@/lib/api-client"
import { t, type Lang } from "@/lib/i18n"
import { checkYear, cleanYearInput, clip, LIMITS, safeYear, yearMax, YEAR_MIN, type YearError } from "@/lib/limits"
import { newId, type City, type Entry, type Trip } from "@/lib/types"
import { CaretDownIcon, CaretUpIcon, ImageIcon, TrashIcon, XIcon } from "./icons"
import { Photo } from "./photo"
import { Button, cn, FieldError, Segmented, TextArea, TextField, useFitVisualViewport } from "./ui"

export { cn }

// Текст ошибки года для поля ввода
export function yearMessage(lang: Lang, err: YearError | null): string | null {
  if (!err) return null
  if (err === "yearRange") return t(lang, "yearRange").replace("{min}", String(YEAR_MIN)).replace("{max}", String(yearMax()))
  return t(lang, err)
}

// Нижняя шторка (на телефоне) / окно по центру (на больших экранах).
// Закрывается по Esc и тапу по фону.
export function Sheet({ title, lang, onClose, children }: { title: string; lang: Lang; onClose: () => void; children: ReactNode }) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const boxRef = useRef<HTMLDivElement>(null)
  useFitVisualViewport(boxRef)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeRef.current() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])
  return (
    <div ref={boxRef} className="atlas-backdrop fixed inset-0 z-50 flex flex-col justify-end bg-black/50 backdrop-blur-sm md:justify-center md:p-6" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-label={title}
        className="atlas-sheet glass-panel relative z-10 flex max-h-[calc(100%-24px)] md:max-h-full flex-col overflow-hidden rounded-t-[32px] pb-[env(safe-area-inset-bottom)] md:mx-auto md:w-[480px] md:rounded-[32px]"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center gap-3 px-4 pt-4 pb-2">
          <span className="size-9" />
          <h2 className="flex-1 truncate text-center text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{title}</h2>
          <button type="button" onClick={onClose} aria-label={t(lang, "closeAria")} className="focus-ring glass-tile grid size-9 shrink-0 place-items-center rounded-full active:scale-95"><XIcon className="size-4" /></button>
        </div>
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-6">{children}</div>
      </section>
    </div>
  )
}

function DeleteButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return <Button variant="danger" size="md" onClick={onClick} icon={<TrashIcon size={16} />}>{children}</Button>
}

export function CityForm({ city, lang, onSave, onDelete }: { city: City; lang: Lang; onSave: (patch: Partial<City>) => void; onDelete: () => void }) {
  const [name, setName] = useState(city.name)
  const [date, setDate] = useState(city.date === "—" ? "" : city.date || "")
  const nameError = name.trim() ? null : t(lang, "nameRequired")
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => {
      e.preventDefault()
      if (!nameError) onSave({ name: name.trim(), date: date.trim() || (city.date === "" ? "" : "—") })
    }}>
      <TextField label={t(lang, "cityNameLabel")} value={name} maxLength={LIMITS.cityName} onChange={(e) => setName(e.target.value)} error={name ? null : nameError} />
      <TextField label={t(lang, "dateLabel")} value={date} maxLength={LIMITS.date} placeholder={t(lang, "datePlaceholder")} onChange={(e) => setDate(e.target.value)} />
      <Button type="submit" className="mt-1" disabled={!!nameError}>{t(lang, "save")}</Button>
      <DeleteButton onClick={onDelete}>{t(lang, "deleteCity")}</DeleteButton>
    </form>
  )
}

export function VisibilityToggle({ value, lang, onChange }: { value: boolean; lang: Lang; onChange: (v: boolean) => void }) {
  return (
    <div>
      <span className="mb-1.5 block px-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{t(lang, "visibilityLabel")}</span>
      <Segmented label={t(lang, "visibilityLabel")} value={value ? "public" : "private"} onChange={(v) => onChange(v === "public")}
        options={[{ id: "public", label: t(lang, "visPublic") }, { id: "private", label: t(lang, "visPrivate") }]} />
    </div>
  )
}

export function TripForm({ trip, lang, onSave, onDelete }: { trip: Trip; lang: Lang; onSave: (patch: Partial<Trip>) => void; onDelete: () => void }) {
  const [title, setTitle] = useState(trip.title)
  const [year, setYear] = useState(String(trip.year))
  const [period, setPeriod] = useState(trip.period || "")
  const [country, setCountry] = useState(trip.country)
  const [isPublic, setIsPublic] = useState(trip.isPublic)
  const [order, setOrder] = useState(trip.cities)

  const yearError = yearMessage(lang, checkYear(year))
  const titleError = title.trim() ? null : t(lang, "nameRequired")
  const countryError = country.trim() ? null : t(lang, "countryRequired")
  const valid = !yearError && !titleError && !countryError

  function move(i: number, dir: number) {
    const j = i + dir
    if (j < 0 || j >= order.length) return
    const next = order.slice()
    ;[next[i], next[j]] = [next[j], next[i]]
    setOrder(next)
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => {
      e.preventDefault()
      if (valid) onSave({ title: title.trim(), year: Number(year), period: period.trim(), country: country.trim(), isPublic, cities: order })
    }}>
      <div className="grid grid-cols-[1fr_96px] items-start gap-2">
        <TextField label={t(lang, "titleLabel")} value={title} maxLength={LIMITS.title} onChange={(e) => setTitle(e.target.value)} error={titleError} messageHidden />
        <TextField label={t(lang, "yearLabel")} value={year} inputMode="numeric" maxLength={4} onChange={(e) => setYear(cleanYearInput(e.target.value))} error={yearError} messageHidden />
      </div>
      <FieldError>{titleError || yearError}</FieldError>
      {trip.kind !== "country" && (
        <TextField label={t(lang, "periodLabel")} value={period} maxLength={LIMITS.period} placeholder={t(lang, "periodPlaceholder")} onChange={(e) => setPeriod(e.target.value)} />
      )}
      <TextField label={t(lang, "countryLabel")} value={country} maxLength={LIMITS.country} onChange={(e) => setCountry(e.target.value)} error={countryError} />
      <VisibilityToggle value={isPublic} lang={lang} onChange={setIsPublic} />

      {order.length > 1 && (
        <div>
          <span className="mb-1.5 block px-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{t(lang, "citiesOrder")}</span>
          <ol className="glass-tile flex flex-col rounded-[16px] p-1">
            {order.map((c, i) => (
              <li key={c.id} className="flex items-center gap-2 rounded-[12px] py-1 pr-1 pl-3">
                <span className="w-5 text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={t(lang, "moveUp")} className="focus-ring grid size-9 place-items-center rounded-full hover:bg-foreground/10 disabled:opacity-25 disabled:hover:bg-transparent"><CaretUpIcon size={16} /></button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === order.length - 1} aria-label={t(lang, "moveDown")} className="focus-ring grid size-9 place-items-center rounded-full hover:bg-foreground/10 disabled:opacity-25 disabled:hover:bg-transparent"><CaretDownIcon size={16} /></button>
              </li>
            ))}
          </ol>
        </div>
      )}

      <Button type="submit" className="mt-1" disabled={!valid}>{t(lang, "save")}</Button>
      <DeleteButton onClick={onDelete}>{t(lang, "deleteTrip")}</DeleteButton>
    </form>
  )
}

function nowStamp(lang: Lang) {
  const d = new Date()
  const loc = lang === "ru" ? "ru-RU" : "en-US"
  const day = d.toLocaleDateString(loc, { day: "numeric", month: "short" }).replace(".", "")
  const time = d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit", hour12: false })
  return `${day}, ${time}`
}

// Заметка: фото сразу ужимается и загружается на сервер — в заметке хранится
// только его адрес
export function EntryForm({ entry, lang, onSave, onDelete }: { entry: Entry | null; lang: Lang; onSave: (e: Entry) => void; onDelete: (() => void) | null }) {
  const [text, setText] = useState(entry?.text || "")
  const [time, setTime] = useState(entry ? entry.time || "" : nowStamp(lang))
  const [photo, setPhoto] = useState(entry?.photo || "")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ""
    if (!f) return
    setErr(null)
    if (!f.type.startsWith("image/")) { setErr(t(lang, "photoError")); return }
    setBusy(true)
    try {
      const blob = await compressImage(f)
      setPhoto(await api.uploadPhoto(blob))
    } catch {
      setErr(t(lang, "photoError"))
    } finally {
      setBusy(false)
    }
  }

  const canSave = (text.trim() || photo) && !busy
  const pickPhoto = () => fileRef.current?.click()

  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => {
      e.preventDefault()
      if (canSave) onSave({ id: entry ? entry.id : newId(), time: time.trim() || undefined, text: text.trim() || undefined, photo: photo || undefined })
    }}>
      {photo ? (
        <div className="flex flex-col gap-2">
          <Photo src={photo} />
          <div className="flex gap-2">
            <Button variant="secondary" size="md" className="flex-1" onClick={pickPhoto} disabled={busy}>{busy ? t(lang, "photoLoading") : t(lang, "replacePhoto")}</Button>
            <Button variant="secondary" size="md" className="w-auto px-5" onClick={() => setPhoto("")}>{t(lang, "removePhoto")}</Button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={pickPhoto} disabled={busy} className="focus-ring glass-tile flex h-28 flex-col items-center justify-center gap-2 rounded-[22px] text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ImageIcon size={22} />
          {busy ? t(lang, "photoLoading") : t(lang, "addPhoto")}
        </button>
      )}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
      {err && <p role="alert" className="px-1 text-[11px] text-[var(--atlas-accent)]">{err}</p>}

      <TextField label={t(lang, "timeLabel")} value={time} maxLength={LIMITS.time} placeholder={t(lang, "timePlaceholder")} onChange={(e) => setTime(e.target.value)} />
      <TextArea label={t(lang, "textLabel")} rows={4} value={text} maxLength={LIMITS.text} placeholder={t(lang, "entryTextPlaceholder")} onChange={(e) => setText(e.target.value)} />

      <Button type="submit" className="mt-1" disabled={!canSave}>{t(lang, "save")}</Button>
      {!text.trim() && !photo && <p className="-mt-1 px-1 text-center text-[11px] text-muted-foreground">{t(lang, "entryNeedsContent")}</p>}
      {onDelete && <DeleteButton onClick={onDelete}>{t(lang, "deleteEntry")}</DeleteButton>}
    </form>
  )
}

// Проверка бэкапа (и старого формата из превью): пропускаем только то, что
// похоже на поездки, приводим к допустимым значениям и дописываем недостающее
export function normalizeBackup(data: unknown): Trip[] | null {
  const list = Array.isArray(data) ? data : data && Array.isArray((data as { trips?: unknown }).trips) ? (data as { trips: unknown[] }).trips : null
  if (!list) return null
  const okId = (v: unknown) => typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v)
  const str = (v: unknown, max: number) => (typeof v === "string" ? clip(v.trim(), max) : "")
  const out: Trip[] = []
  for (const raw of list as Record<string, unknown>[]) {
    if (!raw || typeof raw.title !== "string" || !Array.isArray(raw.cities)) return null
    const cities: City[] = []
    for (const c of raw.cities as Record<string, unknown>[]) {
      if (!c || typeof c.name !== "string" || typeof c.lat !== "number" || typeof c.lng !== "number") return null
      if (Math.abs(c.lat) > 90 || Math.abs(c.lng) > 180 || !c.name.trim()) continue
      const entries = Array.isArray(c.entries)
        ? (c.entries as Record<string, unknown>[])
            .filter((e) => e && (e.text || e.photo))
            // загруженные в превью фото (data:) на сервер не переносим — они хранились в браузере
            .map((e) => ({
              id: okId(e.id) ? (e.id as string) : newId(),
              time: str(e.time, LIMITS.time) || undefined,
              text: str(e.text, LIMITS.text) || undefined,
              photo: typeof e.photo === "string" && !e.photo.startsWith("data:") ? e.photo : undefined,
            }))
            .filter((e) => e.text || e.photo)
        : []
      cities.push({
        id: okId(c.id) ? (c.id as string) : newId(),
        name: str(c.name, LIMITS.cityName), lat: c.lat, lng: c.lng,
        date: typeof c.date === "string" ? str(c.date, LIMITS.date) : "—",
        ...(entries.length ? { entries } : {}),
      })
    }
    const title = str(raw.title, LIMITS.title)
    if (!cities.length || !title) continue
    out.push({
      id: okId(raw.id) ? (raw.id as string) : newId(),
      slug: typeof raw.slug === "string" ? raw.slug : undefined,
      title,
      country: str(raw.country, LIMITS.country) || title,
      year: safeYear(raw.year),
      period: str(raw.period, LIMITS.period),
      ...(raw.kind === "country" ? { kind: "country" as const } : {}),
      isPublic: raw.isPublic !== false,
      createdAt: typeof raw.createdAt === "string" && !Number.isNaN(Date.parse(raw.createdAt)) ? new Date(raw.createdAt).toISOString() : undefined,
      cities,
    })
  }
  return out
}
