// Общая модель данных — одна и та же на сервере (БД, API) и в браузере.
export type Entry = {
  id: string
  time?: string
  text?: string
  // URL фото: свои загрузки — /api/photos/<id>, демо — внешние https-ссылки
  photo?: string
}

export type City = {
  id: string
  name: string
  lat: number
  lng: number
  date: string
  // Страна точки — из геокодера при добавлении (у старых точек досчитывается
  // в фоне). Тур может идти через несколько стран, поэтому страна — у точки.
  country?: string
  // ISO-код страны в нижнем регистре ("ru", "jp") — по нему страны считаются
  // без дублей, даже если названия на разных языках
  countryCode?: string
  entries?: Entry[]
}

export type Trip = {
  id: string
  // Человекочитаемый адрес публичной страницы: /t/<slug>. Назначает сервер,
  // после создания не меняется — чтобы отправленные ссылки не ломались.
  slug?: string
  title: string
  country: string
  year: number
  period: string
  // "country" — «была в стране» без деталей по городам: одна точка-отметка
  kind?: "country"
  // Видна ли поездка в публичной версии. Скрытые видит только владелец.
  isPublic: boolean
  createdAt?: string
  updatedAt?: string
  cities: City[]
}

// Порядок поездок одинаковый везде: сначала свежие по году, внутри года —
// недавно добавленные выше
export function sortTrips(trips: Trip[]): Trip[] {
  return trips.slice().sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year
    return (b.createdAt || "").localeCompare(a.createdAt || "")
  })
}

export function findCity(trips: Trip[], cityId: string) {
  for (const trip of trips) {
    const city = trip.cities.find((c) => c.id === cityId)
    if (city) return { city, trip }
  }
  return null
}

export function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

// Ключ страны точки: код, если известен; иначе — название страны точки или тура.
// Названия, для которых где-то уже известен код, тоже сводятся к коду.
export function countryKeys(trips: Trip[]): Set<string> {
  const norm = (s: string) => s.trim().toLowerCase()
  const codeByName = new Map<string, string>()
  for (const t of trips) for (const c of t.cities) {
    if (!c.countryCode) continue
    if (c.country) codeByName.set(norm(c.country), c.countryCode)
    // тур, все точки которого в одной стране, связывает и название тура с кодом
    if (t.cities.every((x) => x.countryCode === c.countryCode)) codeByName.set(norm(t.country), c.countryCode)
  }
  // в поле страны тура бывает список: «Латвия, Швеция, Дания» — это три страны
  const tripNames = (t: Trip) => t.country.split(/[,;/]+/).map(norm).filter(Boolean)
  const keys = new Set<string>()
  const addName = (name: string) => keys.add(codeByName.get(name) || name)
  for (const t of trips) {
    if (!t.cities.length) { tripNames(t).forEach(addName); continue }
    for (const c of t.cities) {
      if (c.countryCode) keys.add(c.countryCode)
      else if (c.country) addName(norm(c.country))
      else tripNames(t).forEach(addName)
    }
  }
  keys.delete("")
  return keys
}

export const countCountries = (trips: Trip[]) => countryKeys(trips).size

// Сколько мест отмечено: точки туров. Страна-отметка («была, без деталей»)
// — это страна, а не место, её точка не считается.
export const placeCount = (trips: Trip[]) => trips.reduce((s, t) => s + (t.kind === "country" ? 0 : t.cities.length), 0)
