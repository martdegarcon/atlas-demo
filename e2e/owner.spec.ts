import { readFileSync } from "node:fs"
import { expect, test, type Browser } from "@playwright/test"
import { expandPanel, login, offline, openApp, panel, PASSWORD, PHOTO, ready, resetData } from "./helpers"

// Сценарий владельца целиком, шаг за шагом, на одной базе
test.describe.configure({ mode: "serial" })

async function guestPage(browser: Browser) {
  const ctx = await browser.newContext()
  await offline(ctx)
  return ctx.newPage()
}

test.beforeAll(async ({}, info) => resetData(info.project.use.baseURL!))
test.beforeEach(async ({ context }) => offline(context))

test("вход по адресу /admin и обратно на главную", async ({ page }) => {
  await page.goto("/admin")
  await ready(page)
  await page.getByLabel("Пароль").fill(PASSWORD)
  await Promise.all([page.waitForURL((u) => u.pathname === "/"), page.getByRole("button", { name: "Войти" }).click()])
  await ready(page)
  await expect(page.getByRole("button", { name: "Новое место" })).toBeVisible()
  // уже вошли — /admin сразу ведёт на главную
  await page.goto("/admin")
  await expect(page).toHaveURL(/\/$/)
})

test("неверный пароль не пускает", async ({ page }) => {
  await openApp(page)
  await page.getByRole("button", { name: /Ещё/ }).click()
  await page.getByText("Вход для владельца").click()
  await page.getByLabel("Пароль").fill("wrong")
  await page.getByRole("button", { name: "Войти" }).click()
  await expect(page.getByText("Неверный пароль")).toBeVisible()
})

test("владелец добавляет город в новую скрытую поездку — гость её не видит", async ({ page, browser }) => {
  await login(page)
  await page.getByRole("button", { name: /Карта/ }).click()
  await page.getByRole("button", { name: "Новое место" }).click()
  await page.getByPlaceholder("Город, остров, бухта…").fill("Тбил")
  await page.getByText("Тбилиси, Грузия").first().click()
  await page.getByPlaceholder("Название поездки").fill("Грузия")
  await page.getByPlaceholder(/Дата/).fill("1 мая")
  await page.getByRole("button", { name: "Добавить место" }).click()
  await expect(panel(page).getByRole("heading", { level: 1 })).toHaveText("Тбилиси")

  // делаем поездку скрытой
  await panel(page).getByRole("button", { name: "Назад" }).click()
  await page.getByRole("button", { name: "Редактировать" }).click()
  await page.getByRole("button", { name: "Только я" }).click()
  await page.getByRole("button", { name: "Сохранить" }).click()
  await expect(panel(page).getByText("скрыта")).toBeVisible()

  // после перезагрузки всё на месте — данные на сервере
  await page.reload()
  await ready(page)
  await expandPanel(page)
  await expect(panel(page).getByText("Грузия")).toBeVisible()

  const guest = await guestPage(browser)
  await openApp(guest)
  await expandPanel(guest)
  await expect(panel(guest).getByText("Япония")).toBeVisible()
  await expect(panel(guest).getByText("Грузия")).toHaveCount(0)
  await guest.context().close()
})

test("заметка с фото: загрузка, хранение, показ гостю после публикации", async ({ page, browser }) => {
  await login(page)
  await page.getByRole("button", { name: /Карта/ }).click()
  await expandPanel(page)
  await panel(page).getByText("Грузия").click()
  await panel(page).getByText("Тбилиси").click()
  await panel(page).getByText("Добавить заметку").click()
  await page.locator('input[type="file"][accept="image/*"]').setInputFiles(PHOTO)
  await expect(page.getByRole("dialog").locator("img[data-photo]")).toHaveAttribute("src", /^\/api\/photos\//)
  await page.getByPlaceholder("Что хочется запомнить?").fill("Серные бани и хачапури")
  await page.getByRole("button", { name: "Сохранить" }).click()
  const photo = panel(page).locator('img[data-photo][src^="/api/photos/"]')
  await expect(photo).toBeVisible()
  const src = (await photo.getAttribute("src"))!
  // фото реально ужато браузером и лежит на сервере
  const res = await page.request.get(src)
  expect(res.headers()["content-type"]).toBe("image/jpeg")
  expect(res.headers()["cache-control"]).toContain("immutable")

  // публикуем через окно «Поделиться»
  await panel(page).getByRole("button", { name: "Назад" }).click()
  await page.getByRole("button", { name: "Поделиться" }).click()
  await page.getByRole("button", { name: "Открыть доступ всем" }).click()
  const link = page.getByText(/\/t\/gruziya-\d{4}$/)
  await expect(link).toBeVisible()
  const url = (await link.textContent())!

  const guest = await guestPage(browser)
  await openApp(guest, new URL(url).pathname)
  await expect(panel(guest).getByRole("heading", { level: 1 })).toHaveText("Грузия")
  await panel(guest).getByText("Тбилиси").click()
  await expect(panel(guest).getByText("Серные бани и хачапури")).toBeVisible()
  await expect(panel(guest).locator(`img[data-photo][src="${src}"]`)).toBeVisible()
  await expect(guest.getByRole("button", { name: "Редактировать" })).toHaveCount(0)
  await guest.context().close()
})

test("удаление поездки и «Отменить» — переживают перезагрузку", async ({ page }) => {
  await login(page)
  await page.getByRole("button", { name: /Карта/ }).click()
  await expandPanel(page)
  await panel(page).getByText("Турция").click()
  await page.getByRole("button", { name: "Редактировать" }).click()
  await page.getByRole("button", { name: "Удалить поездку" }).click()
  await expect(panel(page).getByText("Турция")).toHaveCount(0)
  await page.getByRole("button", { name: "Отменить" }).click()
  await expect(panel(page).getByText("Турция")).toBeVisible()
  await page.waitForTimeout(500)
  await page.reload()
  await ready(page)
  await expandPanel(page)
  await expect(panel(page).getByText("Турция")).toBeVisible()
})

test("страна-отметка и бэкап", async ({ page }) => {
  await login(page)
  await page.getByRole("button", { name: /Карта/ }).click()
  await page.getByRole("button", { name: "Новое место" }).click()
  await page.getByRole("button", { name: "Страна" }).click()
  await page.getByPlaceholder("Название страны").fill("Арм")
  await page.getByText("Армения").first().click()
  await page.getByRole("button", { name: "Добавить страну" }).click()
  await expect(panel(page).getByRole("heading", { level: 1 })).toHaveText("Армения")

  await page.getByRole("button", { name: /Ещё/ }).click()
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByText("Скачать бэкап").click()])
  const backup = JSON.parse(readFileSync((await download.path())!, "utf8"))
  expect(backup.trips.map((t: { title: string }) => t.title)).toEqual(expect.arrayContaining(["Армения", "Грузия", "Япония"]))
  expect(backup.trips.find((t: { title: string }) => t.title === "Армения").kind).toBe("country")
})

test("выход возвращает в публичный режим", async ({ page }) => {
  await login(page)
  await page.getByRole("button", { name: /Ещё/ }).click()
  await expect(page.getByText("Вы вошли как владелец")).toBeVisible()
  await Promise.all([page.waitForEvent("load"), page.getByRole("button", { name: "Выйти" }).click()])
  await ready(page)
  // страница перезагружается уже без прав: «+» исчез, во «Ещё» снова кнопка входа
  await expect(page.getByRole("button", { name: "Новое место" })).toHaveCount(0)
  await page.getByRole("button", { name: /Ещё/ }).click()
  await expect(page.getByText("Вход для владельца")).toBeVisible()
  // и API больше не принимает изменения от этого браузера
  expect((await page.request.put("/api/trips", { data: { trips: [] } })).status()).toBe(401)
  expect(PASSWORD).toBeTruthy()
})
