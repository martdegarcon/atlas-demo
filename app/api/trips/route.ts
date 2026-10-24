import { isAdmin, requireAdmin } from "@/lib/auth"
import { listTrips, replaceAllTrips, upsertTrip } from "@/lib/trips-repo"
import { parseBulk, parseTrip } from "@/lib/validate"

export const dynamic = "force-dynamic"

// Список поездок: гостю — только публичные, владельцу — все
export async function GET() {
  const trips = await listTrips({ includePrivate: await isAdmin() })
  return Response.json({ trips })
}

// Новая поездка
export async function POST(req: Request) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const trip = parseTrip(await req.json().catch(() => null))
  if (!trip) return Response.json({ error: "invalid_trip" }, { status: 400 })
  return Response.json({ trip: await upsertTrip(trip) })
}

// Замена всего набора: импорт бэкапа, сброс к демо, «начать с чистого листа»
export async function PUT(req: Request) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const trips = parseBulk(await req.json().catch(() => null))
  if (!trips) return Response.json({ error: "invalid_trips" }, { status: 400 })
  return Response.json({ trips: await replaceAllTrips(trips) })
}
