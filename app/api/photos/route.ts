import { requireAdmin } from "@/lib/auth"
import { insertPhoto } from "@/lib/trips-repo"
import { newId } from "@/lib/types"

const MAX_BYTES = 4 * 1024 * 1024
const TYPES = ["image/jpeg", "image/png", "image/webp"]

// Загрузка фото: тело запроса — сам файл (клиент заранее ужимает его до ~1600px).
// Храним прямо в Postgres — никаких отдельных хранилищ настраивать не нужно.
export async function POST(req: Request) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  const type = (req.headers.get("content-type") || "").split(";")[0].trim()
  if (!TYPES.includes(type)) return Response.json({ error: "unsupported_type" }, { status: 415 })
  const buf = new Uint8Array(await req.arrayBuffer())
  if (!buf.length || buf.length > MAX_BYTES) return Response.json({ error: "too_large" }, { status: 413 })
  // проверяем сигнатуру файла, а не только заголовок
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8
  const isPng = buf[0] === 0x89 && buf[1] === 0x50
  const isWebp = buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  if (!isJpeg && !isPng && !isWebp) return Response.json({ error: "not_an_image" }, { status: 415 })
  const id = newId()
  await insertPhoto(id, type, buf)
  return Response.json({ url: `/api/photos/${id}` })
}
