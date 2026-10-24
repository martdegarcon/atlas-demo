import { cookies } from "next/headers"
import {
  SESSION_COOKIE, adminConfigured, checkPassword, clearLoginAttempts, clientIp,
  createSessionToken, loginBlocked, noteFailedLogin,
} from "@/lib/auth"

export async function POST(req: Request) {
  if (!adminConfigured()) return Response.json({ error: "not_configured" }, { status: 503 })
  const ip = clientIp(req)
  if (loginBlocked(ip)) return Response.json({ error: "too_many_attempts" }, { status: 429 })

  let password = ""
  try {
    const body = await req.json()
    password = typeof body?.password === "string" ? body.password : ""
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 })
  }

  if (!checkPassword(password)) {
    noteFailedLogin(ip)
    // небольшая пауза делает перебор ещё медленнее
    await new Promise((r) => setTimeout(r, 400))
    return Response.json({ error: "wrong_password" }, { status: 401 })
  }

  clearLoginAttempts(ip)
  const { token, maxAge } = createSessionToken()
  const https = req.headers.get("x-forwarded-proto") === "https" || new URL(req.url).protocol === "https:"
  ;(await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: https, path: "/", maxAge })
  return Response.json({ ok: true })
}
