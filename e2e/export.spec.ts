import { writeFileSync } from "node:fs"
import { expect, test } from "@playwright/test"
import { expandPanel, login, offline, panel, resetData } from "./helpers"

test.beforeAll(async ({}, info) => resetData(info.project.use.baseURL!))
test.beforeEach(async ({ context }) => offline(context))

test("карточка PNG 1080×1350 на карте открывается в окне «Поделиться»", async ({ page }) => {
  await login(page)
  await page.getByRole("button", { name: /Карта/ }).click()
  await expandPanel(page)
  await panel(page).getByText("Португалия").click()
  await page.getByRole("button", { name: "Поделиться" }).click()
  // карточка собирается в браузере на настоящей карте (а не запасная серверная)
  const img = page.getByRole("dialog").locator('img[data-card="map"]')
  await expect(img).toBeVisible({ timeout: 60_000 })
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth), { timeout: 30_000 }).toBe(1080)
  expect(await img.evaluate((el: HTMLImageElement) => el.naturalHeight)).toBe(1350)
})

// Главная проверка экспорта: видео собирается в настоящем браузере
// (MapLibre + WebCodecs + mp4-muxer) и получается проигрываемый MP4
test("видео-пролёт: собирается настоящий MP4 нужной длины", async ({ page }) => {
  // На обычном компьютере ролик собирается за 20–60 с. В CI без видеокарты WebGL
  // программный и кадр рисуется в разы дольше — даём запас.
  test.setTimeout(600_000)
  await login(page)
  await page.getByRole("button", { name: /Карта/ }).click()
  await expandPanel(page)
  await panel(page).getByText("Турция").click()
  await page.getByRole("button", { name: "Поделиться" }).click()
  const started = Date.now()
  await page.getByRole("button", { name: "Собрать видео" }).click()
  await expect(page.getByText(/\d+%/)).toBeVisible()

  const video = page.getByRole("dialog").locator("video")
  await expect(video).toHaveAttribute("src", /^blob:/, { timeout: 560_000 })
  console.log(`видео собрано за ${Math.round((Date.now() - started) / 1000)} с`)

  const info = await video.evaluate(async (el: HTMLVideoElement) => {
    if (el.readyState < 1) await new Promise((r) => el.addEventListener("loadedmetadata", r, { once: true }))
    const buf = new Uint8Array(await (await fetch(el.src)).arrayBuffer())
    const head = String.fromCharCode(...buf.slice(4, 8))
    return { duration: el.duration, width: el.videoWidth, height: el.videoHeight, size: buf.length, head, error: el.error?.code ?? null }
  })
  expect(info.error).toBeNull()
  // E2E_SAVE_VIDEO=путь — сохранить ролик, чтобы посмотреть глазами
  if (process.env.E2E_SAVE_VIDEO) {
    const b64 = await video.evaluate(async (el: HTMLVideoElement) => {
      const buf = new Uint8Array(await (await fetch(el.src)).arrayBuffer())
      let s = ""
      for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000))
      return btoa(s)
    })
    writeFileSync(process.env.E2E_SAVE_VIDEO, Buffer.from(b64, "base64"))
  }
  expect(info.head).toBe("ftyp") // контейнер MP4
  expect(info.width).toBe(720)
  expect(info.height).toBe(900)
  expect(info.duration).toBeGreaterThan(10)
  expect(info.duration).toBeLessThan(20)
  expect(info.size).toBeGreaterThan(50_000)

  // кадр из середины ролика — не пустой чёрный экран
  const lit = await video.evaluate(async (el: HTMLVideoElement) => {
    el.pause()
    el.currentTime = el.duration * 0.4
    await new Promise((r) => el.addEventListener("seeked", r, { once: true }))
    const c = document.createElement("canvas")
    c.width = el.videoWidth; c.height = el.videoHeight
    const ctx = c.getContext("2d")!
    ctx.drawImage(el, 0, 0)
    const d = ctx.getImageData(0, 0, c.width, c.height).data
    let red = 0, light = 0
    for (let i = 0; i < d.length; i += 4 * 7) {
      if (d[i] > 180 && d[i + 1] < 90 && d[i + 2] < 100) red++ // маршрут и точки акцентного цвета
      if (d[i] > 200 && d[i + 1] > 200 && d[i + 2] > 200) light++ // текст карточки
    }
    return { red, light }
  })
  expect(lit.red).toBeGreaterThan(20)

  // в углу кадра — чистый фон космоса, без шлейфов прошлых кадров
  const corner = await video.evaluate(async (el: HTMLVideoElement) => {
    el.currentTime = 1.0
    await new Promise((r) => el.addEventListener("seeked", r, { once: true }))
    const c = document.createElement("canvas")
    c.width = el.videoWidth; c.height = el.videoHeight
    const ctx = c.getContext("2d")!
    ctx.drawImage(el, 0, 0)
    // полоса у правого края на высоте 60–70% — там нет ни текста, ни глобуса
    const d = ctx.getImageData(c.width - 40, Math.round(c.height * 0.6), 30, Math.round(c.height * 0.1)).data
    let max = 0
    for (let i = 0; i < d.length; i += 4) max = Math.max(max, d[i], d[i + 1], d[i + 2])
    return max
  })
  expect(corner).toBeLessThan(40)
  expect(lit.light).toBeGreaterThan(50)

  await expect(page.getByRole("button", { name: "Собрать заново" })).toBeVisible()
})
