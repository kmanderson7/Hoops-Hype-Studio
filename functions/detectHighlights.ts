import type { Handler } from '@netlify/functions'
import { log, captureException } from './_obs'
import { requireHmacNonce } from './_auth'

const { GPU_WORKER_BASE_URL = '', GPU_WORKER_TOKEN = '' } = process.env

export const handler: Handler = async (evt) => {
  try {
    const guard = await requireHmacNonce({ headers: evt.headers as any, bodyText: evt.body || '' })
    if (guard) return guard
    const body = JSON.parse(evt.body || '{}') as { assetId?: string; proxyUrl?: string; videoUrl?: string }
    // Prefer proxyUrl/videoUrl for demo; assetId for real pipeline
    if (GPU_WORKER_BASE_URL && GPU_WORKER_TOKEN) {
      const res = await fetch(`${GPU_WORKER_BASE_URL}/highlights`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${GPU_WORKER_TOKEN}` },
        body: JSON.stringify({ assetId: body.assetId || 'demo', proxyUrl: body.proxyUrl || body.videoUrl }),
      })
      if (!res.ok) return { statusCode: res.status, body: await res.text() }
      const data = await res.json()
      await log({ level: 'info', msg: 'highlights_ok', assetId: body.assetId || 'demo' })
      return { statusCode: 200, body: JSON.stringify(data) }
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
