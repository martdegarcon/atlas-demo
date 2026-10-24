import { AtlasApp } from "@/components/atlas-app"
import { adminConfigured, isAdmin } from "@/lib/auth"
import { listTrips } from "@/lib/trips-repo"

export const dynamic = "force-dynamic"

// Главная: гость видит только публичные поездки, владелец — все и может править
export default async function Home() {
  const admin = await isAdmin()
  const trips = await listTrips({ includePrivate: admin })
  return <AtlasApp initialTrips={trips} isAdmin={admin} loginEnabled={adminConfigured()} />
}
