import { getPhoto } from "@/lib/trips-repo"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[A-Za-z0-9-]{1,64}$/.test(id)) return new Response("Not found", { status: 404 })
  const photo = await getPhoto(id)
  if (!photo) return new Response("Not found", { status: 404 })
  // Фото по id никогда не меняется — пусть браузер и CDN кешируют навсегда
  return new Response(Buffer.from(photo.data), {
    headers: {
      "content-type": photo.mime,
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  })
}
