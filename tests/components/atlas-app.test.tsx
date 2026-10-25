import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { Trip } from "@/lib/types"

// Глобус — WebGL, в jsdom его нет: подменяем пустышкой, остальное — настоящее
vi.mock("next/dynamic", () => ({ default: () => () => null }))

class ApiError extends Error {
  constructor(public status: number, public code: string) { super(code) }
}
const api = {
  saveTrip: vi.fn(async (trip: Trip): Promise<Trip> => ({ ...trip, slug: trip.slug || "new-slug", updatedAt: "2026-10-24T00:00:00.000Z" })),
  deleteTrip: vi.fn(async (_id: string) => ({ ok: true })),
  replaceAll: vi.fn(async (trips: Trip[]): Promise<Trip[]> => trips),
  login: vi.fn(async (_password: string): Promise<{ ok: true }> => ({ ok: true })),
  logout: vi.fn(async () => ({ ok: true })),
  resolveLink: vi.fn(),
  uploadPhoto: vi.fn(),
}
vi.mock("@/lib/api-client", () => ({ api, ApiError, compressImage: vi.fn() }))
const reloadPage = vi.fn()
vi.mock("@/lib/browser", () => ({ reloadPage: () => reloadPage() }))

const { AtlasApp } = await import("@/components/atlas-app")
const { demoTrips } = await import("@/lib/demo-data")
const { makeTrip } = await import("../fixtures")

const trips = () => [makeTrip({ slug: "gruziya-2026", isPublic: false }), ...structuredClone(demoTrips)]
const panel = () => screen.getByRole("region", { name: "Мой атлас" })
const handle = () => screen.getByRole("button", { name: /(Развернуть|Свернуть) панель/ })

beforeEach(() => {
  Object.defineProperty(window, "innerHeight", { value: 1000, configurable: true })
})
afterEach(() => vi.clearAllMocks())

describe("гость", () => {
  it("видит атлас, но не инструменты правки", async () => {
    render(<AtlasApp initialTrips={demoTrips} isAdmin={false} loginEnabled />)
    expect(screen.queryByRole("button", { name: "Новое место" })).not.toBeInTheDocument()
    await userEvent.click(within(panel()).getByText("Япония"))
    expect(screen.queryByRole("button", { name: "Редактировать" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Поделиться" })).toBeInTheDocument()
  })
  it("входит через «Ещё»: ошибка пароля, затем успех и перезагрузка", async () => {
    const user = userEvent.setup()
    render(<AtlasApp initialTrips={demoTrips} isAdmin={false} loginEnabled />)
    await user.click(screen.getByRole("button", { name: /Ещё/ }))
    await user.click(screen.getByText("Вход для владельца"))
    api.login.mockRejectedValueOnce(new ApiError(401, "wrong_password"))
    await user.type(screen.getByLabelText("Пароль"), "nope{Enter}")
    expect(await screen.findByText("Неверный пароль")).toBeInTheDocument()
    api.login.mockRejectedValueOnce(new ApiError(429, "too_many_attempts"))
    await user.click(screen.getByRole("button", { name: "Войти" }))
    expect(await screen.findByText(/Слишком много попыток/)).toBeInTheDocument()
    api.login.mockResolvedValueOnce({ ok: true })
    await user.click(screen.getByRole("button", { name: "Войти" }))
    await waitFor(() => expect(reloadPage).toHaveBeenCalled())
  })
})

describe("владелец: правки уходят на сервер", () => {
  it("удаление поездки и «Отменить»", async () => {
    const user = userEvent.setup()
    render(<AtlasApp initialTrips={trips()} isAdmin loginEnabled />)
    await user.click(within(panel()).getByText("Португалия"))
    await user.click(screen.getByRole("button", { name: "Редактировать" }))
    await user.click(screen.getByRole("button", { name: "Удалить поездку" }))
    await waitFor(() => expect(api.deleteTrip).toHaveBeenCalledWith("portugal-2024"))
    expect(within(panel()).queryByText("Португалия")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Отменить" }))
    await waitFor(() => expect(api.saveTrip).toHaveBeenCalledWith(expect.objectContaining({ id: "portugal-2024", cities: expect.any(Array) })))
    expect(within(panel()).getByText("Португалия")).toBeInTheDocument()
  })

  it("правка города сохраняет всю поездку и обновляет экран", async () => {
    const user = userEvent.setup()
    render(<AtlasApp initialTrips={trips()} isAdmin loginEnabled initialTripId="georgia" initialCityId="kazbegi" />)
    expect(within(panel()).getByRole("heading", { level: 1 })).toHaveTextContent("Казбеги")
    await user.click(screen.getByRole("button", { name: "Редактировать" }))
    const name = screen.getByDisplayValue("Казбеги")
    await user.clear(name)
    await user.type(name, "Степанцминда")
    await user.click(screen.getByRole("button", { name: "Сохранить" }))
    await waitFor(() => expect(api.saveTrip).toHaveBeenCalled())
    const saved = api.saveTrip.mock.calls[0][0] as Trip
    expect(saved.id).toBe("georgia")
    expect(saved.cities.map((c) => c.name)).toEqual(["Тбилиси", "Степанцминда", "Батуми"])
    expect(within(panel()).getByRole("heading", { level: 1 })).toHaveTextContent("Степанцминда")
    expect(screen.getByRole("status")).toHaveTextContent("Сохранено")
  })

  it("новая заметка добавляется в город", async () => {
    const user = userEvent.setup()
    render(<AtlasApp initialTrips={trips()} isAdmin loginEnabled initialTripId="georgia" initialCityId="batumi" />)
    await user.click(screen.getByText("Добавить заметку"))
    await user.type(screen.getByPlaceholderText("Что хочется запомнить?"), "Море и ветер")
    await user.click(screen.getByRole("button", { name: "Сохранить" }))
    await waitFor(() => expect(api.saveTrip).toHaveBeenCalled())
    const batumi = (api.saveTrip.mock.calls[0][0] as Trip).cities.find((c) => c.id === "batumi")!
    expect(batumi.entries?.[0].text).toBe("Море и ветер")
    expect(within(panel()).getByText("Море и ветер")).toBeInTheDocument()
  })

  it("ошибка сети откатывает изменение и говорит об этом", async () => {
    api.deleteTrip.mockRejectedValueOnce(new ApiError(500, "boom"))
    const user = userEvent.setup()
    render(<AtlasApp initialTrips={trips()} isAdmin loginEnabled />)
    await user.click(within(panel()).getByText("Турция"))
    await user.click(screen.getByRole("button", { name: "Редактировать" }))
    await user.click(screen.getByRole("button", { name: "Удалить поездку" }))
    expect(await screen.findByText(/Не удалось сохранить/)).toBeInTheDocument()
    expect(within(panel()).getByText("Турция")).toBeInTheDocument()
  })

  it("истёкшая сессия — отдельное сообщение", async () => {
    api.saveTrip.mockRejectedValueOnce(new ApiError(401, "unauthorized"))
    const user = userEvent.setup()
    render(<AtlasApp initialTrips={trips()} isAdmin loginEnabled initialTripId="georgia" />)
    await user.click(screen.getByRole("button", { name: "Редактировать" }))
    await user.click(screen.getByRole("button", { name: "Сохранить" }))
    expect(await screen.findByText("Сессия истекла — войдите снова")).toBeInTheDocument()
  })

  it("сохранения идут строго по очереди", async () => {
    const order: string[] = []
    let releaseFirst!: () => void
    api.saveTrip.mockImplementationOnce(async (t: Trip) => { order.push("start:" + t.title); await new Promise<void>((r) => { releaseFirst = r }); order.push("end:" + t.title); return t })
    api.saveTrip.mockImplementationOnce(async (t: Trip) => { order.push("start:" + t.title); return t })
    const user = userEvent.setup()
    render(<AtlasApp initialTrips={trips()} isAdmin loginEnabled initialTripId="georgia" />)
    for (const title of ["А", "Б"]) {
      await user.click(screen.getByRole("button", { name: "Редактировать" }))
      const input = within(screen.getByRole("dialog")).getAllByRole("textbox")[0] // название поездки
      await user.clear(input)
      await user.type(input, title)
      await user.click(screen.getByRole("button", { name: "Сохранить" }))
    }
    await waitFor(() => expect(order).toEqual(["start:А"]))
    releaseFirst()
    await waitFor(() => expect(order).toEqual(["start:А", "end:А", "start:Б"]))
  })

  it("публикация скрытой поездки из окна «Поделиться»", async () => {
    const user = userEvent.setup()
    render(<AtlasApp initialTrips={trips()} isAdmin loginEnabled initialTripId="georgia" />)
    expect(within(panel()).getByText("скрыта")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Поделиться" }))
    await user.click(screen.getByRole("button", { name: "Открыть доступ всем" }))
    await waitFor(() => expect(api.saveTrip).toHaveBeenCalledWith(expect.objectContaining({ id: "georgia", isPublic: true })))
    expect(await screen.findByText("http://localhost:3000/t/gruziya-2026")).toBeInTheDocument()
  })

  it("импорт бэкапа заменяет набор и отменяется", async () => {
    const user = userEvent.setup()
    const { container } = render(<AtlasApp initialTrips={trips()} isAdmin loginEnabled />)
    await user.click(screen.getByRole("button", { name: /Ещё/ }))
    const backup = new File([JSON.stringify({ trips: [makeTrip({ id: "only", title: "Только эта" })] })], "b.json", { type: "application/json" })
    await user.upload(container.querySelector('input[accept*="json"]')!, backup)
    await waitFor(() => expect(api.replaceAll).toHaveBeenCalledWith([expect.objectContaining({ id: "only" })]))
    await user.click(await screen.findByRole("button", { name: "Отменить" }))
    await waitFor(() => expect(api.replaceAll).toHaveBeenCalledTimes(2))
    expect((api.replaceAll.mock.calls[1][0] as Trip[]).length).toBe(4)
  })

  it("битый бэкап не трогает данные", async () => {
    const user = userEvent.setup()
    const { container } = render(<AtlasApp initialTrips={trips()} isAdmin loginEnabled />)
    await user.click(screen.getByRole("button", { name: /Ещё/ }))
    await user.upload(container.querySelector('input[accept*="json"]')!, new File(["{oops"], "b.json", { type: "application/json" }))
    expect(await screen.findByText("Этот файл не похож на бэкап Атласа")).toBeInTheDocument()
    expect(api.replaceAll).not.toHaveBeenCalled()
  })

  it("выход перезагружает страницу", async () => {
    const user = userEvent.setup()
    render(<AtlasApp initialTrips={trips()} isAdmin loginEnabled />)
    await user.click(screen.getByRole("button", { name: /Ещё/ }))
    await user.click(screen.getByRole("button", { name: "Выйти" }))
    await waitFor(() => expect(reloadPage).toHaveBeenCalled())
    expect(api.logout).toHaveBeenCalled()
  })
})

describe("шторка", () => {
  it("быстрый тап по ручке открывает и закрывает (регрессия «залипания»)", async () => {
    render(<AtlasApp initialTrips={demoTrips} isAdmin={false} loginEnabled />)
    expect(handle()).toHaveAttribute("aria-expanded", "false")
    // pointerdown и pointerup подряд, без ожидания перерисовки между ними
    act(() => {
      fireEvent.pointerDown(handle(), { clientY: 500, pointerId: 1 })
      fireEvent.pointerUp(handle(), { clientY: 500, pointerId: 1 })
    })
    expect(handle()).toHaveAttribute("aria-expanded", "true")
    act(() => {
      fireEvent.pointerDown(handle(), { clientY: 500, pointerId: 1 })
      fireEvent.pointerUp(handle(), { clientY: 501, pointerId: 1 })
    })
    expect(handle()).toHaveAttribute("aria-expanded", "false")
  })
  it("свайп вверх открывает, вниз — закрывает, высота следует за пальцем", () => {
    render(<AtlasApp initialTrips={demoTrips} isAdmin={false} loginEnabled />)
    act(() => { fireEvent.pointerDown(handle(), { clientY: 600, pointerId: 1 }) })
    act(() => { fireEvent.pointerMove(handle(), { clientY: 500, pointerId: 1 }) })
    expect(panel().style.getPropertyValue("--sheet-h")).toBe("312px") // 212 + 100
    act(() => { fireEvent.pointerMove(handle(), { clientY: -2000, pointerId: 1 }) })
    expect(panel().style.getPropertyValue("--sheet-h")).toBe("550px") // не выше открытой высоты
    act(() => { fireEvent.pointerUp(handle(), { clientY: -2000, pointerId: 1 }) })
    expect(handle()).toHaveAttribute("aria-expanded", "true")
    act(() => {
      fireEvent.pointerDown(handle(), { clientY: 300, pointerId: 1 })
      fireEvent.pointerMove(handle(), { clientY: 380, pointerId: 1 })
      fireEvent.pointerUp(handle(), { clientY: 380, pointerId: 1 })
    })
    expect(handle()).toHaveAttribute("aria-expanded", "false")
  })
  it("смахнуть вниз из свёрнутого — панель убирается совсем, вернуть кнопкой или вкладкой", async () => {
    render(<AtlasApp initialTrips={demoTrips} isAdmin={false} loginEnabled />)
    const region = () => document.querySelector<HTMLElement>('section[aria-label="Мой атлас"]')!
    act(() => {
      fireEvent.pointerDown(handle(), { clientY: 600, pointerId: 1 })
      fireEvent.pointerMove(handle(), { clientY: 700, pointerId: 1 })
      fireEvent.pointerUp(handle(), { clientY: 700, pointerId: 1 })
    })
    await waitFor(() => expect(region()).toHaveAttribute("data-sheet", "hidden"))
    expect(region()).toHaveAttribute("aria-hidden", "true")
    // кнопка «Атлас»: тап — вернуть свёрнутой
    const show = screen.getByRole("button", { name: "Показать панель" })
    act(() => {
      fireEvent.pointerDown(show, { clientY: 800, pointerId: 2 })
      fireEvent.pointerUp(show, { clientY: 800, pointerId: 2 })
    })
    await waitFor(() => expect(region()).toHaveAttribute("data-sheet", "closed"))
    expect(screen.queryByRole("button", { name: "Показать панель" })).not.toBeInTheDocument()
    // снова убрать и вернуть вкладкой
    act(() => {
      fireEvent.pointerDown(handle(), { clientY: 600, pointerId: 1 })
      fireEvent.pointerMove(handle(), { clientY: 900, pointerId: 1 })
      fireEvent.pointerUp(handle(), { clientY: 900, pointerId: 1 })
    })
    await waitFor(() => expect(region()).toHaveAttribute("data-sheet", "hidden"))
    await userEvent.click(screen.getByRole("button", { name: /Поездки/ }))
    await waitFor(() => expect(region()).toHaveAttribute("data-sheet", "closed"))
  })
  it("потянуть кнопку «Атлас» вверх — сразу развёрнутая панель", async () => {
    render(<AtlasApp initialTrips={demoTrips} isAdmin={false} loginEnabled />)
    act(() => {
      fireEvent.pointerDown(handle(), { clientY: 600, pointerId: 1 })
      fireEvent.pointerMove(handle(), { clientY: 800, pointerId: 1 })
      fireEvent.pointerUp(handle(), { clientY: 800, pointerId: 1 })
    })
    const show = await screen.findByRole("button", { name: "Показать панель" })
    act(() => {
      fireEvent.pointerDown(show, { clientY: 800, pointerId: 2 })
      fireEvent.pointerUp(show, { clientY: 700, pointerId: 2 })
    })
    await waitFor(() => expect(handle()).toHaveAttribute("aria-expanded", "true"))
  })
  it("лишний pointerup без pointerdown ничего не ломает", () => {
    render(<AtlasApp initialTrips={demoTrips} isAdmin={false} loginEnabled />)
    act(() => { fireEvent.pointerUp(handle(), { clientY: 100 }) })
    expect(handle()).toHaveAttribute("aria-expanded", "false")
  })
  it("с клавиатуры (Enter) тоже переключается", () => {
    render(<AtlasApp initialTrips={demoTrips} isAdmin={false} loginEnabled />)
    act(() => { fireEvent.click(handle(), { detail: 0 }) })
    expect(handle()).toHaveAttribute("aria-expanded", "true")
  })
})

describe("навигация", () => {
  it("ссылка на поездку открывает атлас сразу на ней", () => {
    render(<AtlasApp initialTrips={demoTrips} isAdmin={false} loginEnabled initialTripId="portugal-2024" />)
    expect(within(panel()).getByRole("heading", { level: 1 })).toHaveTextContent("Португалия")
    expect(handle()).toHaveAttribute("aria-expanded", "true")
  })
  it("быстрый поиск находит город и поездку", async () => {
    const user = userEvent.setup()
    render(<AtlasApp initialTrips={demoTrips} isAdmin={false} loginEnabled />)
    await user.click(screen.getByRole("button", { name: /Найти место/ }))
    await user.type(screen.getByPlaceholderText("Найти место или поездку"), "КИО")
    expect(screen.getByText("Киото")).toBeInTheDocument()
    expect(screen.getByText("Токио")).toBeInTheDocument()
    await user.click(screen.getByText("Киото"))
    expect(within(panel()).getByRole("heading", { level: 1 })).toHaveTextContent("Киото")
  })
  it("поиск без результатов и закрытие по Esc", async () => {
    const user = userEvent.setup()
    render(<AtlasApp initialTrips={demoTrips} isAdmin={false} loginEnabled />)
    await user.click(screen.getByRole("button", { name: /Найти место/ }))
    await user.type(screen.getByPlaceholderText("Найти место или поездку"), "Марс")
    expect(screen.getByText("Ничего не нашлось")).toBeInTheDocument()
    await user.keyboard("{Escape}")
    expect(screen.queryByPlaceholderText("Найти место или поездку")).not.toBeInTheDocument()
  })
  it("вкладки и «назад» по уровням", async () => {
    const user = userEvent.setup()
    render(<AtlasApp initialTrips={demoTrips} isAdmin={false} loginEnabled initialTripId="japan-2025" initialCityId="nara" />)
    await user.click(screen.getByRole("button", { name: "Назад" }))
    expect(within(panel()).getByRole("heading", { level: 1 })).toHaveTextContent("Япония")
    await user.click(screen.getByRole("button", { name: "Назад" }))
    await user.click(screen.getByRole("button", { name: "Назад" }))
    expect(within(panel()).getByRole("heading", { level: 1 })).toHaveTextContent("Атлас")
    await user.click(screen.getByRole("button", { name: /Заметки/ }))
    // текст открывает заметку целиком, оттуда — «Показать на карте»
    await user.click(screen.getByText(/Паром через Босфор/))
    const viewer = screen.getByRole("dialog", { name: "Заметка" })
    expect(viewer).toHaveTextContent(/Стамбул/)
    await user.click(within(viewer).getByRole("button", { name: "Показать на карте" }))
    expect(screen.queryByRole("dialog", { name: "Заметка" })).not.toBeInTheDocument()
    expect(within(panel()).getByRole("heading", { level: 1 })).toHaveTextContent("Стамбул")
  })
  it("язык и тема запоминаются", async () => {
    const user = userEvent.setup()
    render(<AtlasApp initialTrips={demoTrips} isAdmin={false} loginEnabled />)
    await user.click(screen.getByRole("button", { name: /Ещё/ }))
    await user.click(screen.getByRole("button", { name: "English" }))
    expect(screen.getByRole("button", { name: /More/ })).toBeInTheDocument()
    expect(localStorage.getItem("atlas-lang")).toBe("en")
    await user.click(screen.getByRole("button", { name: "Light" }))
    expect(document.documentElement.classList.contains("dark")).toBe(false)
    expect(localStorage.getItem("atlas-theme")).toBe("light")
    await user.click(screen.getByRole("button", { name: "Dark" }))
    expect(document.documentElement.classList.contains("dark")).toBe(true)
  })
})

describe("шторка: устойчивость", () => {
  it("тап срабатывает, даже если браузер отказал в захвате указателя", () => {
    const orig = HTMLElement.prototype.setPointerCapture
    HTMLElement.prototype.setPointerCapture = () => { throw new DOMException("No active pointer", "NotFoundError") }
    try {
      render(<AtlasApp initialTrips={demoTrips} isAdmin={false} loginEnabled />)
      act(() => {
        fireEvent.pointerDown(handle(), { clientY: 500, pointerId: 9 })
        fireEvent.pointerUp(handle(), { clientY: 500, pointerId: 9 })
      })
      expect(handle()).toHaveAttribute("aria-expanded", "true")
    } finally {
      HTMLElement.prototype.setPointerCapture = orig
    }
  })
  it("панель сообщает, движется ли она", () => {
    render(<AtlasApp initialTrips={demoTrips} isAdmin={false} loginEnabled />)
    expect(panel()).toHaveAttribute("data-sheet", "closed")
    act(() => { fireEvent.pointerDown(handle(), { clientY: 500, pointerId: 1 }) })
    expect(panel()).toHaveAttribute("data-sheet", "moving")
  })
})

describe("добавление мест владельцем", () => {
  const geo = (url: string) => {
    if (url.includes("featuretype=country")) return [{ place_id: 2, display_name: "Армения", lat: "40.1", lon: "45.0", name: "Армения", address: { country: "Армения" } }]
    return [{ place_id: 1, display_name: "Ереван, Армения", lat: "40.18", lon: "44.51", name: "Ереван", address: { city: "Ереван", country: "Армения" } }]
  }
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(geo(url)))))
  })
  afterEach(() => vi.unstubAllGlobals())

  it("страна-отметка, а потом первый город заменяет отметку", async () => {
    const user = userEvent.setup()
    render(<AtlasApp initialTrips={trips()} isAdmin loginEnabled />)
    await user.click(screen.getByRole("button", { name: "Новое место" }))
    await user.click(screen.getByRole("button", { name: "Страна" }))
    await user.type(screen.getByPlaceholderText("Название страны"), "Арм")
    await user.click(await screen.findByText("Армения", { selector: "span.text-xs" }))
    await user.click(screen.getByRole("button", { name: "Добавить страну" }))
    await waitFor(() => expect(api.saveTrip).toHaveBeenCalledTimes(1))
    const country = api.saveTrip.mock.calls[0][0] as Trip
    expect(country).toMatchObject({ kind: "country", title: "Армения" })
    expect(within(panel()).getByRole("heading", { level: 1 })).toHaveTextContent("Армения")

    await user.click(screen.getByRole("button", { name: "Новое место" }))
    await user.type(await screen.findByPlaceholderText("Город, остров, бухта…"), "Ере")
    await user.click(await screen.findByText("Ереван, Армения"))
    await user.selectOptions(screen.getByRole("combobox"), country.id)
    await user.click(screen.getByRole("button", { name: "Добавить место" }))
    await waitFor(() => expect(api.saveTrip).toHaveBeenCalledTimes(2))
    const updated = api.saveTrip.mock.calls[1][0] as Trip
    expect(updated.kind).toBeUndefined()
    expect(updated.cities.map((c) => c.name)).toEqual(["Ереван"])
  })

  it("город в существующую поездку — в конец маршрута", async () => {
    const user = userEvent.setup()
    render(<AtlasApp initialTrips={trips()} isAdmin loginEnabled />)
    await user.click(screen.getByRole("button", { name: "Новое место" }))
    await user.type(screen.getByPlaceholderText("Город, остров, бухта…"), "Ере")
    await user.click(await screen.findByText("Ереван, Армения"))
    await user.selectOptions(screen.getByRole("combobox"), "georgia")
    await user.click(screen.getByRole("button", { name: "Добавить место" }))
    await waitFor(() => expect(api.saveTrip).toHaveBeenCalled())
    expect((api.saveTrip.mock.calls[0][0] as Trip).cities.map((c) => c.name)).toEqual(["Тбилиси", "Казбеги", "Батуми", "Ереван"])
    expect(within(panel()).getByRole("heading", { level: 1 })).toHaveTextContent("Ереван")
  })

  it("удалить все поездки разом нельзя — ни очисткой, ни сбросом к демо", async () => {
    const user = userEvent.setup()
    render(<AtlasApp initialTrips={trips()} isAdmin loginEnabled />)
    await user.click(screen.getByRole("button", { name: /Ещё/ }))
    expect(screen.queryByText("Начать с чистого листа")).not.toBeInTheDocument()
    expect(screen.queryByText("Вернуть демо-данные")).not.toBeInTheDocument()
    expect(screen.getByText("Скачать бэкап")).toBeInTheDocument()
  })
})

describe("вход по адресу /admin", () => {
  it("сразу открывает окно пароля", () => {
    render(<AtlasApp initialTrips={demoTrips} isAdmin={false} loginEnabled startWithLogin />)
    expect(screen.getByRole("dialog", { name: "Вход" })).toBeInTheDocument()
    expect(screen.getByLabelText("Пароль")).toHaveFocus()
  })
  it("без пароля на сервере объясняет, как включить вход", () => {
    render(<AtlasApp initialTrips={demoTrips} isAdmin={false} loginEnabled={false} startWithLogin />)
    expect(screen.getByText(/задайте на сервере переменную ADMIN_PASSWORD/)).toBeInTheDocument()
    expect(screen.queryByLabelText("Пароль")).not.toBeInTheDocument()
  })
  it("владельцу окно входа не показывается", () => {
    render(<AtlasApp initialTrips={demoTrips} isAdmin loginEnabled startWithLogin />)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })
})
