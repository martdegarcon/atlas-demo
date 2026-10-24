import { readFileSync } from "node:fs"
import path from "node:path"
import { expect, request, type BrowserContext, type Page } from "@playwright/test"
import { demoTrips } from "../lib/demo-data"

export const PASSWORD = "e2e-password"
export const PHOTO = path.join(__dirname, "photo.jpg")
const photoBytes = readFileSync(PHOTO)

// Тесты не зависят от интернета: тайлы карты, шрифты карты, фото Unsplash
// и геокодер подменяются локальными ответами
export async function offline(context: BrowserContext) {
  await context.route("https://tiles.openfreemap.org/planet", (r) =>
    r.fulfill({ json: { tilejson: "2.2.0", tiles: ["https://tiles.openfreemap.org/t/{z}/{x}/{y}.pbf"], minzoom: 0, maxzoom: 14 }, headers: { "access-control-allow-origin": "*" } })
  )
  await context.route("https://tiles.openfreemap.org/t/**", (r) => r.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } }))
  await context.route("https://tiles.openfreemap.org/fonts/**", (r) => r.fulfill({ status: 404, headers: { "access-control-allow-origin": "*" } }))
  await context.route("https://images.unsplash.com/**", (r) =>
    r.fulfill({ body: photoBytes, contentType: "image/jpeg", headers: { "access-control-allow-origin": "*" } })
  )
  await context.route("https://nominatim.openstreetmap.org/**", (r) => {
    const url = r.request().url()
    if (url.includes("/reverse")) return r.fulfill({ json: { display_name: "Тбилиси, Грузия", address: { city: "Тбилиси", country: "Грузия" } }, headers: { "access-control-allow-origin": "*" } })
    if (url.includes("featuretype=country")) return r.fulfill({ json: [{ place_id: 9, display_name: "Армения", lat: "40.1", lon: "45.0", name: "Армения", address: { country: "Армения" } }], headers: { "access-control-allow-origin": "*" } })
    return r.fulfill({ json: [{ place_id: 1, display_name: "Тбилиси, Грузия", lat: "41.6934", lon: "44.8015", name: "Тбилиси", address: { city: "Тбилиси", country: "Грузия" } }], headers: { "access-control-allow-origin": "*" } })
  })
}

export const panel = (page: Page) => page.getByRole("region", { name: "Мой атлас" })
export const handle = (page: Page) => page.getByRole("button", { name: /(Развернуть|Свернуть) панель/ })

export async function openApp(page: Page, url = "/") {
  await page.goto(url)
  await ready(page)
}

// Страница не только показана, но и «ожила» — обработчики подключены
export async function ready(page: Page) {
  await expect(page.locator("main[data-hydrated]")).toBeVisible()
}

export async function login(page: Page) {
  await openApp(page)
  await page.getByRole("button", { name: /Ещё/ }).click()
  await page.getByText("Вход для владельца").click()
  await page.getByLabel("Пароль").fill(PASSWORD)
  await Promise.all([page.waitForEvent("load"), page.getByRole("button", { name: "Войти" }).click()])
  await ready(page)
  // после входа страница перезагружается — с правами владельца появляется «+»
  await expect(page.getByRole("button", { name: "Добавить место" })).toBeVisible()
}

export async function expandPanel(page: Page) {
  if ((await handle(page).getAttribute("aria-expanded")) !== "true") await handle(page).click()
  await expect(handle(page)).toHaveAttribute("aria-expanded", "true")
  await sheetIdle(page)
}

// Ждём, пока шторка доедет: пока идёт жест или анимация, у панели data-sheet="moving"
export async function sheetIdle(page: Page) {
  await expect(panel(page)).not.toHaveAttribute("data-sheet", "moving", { timeout: 10_000 })
}

// Перед каждым файлом тестов — исходный набор поездок. Делается через настоящий
// API владельца (вход + замена набора), без тестовых лазеек в приложении.
export async function resetData(baseURL: string) {
  const api = await request.newContext({ baseURL })
  const login = await api.post("/api/auth/login", { data: { password: PASSWORD } })
  expect(login.ok()).toBe(true)
  const res = await api.put("/api/trips", { data: { trips: demoTrips } })
  expect(res.ok()).toBe(true)
  await api.dispose()
}
