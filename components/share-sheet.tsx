"use client"

import { useEffect, useRef, useState } from "react"
import { t, type Lang } from "@/lib/i18n"
import type { Trip } from "@/lib/types"
import { Sheet } from "./editors"
import { Button } from "./ui"
import { CardIcon, CopyIcon, DownloadIcon, FilmIcon, LinkIcon, LockIcon, ShareIcon } from "./icons"

// Поделиться поездкой или местом. Ссылку может взять любой гость (для
// публичных поездок); видео и карточку собирает владелец.

async function shareOrDownload(file: File): Promise<"shared" | "downloaded"> {
  // На телефоне открывается системное меню «Поделиться» — там есть Telegram
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return "shared"
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return "shared"
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement("a")
  a.href = url
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
  return "downloaded"
}

const sectionCls = "glass-tile rounded-[22px] p-4"
const headCls = "flex items-center gap-2 text-base"
const hintCls = "mt-1 text-xs leading-relaxed text-muted-foreground"
const ghostBtn = "focus-ring glass-tile flex h-11 flex-1 items-center justify-center gap-2 rounded-full text-sm text-foreground disabled:opacity-40"

export function ShareSheet({ trip, cityId, lang, isAdmin, onClose, onToast, onMakePublic }: {
  trip: Trip
  cityId: string | null
  lang: Lang
  isAdmin: boolean
  onClose: () => void
  onToast: (text: string) => void
  onMakePublic: () => void
}) {
  const city = cityId ? trip.cities.find((c) => c.id === cityId) : null
  const slug = trip.slug
  const url = slug && typeof window !== "undefined"
    ? `${window.location.origin}/t/${slug}${city ? `?city=${encodeURIComponent(city.id)}` : ""}`
    : ""
  const fileBase = `atlas-${slug || trip.id}`

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url)
      onToast(t(lang, "linkCopied"))
    } catch {
      onToast(t(lang, "shareFailed"))
    }
  }

  async function sendLink() {
    if (navigator.share) {
      try { await navigator.share({ title: city ? city.name : trip.title, url }); return } catch (e) {
        if ((e as Error)?.name === "AbortError") return
      }
    }
    copyLink()
  }

  return (
    <Sheet title={city ? t(lang, "shareCity") : t(lang, "shareTrip")} lang={lang} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className={sectionCls}>
          <div className={headCls}><LinkIcon size={18} />{t(lang, "shareLinkTitle")}</div>
          {trip.isPublic ? (
            <>
              <p className={hintCls}>{t(lang, "shareLinkHint")}</p>
              <div className="mt-3 truncate rounded-[12px] bg-black/10 px-3 py-2 font-mono text-[11px] text-muted-foreground dark:bg-white/5">{url || "…"}</div>
              <div className="mt-3 flex gap-2">
                <button type="button" className={ghostBtn} disabled={!url} onClick={copyLink}><CopyIcon size={16} />{t(lang, "copyLink")}</button>
                <button type="button" className={ghostBtn} disabled={!url} onClick={sendLink}><ShareIcon size={16} />{t(lang, "send")}</button>
              </div>
            </>
          ) : (
            <>
              <p className={hintCls}><LockIcon size={12} className="mr-1 inline -translate-y-px" />{t(lang, "privateNote")}</p>
              {isAdmin && <Button size="md" className="mt-3" onClick={onMakePublic}>{t(lang, "makePublic")}</Button>}
            </>
          )}
        </div>

        {isAdmin && !city && <VideoSection trip={trip} lang={lang} fileBase={fileBase} onToast={onToast} />}
        {(isAdmin || trip.isPublic) && !city && <CardSection trip={trip} lang={lang} fileBase={fileBase} onToast={onToast} />}
      </div>
    </Sheet>
  )
}

function VideoSection({ trip, lang, fileBase, onToast }: { trip: Trip; lang: Lang; fileBase: string; onToast: (s: string) => void }) {
  const [state, setState] = useState<"idle" | "prepare" | "render" | "done" | "error" | "unsupported">("idle")
  const [progress, setProgress] = useState(0)
  const [video, setVideo] = useState<{ url: string; file: File } | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => () => {
    abortRef.current?.abort()
  }, [])
  useEffect(() => () => { if (video) URL.revokeObjectURL(video.url) }, [video])

  async function make() {
    // модуль видео тяжёлый — грузим его только когда он действительно нужен
    const { renderTripVideo, videoSupported } = await import("@/lib/export-video")
    if (!videoSupported()) { setState("unsupported"); return }
    const ac = new AbortController()
    abortRef.current = ac
    setVideo(null)
    setProgress(0)
    setState("prepare")
    try {
      const blob = await renderTripVideo(trip, {
        signal: ac.signal, lang,
        onProgress: (phase, p) => { setState(phase); setProgress(p) },
      })
      const file = new File([blob], `${fileBase}.mp4`, { type: "video/mp4" })
      setVideo({ url: URL.createObjectURL(blob), file })
      setState("done")
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return
      setState((e as Error)?.message === "unsupported" ? "unsupported" : "error")
    }
  }

  const busy = state === "prepare" || state === "render"

  return (
    <div className={sectionCls}>
      <div className={headCls}><FilmIcon size={18} />{t(lang, "videoTitle")}</div>
      <p className={hintCls}>{t(lang, "videoHint")}</p>

      {video && (
        <video src={video.url} autoPlay loop muted playsInline className="mt-3 aspect-[4/5] w-full rounded-[16px] bg-black object-cover" />
      )}

      {busy && (
        <div className="mt-3">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{state === "prepare" ? t(lang, "videoPrepare") : t(lang, "videoRendering")}</span>
            <span className="tabular-nums">{Math.round(progress * 100)}%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/15 dark:bg-white/10">
            <div className="h-full rounded-full bg-[var(--atlas-accent)] transition-[width] duration-200" style={{ width: `${Math.max(2, progress * 100)}%` }} />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">{t(lang, "videoKeepTab")}</p>
        </div>
      )}
      {state === "unsupported" && <p className="mt-3 text-xs text-[var(--atlas-accent)]">{t(lang, "videoUnsupported")}</p>}
      {state === "error" && <p className="mt-3 text-xs text-[var(--atlas-accent)]">{t(lang, "videoFailed")}</p>}

      <div className="mt-3 flex gap-2">
        {video ? (
          <>
            <button type="button" className={ghostBtn} onClick={() => shareOrDownload(video.file).catch(() => onToast(t(lang, "shareFailed")))}>
              <ShareIcon size={16} />{t(lang, "send")}
            </button>
            <button type="button" className={ghostBtn} onClick={make}>{t(lang, "videoRedo")}</button>
          </>
        ) : (
          <Button size="md" disabled={busy} onClick={make}>{t(lang, "videoMake")}</Button>
        )}
      </div>
    </div>
  )
}

function CardSection({ trip, lang, fileBase, onToast }: { trip: Trip; lang: Lang; fileBase: string; onToast: (s: string) => void }) {
  // Карточка собирается в браузере на настоящей карте. Если не вышло (нет WebGL
  // и т.п.) — запасная серверная, без карты. Версия в адресе — чтобы после
  // правок не показывалась старая картинка из кеша.
  const fallback = `/api/trips/${encodeURIComponent(trip.id)}/card?v=${encodeURIComponent(trip.updatedAt || "")}`
  const [card, setCard] = useState<{ url: string; blob: Blob | null } | null>(null)
  const [loaded, setLoaded] = useState(false)
  const version = `${lang}:${trip.id}:${trip.updatedAt || ""}:${JSON.stringify(trip.cities.map((c) => [c.name, c.lat, c.lng, c.date]))}:${trip.title}`

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    setCard(null)
    setLoaded(false)
    import("@/lib/export-card")
      .then(({ renderTripCard }) => renderTripCard(trip, lang))
      .then((blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setCard({ url: objectUrl, blob })
      })
      .catch(() => { if (!cancelled) setCard({ url: fallback, blob: null }) })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version])

  async function getFile() {
    let blob = card?.blob
    if (!blob) {
      const res = await fetch(card?.url || fallback)
      if (!res.ok) throw new Error()
      blob = await res.blob()
    }
    return new File([blob], `${fileBase}.png`, { type: "image/png" })
  }

  async function send() {
    try {
      await shareOrDownload(await getFile())
    } catch {
      onToast(t(lang, "shareFailed"))
    }
  }

  async function download() {
    try {
      const file = await getFile()
      const url = URL.createObjectURL(file)
      const a = document.createElement("a")
      a.href = url
      a.download = file.name
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
    } catch {
      onToast(t(lang, "shareFailed"))
    }
  }

  return (
    <div className={sectionCls}>
      <div className={headCls}><CardIcon size={18} />{t(lang, "cardTitle")}</div>
      <p className={hintCls}>{t(lang, "cardHint")}</p>
      <div className="relative mt-3 aspect-[4/5] overflow-hidden rounded-[16px] bg-black/20">
        {!loaded && <div className="absolute inset-0 flex items-center justify-center gap-1.5"><span className="atlas-loader-dot" /><span className="atlas-loader-dot" style={{ animationDelay: "150ms" }} /><span className="atlas-loader-dot" style={{ animationDelay: "300ms" }} /></div>}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {card && <img src={card.url} alt="" data-card={card.blob ? "map" : "fallback"} onLoad={() => setLoaded(true)} className="size-full object-cover" />}
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" className={ghostBtn} disabled={!card} onClick={send}><ShareIcon size={16} />{t(lang, "send")}</button>
        <button type="button" className={ghostBtn} disabled={!card} onClick={download}><DownloadIcon size={16} />{t(lang, "download")}</button>
      </div>
    </div>
  )
}
