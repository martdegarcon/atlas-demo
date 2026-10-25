import { z } from "zod"
import { LIMITS, yearMax, YEAR_MIN } from "./limits"
import type { Trip } from "./types"

// Всё, что приходит в API, проверяется здесь: лишние поля отбрасываются,
// длины ограничены, фото — только свои загрузки или https-ссылки
const id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/)
const text = (max: number) => z.string().trim().max(max)
const photo = z
  .string()
  .max(1000)
  .refine((v) => /^\/api\/photos\/[A-Za-z0-9-]+$/.test(v) || /^https:\/\/[^\s"'<>]+$/.test(v), "bad photo url")

const entry = z.object({
  id,
  time: text(LIMITS.time).optional(),
  text: text(LIMITS.text).optional(),
  photo: photo.optional(),
})

const city = z.object({
  id,
  name: text(LIMITS.cityName).min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  date: text(LIMITS.date).default(""),
  country: text(LIMITS.country).optional(),
  countryCode: z.string().regex(/^[a-z]{2}$/).optional(),
  entries: z.array(entry).max(200).optional(),
})

export const tripSchema = z.object({
  id,
  slug: z.string().max(64).optional(),
  title: text(LIMITS.title).min(1),
  country: text(LIMITS.country).min(1),
  // верхняя граница считается при каждой проверке — год сменился, граница сдвинулась
  year: z.number().int().min(YEAR_MIN).refine((y) => y <= yearMax(), "year too far"),
  period: text(LIMITS.period).default(""),
  kind: z.literal("country").optional(),
  isPublic: z.boolean().default(true),
  createdAt: z.string().datetime().optional(),
  cities: z.array(city).min(1).max(300),
})

export const bulkSchema = z.object({ trips: z.array(tripSchema).max(1000) })

export function parseTrip(input: unknown): Trip | null {
  const r = tripSchema.safeParse(input)
  return r.success ? (r.data as Trip) : null
}

export function parseBulk(input: unknown): Trip[] | null {
  const r = bulkSchema.safeParse(input)
  if (!r.success) return null
  const trips = r.data.trips as Trip[]
  // id городов и заметок должны быть уникальны в пределах всего набора
  const seen = new Set<string>()
  for (const t of trips) {
    if (seen.has("t:" + t.id)) return null
    seen.add("t:" + t.id)
    for (const c of t.cities) {
      if (seen.has("c:" + c.id)) return null
      seen.add("c:" + c.id)
      for (const e of c.entries || []) {
        if (seen.has("e:" + e.id)) return null
        seen.add("e:" + e.id)
      }
    }
  }
  return trips
}
