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
