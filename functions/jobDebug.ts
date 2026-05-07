import type { Handler } from '@netlify/functions'
import { getRenderJob } from './_jobStore'
import { log, captureException } from './_obs'
import { requireHmacNonce } from './_auth'

/**
 * Admin job-state inspector. Returns the RAW job record (no progress cap, no
 * status massaging) so we can triage stuck/failed renders by jobId without
 * having to grep Logtail.
 *
 * Triage runbook for the Export Suite "98% stall":
 *   1. Read jobId suffix from the UI status line ("Rendering... 98% — abc12345").
 *   2. POST { jobId } here with HMAC headers; inspect the response.
 *   3. ageMs small + status: 'running' + !hasDownloads  → still rendering (UX artifact).
 *   4. ageMs > 12 min + status: 'error' + error: 'modal_timeout'  → Modal exceeding 12-min budget.
 *      Confirm in Logtail that `render_background_modal_call_returned` is missing,
 *      then move investigation to workers/modal/modal_app.py:1166 (perf).
 *   5. status: 'running' between 6–12 min + !hasDownloads  → new headroom doing its job; wait.
 *   6. modal_call_returned present but no set_downloads_done  → Redis write failed
 *      (functions/_jobStore_redis.ts:85 / Upstash availability).
 *   7. status: 'done' + hasDownloads but UI still at 98%  → client polling bug
 *      at apps/web/src/app.tsx:484.
 */
export const handler: Handler = async (evt) => {
  try {
    const guard = await requireHmacNonce({ headers: evt.headers as any, bodyText: evt.body || '' })
    if (guard) return guard
    const body = evt.body ? JSON.parse(evt.body) : undefined
    const query = evt.queryStringParameters || {}
    const jobId = body?.jobId || query.jobId
    if (!jobId) return { statusCode: 400, body: JSON.stringify({ title: 'Invalid input', detail: 'jobId required' }) }

    const job = await (getRenderJob as any)(jobId)
    if (!job) return { statusCode: 404, body: JSON.stringify({ title: 'Not found' }) }

    const hasDownloads = !!(job.downloads && job.downloads.length > 0)
    const ageMs = Date.now() - job.createdAt
    await log({ level: 'info', msg: 'job_debug', jobId, status: job.status, hasDownloads, ageMs })

    return {
      statusCode: 200,
      body: JSON.stringify({
        id: job.id,
        status: job.status,
        assetId: job.assetId,
        trackId: job.trackId,
        presets: job.presets,
        createdAt: job.createdAt,
        durationMs: job.durationMs,
        ageMs,
        hasDownloads,
        downloads: job.downloads,
        error: job.error,
      }),
    }
  } catch (e: any) {
    await captureException(e, { where: 'jobDebug' })
    return { statusCode: 500, body: JSON.stringify({ title: 'Server error', detail: e?.message || String(e) }) }
  }
}
