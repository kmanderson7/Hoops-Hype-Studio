export default async (request: Request) => {
  const url = new URL(request.url)
  // Token-bucket rate limiting (prefers Upstash Redis; falls back to memory)
  const ip = request.headers.get('x-forwarded-for') || 'unknown'
  const base = (globalThis as any).UPSTASH_REDIS_REST_URL || (Deno.env.get('UPSTASH_REDIS_REST_URL') || '')
  const token = (globalThis as any).UPSTASH_REDIS_REST_TOKEN || (Deno.env.get('UPSTASH_REDIS_REST_TOKEN') || '')
  const limit = Number(Deno.env.get('RATE_LIMIT_TOKENS') || '120') // tokens per window
  const windowSec = Number(Deno.env.get('RATE_LIMIT_WINDOW_SEC') || '60')

  async function redisIncr(key: string, ttlSec: number): Promise<number | null> {
    if (!base || !token) return null
    const url = `${base}/pipeline/${encodeURIComponent('INCR')}/${encodeURIComponent(key)}/${encodeURIComponent('EXPIRE')}/${encodeURIComponent(key)}/${ttlSec}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return null
    const data = await res.json().catch(() => null) as any
    const result = Array.isArray(data?.result) ? data.result[0]?.result : undefined
    return typeof result === 'number' ? result : null
  }

  const windowKey = `rl:${ip}:${Math.floor(Date.now() / (windowSec * 1000))}`
  let count: number | null = await redisIncr(windowKey, windowSec)
  if (count == null) {
    // In-memory fallback per edge isolate
    // @ts-ignore
    const mem: Map<string, { n: number; t: number }> = (globalThis as any).__rl || ((globalThis as any).__rl = new Map())
    const now = Date.now()
    const win = windowSec * 1000
    const rec = mem.get(windowKey)
    if (!rec || now - rec.t > win) {
      mem.set(windowKey, { n: 1, t: now })
      count = 1
    } else {
      rec.n += 1
      count = rec.n
      mem.set(windowKey, rec)
    }
  }
  if ((count || 0) > limit) {
    return new Response(JSON.stringify({ title: 'Too Many Requests', detail: 'RATE_LIMITED' }), {
      status: 429,
      headers: { 'content-type': 'application/json', 'retry-after': String(Math.ceil(windowSec / 4)) },
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
