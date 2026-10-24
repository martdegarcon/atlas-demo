import "@testing-library/jest-dom/vitest"
import { afterEach, vi } from "vitest"
import { cleanup } from "@testing-library/react"

afterEach(() => {
  cleanup()
  localStorage.clear()
})

// jsdom не умеет того, что есть в браузере, — даём безопасные заглушки
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (q: string) => ({ matches: q.includes("dark"), media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
})
HTMLElement.prototype.scrollTo = function () {}
HTMLElement.prototype.setPointerCapture = function () {}
HTMLElement.prototype.releasePointerCapture = function () {}
HTMLElement.prototype.hasPointerCapture = function () { return false }
