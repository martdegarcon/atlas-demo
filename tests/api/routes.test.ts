import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { makeTrip, TINY_JPEG, TINY_PNG } from "../fixtures"

// Куки next/headers — в общем хранилище, как в браузере между запросами
const jar = new Map<string, string>()
const setCookieLog: { name: string; opts: Record<string, unknown> }[] = []
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => (jar.has(k) ? { value: jar.get(k) } : undefined),
    set: (k: string, v: string, opts: Record<string, unknown>) => { jar.set(k, v); setCookieLog.push({ name: k, opts }) },
    delete: (k: string) => { jar.delete(k) },
  }),
}))

const { __resetDbForTests } = await import("@/lib/db")
const { clearLoginAttempts } = await import("@/lib/auth")
const login = await import("@/app/api/auth/login/route")
const logout = await import("@/app/api/auth/logout/route")
const tripsRoute = await import("@/app/api/trips/route")
const tripRoute = await import("@/app/api/trips/[id]/route")
const photosRoute = await import("@/app/api/photos/route")
const photoRoute = await import("@/app/api/photos/[id]/route")
const resolveRoute = await import("@/app/api/resolve-link/route")
const countriesRoute = await import("@/app/api/cities/countries/route")

const BASE = "http://atlas.test"
const ctx = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) })
function req(path: string, init: RequestInit & { json?: unknown } = {}) {
  const headers = new Headers(init.headers)
  headers.set("host", "atlas.test")
  let body = init.body
  if (init.json !== undefined) { body = JSON.stringify(init.json); headers.set("content-type", "application/json") }
  return new Request(BASE + path, { ...init, headers, body })
}
async function signIn() {
  const res = await login.POST(req("/api/auth/login", { method: "POST", json: { password: "test-password" } }))
  expect(res.status).toBe(200)
}

beforeEach(() => {
  __resetDbForTests()
  jar.clear()
  setCookieLog.length = 0
  clearLoginAttempts("local")
})
afterEach(() => vi.unstubAllGlobals())

describe("вход и выход", () => {
  it("верный пароль ставит httpOnly-куку на 30 дней", async () => {
    await signIn()
    expect(jar.has("atlas_session")).toBe(true)
    expect(setCookieLog[0].opts).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 2592000, secure: false })
  })
  it("за https-прокси кука secure", async () => {
    await login.POST(req("/api/auth/login", { method: "POST", json: { password: "test-password" }, headers: { "x-forwarded-proto": "https" } }))
    expect(setCookieLog[0].opts.secure).toBe(true)
  })
  it("неверный пароль — 401, кривое тело — 400", async () => {
    const bad = await login.POST(req("/api/auth/login", { method: "POST", json: { password: "nope" } }))
    expect(bad.status).toBe(401)
    expect(await bad.json()).toEqual({ error: "wrong_password" })
    expect(jar.size).toBe(0)
    const junk = await login.POST(req("/api/auth/login", { method: "POST", body: "{not json" }))
    expect(junk.status).toBe(400)
  })
  it("после 6 ошибок блокирует даже верный пароль", async () => {
    for (let i = 0; i < 6; i++) await login.POST(req("/api/auth/login", { method: "POST", json: { password: "x" } }))
    const res = await login.POST(req("/api/auth/login", { method: "POST", json: { password: "test-password" } }))
    expect(res.status).toBe(429)
  })
  it("без ADMIN_PASSWORD вход отключён", async () => {
    vi.stubEnv("ADMIN_PASSWORD", "")
    const res = await login.POST(req("/api/auth/login", { method: "POST", json: { password: "" } }))
    expect(res.status).toBe(503)
    vi.unstubAllEnvs()
  })
  it("выход удаляет куку", async () => {
    await signIn()
    await logout.POST()
    expect(jar.has("atlas_session")).toBe(false)
  })
})

describe("поездки: права", () => {
  it("гость читает только публичное", async () => {
    await signIn()
    await tripRoute.PUT(req("/api/trips/georgia", { method: "PUT", json: makeTrip({ isPublic: false }) }), ctx({ id: "georgia" }))
    jar.clear()
    const list = await (await tripsRoute.GET()).json()
    expect(list.trips.map((t: { id: string }) => t.id)).not.toContain("georgia")
    expect((await tripRoute.GET(req("/api/trips/georgia"), ctx({ id: "georgia" }))).status).toBe(404)
  })
  it.each([
    ["PUT поездки", () => tripRoute.PUT(req("/api/trips/georgia", { method: "PUT", json: makeTrip() }), ctx({ id: "georgia" }))],
    ["DELETE поездки", () => tripRoute.DELETE(req("/api/trips/japan-2025", { method: "DELETE" }), ctx({ id: "japan-2025" }))],
    ["POST поездки", () => tripsRoute.POST(req("/api/trips", { method: "POST", json: makeTrip() }))],
    ["PUT всего набора", () => tripsRoute.PUT(req("/api/trips", { method: "PUT", json: { trips: [] } }))],
    ["загрузка фото", () => photosRoute.POST(req("/api/photos", { method: "POST", body: TINY_JPEG, headers: { "content-type": "image/jpeg" } }))],
    ["разворот ссылки", () => resolveRoute.POST(req("/api/resolve-link", { method: "POST", json: { url: "https://maps.app.goo.gl/x" } }))],
  ])("гость: %s → 401", async (_n, call) => {
    expect((await call()).status).toBe(401)
  })
  it("поддельная кука не даёт прав", async () => {
    jar.set("atlas_session", "eyJzdWIiOiJhZG1pbiIsImV4cCI6OTk5OTk5OTk5OX0.forged")
    const res = await tripsRoute.PUT(req("/api/trips", { method: "PUT", json: { trips: [] } }))
    expect(res.status).toBe(401)
  })
  it("чужой Origin — 403, данные не тронуты", async () => {
    await signIn()
    const res = await tripsRoute.PUT(req("/api/trips", { method: "PUT", json: { trips: [] }, headers: { origin: "https://evil.example" } }))
    expect(res.status).toBe(403)
    expect((await (await tripsRoute.GET()).json()).trips).toHaveLength(3)
  })
})

describe("поездки: владелец", () => {
  beforeEach(signIn)

  it("создаёт, читает, правит, удаляет", async () => {
    const created = await (await tripsRoute.POST(req("/api/trips", { method: "POST", json: makeTrip() }))).json()
    expect(created.trip.slug).toBe("gruziya-2026")
    const edited = await (await tripRoute.PUT(req("/api/trips/georgia", { method: "PUT", json: makeTrip({ title: "Грузия!" }) }), ctx({ id: "georgia" }))).json()
    expect(edited.trip.title).toBe("Грузия!")
    expect((await tripRoute.GET(req("/api/trips/georgia"), ctx({ id: "georgia" }))).status).toBe(200)
    expect((await tripRoute.DELETE(req("/api/trips/georgia", { method: "DELETE" }), ctx({ id: "georgia" }))).status).toBe(200)
    expect((await tripRoute.GET(req("/api/trips/georgia"), ctx({ id: "georgia" }))).status).toBe(404)
  })
  it("id в адресе и в теле должны совпадать", async () => {
    const res = await tripRoute.PUT(req("/api/trips/other", { method: "PUT", json: makeTrip() }), ctx({ id: "other" }))
    expect(res.status).toBe(400)
  })
  it("невалидные данные — 400 и ничего не сохраняется", async () => {
    for (const body of [makeTrip({ title: "" }), { ...makeTrip(), cities: [] }, "мусор"]) {
      const res = await tripRoute.PUT(req("/api/trips/georgia", { method: "PUT", json: body }), ctx({ id: "georgia" }))
      expect(res.status).toBe(400)
    }
    const raw = await tripRoute.PUT(req("/api/trips/georgia", { method: "PUT", body: "{oops", headers: { "content-type": "application/json" } }), ctx({ id: "georgia" }))
    expect(raw.status).toBe(400)
    expect((await tripRoute.GET(req("/api/trips/georgia"), ctx({ id: "georgia" }))).status).toBe(404)
  })
  it("замена набора: очистка и восстановление", async () => {
    const before = (await (await tripsRoute.GET()).json()).trips
    expect((await (await tripsRoute.PUT(req("/api/trips", { method: "PUT", json: { trips: [] } }))).json()).trips).toEqual([])
    const restored = await (await tripsRoute.PUT(req("/api/trips", { method: "PUT", json: { trips: before } }))).json()
    expect(restored.trips.map((t: { slug: string }) => t.slug)).toEqual(before.map((t: { slug: string }) => t.slug))
  })
})

describe("фото", () => {
  beforeEach(signIn)
  const upload = (body: Uint8Array | string, type: string) =>
    photosRoute.POST(req("/api/photos", { method: "POST", body: body as BodyInit, headers: { "content-type": type } }))

  it("JPEG и PNG загружаются и отдаются с вечным кешем", async () => {
    for (const [buf, type] of [[TINY_JPEG, "image/jpeg"], [TINY_PNG, "image/png"]] as const) {
      const { url } = await (await upload(buf, type)).json()
      const id = url.split("/").pop()
      const res = await photoRoute.GET(req(url), ctx({ id }))
      expect(res.status).toBe(200)
      expect(res.headers.get("content-type")).toBe(type)
      expect(res.headers.get("cache-control")).toContain("immutable")
      expect(res.headers.get("x-content-type-options")).toBe("nosniff")
      expect(Buffer.from(await res.arrayBuffer()).equals(buf)).toBe(true)
    }
  })
  it("отклоняет не-картинки, подмену типа, пустые и огромные файлы", async () => {
    expect((await upload("<svg/>", "image/svg+xml")).status).toBe(415)
    expect((await upload("<html>", "image/jpeg")).status).toBe(415) // сигнатура не JPEG
    expect((await upload(new Uint8Array(0), "image/jpeg")).status).toBe(413)
    const huge = new Uint8Array(5 * 1024 * 1024); huge[0] = 0xff; huge[1] = 0xd8
    expect((await upload(huge, "image/jpeg")).status).toBe(413)
  })
  it("несуществующее и кривое id — 404", async () => {
    expect((await photoRoute.GET(req("/api/photos/nope"), ctx({ id: "nope" }))).status).toBe(404)
    expect((await photoRoute.GET(req("/api/photos/x"), ctx({ id: "../etc/passwd" }))).status).toBe(404)
  })
})

describe("разворот коротких ссылок", () => {
  beforeEach(signIn)
  const resolve = (url: string) => resolveRoute.POST(req("/api/resolve-link", { method: "POST", json: { url } }))
  const redirect = (to: string) => new Response(null, { status: 302, headers: { location: to } })

  it("идёт по редиректам внутри Google и возвращает итоговый адрес", async () => {
    const final = "https://www.google.com/maps/place/Kyoto/@35.01,135.76,12z"
    const fetchMock = vi.fn().mockResolvedValueOnce(redirect(final)).mockResolvedValueOnce(new Response("ok", { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    const res = await resolve("https://maps.app.goo.gl/AbC")
    expect(await res.json()).toEqual({ url: final })
    expect(fetchMock.mock.calls[0][1].redirect).toBe("manual")
  })
  it("достаёт адрес со страницы согласия Google", async () => {
    const final = "https://www.google.com/maps/@41.7,44.8,12z"
    const consent = `https://consent.google.com/m?continue=${encodeURIComponent(final)}`
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(redirect(consent)).mockResolvedValueOnce(new Response("ok")))
    expect(await (await resolve("https://maps.app.goo.gl/AbC")).json()).toEqual({ url: final })
  })
  it("не уходит за пределы Google — ни сразу, ни через редирект", async () => {
    expect((await resolve("http://169.254.169.254/latest")).status).toBe(400)
    expect((await resolve("http://maps.app.goo.gl/x")).status).toBe(400) // только https
    expect((await resolve("https://maps.app.goo.gl.evil.com/x")).status).toBe(400)
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(redirect("http://127.0.0.1:5432/")))
    expect((await resolve("https://maps.app.goo.gl/AbC")).status).toBe(400)
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(redirect(`https://consent.google.com/m?continue=${encodeURIComponent("https://evil.com")}`)))
    expect((await resolve("https://maps.app.goo.gl/AbC")).status).toBe(400)
  })
  it("ошибка сети — 502, мусор — 400", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")))
    expect((await resolve("https://maps.app.goo.gl/AbC")).status).toBe(502)
    expect((await resolve("не ссылка")).status).toBe(400)
  })
  it("не зацикливается на бесконечных редиректах", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => redirect("https://www.google.com/maps/loop"))
    vi.stubGlobal("fetch", fetchMock)
    expect((await resolve("https://maps.app.goo.gl/AbC")).status).toBe(200)
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(6)
  })
})

describe("досчёт стран точек", () => {
  it("гостю нельзя, владельцу — только страна, кривые данные отклоняются", async () => {
    const t = makeTrip({ id: "geo" })
    const body = { items: [{ id: t.cities[0].id, country: "Грузия", countryCode: "ge" }] }
    expect((await countriesRoute.POST(req("/api/cities/countries", { method: "POST", json: body }))).status).toBe(401)
    await signIn()
    await tripRoute.PUT(req("/api/trips/geo", { method: "PUT", json: t }), ctx({ id: "geo" }))
    expect((await countriesRoute.POST(req("/api/cities/countries", { method: "POST", json: { items: [{ id: t.cities[0].id, countryCode: "GEO" }] } }))).status).toBe(400)
    const res = await countriesRoute.POST(req("/api/cities/countries", { method: "POST", json: body }))
    expect(await res.json()).toEqual({ updated: 1 })
    const got = await (await tripRoute.GET(req("/api/trips/geo"), ctx({ id: "geo" }))).json()
    expect(got.trip.cities[0]).toMatchObject({ country: "Грузия", countryCode: "ge" })
  })
})
