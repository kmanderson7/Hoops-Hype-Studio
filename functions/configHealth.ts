import type { Handler } from '@netlify/functions'
import { log, captureException } from './_obs'
import { requireHmacNonce } from './_auth'

/**
 * Reports presence of every server env var the render pipeline depends on.
 * Returns booleans only — never the values themselves. The frontend renders
 * these as a ✓/✗ checklist in the Export panel so users without Netlify
 * dashboard access can diagnose "every render stalls at 98%" themselves.
 *
 * The classic 98%-stall failure modes this surfaces:
 *   - hasRedis: false        → in-memory job store loses writes across
 *                              Netlify containers; bg fn writes downloads
 *                              the polling fn never sees.
 *   - hasGpuWorker: false    → bg fn never kicks off; no Modal call ever made.
 *   - hasStorage: false      → Modal renders but R2 upload fails.
 *   - hasHmacSecret: false   → edge function rejects every API call as 401.
 */
export const handler: Handler = async (evt) => {
  try {
    const guard = await requireHmacNonce({ headers: evt.headers as any, bodyText: evt.body || '' })
    if (guard) return guard

    const hasGpuWorker = !!(process.env.GPU_WORKER_BASE_URL && process.env.GPU_WORKER_TOKEN)
    const hasRedis = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
    const hasStorage = !!(
      process.env.STORAGE_BUCKET &&
      process.env.STORAGE_ACCESS_KEY &&
      process.env.STORAGE_SECRET_KEY
    )
    const hasHmacSecret = !!process.env.EDGE_HMAC_SECRET
    const hasOpenAi = !!process.env.OPENAI_API_KEY
    const hasMusicApi = !!process.env.MUSIC_API_KEY
    const hasLogtail = !!process.env.LOGTAIL_TOKEN

    // `ok` is the minimum viable production set. Renders cannot succeed
    // without all four — Redis (cross-container state), GPU worker (Modal),
    // storage (S3 upload target), HMAC (request auth).
    const ok = hasGpuWorker && hasRedis && hasStorage && hasHmacSecret

    await log({ level: 'info', msg: 'config_health', ok, hasGpuWorker, hasRedis, hasStorage, hasHmacSecret })

    return {
      statusCode: 200,
      body: JSON.stringify({ ok, hasGpuWorker, hasRedis, hasStorage, hasHmacSecret, hasOpenAi, hasMusicApi, hasLogtail }),
    }
  } catch (e: any) {
    await captureException(e, { where: 'configHealth' })
    return { statusCode: 500, body: JSON.stringify({ title: 'Server error', detail: e?.message || String(e) }) }
  }
}
