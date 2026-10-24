import { isAdmin } from "@/lib/auth"
import { renderCard } from "@/lib/card"
import { getTripById } from "@/lib/trips-repo"

// PNG-карточка поездки 1080×1350 — для отправки в Telegram и сторис.
// Гостям доступна только для публичных поездок.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const trip = await getTripById(id, { includePrivate: await isAdmin() })
  if (!trip) return new Response("Not found", { status: 404 })
  const img = await renderCard(trip, "story")
  const headers = new Headers(img.headers)
  headers.set("cache-control", trip.isPublic ? "public, max-age=300" : "private, no-store")
  headers.set("content-disposition", `inline; filename="atlas-${trip.slug || trip.id}.png"`)
  return new Response(img.body, { headers })
}
