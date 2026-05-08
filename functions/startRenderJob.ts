import type { Handler } from '@netlify/functions'
import { createRenderJob, setRenderJobError } from './_jobStore'
import { requireHmacNonce, checkRenderConcurrency, setRenderLock, clearRenderLock } from './_auth'
import { log, captureException } from './_obs'

const { GPU_WORKER_BASE_URL = '', GPU_WORKER_TOKEN = '', URL: SITE_URL = '' } = process.env

export const handler: Handler = async (evt) => {
  try {
    const guard = await requireHmacNonce({ headers: evt.headers as any, bodyText: evt.body || '' })
    if (guard) return guard

    const body = JSON.parse(evt.body || '{}') as {
      assetId?: string
      trackId?: string
      presets?: { presetId: string }[]
      metadata?: Record<string, unknown>
    }
    const presetIds = (body.presets || []).map((p) => p.presetId).filter(Boolean)
    if (!presetIds.length) {
      return { statusCode: 400, body: JSON.stringify({ title: 'Invalid input', detail: 'presets[] required' }) }
    }
    const ip = (evt.headers['x-forwarded-for'] as string) || ''
    const cc = await checkRenderConcurrency(ip)
    if (cc.blocked) {
      return { statusCode: 429, body: JSON.stringify({ title: 'Too Many Requests', detail: 'RENDER_CONCURRENCY_LIMIT' }) }
    }
    const job = await (createRenderJob as any)({ assetId: body.assetId, trackId: body.trackId, presets: presetIds })
    if (ip) await setRenderLock(ip, job.id, 15 * 60)
    await log({ level: 'info', msg: 'render_job_created', jobId: job.id, presets: presetIds })

    // Hand off the long Modal /render call to a Background Function so this
    // synchronous handler can return jobId in <1s. Background fns get up to
    // 15 minutes of runtime — enough for any reasonable render. The frontend
    // polls getJobStatus and sees downloads appear when Modal completes.
    if (GPU_WORKER_BASE_URL && GPU_WORKER_TOKEN) {
      const origin = SITE_URL || `https://${(evt.headers['host'] as string) || ''}`
      try {
        // Awaiting this is fine — Netlify ACKs background invocations near-instantly
        // (just registers the job, doesn't wait for it to finish). If we DON'T await,
        // the in-flight fetch would be killed when the handler returns.
        const res = await fetch(`${origin}/.netlify/functions/runRender-background`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            jobId: job.id,
            ip,
            assetId: body.assetId,
            trackUrl: body.metadata && (body.metadata as any).trackUrl,
            presets: presetIds.map((p) => ({ presetId: p })),
            metadata: body.metadata || {},
          }),
        })
        if (!res.ok) {
          // Bg fn never registered (host header mismatch, function load failure,
          // deploy in flight, etc.). Mark the job so the user gets immediate
          // feedback instead of staring at 99% for 14 minutes.
          const detail = await res.text().catch(() => '')
          await log({ level: 'error', msg: 'render_bg_kickoff_failed', jobId: job.id, status: res.status, detail: detail.slice(0, 500) })
          await (setRenderJobError as any)(job.id, `kickoff_${res.status}`)
          if (ip) await clearRenderLock(ip)
        }
      } catch (e: any) {
        // Kickoff failed — the bg fn will never run, so release the lock now
        // so the user isn't stuck for 15 minutes on a job that never dispatched.
        if (ip) await clearRenderLock(ip)
        await (setRenderJobError as any)(job.id, 'kickoff_exception').catch(() => {})
        await captureException(e, { where: 'startRenderJob:bg_kickoff' })
      }
    }

    return { statusCode: 200, body: JSON.stringify({ renderJobId: job.id, jobId: job.id }) }
  } catch (e: any) {
    const ip = (evt.headers['x-forwarded-for'] as string) || ''
    if (ip) await clearRenderLock(ip).catch(() => {})
    await captureException(e, { where: 'startRenderJob' })
    return { statusCode: 500, body: JSON.stringify({ title: 'Server error', detail: e?.message || String(e) }) }
  }
}
