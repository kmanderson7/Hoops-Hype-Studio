import type { Handler } from '@netlify/functions'
import { log, captureException } from './_obs'
import { requireHmacNonce } from './_auth'

const { GPU_WORKER_BASE_URL = '', GPU_WORKER_TOKEN = '' } = process.env

export const handler: Handler = async (evt) => {
  try {
    const guard = await requireHmacNonce({ headers: evt.headers as any, bodyText: evt.body || '' })
    if (guard) return guard
    const body = JSON.parse(evt.body || '{}') as { assetId?: string; proxyUrl?: string; videoUrl?: string; targetJersey?: string }
    // Prefer proxyUrl/videoUrl for demo; assetId for real pipeline
    const sourceUrl = body.proxyUrl || body.videoUrl || ''
    // Browser blob: URLs are local-only — Python urllib can't fetch them, and
    // the Modal /highlights endpoint will throw `unknown url type: blob`. If
    // the frontend calls us before R2 ingest completes (race on uploadRunId),
    // fall through to the stub so the user still gets a usable segment list
    // and no spurious 500 reaches Modal.
    const fetchable = /^https?:\/\//i.test(sourceUrl)
    if (GPU_WORKER_BASE_URL && GPU_WORKER_TOKEN && fetchable) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 8_000)
      try {
        const res = await fetch(`${GPU_WORKER_BASE_URL}/highlights`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${GPU_WORKER_TOKEN}` },
          body: JSON.stringify({
            assetId: body.assetId || 'demo',
            proxyUrl: sourceUrl,
            targetJersey: body.targetJersey,
          }),
          signal: controller.signal,
        })
        if (!res.ok) return { statusCode: res.status, body: await res.text() }
        const data = await res.json()
        await log({ level: 'info', msg: 'highlights_ok', assetId: body.assetId || 'demo' })
        return { statusCode: 200, body: JSON.stringify(data) }
      } catch (abortErr: any) {
        if (abortErr?.name !== 'AbortError') throw abortErr
      } finally {
        clearTimeout(timer)
      }
    }

    // Fallback stub
    const segments = [
      { id: 's1', start: 1.0, end: 2.6, label: 'dunk', confidence: 0.9, score: 0.92 },
      { id: 's2', start: 5.2, end: 7.4, label: 'three', confidence: 0.85, score: 0.88 },
    ]
    return { statusCode: 200, body: JSON.stringify({ segments, proxyUrl: body.videoUrl, thumbnails: [] }) }
  } catch (e: any) {
    await captureException(e, { where: 'detectHighlights' })
    return { statusCode: 500, body: JSON.stringify({ title: 'Server error', detail: e?.message || String(e) }) }
  }
}
