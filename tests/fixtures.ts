import type { Trip } from "@/lib/types"

// Общие тестовые данные: небольшая поездка с заметками и фото
export function makeTrip(over: Partial<Trip> = {}): Trip {
  return {
    id: "georgia",
    title: "Грузия",
    country: "Грузия",
    year: 2026,
    period: "1–9 мая",
    isPublic: true,
    createdAt: "2026-05-09T00:00:00.000Z",
    cities: [
      { id: "tbilisi", name: "Тбилиси", lat: 41.7151, lng: 44.8271, date: "1 мая", entries: [{ id: "tb-1", time: "1 мая, 10:00", text: "Серные бани." }] },
      { id: "kazbegi", name: "Казбеги", lat: 42.6573, lng: 44.6436, date: "5 мая" },
      { id: "batumi", name: "Батуми", lat: 41.6168, lng: 41.6367, date: "8 мая" },
    ],
    ...over,
  }
}

// Минимальный настоящий JPEG 1×1
export const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  "base64"
)
export const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
)
