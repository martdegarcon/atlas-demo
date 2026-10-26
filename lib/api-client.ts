import type { Trip } from "./types"

// Обращения браузера к API. Ошибка несёт HTTP-статус: по 401 интерфейс
// понимает, что сессия истекла, по остальным — что сохранить не вышло.
export class ApiError extends Error {
  constructor(public status: number, public code: string) {
    super(code)
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init?.headers || {}) } })
  let data: unknown = null
  try {
    data = await res.json()
  } catch {}
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string })?.error || "request_failed")
  return data as T
}

export const api = {
  saveTrip: (trip: Trip) =>
    call<{ trip: Trip }>(`/api/trips/${encodeURIComponent(trip.id)}`, { method: "PUT", body: JSON.stringify(trip) }).then((r) => r.trip),
  deleteTrip: (id: string) => call<{ ok: true }>(`/api/trips/${encodeURIComponent(id)}`, { method: "DELETE" }),
  replaceAll: (trips: Trip[]) => call<{ trips: Trip[] }>("/api/trips", { method: "PUT", body: JSON.stringify({ trips }) }).then((r) => r.trips),
  setCityCountries: (items: { id: string; country?: string; countryCode: string }[]) =>
    call<{ updated: number }>("/api/cities/countries", { method: "POST", body: JSON.stringify({ items }) }),
  login: (password: string) => call<{ ok: true }>("/api/auth/login", { method: "POST", body: JSON.stringify({ password }) }),
  logout: () => call<{ ok: true }>("/api/auth/logout", { method: "POST" }),
  resolveLink: (url: string) => call<{ url: string }>("/api/resolve-link", { method: "POST", body: JSON.stringify({ url }) }).then((r) => r.url),
  async uploadPhoto(blob: Blob): Promise<string> {
    const res = await fetch("/api/photos", { method: "POST", headers: { "content-type": blob.type || "image/jpeg" }, body: blob })
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new ApiError(res.status, data?.error || "upload_failed")
    return data.url as string
  },
}

// Фото ужимается до 1600px по длинной стороне в JPEG перед отправкой:
// быстрее грузится, меньше места в базе, а для экрана телефона хватает с запасом
export function compressImage(file: File, max = 2560, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
      const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale)
      const canvas = document.createElement("canvas")
      canvas.width = w
      canvas.height = h
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/jpeg", quality)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("image"))
    }
    img.src = url
  })
}
