"use client"

// Единая точка подключения MapLibre: указываем, откуда брать фоновый воркер
// (файл копируется в public/ скриптом scripts/copy-map-worker.mjs).
// Без этого карта не загружает тайлы и не рисует маршруты.
import * as maplibregl from "maplibre-gl"

if (typeof window !== "undefined") {
  maplibregl.setWorkerUrl(new URL("/maplibre-gl-worker.mjs", window.location.origin).href)
}

export default maplibregl
export * from "maplibre-gl"
