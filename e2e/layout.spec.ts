import { expect, test } from "@playwright/test"
import { login, offline, openApp, panel, resetData } from "./helpers"

// Раскладка под разные экраны: телефон — шторка; планшет и ноутбук — колонка
// слева; большой экран — ещё и город в отдельной колонке справа.
test.beforeAll(async ({}, info) => resetData(info.project.use.baseURL!))
test.beforeEach(async ({ context }) => offline(context))

const sizes = { tablet: { width: 834, height: 1194 }, laptop: { width: 1366, height: 800 }, wide: { width: 1680, height: 1050 } }

for (const [name, viewport] of Object.entries(sizes)) {
  test.describe(name, () => {
    test.use({ viewport, isMobile: false, hasTouch: false, deviceScaleFactor: 1 })

    test("колонка слева на всю высоту, без ручки шторки", async ({ page }) => {
      await openApp(page)
      const box = (await panel(page).boundingBox())!
      expect(box.x).toBeLessThan(30)
      expect(box.height).toBeGreaterThan(viewport.height - 200)
      expect(box.width).toBeLessThanOrEqual(viewport.width >= 1024 ? 420 : 380)
      await expect(page.getByRole("button", { name: /(Развернуть|Свернуть) панель/ })).toBeHidden()
      // вкладки — в колонке над панелью, а не внизу экрана
      const nav = (await page.getByRole("navigation", { name: "Основная навигация" }).boundingBox())!
      expect(nav.y).toBeLessThan(box.y)
      // список сразу прокручивается — шторку разворачивать не нужно
      await expect(panel(page).getByText("Турция")).toBeVisible()
    })

    test("город: справа отдельная колонка только на широком экране", async ({ page }) => {
      await openApp(page)
      await panel(page).getByText("Япония").click()
      await panel(page).getByText("Киото").click()
      const aside = page.getByRole("region", { name: "Киото" })
      if (name === "wide") {
        await expect(aside).toBeVisible()
        expect((await aside.boundingBox())!.x).toBeGreaterThan(viewport.width - 460)
        await expect(aside.getByText(/Фусими Инари/)).toBeVisible()
        // слева остаётся маршрут поездки с выделенным городом
        await expect(panel(page).getByRole("heading", { level: 1 })).toHaveText("Япония")
        await aside.getByRole("button", { name: "Нара" }).click()
        await expect(page.getByRole("region", { name: "Нара" })).toBeVisible()
        await page.getByRole("region", { name: "Нара" }).getByRole("button", { name: "Закрыть" }).click()
        await expect(page.getByRole("region", { name: "Нара" })).toHaveCount(0)
      } else {
        await expect(aside).toHaveCount(0)
        await expect(panel(page).getByRole("heading", { level: 1 })).toHaveText("Киото")
      }
    })
  })
}

test.describe("окна по центру на большом экране", () => {
  test.use({ viewport: sizes.wide, isMobile: false, hasTouch: false })
  test("окно правки не прилипает к низу", async ({ page }) => {
    await login(page)
    await panel(page).getByText("Португалия").click()
    await page.getByRole("button", { name: "Редактировать" }).click()
    const dlg = (await page.getByRole("dialog").boundingBox())!
    expect(dlg.y).toBeGreaterThan(40)
    expect(dlg.y + dlg.height).toBeLessThan(sizes.wide.height - 40)
    expect(Math.abs(dlg.x + dlg.width / 2 - sizes.wide.width / 2)).toBeLessThan(4)
  })
})
