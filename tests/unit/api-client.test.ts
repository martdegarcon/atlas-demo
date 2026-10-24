import { afterEach, describe, expect, it, vi } from "vitest"
import { api, ApiError } from "@/lib/api-client"
import { makeTrip } from "../fixtures"

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
afterEach(() => vi.unstubAllGlobals())

describe("клиент API", () => {
  it("сохраняет поездку PUT-запросом с JSON", async () => {
    const trip = makeTrip()
    const fetchMock = vi.fn().mockResolvedValue(json({ trip: { ...trip, slug: "gruziya-2026" } }))
    vi.stubGlobal("fetch", fetchMock)
    const saved = await api.saveTrip(trip)
    expect(saved.slug).toBe("gruziya-2026")
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/trips/georgia")
    expect(init.method).toBe("PUT")
    expect(init.headers["content-type"]).toBe("application/json")
    expect(JSON.parse(init.body).id).toBe("georgia")
  })

  it("экранирует id в адресе", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ ok: true }))
    vi.stubGlobal("fetch", fetchMock)
    await api.deleteTrip("a/b?c")
    expect(fetchMock.mock.calls[0][0]).toBe("/api/trips/a%2Fb%3Fc")
  })

  it("ошибка сервера превращается в ApiError с кодом и статусом", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: "unauthorized" }, 401)))
    const err = await api.replaceAll([]).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status: 401, code: "unauthorized" })
  })

  it("ответ без JSON — тоже понятная ошибка", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>502</html>", { status: 502 })))
    await expect(api.login("x")).rejects.toMatchObject({ status: 502, code: "request_failed" })
  })

  it("вход, выход, разворот ссылки", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ ok: true }))
      .mockResolvedValueOnce(json({ ok: true }))
      .mockResolvedValueOnce(json({ url: "https://www.google.com/maps/@1,2,3z" }))
    vi.stubGlobal("fetch", fetchMock)
    await api.login("pw")
    await api.logout()
    expect(await api.resolveLink("https://maps.app.goo.gl/x")).toBe("https://www.google.com/maps/@1,2,3z")
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ password: "pw" })
    expect(fetchMock.mock.calls[1][0]).toBe("/api/auth/logout")
  })

  it("загрузка фото: тип файла в заголовке, ошибка с кодом", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ url: "/api/photos/1" })).mockResolvedValueOnce(json({ error: "too_large" }, 413))
    vi.stubGlobal("fetch", fetchMock)
    const blob = new Blob([new Uint8Array([0xff, 0xd8])], { type: "image/jpeg" })
    expect(await api.uploadPhoto(blob)).toBe("/api/photos/1")
    expect(fetchMock.mock.calls[0][1].headers["content-type"]).toBe("image/jpeg")
    await expect(api.uploadPhoto(blob)).rejects.toMatchObject({ status: 413, code: "too_large" })
  })
})
