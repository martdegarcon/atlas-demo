import { isAdmin, requireAdmin } from "@/lib/auth"
import { deleteTrip, getTripById, upsertTrip } from "@/lib/trips-repo"
import { parseTrip } from "@/lib/validate"

export const dynamic = "force-dynamic"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const trip = await getTripById(id, { includePrivate: await isAdmin() })
  return trip ? Response.json({ trip }) : Response.json({ error: "not_found" }, { status: 404 })
}

// Сохранить поездку целиком (создаёт, если её нет — так работает «Отменить» после удаления)
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const { id } = await params
  const trip = parseTrip(await req.json().catch(() => null))
  if (!trip || trip.id !== id) return Response.json({ error: "invalid_trip" }, { status: 400 })
  return Response.json({ trip: await upsertTrip(trip) })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const { id } = await params
  await deleteTrip(id)
  return Response.json({ ok: true })
}
