import { redirect } from "next/navigation"
import { AtlasApp } from "@/components/atlas-app"
import { adminConfigured, isAdmin } from "@/lib/auth"
import { listTrips } from "@/lib/trips-repo"

export const dynamic = "force-dynamic"

// Вход в админку по прямому адресу: /admin сразу открывает окно пароля.
// Уже вошли — отправляем на главную.
export default async function AdminPage() {
  if (await isAdmin()) redirect("/")
  const trips = await listTrips({ includePrivate: false })
  return <AtlasApp initialTrips={trips} isAdmin={false} loginEnabled={adminConfigured()} startWithLogin />
}
