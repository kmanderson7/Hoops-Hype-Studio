import type { Handler } from '@netlify/functions'
import { createRenderJob, setRenderJobDownloads } from './_jobStore'
import { requireHmacNonce, checkRenderConcurrency, setRenderLock } from './_auth'
import { log, captureException } from './_obs'

const { GPU_WORKER_BASE_URL = '', GPU_WORKER_TOKEN = '' } = process.env

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

    // If GPU worker is configured, kick off render immediately and capture outputs
    if (GPU_WORKER_BASE_URL && GPU_WORKER_TOKEN) {
      try {
        const res = await fetch(`${GPU_WORKER_BASE_URL}/render`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${GPU_WORKER_TOKEN}` },
          body: JSON.stringify({
            assetId: body.assetId,
            trackUrl: body.metadata && (body.metadata as any).trackUrl,
            presets: presetIds.map((p) => ({ presetId: p })),
            metadata: body.metadata || {},
          }),
        })
        if (res.ok) {
          const data = await res.json()
          if (data?.outputs) {
            await (setRenderJobDownloads as any)(job.id, data.outputs)
          }
        }
      } catch (e: any) {
        // ignore worker errors; job will still simulate progress
        await captureException(e, { where: 'startRenderJob:worker_render' })
      }
    }

    return { statusCode: 200, body: JSON.stringify({ renderJobId: job.id, jobId: job.id }) }
  } catch (e: any) {
    await captureException(e, { where: 'startRenderJob' })
    return { statusCode: 500, body: JSON.stringify({ title: 'Server error', detail: e?.message || String(e) }) }
  }
}
