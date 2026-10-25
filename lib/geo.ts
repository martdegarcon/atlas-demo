"use client"

import type { City, Trip } from "./types"

// Страна по координатам — обратный геокодинг OpenStreetMap (Nominatim).
// zoom=3 — уровень страны: быстрый ответ без лишних подробностей.
export async function reverseCountry(lat: number, lng: number, lang: "ru" | "en", signal?: AbortSignal): Promise<Pick<City, "country" | "countryCode"> | null> {
  const p = new URLSearchParams({ format: "json", lat: String(lat), lon: String(lng), zoom: "3", addressdetails: "1", "accept-language": lang })
  const res = await fetch("https://nominatim.openstreetmap.org/reverse?" + p, { signal })
  if (!res.ok) return null
  const data = (await res.json()) as { address?: { country?: string; country_code?: string } }
  const code = data.address?.country_code?.toLowerCase()
  if (!code || !/^[a-z]{2}$/.test(code)) return null
  return { countryCode: code, ...(data.address?.country ? { country: data.address.country.slice(0, 80) } : {}) }
}

// Точки без известной страны. Язык названия — как у названия страны тура,
// чтобы «Россия» и «Russia» не путались между собой.
export function citiesWithoutCountry(trips: Trip[]): { tripId: string; city: City; lang: "ru" | "en" }[] {
  return trips.flatMap((t) =>
    t.cities.filter((c) => !c.countryCode).map((city) => ({ tripId: t.id, city, lang: /[а-яё]/i.test(t.country) ? ("ru" as const) : ("en" as const) }))
  )
}

// Вписать найденные страны в поездки (только поля страны — остальное не трогаем)
export function withCountries(trips: Trip[], found: Map<string, Pick<City, "country" | "countryCode">>): { trips: Trip[]; changed: string[] } {
  const changed: string[] = []
  const next = trips.map((t) => {
    if (!t.cities.some((c) => found.has(c.id) && !c.countryCode)) return t
    changed.push(t.id)
    return { ...t, cities: t.cities.map((c) => (found.has(c.id) && !c.countryCode ? { ...c, ...found.get(c.id) } : c)) }
  })
  return { trips: next, changed }
}
