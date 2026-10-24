import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const renderTripVideo = vi.fn()
const videoSupported = vi.fn(() => true)
vi.mock("@/lib/export-video", () => ({ renderTripVideo: (...a: unknown[]) => renderTripVideo(...a), videoSupported: () => videoSupported() }))
// Карточка с картой собирается в браузере (WebGL) — в jsdom его нет, поэтому подменяем
const renderTripCard = vi.fn(async (_trip?: unknown): Promise<Blob> => { throw new Error("no webgl") })
vi.mock("@/lib/export-card", () => ({ renderTripCard: (t: unknown) => renderTripCard(t) }))

const { ShareSheet } = await import("@/components/share-sheet")
const { makeTrip } = await import("../fixtures")

const writeText = vi.fn().mockResolvedValue(undefined)
beforeEach(() => {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
  Object.defineProperty(navigator, "share", { value: undefined, configurable: true })
  Object.defineProperty(navigator, "canShare", { value: undefined, configurable: true })
  URL.createObjectURL = vi.fn(() => "blob:video")
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => vi.clearAllMocks())

function sheet(over: Partial<Parameters<typeof ShareSheet>[0]> = {}) {
  const props = {
    trip: makeTrip({ slug: "gruziya-2026", updatedAt: "2026-05-10T00:00:00.000Z" }), cityId: null, lang: "ru" as const, isAdmin: true,
    onClose: vi.fn(), onToast: vi.fn(), onMakePublic: vi.fn(), ...over,
  }
  render(<ShareSheet {...props} />)
  return props
}

describe("ссылка", () => {
  it("на поездку и на место", async () => {
    const p = sheet()
    expect(screen.getByText("http://localhost:3000/t/gruziya-2026")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Скопировать" }))
    expect(writeText).toHaveBeenCalledWith("http://localhost:3000/t/gruziya-2026")
    expect(p.onToast).toHaveBeenCalledWith("Ссылка скопирована")
  })
  it("на конкретный город — с ?city= и без видео/карточки", () => {
    sheet({ cityId: "kazbegi" })
    expect(screen.getByRole("dialog", { name: "Поделиться местом" })).toBeInTheDocument()
    expect(screen.getByText("http://localhost:3000/t/gruziya-2026?city=kazbegi")).toBeInTheDocument()
    expect(screen.queryByText("Видео-пролёт")).not.toBeInTheDocument()
    expect(screen.queryByText("Карточка")).not.toBeInTheDocument()
  })
  it("системное «Поделиться», а при отказе буфера — сообщение об ошибке", async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "share", { value: share, configurable: true })
    const p = sheet()
    await userEvent.click(screen.getAllByRole("button", { name: "Отправить" })[0])
    expect(share).toHaveBeenCalledWith({ title: "Грузия", url: "http://localhost:3000/t/gruziya-2026" })
    writeText.mockRejectedValueOnce(new Error("denied"))
    await userEvent.click(screen.getByRole("button", { name: "Скопировать" }))
    await waitFor(() => expect(p.onToast).toHaveBeenCalledWith("Не получилось поделиться"))
  })
  it("пока сервер не выдал slug, кнопки недоступны", () => {
    sheet({ trip: makeTrip() })
    expect(screen.getByRole("button", { name: "Скопировать" })).toBeDisabled()
  })
  it("скрытая поездка: владельцу предлагают открыть доступ, ссылки нет", async () => {
    const p = sheet({ trip: makeTrip({ slug: "g", isPublic: false }) })
    expect(screen.getByText(/видите только вы/)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Скопировать" })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Открыть доступ всем" }))
    expect(p.onMakePublic).toHaveBeenCalled()
  })
})

describe("видео и карточка", () => {
  it("гость видит карточку, но не видео", () => {
    sheet({ isAdmin: false })
    expect(screen.queryByText("Видео-пролёт")).not.toBeInTheDocument()
    expect(screen.getByText("Карточка")).toBeInTheDocument()
  })
  it("карточка собирается на карте; без WebGL — запасная серверная с версией в адресе", async () => {
    renderTripCard.mockResolvedValueOnce(new Blob(["png"], { type: "image/png" }))
    const first = render(<ShareSheet trip={makeTrip({ slug: "g", updatedAt: "2026-05-10T00:00:00.000Z" })} cityId={null} lang="ru" isAdmin onClose={vi.fn()} onToast={vi.fn()} onMakePublic={vi.fn()} />)
    await waitFor(() => expect(first.container.querySelector("img[data-card]")).toHaveAttribute("data-card", "map"))
    expect(first.container.querySelector("img[data-card]")!.getAttribute("src")).toBe("blob:video")
    first.unmount()

    const { container } = render(<ShareSheet trip={makeTrip({ slug: "g", updatedAt: "2026-05-10T00:00:00.000Z" })} cityId={null} lang="ru" isAdmin onClose={vi.fn()} onToast={vi.fn()} onMakePublic={vi.fn()} />)
    await waitFor(() => expect(container.querySelector("img[data-card]")).toHaveAttribute("data-card", "fallback"))
    expect(container.querySelector("img[data-card]")!.getAttribute("src")).toBe("/api/trips/georgia/card?v=2026-05-10T00%3A00%3A00.000Z")
  })
  it("сборка видео: прогресс, превью, отправка файлом", async () => {
    let finish!: (b: Blob) => void
    renderTripVideo.mockImplementation((_trip, { onProgress }) => {
      onProgress("render", 0.42)
      return new Promise((r) => { finish = r })
    })
    const user = userEvent.setup()
    const { container } = render(<ShareSheet trip={makeTrip({ slug: "g" })} cityId={null} lang="ru" isAdmin onClose={vi.fn()} onToast={vi.fn()} onMakePublic={vi.fn()} />)
    await user.click(screen.getByRole("button", { name: "Собрать видео" }))
    expect(await screen.findByText("42%")).toBeInTheDocument()
    expect(screen.getByText("Не сворачивайте вкладку, пока идёт сборка")).toBeInTheDocument()
    finish(new Blob(["mp4"], { type: "video/mp4" }))
    await waitFor(() => expect(container.querySelector("video")).toHaveAttribute("src", "blob:video"))

    const share = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true })
    Object.defineProperty(navigator, "share", { value: share, configurable: true })
    await user.click(screen.getAllByRole("button", { name: "Отправить" })[1])
    const file = share.mock.calls[0][0].files[0] as File
    expect(file.name).toBe("atlas-g.mp4")
    expect(file.type).toBe("video/mp4")
  })
  it("неподдерживаемый браузер и ошибка сборки", async () => {
    videoSupported.mockReturnValueOnce(false)
    const user = userEvent.setup()
    sheet()
    await user.click(screen.getByRole("button", { name: "Собрать видео" }))
    expect(await screen.findByText(/не умеет собирать видео/)).toBeInTheDocument()
    renderTripVideo.mockRejectedValueOnce(new Error("map_timeout"))
    await user.click(screen.getByRole("button", { name: "Собрать видео" }))
    expect(await screen.findByText("Не получилось собрать видео")).toBeInTheDocument()
  })
})

describe("карточка: отправка", () => {
  it("скачивает PNG и отдаёт его в системное меню", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Uint8Array([0x89, 0x50]), { status: 200, headers: { "content-type": "image/png" } })))
    const share = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true })
    Object.defineProperty(navigator, "share", { value: share, configurable: true })
    sheet({ isAdmin: false })
    await userEvent.click(screen.getAllByRole("button", { name: "Отправить" })[1])
    await waitFor(() => expect(share).toHaveBeenCalled())
    const file = share.mock.calls[0][0].files[0] as File
    expect(file.name).toBe("atlas-gruziya-2026.png")
    vi.unstubAllGlobals()
  })
  it("без системного меню — скачивание файлом; ошибка сервера — сообщение", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(new Uint8Array([0x89]), { headers: { "content-type": "image/png" } }))
      .mockResolvedValueOnce(new Response("nope", { status: 500 })))
    const p = sheet({ isAdmin: false })
    await userEvent.click(screen.getAllByRole("button", { name: "Отправить" })[1])
    await waitFor(() => expect(click).toHaveBeenCalled())
    await userEvent.click(screen.getAllByRole("button", { name: "Отправить" })[1])
    await waitFor(() => expect(p.onToast).toHaveBeenCalledWith("Не получилось поделиться"))
    click.mockRestore()
    vi.unstubAllGlobals()
  })
})
