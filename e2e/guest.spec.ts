import { expect, test } from "@playwright/test"
import { expandPanel, handle, offline, openApp, panel, sheetIdle, resetData } from "./helpers"

test.beforeAll(async ({}, info) => resetData(info.project.use.baseURL!))
test.beforeEach(async ({ context }) => offline(context))

test("гость видит атлас и карту, но не инструменты правки", async ({ page }) => {
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))
  await openApp(page)
  await expect(page.locator(".maplibregl-canvas")).toBeVisible()
  await expect(page.locator(".atlas-pin")).toHaveCount(11)
  // на самой карте нет плашки с источниками — она перенесена в «Ещё»
  await expect(page.locator(".maplibregl-ctrl-attrib")).toHaveCount(0)
  await expect(panel(page).getByText("Япония")).toBeVisible()
  await expect(page.getByRole("button", { name: "Добавить место" })).toHaveCount(0)
  await expandPanel(page)
  await panel(page).getByText("Португалия").click()
  await expect(panel(page).getByRole("heading", { level: 1 })).toHaveText("Португалия")
  await expect(page.getByRole("button", { name: "Редактировать" })).toHaveCount(0)
  await panel(page).getByText("Лиссабон").click()
  await expect(panel(page).getByText(/Трамвай 28/)).toBeVisible()
  expect(errors).toEqual([])
})

test("клик по точке на карте открывает город", async ({ page }) => {
  await openApp(page)
  await page.locator('.atlas-pin[aria-label="Стамбул"]').dispatchEvent("click")
  await expect(panel(page).getByRole("heading", { level: 1 })).toHaveText("Стамбул")
  await expect(page.locator('.atlas-pin[aria-label="Стамбул"]')).toHaveAttribute("data-state", "selected")
})

test("ссылка на поездку: сразу открыта, с превью для Telegram", async ({ page, request }) => {
  await openApp(page, "/t/turkey-2023?city=goreme")
  await expect(panel(page).getByRole("heading", { level: 1 })).toHaveText("Гёреме")
  const html = await (await request.get("/t/turkey-2023")).text()
  expect(html).toContain('property="og:title" content="Турция — Атлас"')
  const og = html.match(/property="og:image" content="([^"]+)"/)![1]
  const img = await request.get(new URL(og).pathname + new URL(og).search)
  expect(img.headers()["content-type"]).toBe("image/png")
  expect((await request.get("/t/no-such-trip")).status()).toBe(404)
})

test("шторка: тап, свайп и клавиатура", async ({ page }) => {
  await openApp(page)
  const center = async () => {
    const b = (await handle(page).boundingBox())!
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  }
  await expect(handle(page)).toHaveAttribute("aria-expanded", "false")
  // обычные тапы: ручка ездит вместе с панелью, поэтому каждый раз берём её текущее место
  for (const expected of ["true", "false", "true", "false"]) {
    const { x, y } = await center()
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.up()
    await expect(handle(page)).toHaveAttribute("aria-expanded", expected)
    await sheetIdle(page)
  }
  // тап посреди анимации открытия — должен сразу закрыть (регрессия «залипания»)
  {
    const { x, y } = await center()
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.up()
    await page.waitForTimeout(100)
    await handle(page).dispatchEvent("pointerdown", { pointerId: 7, clientY: 400, button: 0 })
    await handle(page).dispatchEvent("pointerup", { pointerId: 7, clientY: 400, button: 0 })
    await expect(handle(page)).toHaveAttribute("aria-expanded", "false")
    await sheetIdle(page)
  }
  const { x, y } = await center()
  // свайп вверх
  const before = (await panel(page).boundingBox())!.height
  await page.mouse.move(x, y); await page.mouse.down()
  await page.mouse.move(x, y - 150, { steps: 6 }); await page.mouse.up()
  await expect(handle(page)).toHaveAttribute("aria-expanded", "true")
  await expect.poll(async () => (await panel(page).boundingBox())!.height).toBeGreaterThan(before + 100)
  await sheetIdle(page) // ручку берём на её окончательном месте
  // свайп вниз
  const b2 = (await handle(page).boundingBox())!
  await page.mouse.move(x, b2.y + 10); await page.mouse.down()
  await page.mouse.move(x, b2.y + 160, { steps: 6 }); await page.mouse.up()
  await expect(handle(page)).toHaveAttribute("aria-expanded", "false")
  // клавиатура
  await handle(page).focus()
  await page.keyboard.press("Enter")
  await expect(handle(page)).toHaveAttribute("aria-expanded", "true")
})

test("быстрый поиск и вкладки", async ({ page }) => {
  await openApp(page)
  await page.getByRole("button", { name: /Найти город/ }).click()
  await page.getByPlaceholder("Найти город или поездку").fill("нар")
  await page.locator(".atlas-sheet").getByRole("button", { name: /Нара/ }).click()
  await expect(panel(page).getByRole("heading", { level: 1 })).toHaveText("Нара")
  await page.getByRole("button", { name: /Поездки/ }).click()
  await expect(panel(page).getByRole("heading", { level: 1 })).toContainText("Поездки")
  await page.getByRole("button", { name: /Заметки/ }).click()
  await expect(panel(page).getByRole("heading", { level: 1 })).toContainText("Заметки(10)")
})

test("тема и язык переживают перезагрузку", async ({ page }) => {
  await openApp(page)
  await page.getByRole("button", { name: /Ещё/ }).click()
  await page.getByRole("button", { name: "Светлая" }).click()
  await page.getByRole("button", { name: "English" }).click()
  await page.reload()
  await page.locator("main[data-hydrated]").waitFor()
  await expect(page.locator("html")).not.toHaveClass(/dark/)
  await expect(page.getByRole("button", { name: /More/ })).toBeVisible()
})

test("API не даёт гостю ничего менять", async ({ request }) => {
  expect((await request.delete("/api/trips/japan-2025")).status()).toBe(401)
  expect((await request.put("/api/trips", { data: { trips: [] } })).status()).toBe(401)
  expect((await request.post("/api/photos", { data: Buffer.from([0xff, 0xd8]), headers: { "content-type": "image/jpeg" } })).status()).toBe(401)
  const list = await (await request.get("/api/trips")).json()
  expect(list.trips).toHaveLength(3)
})
