import type { Metadata, Viewport } from "next"
import "@fontsource/space-grotesk/300.css"
import "@fontsource/space-grotesk/400.css"
import "@fontsource/space-grotesk/500.css"
import "@fontsource/onest/300.css"
import "@fontsource/onest/400.css"
import "@fontsource/onest/500.css"
import "./globals.css"

// Адрес сайта для превью ссылок (Telegram берёт картинку по полному адресу).
// SITE_URL — свой домен; иначе на Vercel — основной адрес проекта.
function siteUrl(): URL | undefined {
  const raw = process.env.SITE_URL?.trim() || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "")
  try {
    return raw ? new URL(raw) : undefined
  } catch {
    return undefined
  }
}

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: "Атлас",
  description: "Карта поездок: города, маршруты и заметки",
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='14' fill='%230c0b0a' stroke='%23fb2c36' stroke-width='2'/%3E%3Cellipse cx='16' cy='16' rx='6' ry='14' fill='none' stroke='%23fb2c36' stroke-width='1.3'/%3E%3Cline x1='2' y1='16' x2='30' y2='16' stroke='%23fb2c36' stroke-width='1.3'/%3E%3C/svg%3E",
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Android: клавиатура ужимает страницу, а не перекрывает окна
  interactiveWidget: "resizes-content",
  colorScheme: "dark light",
}

// Тема выставляется до первой отрисовки — без вспышки светлого экрана
const themeScript = `try{var t=localStorage.getItem("atlas-theme")||"dark";if(t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){document.documentElement.classList.add("dark")}`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
