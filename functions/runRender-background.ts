import type { Handler } from '@netlify/functions'
import { setRenderJobDownloads, setRenderJobError } from './_jobStore'
import { clearRenderLock } from './_auth'
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
  const body = (() => {
    try {
      return JSON.parse(evt.body || '{}') as {
        jobId?: string
        ip?: string
        assetId?: string
        trackUrl?: string
        presets?: { presetId: string }[]
        metadata?: Record<string, unknown>
      }
    } catch {
      return {} as any
    }
  })()
  const ip = body.ip || ''

  try {
    if (!GPU_WORKER_BASE_URL || !GPU_WORKER_TOKEN) {
      await log({ level: 'warn', msg: 'render_background_no_worker' })
      if (body.jobId) await (setRenderJobError as any)(body.jobId, 'no_worker_configured')
      return { statusCode: 200, body: '' }
    }

    if (!body.jobId) {
      await log({ level: 'error', msg: 'render_background_no_job_id' })
      return { statusCode: 200, body: '' }
    }

    await log({ level: 'info', msg: 'render_background_start', jobId: body.jobId })

    // Hard cap on Modal /render. Modal's own @app.function(timeout=900) at
    // workers/modal/modal_app.py:1744 gives the worker 15 min; the broadcast-polish
    // render path (subject tracking + multi-segment ffmpeg + voiceover + multi-preset
    // upload) can legitimately consume several minutes. Sit 3 min under Modal's cap
    // so we abort cleanly with `modal_timeout` before Modal itself times out.
    const RENDER_TIMEOUT_MS = 12 * 60 * 1000
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), RENDER_TIMEOUT_MS)
    let res: Response
    const t0 = Date.now()
    await log({ level: 'info', msg: 'render_background_modal_call_start', jobId: body.jobId, presetCount: (body.presets || []).length, hasTrackUrl: !!body.trackUrl, timeoutMs: RENDER_TIMEOUT_MS })
    try {
      res = await fetch(`${GPU_WORKER_BASE_URL}/render`, {
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
        signal: ac.signal,
      })
    } catch (e: any) {
      const aborted = e?.name === 'AbortError'
      await log({ level: 'error', msg: aborted ? 'render_background_modal_timeout' : 'render_background_fetch_error', jobId: body.jobId, detail: e?.message || String(e), elapsed_ms: Date.now() - t0 })
      await (setRenderJobError as any)(body.jobId, aborted ? 'modal_timeout' : `fetch_${e?.message || 'error'}`)
      return { statusCode: 200, body: '' }
    } finally {
      clearTimeout(timer)
    }
    await log({ level: 'info', msg: 'render_background_modal_call_returned', jobId: body.jobId, status: res.status, ok: res.ok, elapsed_ms: Date.now() - t0 })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      await log({ level: 'error', msg: 'render_background_modal_error', jobId: body.jobId, status: res.status, detail: errText.slice(0, 500) })
      await (setRenderJobError as any)(body.jobId, `modal_${res.status}`)
      return { statusCode: 200, body: '' }
    }

    const data = await res.json().catch(() => null) as { outputs?: { presetId: string; url: string; key?: string }[] } | null
    if (data?.outputs && data.outputs.length > 0) {
      const tWrite = Date.now()
      await log({ level: 'info', msg: 'render_background_set_downloads_start', jobId: body.jobId, count: data.outputs.length })
      try {
        await (setRenderJobDownloads as any)(body.jobId, data.outputs)
      } catch (e: any) {
        await log({ level: 'error', msg: 'render_background_set_downloads_error', jobId: body.jobId, detail: e?.message || String(e), elapsed_ms: Date.now() - tWrite })
        await (setRenderJobError as any)(body.jobId, 'persist_failed')
        return { statusCode: 200, body: '' }
      }
      await log({ level: 'info', msg: 'render_background_set_downloads_done', jobId: body.jobId, count: data.outputs.length, elapsed_ms: Date.now() - tWrite })
      await log({ level: 'info', msg: 'render_background_done', jobId: body.jobId, count: data.outputs.length })
    } else {
      await log({ level: 'warn', msg: 'render_background_no_outputs', jobId: body.jobId })
      await (setRenderJobError as any)(body.jobId, 'no_outputs')
    }
    return { statusCode: 200, body: '' }
  } catch (e: any) {
    await captureException(e, { where: 'runRender-background' })
    if (body.jobId) await (setRenderJobError as any)(body.jobId, e?.message || 'exception').catch(() => {})
    return { statusCode: 200, body: '' }
  } finally {
    // Always release the per-IP render lock so the user can start another
    // render once this one ends — success, Modal failure, or exception.
    if (ip) await clearRenderLock(ip).catch(() => {})
  }
}
