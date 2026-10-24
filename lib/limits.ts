// Единые ограничения на ввод — их проверяют и формы (с подсказкой человеку),
// и сервер (на случай запроса в обход интерфейса). Меняются в одном месте.

export const LIMITS = {
  title: 80,
  country: 80,
  cityName: 80,
  date: 40,
  period: 40,
  time: 40,
  text: 5000,
  password: 200,
} as const

export const YEAR_MIN = 1900
// Поездку можно занести заранее — но не дальше следующего года
export const yearMax = () => new Date().getFullYear() + 1

export type YearError = "yearRequired" | "yearFormat" | "yearRange"

// Год в поле ввода: только 4 цифры в допустимом диапазоне
export function checkYear(raw: string): YearError | null {
  const v = raw.trim()
  if (!v) return "yearRequired"
  if (!/^\d{4}$/.test(v)) return "yearFormat"
  const n = Number(v)
  if (n < YEAR_MIN || n > yearMax()) return "yearRange"
  return null
}

// Оставляем в поле года только цифры и не больше четырёх
export const cleanYearInput = (raw: string) => raw.replace(/\D/g, "").slice(0, 4)

// Приводим год из старых данных или бэкапа к допустимому, иначе — текущий
export function safeYear(v: unknown): number {
  const n = Number(v)
  return Number.isInteger(n) && n >= YEAR_MIN && n <= yearMax() ? n : new Date().getFullYear()
}

export const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max) : s)

// Координаты в допустимых пределах (ссылки бывают битыми)
export const validLatLng = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
