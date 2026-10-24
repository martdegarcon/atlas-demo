import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // PGlite (встроенный Postgres для локального запуска) тянет wasm-файлы —
  // его не бандлим, а грузим как обычный node-пакет
  serverExternalPackages: ["@electric-sql/pglite"],
  // Шрифты для карточек читаются с диска во время запроса — явно кладём их
  // в серверную сборку, иначе на Vercel их не будет
  outputFileTracingIncludes: {
    "/api/trips/[id]/card": ["./assets/fonts/**"],
    "/t/[slug]/opengraph-image": ["./assets/fonts/**"],
  },
  images: { unoptimized: true },
}

export default nextConfig
