import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const resolveLink = vi.fn()
vi.mock("@/lib/api-client", () => ({ api: { resolveLink: (u: string) => resolveLink(u) } }))

const { AddPlace } = await import("@/components/add-place")
const { demoTrips } = await import("@/lib/demo-data")

const kyoto = { place_id: 1, display_name: "Киото, Япония", lat: "35.0116", lon: "135.7681", name: "Киото", address: { city: "Киото", country: "Япония" } }
const france = { place_id: 2, display_name: "Франция", lat: "46.6", lon: "1.9", name: "Франция", address: { country: "Франция" } }

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  fetchMock = vi.fn(async (url: string) => {
    if (url.includes("/reverse?")) return new Response(JSON.stringify({ display_name: "Фусими, Киото, Япония", address: { city: "Киото", country: "Япония" } }))
    if (url.includes("featuretype=country")) return new Response(JSON.stringify([france]))
    return new Response(JSON.stringify([kyoto]))
  })
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

function open() {
  const onClose = vi.fn()
  const onAddCity = vi.fn()
  render(<AddPlace open trips={demoTrips} lang="ru" onClose={onClose} onAddCity={onAddCity} />)
  return { onClose, onAddCity }
}

describe("AddPlace", () => {
  it("ищет город с задержкой и добавляет в новую поездку", async () => {
    const user = userEvent.setup()
    const p = open()
    await user.type(screen.getByPlaceholderText("Город, остров, бухта…"), "Кио")
    await user.click(await screen.findByText("Киото, Япония"))
    const url = fetchMock.mock.calls.at(-1)![0] as string
    expect(url).toContain("addressdetails=1")
    expect(url).toContain("accept-language=ru")
    // без названия новой поездки — нельзя
    expect(screen.getByRole("button", { name: "Добавить место" })).toBeDisabled()
    await user.type(screen.getByPlaceholderText("Название поездки"), "Кансай")
    await user.type(screen.getByPlaceholderText(/Дата/), "3 мар")
    await user.type(screen.getByPlaceholderText("Заметка (необязательно)"), "Храмы")
    await user.click(screen.getByRole("button", { name: "Добавить место" }))
    const [city, tripId, trip] = p.onAddCity.mock.calls[0]
    expect(tripId).toBeNull()
    expect(city).toMatchObject({ name: "Киото", lat: 35.0116, lng: 135.7681, date: "3 мар", entries: [{ text: "Храмы" }] })
    expect(trip).toMatchObject({ title: "Кансай", country: "Япония", period: "3 мар", isPublic: true, cities: [city] })
  })

  it("год новой поездки проверяется: буквы не вводятся, мусор не сохраняется", async () => {
    const user = userEvent.setup()
    const p = open()
    await user.type(screen.getByPlaceholderText("Город, остров, бухта…"), "Кио")
    await user.click(await screen.findByText("Киото, Япония"))
    await user.type(screen.getByPlaceholderText("Название поездки"), "Кансай")
    const year = screen.getByLabelText("Год")
    await user.clear(year)
    await user.type(year, "20x2y99")
    expect(year).toHaveValue("2029")
    expect(screen.getByRole("alert")).toHaveTextContent("Год от 1900")
    expect(screen.getByRole("button", { name: "Добавить место" })).toBeDisabled()
    await user.clear(year)
    await user.type(year, "2024")
    await user.click(screen.getByRole("button", { name: "Добавить место" }))
    expect(p.onAddCity.mock.calls[0][2]).toMatchObject({ year: 2024 })
  })

  it("добавляет в существующую поездку", async () => {
    const user = userEvent.setup()
    const p = open()
    await user.type(screen.getByPlaceholderText("Город, остров, бухта…"), "Кио")
    await user.click(await screen.findByText("Киото, Япония"))
    await user.selectOptions(screen.getByRole("combobox"), "japan-2025")
    await user.click(screen.getByRole("button", { name: "Добавить место" }))
    expect(p.onAddCity.mock.calls[0][1]).toBe("japan-2025")
    expect(p.onAddCity.mock.calls[0][0].date).toBe("—")
  })

  it("страна: отдельный поиск, без режима ссылки, kind=country", async () => {
    const user = userEvent.setup()
    const p = open()
    await user.click(screen.getByRole("button", { name: "Страна" }))
    expect(screen.queryByRole("button", { name: /По ссылке/ })).not.toBeInTheDocument()
    await user.type(screen.getByPlaceholderText("Название страны"), "Фра")
    await user.click(await screen.findByText("Франция", { selector: "span.text-xs" }))
    await user.click(screen.getByRole("button", { name: "Добавить страну" }))
    const [, , trip] = p.onAddCity.mock.calls[0]
    expect(trip).toMatchObject({ kind: "country", title: "Франция", country: "Франция" })
  })

  it("по длинной ссылке: координаты из ссылки, город — обратным геокодингом", async () => {
    const user = userEvent.setup()
    const p = open()
    await user.click(screen.getByRole("button", { name: /По ссылке/ }))
    await user.type(screen.getByPlaceholderText("Ссылка на Google Maps"), "https://www.google.com/maps/@34.9671,135.7727,15z{Enter}")
    expect(await screen.findByText("Фусими, Киото, Япония")).toBeInTheDocument()
    await user.selectOptions(screen.getByRole("combobox"), "japan-2025")
    await user.click(screen.getByRole("button", { name: "Добавить место" }))
    expect(p.onAddCity.mock.calls[0][0]).toMatchObject({ name: "Киото", lat: 34.9671, lng: 135.7727 })
  })

  it("короткую ссылку разворачивает сервер; если не вышло — понятная ошибка", async () => {
    const user = userEvent.setup()
    open()
    await user.click(screen.getByRole("button", { name: /По ссылке/ }))
    resolveLink.mockResolvedValueOnce("https://www.google.com/maps/place/Nara+Park/@34.685,135.843,15z")
    await user.type(screen.getByPlaceholderText("Ссылка на Google Maps"), "https://maps.app.goo.gl/abc")
    await user.click(screen.getByRole("button", { name: "Найти по ссылке" }))
    expect(await screen.findByText("Nara Park")).toBeInTheDocument()
    expect(resolveLink).toHaveBeenCalledWith("https://maps.app.goo.gl/abc")

    await user.click(screen.getByRole("button", { name: "Назад к поиску" }))
    resolveLink.mockRejectedValueOnce(new Error("502"))
    const input = screen.getByPlaceholderText("Ссылка на Google Maps")
    await user.clear(input)
    await user.type(input, "https://maps.app.goo.gl/broken{Enter}")
    expect(await screen.findByText("Не удалось распознать место по этой ссылке.")).toBeInTheDocument()
  })

  it("без ответа геокодера место называется координатами", async () => {
    fetchMock.mockImplementation(async () => { throw new Error("offline") })
    const user = userEvent.setup()
    open()
    await user.click(screen.getByRole("button", { name: /По ссылке/ }))
    await user.type(screen.getByPlaceholderText("Ссылка на Google Maps"), "https://www.google.com/maps/@1.5,2.25,3z{Enter}")
    expect(await screen.findByText("1.5000, 2.2500", { selector: "span.text-lg" })).toBeInTheDocument()
  })

  it("«Ничего не нашлось» и закрытие по Esc", async () => {
    fetchMock.mockImplementation(async () => new Response("[]"))
    const user = userEvent.setup()
    const p = open()
    await user.type(screen.getByPlaceholderText("Город, остров, бухта…"), "zzzz")
    expect(await screen.findByText("Ничего не нашлось")).toBeInTheDocument()
    await user.keyboard("{Escape}")
    expect(p.onClose).toHaveBeenCalled()
  })

  it("одна буква не ищет", async () => {
    const user = userEvent.setup()
    open()
    await user.type(screen.getByPlaceholderText("Город, остров, бухта…"), "К")
    await new Promise((r) => setTimeout(r, 500))
    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled())
  })
})

describe("AddPlace: повторное открытие", () => {
  it("быстро открытый снова лист начинается с чистой формы", async () => {
    const user = userEvent.setup()
    const onAddCity = vi.fn()
    const { rerender } = render(<AddPlace open trips={demoTrips} lang="ru" onClose={vi.fn()} onAddCity={onAddCity} />)
    await user.click(screen.getByRole("button", { name: "Страна" }))
    await user.type(screen.getByPlaceholderText("Название страны"), "Фра")
    await user.click(await screen.findByText("Франция", { selector: "span.text-xs" }))
    // закрыли и сразу открыли, не дожидаясь конца анимации закрытия
    rerender(<AddPlace open={false} trips={demoTrips} lang="ru" onClose={vi.fn()} onAddCity={onAddCity} />)
    rerender(<AddPlace open trips={demoTrips} lang="ru" onClose={vi.fn()} onAddCity={onAddCity} />)
    expect(screen.getByPlaceholderText("Город, остров, бухта…")).toHaveValue("")
    expect(screen.queryByRole("button", { name: "Добавить страну" })).not.toBeInTheDocument()
  })
})
