import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Кука сессии читается через next/headers — подменяем её простым хранилищем
const jar = new Map<string, string>()
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (k: string) => (jar.has(k) ? { value: jar.get(k) } : undefined) }),
}))

const auth = await import("@/lib/auth")

beforeEach(() => {
  jar.clear()
  vi.stubEnv("ADMIN_PASSWORD", "secret-1")
  vi.stubEnv("SESSION_SECRET", "")
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe("пароль", () => {
  it("проверяет пароль", () => {
    expect(auth.checkPassword("secret-1")).toBe(true)
    expect(auth.checkPassword("secret-2")).toBe(false)
    expect(auth.checkPassword("")).toBe(false)
  })
  it("без ADMIN_PASSWORD вход выключен", () => {
    vi.stubEnv("ADMIN_PASSWORD", "")
    expect(auth.adminConfigured()).toBe(false)
    expect(auth.checkPassword("")).toBe(false)
    expect(() => auth.createSessionToken()).toThrow()
  })
})

describe("токен сессии", () => {
  it("свой токен проходит", () => {
    const { token, maxAge } = auth.createSessionToken()
    expect(maxAge).toBe(30 * 24 * 3600)
    expect(auth.verifySessionToken(token)).toBe(true)
  })
  it("подделка подписи и полезной нагрузки не проходят", () => {
    const { token } = auth.createSessionToken()
    const [payload, sig] = token.split(".")
    expect(auth.verifySessionToken(`${payload}.${sig.slice(0, -2)}xx`)).toBe(false)
    const forged = Buffer.from(JSON.stringify({ sub: "admin", exp: 9999999999 })).toString("base64url")
    expect(auth.verifySessionToken(`${forged}.${sig}`)).toBe(false)
    for (const junk of [undefined, "", "abc", "a.b.c", "..."]) expect(auth.verifySessionToken(junk)).toBe(false)
  })
  it("смена пароля разлогинивает", () => {
    const { token } = auth.createSessionToken()
    vi.stubEnv("ADMIN_PASSWORD", "new-password")
    expect(auth.verifySessionToken(token)).toBe(false)
  })
  it("SESSION_SECRET имеет приоритет над паролем", () => {
    vi.stubEnv("SESSION_SECRET", "separate")
    const { token } = auth.createSessionToken()
    vi.stubEnv("ADMIN_PASSWORD", "changed")
    expect(auth.verifySessionToken(token)).toBe(true)
  })
  it("токен истекает через 30 дней", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))
    const { token } = auth.createSessionToken()
    vi.setSystemTime(new Date("2026-01-30T00:00:00Z"))
    expect(auth.verifySessionToken(token)).toBe(true)
    vi.setSystemTime(new Date("2026-02-01T00:00:00Z"))
    expect(auth.verifySessionToken(token)).toBe(false)
  })
})

describe("isAdmin / requireAdmin", () => {
  const login = () => jar.set(auth.SESSION_COOKIE, auth.createSessionToken().token)
  const req = (method: string, headers: Record<string, string> = {}) =>
    new Request("http://atlas.test/api/x", { method, headers: { host: "atlas.test", ...headers } })

  it("без куки — не админ, 401", async () => {
    expect(await auth.isAdmin()).toBe(false)
    expect((await auth.requireAdmin(req("PUT")))?.status).toBe(401)
  })
  it("с кукой — админ", async () => {
    login()
    expect(await auth.isAdmin()).toBe(true)
    expect(await auth.requireAdmin(req("PUT", { origin: "http://atlas.test" }))).toBeNull()
    expect(await auth.requireAdmin(req("PUT"))).toBeNull() // без Origin (curl, старые браузеры)
  })
  it("чужой Origin на изменении — 403", async () => {
    login()
    expect((await auth.requireAdmin(req("DELETE", { origin: "https://evil.example" })))?.status).toBe(403)
    expect((await auth.requireAdmin(req("POST", { origin: "not a url" })))?.status).toBe(403)
  })
  it("за прокси сверяет x-forwarded-host", async () => {
    login()
    const r = new Request("http://internal:3000/api/x", { method: "PUT", headers: { host: "internal:3000", "x-forwarded-host": "atlas.example", origin: "https://atlas.example" } })
    expect(await auth.requireAdmin(r)).toBeNull()
  })
  it("GET не проверяет Origin", async () => {
    login()
    expect(await auth.requireAdmin(req("GET", { origin: "https://evil.example" }))).toBeNull()
  })
})

describe("лимит попыток входа", () => {
  it("блокирует после 6 неудач и сбрасывается", () => {
    const ip = "10.0.0." + Math.random()
    for (let i = 0; i < 5; i++) auth.noteFailedLogin(ip)
    expect(auth.loginBlocked(ip)).toBe(false)
    auth.noteFailedLogin(ip)
    expect(auth.loginBlocked(ip)).toBe(true)
    auth.clearLoginAttempts(ip)
    expect(auth.loginBlocked(ip)).toBe(false)
  })
  it("окно в 15 минут", () => {
    vi.useFakeTimers()
    const ip = "10.1.0.1"
    for (let i = 0; i < 6; i++) auth.noteFailedLogin(ip)
    expect(auth.loginBlocked(ip)).toBe(true)
    vi.advanceTimersByTime(15 * 60 * 1000 + 1)
    expect(auth.loginBlocked(ip)).toBe(false)
  })
  it("адрес клиента из заголовков", () => {
    expect(auth.clientIp(new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" } }))).toBe("1.2.3.4")
    expect(auth.clientIp(new Request("http://x", { headers: { "x-real-ip": "5.6.7.8" } }))).toBe("5.6.7.8")
    expect(auth.clientIp(new Request("http://x"))).toBe("local")
  })
})
