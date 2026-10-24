"use client"

import maplibregl from "@/lib/maplibre"
import { buildStyle, PALETTE_DARK } from "./map-style"

// Невидимая карта для экспорта (видео и карточка): того же стиля, что в
// приложении, с сохраняемым буфером кадра — чтобы снимок можно было скопировать
// на свой canvas.

export async function openOffscreenMap(width: number, height: number, view: { center: [number, number]; zoom: number; projection: "globe" | "mercator" }) {
  const container = document.createElement("div")
  Object.assign(container.style, { position: "fixed", left: "0", top: "0", width: width + "px", height: height + "px", opacity: "0", pointerEvents: "none", zIndex: "-1" })
  document.body.appendChild(container)

  const map = new maplibregl.Map({
    container,
    style: buildStyle(PALETTE_DARK),
    center: view.center,
    zoom: view.zoom,
    pixelRatio: 1,
    interactive: false,
    attributionControl: false,
    fadeDuration: 0,
    canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
  })
  const dispose = () => {
    map.remove()
    container.remove()
  }
  try {
    await new Promise<void>((resolve, reject) => {
      map.once("load", () => resolve())
      map.once("error", (e) => reject(e.error || new Error("map")))
      setTimeout(() => reject(new Error("map_timeout")), 20000)
    })
    map.setProjection({ type: view.projection })
  } catch (e) {
    dispose()
    throw e
  }
  return { map, dispose }
}

// Ждём, пока карта отрисует кадр. Если все тайлы уже на месте — сразу дальше
// (событие idle пришло бы только кадром позже и удвоило бы время сборки видео);
// если что-то ещё грузится — ждём idle, но не дольше timeout.
export function settled(map: maplibregl.Map, timeout = 2500): Promise<void> {
  return new Promise((resolve) => {
    let done = false
    // если за время кадра пришли новые тайлы, отрисованный кадр мог их не включить
    let tileArrived = false
    const onData = (e: { dataType?: string }) => { if (e.dataType === "source") tileArrived = true }
    const finish = () => {
      if (done) return
      done = true
      clearTimeout(timer)
      map.off("idle", finish)
      map.off("data", onData)
      resolve()
    }
    const timer = setTimeout(finish, timeout)
    map.on("data", onData)
    map.once("render", () => {
      if (!tileArrived && map.areTilesLoaded()) finish()
      else map.once("idle", finish)
    })
    map.triggerRepaint()
  })
}

export function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
    setTimeout(() => resolve(null), 8000)
  })
}

export async function loadFonts() {
  await Promise.all(["300 44px Onest", "400 18px Onest", "500 15px Onest"].map((f) => document.fonts.load(f, "АтласAtlas").catch(() => null)))
}
