import { beforeEach, describe, expect, it, vi } from "vitest"
import { makeTrip } from "../fixtures"

const jar = new Map<string, string>()
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (k: string) => (jar.has(k) ? { value: jar.get(k) } : undefined) }),
}))

const { __resetDbForTests } = await import("@/lib/db")
const { createSessionToken } = await import("@/lib/auth")
const { upsertTrip, insertPhoto } = await import("@/lib/trips-repo")
const { tripSummary } = await import("@/lib/card")
const cardRoute = await import("@/app/api/trips/[id]/card/route")
const ogImage = await import("@/app/t/[slug]/opengraph-image")

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const pngSize = (buf: Buffer) => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) })

beforeEach(() => {
  __resetDbForTests()
  jar.clear()
  // внешние картинки в тестах не грузим — карточка должна собраться и без обложки
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))
})

describe("сводка поездки", () => {
  it("города, даты, год", () => {
    expect(tripSummary(makeTrip())).toBe("3 места · 1–9 мая · 2026")
    expect(tripSummary(makeTrip({ kind: "country", period: "" }))).toBe("2026")
  })
})

describe("карточка PNG", () => {
  it("1080×1350 для публичной поездки, с кешем", async () => {
    await upsertTrip(makeTrip())
    const res = await cardRoute.GET(new Request("http://x"), ctx("georgia"))
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("image/png")
    expect(res.headers.get("cache-control")).toContain("public")
    expect(pngSize(Buffer.from(await res.arrayBuffer()))).toEqual({ w: 1080, h: 1350 })
  }, 60000)

  it("с обложкой из своего фото", async () => {
    const { TINY_JPEG } = await import("../fixtures")
    await insertPhoto("cover", "image/jpeg", TINY_JPEG)
    const trip = makeTrip()
    trip.cities[0].entries = [{ id: "e", photo: "/api/photos/cover" }]
    await upsertTrip(trip)
    const res = await cardRoute.GET(new Request("http://x"), ctx("georgia"))
    expect(res.status).toBe(200)
  }, 60000)

  it("скрытая поездка: гостю 404, владельцу — без публичного кеша", async () => {
    await upsertTrip(makeTrip({ isPublic: false }))
    expect((await cardRoute.GET(new Request("http://x"), ctx("georgia"))).status).toBe(404)
    jar.set("atlas_session", createSessionToken().token)
    const res = await cardRoute.GET(new Request("http://x"), ctx("georgia"))
    expect(res.status).toBe(200)
    expect(res.headers.get("cache-control")).toContain("private")
  }, 60000)

  it("одна точка и длинное название не ломают отрисовку", async () => {
    await upsertTrip(makeTrip({ id: "fr", title: "Очень длинное название поездки", kind: "country", cities: [{ id: "fr-c", name: "Франция", lat: 46, lng: 2, date: "" }] }))
    expect((await cardRoute.GET(new Request("http://x"), ctx("fr"))).status).toBe(200)
  }, 60000)
})

describe("OG-картинка ссылки", () => {
  it("1200×630 для публичной поездки и заглушка для несуществующей", async () => {
    const ok = await ogImage.default({ params: Promise.resolve({ slug: "japan-2025" }) })
    expect(pngSize(Buffer.from(await ok.arrayBuffer()))).toEqual({ w: 1200, h: 630 })
    const missing = await ogImage.default({ params: Promise.resolve({ slug: "nope" }) })
    expect(missing.status).toBe(200)
  }, 60000)
})
