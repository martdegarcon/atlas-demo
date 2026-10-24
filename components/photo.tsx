"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { t, type Lang } from "@/lib/i18n"
import { CaretLeftIcon, CaretRightIcon, MapPinIcon, XIcon } from "./icons"
import { cn } from "./ui"

// Фото в ленте — целиком, без обрезки. Если пропорции необычные (длинная
// вертикаль, панорама), свободное место заполняет размытая копия снимка.
export function Photo({ src, onOpen, label, className }: { src: string; onOpen?: () => void; label?: string; className?: string }) {
  const [ratio, setRatio] = useState<number | null>(null)
  // рамка не уже 4:5 и не шире 2:1 — лента остаётся ровной, снимок виден весь
  const box = ratio ? Math.min(2, Math.max(0.8, ratio)) : 4 / 3
  const inner = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" aria-hidden loading="lazy" className="absolute inset-0 size-full scale-110 object-cover opacity-50 blur-2xl" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" loading="lazy" data-photo onLoad={(e) => { const i = e.currentTarget; if (i.naturalWidth) setRatio(i.naturalWidth / i.naturalHeight) }}
        className="relative size-full object-contain" />
    </>
  )
  const cls = cn("glass-tile relative block w-full overflow-hidden rounded-[22px] bg-black/30", className)
  if (!onOpen) return <div className={cls} style={{ aspectRatio: box }}>{inner}</div>
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onOpen() }} aria-label={label} className={cn(cls, "focus-ring cursor-zoom-in")} style={{ aspectRatio: box }}>
      {inner}
    </button>
  )
}

export type ViewerItem = { id: string; photo?: string; text?: string; time?: string; place?: string; onPlace?: () => void }

// Полноэкранный просмотр заметки: фото целиком, весь текст, листание
// стрелками, клавишами и свайпом. Тап по фото — исходный размер (можно
// двигать), ещё тап — снова целиком.
export function PostViewer({ items, index, lang, onIndex, onClose }: { items: ViewerItem[]; index: number; lang: Lang; onIndex: (i: number) => void; onClose: () => void }) {
  const item = items[index]
  const [zoom, setZoom] = useState(false)
  const touch = useRef<{ x: number; y: number } | null>(null)
  const go = useCallback((d: number) => {
    const j = index + d
    if (j >= 0 && j < items.length) { setZoom(false); onIndex(j) }
  }, [index, items.length, onIndex])
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); close.current() }
      else if (e.key === "ArrowLeft") go(-1)
      else if (e.key === "ArrowRight") go(1)
    }
    window.addEventListener("keydown", onKey, true)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { window.removeEventListener("keydown", onKey, true); document.body.style.overflow = prev }
  }, [go])

  if (!item) return null
  const many = items.length > 1
  const navBtn = "focus-ring grid size-11 place-items-center rounded-full bg-white/10 text-white backdrop-blur-md transition-opacity hover:bg-white/20 disabled:opacity-0"

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={t(lang, "postViewerAria")} data-viewer
      className="atlas-backdrop fixed inset-0 z-[60] flex flex-col bg-black text-white"
      onTouchStart={(e) => { if (!zoom) touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }}
      onTouchEnd={(e) => {
        const s = touch.current
        touch.current = null
        if (!s || zoom) return
        const dx = e.changedTouches[0].clientX - s.x, dy = e.changedTouches[0].clientY - s.y
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1)
        else if (dy > 90 && Math.abs(dy) > Math.abs(dx) * 1.5) onClose()
      }}>
      <div className="flex shrink-0 items-center gap-3 px-4 pt-[max(16px,env(safe-area-inset-top))] pb-2">
        <span className="min-w-0 flex-1 truncate text-[11px] uppercase tracking-[0.2em] text-white/60">
          {[item.place, item.time].filter(Boolean).join(" · ")}
        </span>
        {many && <span className="text-xs tabular-nums text-white/60">{index + 1} / {items.length}</span>}
        <button type="button" onClick={onClose} aria-label={t(lang, "closeAria")} className={navBtn}><XIcon className="size-4" /></button>
      </div>

      {item.photo ? (
        <div className={cn("relative min-h-0 flex-1", zoom ? "overflow-auto" : "overflow-hidden")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={item.photo} src={item.photo} alt="" onClick={() => setZoom((z) => !z)}
            className={zoom ? "max-w-none cursor-zoom-out" : "size-full cursor-zoom-in object-contain"} />
        </div>
      ) : <div className="flex-1" />}

      {(item.text || item.onPlace) && (
        <div className={cn("no-scrollbar shrink-0 overflow-y-auto px-5 pt-4", item.photo ? "max-h-[35vh]" : "max-h-[70vh]")}>
          {item.text && <p className={cn("mx-auto max-w-2xl whitespace-pre-line leading-relaxed text-white/90", item.photo ? "text-base" : "text-xl font-light")}>{item.text}</p>}
          {item.onPlace && (
            <button type="button" onClick={() => { item.onPlace!(); onClose() }} className="focus-ring mx-auto mt-3 flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-xs uppercase tracking-[0.12em] text-white/80 hover:bg-white/20">
              <MapPinIcon size={14} />{t(lang, "openOnMap")}
            </button>
          )}
        </div>
      )}
      {!item.photo && <div className="flex-1" />}

      <div className="flex shrink-0 items-center justify-between px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))]">
        {many ? (
          <>
            <button type="button" onClick={() => go(-1)} disabled={index === 0} aria-label={t(lang, "prevAria")} className={navBtn}><CaretLeftIcon className="size-4" /></button>
            <button type="button" onClick={() => go(1)} disabled={index === items.length - 1} aria-label={t(lang, "nextAria")} className={navBtn}><CaretRightIcon className="size-4" /></button>
          </>
        ) : <span className="h-11" />}
      </div>
    </div>,
    document.body
  )
}

// Подключение просмотра к списку заметок
export function usePostViewer(items: ViewerItem[], lang: Lang) {
  const [index, setIndex] = useState<number | null>(null)
  const open = useCallback((id: string) => {
    const i = items.findIndex((x) => x.id === id)
    if (i >= 0) setIndex(i)
  }, [items])
  const viewer = index !== null && items[index] ? <PostViewer items={items} index={index} lang={lang} onIndex={setIndex} onClose={() => setIndex(null)} /> : null
  return { open, viewer }
}
