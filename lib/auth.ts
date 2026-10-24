import { createHash, createHmac, timingSafeEqual } from "node:crypto"
import { cookies } from "next/headers"

// Один владелец, один пароль из переменной окружения ADMIN_PASSWORD.
// После входа в браузере лежит подписанная httpOnly-кука на 30 дней:
// подделать её без секрета нельзя, а из JS страницы она не читается.

export const SESSION_COOKIE = "atlas_session"
const SESSION_DAYS = 30

function secret(): string | null {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET
  // Секрет по умолчанию выводится из пароля: смена пароля = выход везде
  if (process.env.ADMIN_PASSWORD) return "atlas-session:" + sha256(process.env.ADMIN_PASSWORD)
  return null
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex")
const b64url = (buf: Buffer | string) => Buffer.from(buf).toString("base64url")

export function adminConfigured() {
  return !!process.env.ADMIN_PASSWORD
}

export function checkPassword(input: string): boolean {
  const real = process.env.ADMIN_PASSWORD
  if (!real) return false
  // Сравниваем хеши одинаковой длины за постоянное время
  return timingSafeEqual(Buffer.from(sha256(input)), Buffer.from(sha256(real)))
}

export function createSessionToken(): { token: string; maxAge: number } {
  const key = secret()
  if (!key) throw new Error("ADMIN_PASSWORD is not set")
  const maxAge = SESSION_DAYS * 24 * 60 * 60
  const payload = b64url(JSON.stringify({ sub: "admin", exp: Math.floor(Date.now() / 1000) + maxAge }))
  const sig = createHmac("sha256", key).update(payload).digest("base64url")
  return { token: `${payload}.${sig}`, maxAge }
}

export function verifySessionToken(token: string | undefined): boolean {
  const key = secret()
  if (!token || !key) return false
  const [payload, sig] = token.split(".")
  if (!payload || !sig) return false
  const expected = createHmac("sha256", key).update(payload).digest("base64url")
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString())
    return data.sub === "admin" && typeof data.exp === "number" && data.exp > Date.now() / 1000
  } catch {
    return false
  }
}

export async function isAdmin(): Promise<boolean> {
  const jar = await cookies()
  return verifySessionToken(jar.get(SESSION_COOKIE)?.value)
}

// Для изменяющих запросов: кроме куки проверяем, что запрос пришёл с нашего
// же сайта (Origin), — защита от подделки запросов с чужих страниц
export async function requireAdmin(req: Request): Promise<Response | null> {
  if (!(await isAdmin())) return Response.json({ error: "unauthorized" }, { status: 401 })
  if (req.method !== "GET" && req.method !== "HEAD") {
    const origin = req.headers.get("origin")
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host")
    if (origin) {
      try {
        if (new URL(origin).host !== host) return Response.json({ error: "bad_origin" }, { status: 403 })
      } catch {
        return Response.json({ error: "bad_origin" }, { status: 403 })
      }
    }
  }
  return null
}

// Простейший лимит попыток входа: 6 неудач за 15 минут с одного адреса.
// Живёт в памяти процесса — для одного владельца этого достаточно.
const attempts = new Map<string, { n: number; since: number }>()
const WINDOW = 15 * 60 * 1000
const LIMIT = 6

export function loginBlocked(ip: string): boolean {
  const a = attempts.get(ip)
  if (!a) return false
  if (Date.now() - a.since > WINDOW) {
    attempts.delete(ip)
    return false
  }
  return a.n >= LIMIT
}

export function noteFailedLogin(ip: string) {
  const a = attempts.get(ip)
  if (!a || Date.now() - a.since > WINDOW) attempts.set(ip, { n: 1, since: Date.now() })
  else a.n++
}

export function clearLoginAttempts(ip: string) {
  attempts.delete(ip)
}

export function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local"
}
