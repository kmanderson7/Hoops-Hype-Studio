import type { Handler } from '@netlify/functions'
import { setRenderJobDownloads } from './_jobStore'
import { log, captureException } from './_obs'

const { GPU_WORKER_BASE_URL = '', GPU_WORKER_TOKEN = '' } = process.env

/**
 * Long-running render dispatcher. Runs as a Netlify Background Function
 * (filename suffix `-background`), giving us up to 15 minutes of execution
 * time vs. the 10-second cap on synchronous functions.
 *
 * Fired by `startRenderJob.ts` immediately after creating the job in Redis.
 * This function makes the actual Modal /render call and writes downloads
 * back to the job once Modal returns. The frontend polls getJobStatus and
 * sees the job flip to 'done' when downloads land.
 *
 * Background functions return 202 Accepted immediately to the caller;
 * their response body is ignored. Don't put user-facing data here.
 */
export const handler: Handler = async (evt) => {
  try {
    if (!GPU_WORKER_BASE_URL || !GPU_WORKER_TOKEN) {
      await log({ level: 'warn', msg: 'render_background_no_worker' })
      return { statusCode: 200, body: '' }
    }

    const body = JSON.parse(evt.body || '{}') as {
      jobId?: string
      assetId?: string
      trackUrl?: string
      presets?: { presetId: string }[]
      metadata?: Record<string, unknown>
    }
    if (!body.jobId) {
      await log({ level: 'error', msg: 'render_background_no_job_id' })
      return { statusCode: 200, body: '' }
    }

    await log({ level: 'info', msg: 'render_background_start', jobId: body.jobId })

    // No timeout on this fetch — background functions run up to 15 min,
    // and Modal /render typically completes in 30-180s for typical clips.
    const res = await fetch(`${GPU_WORKER_BASE_URL}/render`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${GPU_WORKER_TOKEN}`,
      },
      body: JSON.stringify({
        assetId: body.assetId,
        trackUrl: body.trackUrl,
        presets: body.presets || [],
        metadata: body.metadata || {},
      }),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      await log({ level: 'error', msg: 'render_background_modal_error', jobId: body.jobId, status: res.status, detail: errText.slice(0, 500) })
      return { statusCode: 200, body: '' }
    }

    const data = await res.json().catch(() => null) as { outputs?: { presetId: string; url: string }[] } | null
    if (data?.outputs && data.outputs.length > 0) {
      await (setRenderJobDownloads as any)(body.jobId, data.outputs)
      await log({ level: 'info', msg: 'render_background_done', jobId: body.jobId, count: data.outputs.length })
    } else {
      await log({ level: 'warn', msg: 'render_background_no_outputs', jobId: body.jobId })
    }
    return { statusCode: 200, body: '' }
  } catch (e: any) {
    await captureException(e, { where: 'runRender-background' })
    return { statusCode: 200, body: '' }
  }
}
