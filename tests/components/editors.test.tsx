import { describe, expect, it, vi } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const uploadPhoto = vi.fn()
const compressImage = vi.fn()
vi.mock("@/lib/api-client", () => ({
  api: { uploadPhoto: (...a: unknown[]) => uploadPhoto(...a) },
  compressImage: (...a: unknown[]) => compressImage(...a),
}))

const { CityForm, EntryForm, Sheet, TripForm, VisibilityToggle } = await import("@/components/editors")
const { makeTrip } = await import("../fixtures")

describe("Sheet", () => {
  it("закрывается по Esc и по фону, но не по клику внутри", async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<Sheet title="Заголовок" lang="ru" onClose={onClose}><button>внутри</button></Sheet>)
    expect(screen.getByRole("dialog", { name: "Заголовок" })).toBeInTheDocument()
    await user.click(screen.getByText("внутри"))
    expect(onClose).not.toHaveBeenCalled()
    await user.keyboard("{Escape}")
    expect(onClose).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole("dialog").parentElement!)
    expect(onClose).toHaveBeenCalledTimes(2)
    await user.click(screen.getByRole("button", { name: "Закрыть" }))
    expect(onClose).toHaveBeenCalledTimes(3)
  })
})

describe("CityForm", () => {
  it("правит название и дату, обрезая пробелы", async () => {
    const onSave = vi.fn()
    const user = userEvent.setup()
    render(<CityForm city={makeTrip().cities[0]} lang="ru" onSave={onSave} onDelete={vi.fn()} />)
    const [name, date] = screen.getAllByRole("textbox")
    expect(name).toHaveValue("Тбилиси")
    await user.clear(name)
    await user.type(name, "  Тифлис ")
    await user.clear(date)
    await user.click(screen.getByRole("button", { name: "Сохранить" }))
    expect(onSave).toHaveBeenCalledWith({ name: "Тифлис", date: "—" })
  })
  it("не даёт сохранить без названия, умеет удалять", async () => {
    const onDelete = vi.fn()
    const user = userEvent.setup()
    render(<CityForm city={makeTrip().cities[0]} lang="ru" onSave={vi.fn()} onDelete={onDelete} />)
    await user.clear(screen.getAllByRole("textbox")[0])
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeDisabled()
    await user.click(screen.getByRole("button", { name: "Удалить место" }))
    expect(onDelete).toHaveBeenCalled()
  })
  it("для страны-отметки пустая дата остаётся пустой", async () => {
    const onSave = vi.fn()
    render(<CityForm city={{ id: "fr", name: "Франция", lat: 46, lng: 2, date: "" }} lang="ru" onSave={onSave} onDelete={vi.fn()} />)
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }))
    expect(onSave).toHaveBeenCalledWith({ name: "Франция", date: "" })
  })
})

describe("TripForm", () => {
  it("меняет порядок городов, видимость и поля", async () => {
    const onSave = vi.fn()
    const user = userEvent.setup()
    render(<TripForm trip={makeTrip()} lang="ru" onSave={onSave} onDelete={vi.fn()} />)
    const list = screen.getByRole("list")
    expect(within(list).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["1Тбилиси", "2Казбеги", "3Батуми"])
    expect(within(list).getAllByRole("button", { name: "Выше" })[0]).toBeDisabled()
    expect(within(list).getAllByRole("button", { name: "Ниже" })[2]).toBeDisabled()
    await user.click(within(list).getAllByRole("button", { name: "Ниже" })[0])
    await user.click(within(list).getAllByRole("button", { name: "Выше" })[2])
    await user.click(screen.getByRole("button", { name: "Только я" }))
    const year = screen.getByDisplayValue("2026")
    await user.clear(year)
    await user.type(year, "abc") // буквы в поле года не попадают
    expect(year).toHaveValue("")
    expect(screen.getByRole("alert")).toHaveTextContent("Укажите год")
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeDisabled()
    await user.type(year, "2025")
    await user.click(screen.getByRole("button", { name: "Сохранить" }))
    const patch = onSave.mock.calls[0][0]
    expect(patch.cities.map((c: { id: string }) => c.id)).toEqual(["kazbegi", "batumi", "tbilisi"])
    expect(patch).toMatchObject({ isPublic: false, year: 2025, title: "Грузия", country: "Грузия" })
  })
  it("год: только четыре цифры в разумных пределах", async () => {
    const onSave = vi.fn()
    const user = userEvent.setup()
    render(<TripForm trip={makeTrip()} lang="ru" onSave={onSave} onDelete={vi.fn()} />)
    const year = screen.getByDisplayValue("2026")
    const save = screen.getByRole("button", { name: "Сохранить" })
    await user.clear(year)
    await user.type(year, "123456")
    expect(year).toHaveValue("1234") // больше четырёх цифр не вводится
    expect(screen.getByRole("alert")).toHaveTextContent(`Год от 1900 до ${new Date().getFullYear() + 1}`)
    expect(year).toHaveAttribute("aria-invalid", "true")
    expect(save).toBeDisabled()
    await user.clear(year)
    await user.type(year, "99")
    expect(screen.getByRole("alert")).toHaveTextContent("Год — четыре цифры")
    await user.clear(year)
    await user.type(year, String(new Date().getFullYear() + 5))
    expect(save).toBeDisabled()
    await user.clear(year)
    await user.type(year, "1999")
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    await user.click(save)
    expect(onSave.mock.calls[0][0].year).toBe(1999)
  })
  it("пустое название и страна не сохраняются", async () => {
    const onSave = vi.fn()
    const user = userEvent.setup()
    render(<TripForm trip={makeTrip()} lang="ru" onSave={onSave} onDelete={vi.fn()} />)
    await user.clear(screen.getByLabelText("Название"))
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeDisabled()
    expect(screen.getByText("Введите название")).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })
  it("у страны-отметки нет периода и порядка городов", () => {
    render(<TripForm trip={makeTrip({ kind: "country", cities: [makeTrip().cities[0]] })} lang="ru" onSave={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.queryByText("Даты поездки")).not.toBeInTheDocument()
    expect(screen.queryByText("Порядок мест")).not.toBeInTheDocument()
  })
  it("переключатель видимости показывает текущее значение", async () => {
    const onChange = vi.fn()
    render(<VisibilityToggle value={false} lang="en" onChange={onChange} />)
    expect(screen.getByRole("button", { name: "Only me" }).className).toContain("glass-capsule")
    await userEvent.click(screen.getByRole("button", { name: "Everyone" }))
    expect(onChange).toHaveBeenCalledWith(true)
  })
})

describe("EntryForm", () => {
  const file = () => new File([new Uint8Array([1, 2, 3])], "a.jpg", { type: "image/jpeg" })

  it("новая заметка: время подставлено, без текста и фото сохранить нельзя", async () => {
    const onSave = vi.fn()
    const user = userEvent.setup()
    render(<EntryForm entry={null} lang="ru" onSave={onSave} onDelete={null} />)
    expect((screen.getAllByRole("textbox")[0] as HTMLInputElement).value).toMatch(/\d{1,2} \S+, \d{2}:\d{2}/)
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeDisabled()
    expect(screen.queryByRole("button", { name: "Удалить заметку" })).not.toBeInTheDocument()
    await user.type(screen.getAllByRole("textbox")[1], "  Хинкали  ")
    await user.click(screen.getByRole("button", { name: "Сохранить" }))
    expect(onSave.mock.calls[0][0]).toMatchObject({ text: "Хинкали", photo: undefined })
    expect(onSave.mock.calls[0][0].id).toMatch(/^[A-Za-z0-9-]+$/)
  })

  it("фото ужимается, загружается на сервер, в заметку идёт ссылка", async () => {
    compressImage.mockResolvedValue(new Blob(["x"], { type: "image/jpeg" }))
    let release!: (v: string) => void
    uploadPhoto.mockReturnValue(new Promise((r) => { release = r }))
    const onSave = vi.fn()
    const user = userEvent.setup()
    const { container } = render(<EntryForm entry={null} lang="ru" onSave={onSave} onDelete={null} />)
    const img = () => container.querySelector("img")
    await user.upload(container.querySelector('input[type="file"]')!, file())
    // пока грузится — кнопка занята, сохранить нельзя
    expect(await screen.findByRole("button", { name: /Загружаю фото/ })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeDisabled()
    release("/api/photos/abc")
    await waitFor(() => expect(img()).toHaveAttribute("src", "/api/photos/abc"))
    await user.click(screen.getByRole("button", { name: "Сохранить" }))
    expect(onSave.mock.calls[0][0].photo).toBe("/api/photos/abc")
  })

  it("ошибка загрузки показывается, фото можно убрать", async () => {
    compressImage.mockRejectedValueOnce(new Error("heic"))
    const user = userEvent.setup()
    const onSave = vi.fn()
    const { container } = render(<EntryForm entry={{ id: "e1", text: "t", photo: "/api/photos/old" }} lang="ru" onSave={onSave} onDelete={vi.fn()} />)
    await user.upload(container.querySelector('input[type="file"]')!, file())
    expect(await screen.findByText(/Не получилось загрузить фото/)).toBeInTheDocument()
    expect(container.querySelector("img")).toHaveAttribute("src", "/api/photos/old")
    await user.click(screen.getByRole("button", { name: "Убрать" }))
    expect(container.querySelector("img")).toBeNull()
    await user.click(screen.getByRole("button", { name: "Сохранить" }))
    expect(onSave).toHaveBeenCalledWith({ id: "e1", text: "t", time: undefined, photo: undefined })
  })

  it("существующую заметку можно удалить", async () => {
    const onDelete = vi.fn()
    render(<EntryForm entry={{ id: "e1", text: "t" }} lang="en" onSave={vi.fn()} onDelete={onDelete} />)
    await userEvent.click(screen.getByRole("button", { name: "Delete note" }))
    expect(onDelete).toHaveBeenCalled()
  })
})
