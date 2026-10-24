import { renderCard } from "@/lib/card"
import { getTripBySlug } from "@/lib/trips-repo"

export const alt = "Поездка в Атласе"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

// Превью ссылки в Telegram и мессенджерах — только для публичных поездок
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const trip = await getTripBySlug(slug, { includePrivate: false })
  if (!trip) {
    return renderCard({ id: "x", title: "Атлас", country: "", year: new Date().getFullYear(), period: "", isPublic: true, cities: [{ id: "a", name: "—", lat: 0, lng: 0, date: "" }] }, "og")
  }
  return renderCard(trip, "og")
}
