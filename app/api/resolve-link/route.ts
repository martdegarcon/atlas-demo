import { requireAdmin } from "@/lib/auth"

// Короткие ссылки Google Maps (maps.app.goo.gl) браузер развернуть не может —
// нет CORS. Сервер идёт по редиректам вручную и на каждом шаге проверяет,
// что остаётся внутри Google, — так этот маршрут нельзя использовать, чтобы
// заставить сервер сходить на произвольный адрес.
const ALLOWED = ["maps.app.goo.gl", "goo.gl", "google.com", "maps.google.com", "www.google.com", "consent.google.com"]
const allowed = (u: URL) => u.protocol === "https:" && ALLOWED.some((h) => u.hostname === h || u.hostname.endsWith("." + h))

export async function POST(req: Request) {
  const denied = await requireAdmin(req)
  if (denied) return denied
  let url: URL
  try {
    const body = await req.json()
    url = new URL(String(body?.url || ""))
  } catch {
    return Response.json({ error: "bad_url" }, { status: 400 })
  }
  if (!allowed(url)) return Response.json({ error: "unsupported_host" }, { status: 400 })

  try {
    for (let hop = 0; hop < 6; hop++) {
      const res = await fetch(url, {
        redirect: "manual",
        headers: { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" },
        signal: AbortSignal.timeout(6000),
      })
      const loc = res.headers.get("location")
      if (res.status >= 300 && res.status < 400 && loc) {
        const next = new URL(loc, url)
        if (!allowed(next)) return Response.json({ error: "unsupported_host" }, { status: 400 })
        // Европейские сервера Google иногда шлют на страницу согласия —
        // исходный адрес лежит в её параметре continue
        const cont = next.hostname === "consent.google.com" ? next.searchParams.get("continue") : null
        url = cont ? new URL(cont) : next
        if (cont && !allowed(url)) return Response.json({ error: "unsupported_host" }, { status: 400 })
        continue
      }
      return Response.json({ url: url.toString() })
    }
    return Response.json({ url: url.toString() })
  } catch {
    return Response.json({ error: "fetch_failed" }, { status: 502 })
  }
}
