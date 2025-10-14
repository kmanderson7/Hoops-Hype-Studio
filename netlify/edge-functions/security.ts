export default async (request: Request) => {
  const url = new URL(request.url)
  // Basic rate limiting: 60 req/min per IP (in-memory, best-effort)
  const ip = request.headers.get('x-forwarded-for') || 'unknown'
  const now = Date.now()
  const windowMs = 60_000
  const key = `${ip}:${Math.floor(now / windowMs)}`
  // @ts-ignore - globalThis memory bucket (ephemeral per region/instance)
  const bucket: Map<string, number> = (globalThis as any).__rl || ((globalThis as any).__rl = new Map())
  const count = (bucket.get(key) || 0) + 1
  bucket.set(key, count)
  if (count > 60) {
    return new Response(JSON.stringify({ title: 'Too Many Requests', detail: 'RATE_LIMITED' }), {
      status: 429,
      headers: { 'content-type': 'application/json', 'retry-after': '30' },
    })
  }

  // Optional HMAC validation for admin-only function paths
  const adminPaths = ['/admin']
  if (adminPaths.some((p) => url.pathname.startsWith(p))) {
    const secret = Deno.env.get('EDGE_HMAC_SECRET') || ''
    const signature = request.headers.get('x-signature') || ''
    const timestamp = request.headers.get('x-timestamp') || ''
    const nonce = request.headers.get('x-nonce') || ''
    const skew = Math.abs(Date.now() - Number(timestamp))
    if (!secret || !signature || !timestamp || !nonce || isNaN(Number(timestamp)) || skew > 5 * 60_000) {
      return new Response(JSON.stringify({ title: 'Unauthorized', detail: 'INVALID_SIGNATURE' }), { status: 401, headers: { 'content-type': 'application/json' } })
    }
    const body = await request.clone().text()
    const data = new TextEncoder().encode(body + timestamp + nonce)
    const keyData = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const sig = await crypto.subtle.sign('HMAC', keyData, data)
    const base16 = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('')
    if (base16 !== signature) {
      return new Response(JSON.stringify({ title: 'Unauthorized', detail: 'INVALID_SIGNATURE' }), { status: 401, headers: { 'content-type': 'application/json' } })
    }
  }

  return fetch(request)
}

export const config = {
  path: ["/.netlify/functions/*"],
}

