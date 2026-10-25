import type { StyleSpecification } from "maplibre-gl"

// Свой стиль карты на бесплатных векторных тайлах OpenFreeMap (без ключа).
// Цвета вынесены в палитры: тема меняется перекраской слоёв, без перезагрузки.

export type Palette = {
  bg: string; landuse: string; water: string; roadMinor: string; roadMajor: string; rail: string
  boundRegion: string; boundCountry: string; labelWater: string; label: string; labelDim: string
  labelVillage: string; halo: string
}

export const PALETTE_DARK: Palette = {
  bg: "#0c0b0a", landuse: "#22211f", water: "#080807", roadMinor: "#2a2826", roadMajor: "#3a3733", rail: "#2e2c29",
  boundRegion: "#4a463f", boundCountry: "#6b665c", labelWater: "#3b3934", label: "#a29c90", labelDim: "#6f6a61",
  labelVillage: "#57534b", halo: "#0c0b0a",
}

export const PALETTE_LIGHT: Palette = {
  bg: "#f1efea", landuse: "#e6e2da", water: "#c8d3d7", roadMinor: "#e2ded5", roadMajor: "#d6d0c5", rail: "#cdc7bd",
  boundRegion: "#bcb6ab", boundCountry: "#958e82", labelWater: "#7f8f95", label: "#4a453e", labelDim: "#827c71",
  labelVillage: "#9a9488", halo: "#f6f4f0",
}

// Подписи — на языке интерфейса; если перевода нет, латиницей или как в оригинале
export type MapLang = "ru" | "en"
export const labelField = (lang: MapLang) =>
  lang === "ru"
    ? ["coalesce", ["get", "name:ru"], ["get", "name:latin"], ["get", "name_en"], ["get", "name"]]
    : ["coalesce", ["get", "name:en"], ["get", "name_en"], ["get", "name:latin"], ["get", "name"]]
const LABEL_LAYERS = ["label-water", "label-country", "label-region", "label-city", "label-town", "label-village"]
const FONT = ["Noto Sans Regular"]

export function buildStyle(p: Palette, lang: MapLang = "ru"): StyleSpecification {
  const NAME = labelField(lang)
  return {
    version: 8,
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: { omt: { type: "vector", url: "https://tiles.openfreemap.org/planet" } },
    layers: [
      { id: "background", type: "background", paint: { "background-color": p.bg } },
      {
        id: "landuse-city", type: "fill", source: "omt", "source-layer": "landuse", minzoom: 7,
        filter: ["in", ["get", "class"], ["literal", ["residential", "commercial", "retail", "industrial"]]],
        paint: { "fill-color": p.landuse, "fill-opacity": 0.8 },
      },
      { id: "water", type: "fill", source: "omt", "source-layer": "water", paint: { "fill-color": p.water } },
      {
        id: "roads-minor", type: "line", source: "omt", "source-layer": "transportation", minzoom: 11,
        filter: ["in", ["get", "class"], ["literal", ["minor", "service", "tertiary", "secondary"]]],
        paint: { "line-color": p.roadMinor, "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.4, 16, 2] },
      },
      {
        id: "roads-major", type: "line", source: "omt", "source-layer": "transportation", minzoom: 6,
        filter: ["in", ["get", "class"], ["literal", ["motorway", "trunk", "primary"]]],
        paint: { "line-color": p.roadMajor, "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.4, 14, 2.4] },
      },
      {
        id: "rail", type: "line", source: "omt", "source-layer": "transportation", minzoom: 8,
        filter: ["==", ["get", "class"], "rail"],
        paint: { "line-color": p.rail, "line-width": 0.6, "line-dasharray": [3, 3] },
      },
      {
        id: "boundary-region", type: "line", source: "omt", "source-layer": "boundary", minzoom: 3,
        filter: ["all", ["==", ["get", "admin_level"], 4], ["!=", ["get", "maritime"], 1]],
        paint: { "line-color": p.boundRegion, "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.4, 8, 1.2], "line-dasharray": [2, 2] },
      },
      {
        id: "boundary-country", type: "line", source: "omt", "source-layer": "boundary",
        filter: ["all", ["==", ["get", "admin_level"], 2], ["!=", ["get", "maritime"], 1]],
        paint: { "line-color": p.boundCountry, "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.6, 8, 1.6] },
      },
      {
        id: "label-water", type: "symbol", source: "omt", "source-layer": "water_name", minzoom: 2,
        layout: { "text-field": NAME, "text-font": FONT, "text-size": 11, "text-letter-spacing": 0.15, "text-transform": "uppercase" },
        paint: { "text-color": p.labelWater, "text-halo-color": p.halo, "text-halo-width": 1 },
      },
      {
        id: "label-country", type: "symbol", source: "omt", "source-layer": "place", maxzoom: 7,
        filter: ["==", ["get", "class"], "country"],
        layout: { "text-field": NAME, "text-font": FONT, "text-size": ["interpolate", ["linear"], ["zoom"], 1, 10, 6, 15], "text-transform": "uppercase", "text-letter-spacing": 0.12, "text-max-width": 8 },
        paint: { "text-color": p.label, "text-halo-color": p.halo, "text-halo-width": 1.4 },
      },
      {
        id: "label-region", type: "symbol", source: "omt", "source-layer": "place", minzoom: 4, maxzoom: 9,
        filter: ["in", ["get", "class"], ["literal", ["state", "province"]]],
        layout: { "text-field": NAME, "text-font": FONT, "text-size": ["interpolate", ["linear"], ["zoom"], 4, 10, 8, 13], "text-transform": "uppercase", "text-letter-spacing": 0.1, "text-max-width": 7 },
        paint: { "text-color": p.labelDim, "text-halo-color": p.halo, "text-halo-width": 1.2 },
      },
      {
        id: "label-city", type: "symbol", source: "omt", "source-layer": "place", minzoom: 4,
        filter: ["==", ["get", "class"], "city"],
        layout: { "text-field": NAME, "text-font": FONT, "text-size": ["interpolate", ["linear"], ["zoom"], 4, 11, 10, 16], "symbol-sort-key": ["get", "rank"], "text-max-width": 8 },
        paint: { "text-color": p.label, "text-halo-color": p.halo, "text-halo-width": 1.4 },
      },
      {
        id: "label-town", type: "symbol", source: "omt", "source-layer": "place", minzoom: 7,
        filter: ["==", ["get", "class"], "town"],
        layout: { "text-field": NAME, "text-font": FONT, "text-size": ["interpolate", ["linear"], ["zoom"], 7, 10, 12, 14], "symbol-sort-key": ["get", "rank"] },
        paint: { "text-color": p.labelDim, "text-halo-color": p.halo, "text-halo-width": 1.2 },
      },
      {
        id: "label-village", type: "symbol", source: "omt", "source-layer": "place", minzoom: 10,
        filter: ["in", ["get", "class"], ["literal", ["village", "suburb", "neighbourhood"]]],
        layout: { "text-field": NAME, "text-font": FONT, "text-size": 11 },
        paint: { "text-color": p.labelVillage, "text-halo-color": p.halo, "text-halo-width": 1.2 },
      },
    ],
  } as StyleSpecification
}

// Минимум от карты, нужный для перекраски, — так функцию легко проверить в тестах
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Paintable = { getLayer(id: string): unknown; setPaintProperty(id: string, prop: any, v: any): unknown }

export function applyPalette(map: Paintable, p: Palette) {
  const set = (layer: string, prop: string, val: unknown) => { if (map.getLayer(layer)) map.setPaintProperty(layer, prop, val) }
  set("background", "background-color", p.bg)
  set("landuse-city", "fill-color", p.landuse)
  set("water", "fill-color", p.water)
  set("roads-minor", "line-color", p.roadMinor)
  set("roads-major", "line-color", p.roadMajor)
  set("rail", "line-color", p.rail)
  set("boundary-region", "line-color", p.boundRegion)
  set("boundary-country", "line-color", p.boundCountry)
  set("label-water", "text-color", p.labelWater)
  for (const id of ["label-country", "label-city"]) set(id, "text-color", p.label)
  for (const id of ["label-region", "label-town"]) set(id, "text-color", p.labelDim)
  set("label-village", "text-color", p.labelVillage)
  for (const id of ["label-water", "label-country", "label-region", "label-city", "label-town", "label-village"]) set(id, "text-halo-color", p.halo)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Layoutable = { getLayer(id: string): unknown; setLayoutProperty(id: string, prop: any, v: any): unknown }

// Сменить язык подписей без перезагрузки карты
export function applyLabelLang(map: Layoutable, lang: MapLang) {
  for (const id of LABEL_LAYERS) if (map.getLayer(id)) map.setLayoutProperty(id, "text-field", labelField(lang))
}
