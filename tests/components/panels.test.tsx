import { describe, expect, it, vi } from "vitest"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MapPanel, MorePanel, NotesPanel, TripsPanel } from "@/components/panels"
import { demoTrips } from "@/lib/demo-data"
import type { Trip } from "@/lib/types"
import { makeTrip } from "../fixtures"

const trips: Trip[] = [makeTrip({ isPublic: false }), ...demoTrips]

function mapPanel(over: Partial<Parameters<typeof MapPanel>[0]> = {}) {
  const props = {
    open: true, trips, activeCountry: null, activeTripId: null, selectedCityId: null, lang: "ru" as const, canEdit: false,
    onSelectTrip: vi.fn(), onSelectCity: vi.fn(), onBack: vi.fn(), onShare: vi.fn(), onEditCity: vi.fn(),
    onEditTrip: vi.fn(), onAddEntry: vi.fn(), onEditEntry: vi.fn(), ...over,
  }
  render(<MapPanel {...props} />)
  return props
}

describe("MapPanel — уровни фокуса", () => {
  it("мир: статистика, список поездок, бейдж скрытой", () => {
    mapPanel()
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Атлас(4)")
    expect(screen.getByText("4 страны")).toBeInTheDocument()
    expect(screen.getByText("14 городов")).toBeInTheDocument()
    expect(screen.getAllByText("скрыта")).toHaveLength(1)
  })
  it("страна: поездки страны с таймлайном", async () => {
    const p = mapPanel({ activeCountry: "Япония" })
    expect(screen.getByText("1 поездка · 6 городов")).toBeInTheDocument()
    await userEvent.click(screen.getByText("Киото"))
    expect(p.onSelectCity).toHaveBeenCalledWith("kyoto")
    await userEvent.click(screen.getByRole("button", { name: "Назад" }))
    expect(p.onBack).toHaveBeenCalled()
  })
  it("город: заметки и переход к следующему", async () => {
    const p = mapPanel({ activeCountry: "Япония", activeTripId: "japan-2025", selectedCityId: "kyoto" })
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Киото")
    expect(screen.getByText(/Фусими Инари/)).toBeInTheDocument()
    await userEvent.click(screen.getByText("Нара"))
    expect(p.onSelectCity).toHaveBeenCalledWith("nara")
  })
  it("город без заметок", () => {
    mapPanel({ activeCountry: "Португалия", activeTripId: "portugal-2024", selectedCityId: "porto" })
    expect(screen.getByText("Заметок про этот город пока нет.")).toBeInTheDocument()
  })
})

describe("MapPanel — права", () => {
  it("гость: нет карандашей и «Добавить заметку», поделиться — только публичным", () => {
    mapPanel({ activeCountry: "Япония", activeTripId: "japan-2025", selectedCityId: "tokyo" })
    expect(screen.queryByRole("button", { name: "Редактировать" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Изменить заметку" })).not.toBeInTheDocument()
    expect(screen.queryByText("Добавить заметку")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Поделиться" })).toBeInTheDocument()
  })
  it("гость не может поделиться скрытой поездкой", () => {
    mapPanel({ activeCountry: "Грузия", activeTripId: "georgia" })
    expect(screen.queryByRole("button", { name: "Поделиться" })).not.toBeInTheDocument()
  })
  it("владелец: правка поездки, города, заметок", async () => {
    const user = userEvent.setup()
    const trip = mapPanel({ canEdit: true, activeCountry: "Грузия", activeTripId: "georgia" })
    await user.click(screen.getByRole("button", { name: "Редактировать" }))
    expect(trip.onEditTrip).toHaveBeenCalledWith("georgia")
    await user.click(screen.getByRole("button", { name: "Поделиться" }))
    expect(trip.onShare).toHaveBeenCalledWith("georgia", null)
  })
  it("владелец на городе", async () => {
    const user = userEvent.setup()
    const p = mapPanel({ canEdit: true, activeCountry: "Грузия", activeTripId: "georgia", selectedCityId: "tbilisi" })
    await user.click(screen.getByRole("button", { name: "Редактировать" }))
    expect(p.onEditCity).toHaveBeenCalledWith("tbilisi")
    await user.click(screen.getByRole("button", { name: "Изменить заметку" }))
    expect(p.onEditEntry).toHaveBeenCalledWith("tbilisi", "tb-1")
    await user.click(screen.getByText("Добавить заметку"))
    expect(p.onAddEntry).toHaveBeenCalledWith("tbilisi")
    await user.click(screen.getByRole("button", { name: "Поделиться" }))
    expect(p.onShare).toHaveBeenCalledWith("georgia", "tbilisi")
  })
  it("пустой атлас: разные подсказки гостю и владельцу", () => {
    const { unmount } = render(<MapPanel {...{ open: true, trips: [], activeCountry: null, activeTripId: null, selectedCityId: null, lang: "ru", canEdit: true, onSelectTrip: vi.fn(), onSelectCity: vi.fn(), onBack: vi.fn(), onShare: vi.fn(), onEditCity: vi.fn(), onEditTrip: vi.fn(), onAddEntry: vi.fn(), onEditEntry: vi.fn() }} />)
    expect(screen.getByText(/Нажмите «\+»/)).toBeInTheDocument()
    unmount()
    mapPanel({ trips: [] })
    expect(screen.getByText("Здесь пока ничего нет.")).toBeInTheDocument()
  })
  it("английский интерфейс", () => {
    mapPanel({ lang: "en" })
    expect(screen.getByText("4 countries")).toBeInTheDocument()
    expect(screen.getByText("hidden")).toBeInTheDocument()
  })
})

describe("TripsPanel / NotesPanel", () => {
  it("поездки с обложкой и тегом городов", async () => {
    const onSelect = vi.fn()
    render(<TripsPanel trips={trips} lang="ru" onSelectTrip={onSelect} />)
    expect(screen.getByText("6 городов")).toBeInTheDocument()
    expect(screen.getByText("2 города")).toBeInTheDocument()
    await userEvent.click(screen.getByText("Португалия"))
    expect(onSelect).toHaveBeenCalledWith("portugal-2024")
  })
  it("пусто", () => {
    render(<TripsPanel trips={[]} lang="ru" onSelectTrip={vi.fn()} />)
    expect(screen.getByText("Поездок пока нет.")).toBeInTheDocument()
  })
  it("все заметки одним списком", async () => {
    const onSelect = vi.fn()
    render(<NotesPanel trips={trips} lang="ru" onSelectCity={onSelect} />)
    expect(screen.getByRole("heading")).toHaveTextContent("Заметки(11)")
    // строка с местом ведёт в город
    await userEvent.click(screen.getAllByRole("button", { name: /^Нара · / })[0])
    expect(onSelect).toHaveBeenCalledWith("nara")
  })
  it("заметка открывается целиком: фото без обрезки, весь текст, листание", async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<NotesPanel trips={trips} lang="ru" onSelectCity={onSelect} />)
    await user.click(screen.getByText(/Олени в парке/))
    const viewer = screen.getByRole("dialog", { name: "Заметка" })
    expect(viewer).toHaveTextContent(/Олени в парке/)
    expect(viewer).toHaveTextContent(/Нара/)
    expect(viewer).toHaveTextContent(/\d+ \/ 11/)
    // листание стрелками и клавишами
    const counter = () => viewer.textContent!.match(/(\d+) \/ 11/)![1]
    const start = Number(counter())
    await user.keyboard("{ArrowRight}")
    expect(Number(counter())).toBe(start + 1)
    await user.click(within(viewer).getByRole("button", { name: "Предыдущая" }))
    expect(Number(counter())).toBe(start)
    // фото — целиком (object-contain), тап — исходный размер
    const withPhoto = trips.flatMap((t) => t.cities.flatMap((c) => c.entries || [])).findIndex((e) => e.photo)
    expect(withPhoto).toBeGreaterThanOrEqual(0)
    await user.keyboard("{Escape}")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    await user.click(screen.getAllByRole("button", { name: "Открыть заметку" })[0])
    const img = screen.getByRole("dialog").querySelector("img")!
    expect(img.className).toContain("object-contain")
    await user.click(img)
    expect(img.className).toContain("max-w-none")
  })
})

describe("MorePanel", () => {
  function more(over: Partial<Parameters<typeof MorePanel>[0]> = {}) {
    const props = {
      trips, lang: "ru" as const, theme: "dark" as const, isAdmin: false, loginEnabled: true,
      onTheme: vi.fn(), onLang: vi.fn(), onLogin: vi.fn(), onLogout: vi.fn(), onExport: vi.fn(), onImport: vi.fn(), ...over,
    }
    const view = render(<MorePanel {...props} />)
    return { props, ...view }
  }

  it("гость: настройки и вход, без раздела «Данные»", async () => {
    const { props } = more()
    expect(screen.getByText("Это публичная версия атласа — только для просмотра.")).toBeInTheDocument()
    expect(screen.queryByText("Данные")).not.toBeInTheDocument()
    await userEvent.click(screen.getByText("Вход для владельца"))
    expect(props.onLogin).toHaveBeenCalled()
    await userEvent.click(screen.getByRole("button", { name: "Светлая" }))
    expect(props.onTheme).toHaveBeenCalledWith("light")
    await userEvent.click(screen.getByRole("button", { name: "English" }))
    expect(props.onLang).toHaveBeenCalledWith("en")
  })
  it("без пароля на сервере кнопки входа нет", () => {
    more({ loginEnabled: false })
    expect(screen.queryByText("Вход для владельца")).not.toBeInTheDocument()
  })
  it("владелец: бэкап и восстановление; удалить всё разом — нельзя", async () => {
    const user = userEvent.setup()
    const { props, container } = more({ isAdmin: true })
    await user.click(screen.getByText("Скачать бэкап"))
    expect(props.onExport).toHaveBeenCalled()
    const file = new File(["{}"], "b.json", { type: "application/json" })
    await user.upload(container.querySelector('input[type="file"]')!, file)
    expect(props.onImport).toHaveBeenCalledWith(file)
    expect(screen.queryByText("Начать с чистого листа")).not.toBeInTheDocument()
    expect(screen.queryByText("Вернуть демо-данные")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Выйти" }))
    expect(props.onLogout).toHaveBeenCalled()
  })
  it("при пустом атласе скачивать бэкап нечего", () => {
    more({ isAdmin: true, trips: [] })
    expect(screen.getByText("Скачать бэкап").closest("button")).toBeDisabled()
  })
  it("статистика", () => {
    more()
    const stats = screen.getByText("поездки").parentElement!.parentElement!
    expect(stats.textContent).toBe("4поездки4страны14города")
  })
})

describe("MorePanel: подписи", () => {
  it("нет ни подписи «Атлас», ни ссылок на поставщиков карты", () => {
    const props = { trips, lang: "ru" as const, theme: "dark" as const, isAdmin: true, loginEnabled: true, onTheme: vi.fn(), onLang: vi.fn(), onLogin: vi.fn(), onLogout: vi.fn(), onExport: vi.fn(), onImport: vi.fn() }
    const { container } = render(<MorePanel {...props} />)
    expect(screen.queryByText("Атлас")).not.toBeInTheDocument()
    expect(container.textContent).not.toMatch(/OpenStreetMap|OpenFreeMap|OpenMapTiles/)
  })
})
