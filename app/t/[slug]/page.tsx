import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { AtlasApp } from "@/components/atlas-app"
import { adminConfigured, isAdmin } from "@/lib/auth"
import { tripSummary } from "@/lib/card"
import { getTripBySlug, listTrips } from "@/lib/trips-repo"

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ city?: string }> }

// Ссылка на поездку: тот же атлас, но открытый сразу на ней.
// Метаданные дают красивое превью в Telegram (картинка — opengraph-image рядом).
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const trip = await getTripBySlug(slug, { includePrivate: false })
  if (!trip) return { title: "Атлас" }
  const title = `${trip.title} — Атлас`
  const description = `${tripSummary(trip)}. ${trip.cities.map((c) => c.name).join(" → ")}`
  return { title, description, openGraph: { title, description, type: "article" }, twitter: { card: "summary_large_image", title, description } }
}

export default async function TripPage({ params, searchParams }: Props) {
  const { slug } = await params
  const { city } = await searchParams
  const admin = await isAdmin()
  const trip = await getTripBySlug(slug, { includePrivate: admin })
  if (!trip) notFound()
  const trips = await listTrips({ includePrivate: admin })
  const cityId = city && trip.cities.some((c) => c.id === city) ? city : null
  return <AtlasApp initialTrips={trips} isAdmin={admin} loginEnabled={adminConfigured()} initialTripId={trip.id} initialCityId={cityId} />
}
