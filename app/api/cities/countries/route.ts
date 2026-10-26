import { z } from "zod"
import { requireAdmin } from "@/lib/auth"
import { LIMITS } from "@/lib/limits"
import { setCityCountries } from "@/lib/trips-repo"

export const dynamic = "force-dynamic"

const body = z.object({
  items: z.array(z.object({
    id: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/),
    country: z.string().trim().max(LIMITS.country).optional(),
    countryCode: z.string().regex(/^[a-z]{2}$/),
  })).min(1).max(200),
})

// Фоновый досчёт стран: пишет только страну точки, остальное не трогает
export async function POST(req: Request) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const parsed = body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 })
  return Response.json({ updated: await setCityCountries(parsed.data.items) })
}
