import { createHmac } from 'node:crypto'

const EDGE_HMAC_SECRET = process.env.EDGE_HMAC_SECRET || ''
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || ''
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || ''

interface RedisRestResponse {
  result?: unknown
  error?: string
}

async function redisGet(key: string): Promise<string | null> {
  if (!REDIS_URL || !REDIS_TOKEN) return null
  const res = await fetch(`${REDIS_URL}/GET/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  })
  if (!res.ok) return null
  const j = (await res.json().catch(() => null)) as RedisRestResponse | null
  return j && typeof j.result === 'string' ? j.result : null
}

async function redisSetEx(key: string, val: string, ttlSec: number): Promise<boolean> {
  if (!REDIS_URL || !REDIS_TOKEN) return false
  const res = await fetch(`${REDIS_URL}/SETEX/${encodeURIComponent(key)}/${ttlSec}/${encodeURIComponent(val)}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  })
  return res.ok
}

async function redisDel(key: string): Promise<boolean> {
  if (!REDIS_URL || !REDIS_TOKEN) return false
  const res = await fetch(`${REDIS_URL}/DEL/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  })
  return res.ok
}

function hmacHex(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('hex')
}

/**
 * When HMAC fails: returns a Netlify-shaped 401 response that the handler
 * should `return` directly. When auth is not configured or passes: returns
 * `null` so the handler proceeds.
 */
export async function requireHmacNonce(input: { headers: Record<string, string | undefined>, bodyText: string }): Promise<{ statusCode: number; body: string } | null> {
  if (!EDGE_HMAC_SECRET) return null
  const lower: Record<string, string> = {}
  for (const [k, v] of Object.entries(input.headers || {})) lower[k.toLowerCase()] = (v || '')
  const signature = lower['x-signature'] || ''
  const timestamp = lower['x-timestamp'] || ''
  const nonce = lower['x-nonce'] || ''
  if (!signature || !timestamp || !nonce) {
    return { statusCode: 401, body: JSON.stringify({ title: 'Unauthorized', detail: 'MISSING_HMAC_HEADERS' }) }
  }
  const ts = Number(timestamp)
  if (!Number.isFinite(ts)) {
    return { statusCode: 401, body: JSON.stringify({ title: 'Unauthorized', detail: 'INVALID_TIMESTAMP' }) }
  }
  const skew = Math.abs(Date.now() - ts)
  if (skew > 5 * 60_000) {
    return { statusCode: 401, body: JSON.stringify({ title: 'Unauthorized', detail: 'TIMESTAMP_SKEW' }) }
  }
  // Nonce replay check
  const key = `hmac:nonce:${nonce}`
  const exists = await redisGet(key)
  if (exists) {
    return { statusCode: 401, body: JSON.stringify({ title: 'Unauthorized', detail: 'NONCE_REPLAY' }) }
  }
  const expected = hmacHex(EDGE_HMAC_SECRET, `${input.bodyText}${timestamp}${nonce}`)
  if (expected !== signature) {
    return { statusCode: 401, body: JSON.stringify({ title: 'Unauthorized', detail: 'INVALID_SIGNATURE' }) }
  }
  await redisSetEx(key, '1', 600)
  return null
}

export async function checkRenderConcurrency(ip: string): Promise<{ blocked: boolean; reason?: string }> {
  if (!REDIS_URL || !REDIS_TOKEN) return { blocked: false }
  const key = `render:active:${ip}`
  const out = await redisGet(key)
  if (out) return { blocked: true, reason: 'CONCURRENCY_LIMIT' }
  return { blocked: false }
}

export async function setRenderLock(ip: string, jobId: string, ttlSec = 900) {
  if (!REDIS_URL || !REDIS_TOKEN) return false
  const key = `render:active:${ip}`
  return await redisSetEx(key, jobId, ttlSec)
}

export async function clearRenderLock(ip: string) {
  if (!ip) return false
  return await redisDel(`render:active:${ip}`)
}
