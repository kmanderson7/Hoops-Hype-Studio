import type { Handler } from '@netlify/functions'
import { requireHmacNonce } from './_auth'

const { GPU_WORKER_BASE_URL = '', GPU_WORKER_TOKEN = '' } = process.env

export const handler: Handler = async (evt) => {
  try {
    const guard = await requireHmacNonce({ headers: evt.headers as any, bodyText: evt.body || '' })
    if (guard) return guard
    const body = evt.body ? JSON.parse(evt.body) : {}
    const trackId = body?.trackId
    const trackUrl = body?.trackUrl || body?.previewUrl
    if (GPU_WORKER_BASE_URL && GPU_WORKER_TOKEN && trackUrl) {
      const res = await fetch(`${GPU_WORKER_BASE_URL}/beats`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${GPU_WORKER_TOKEN}` },
        body: JSON.stringify({ trackUrl }),
      })
      if (!res.ok) return { statusCode: res.status, body: await res.text() }
      const data = await res.json()
      return { statusCode: 200, body: JSON.stringify(data) }
    }
    // Fallback simple grid
    const bpm = 130
    const beatGrid = Array.from({ length: 20 }).map((_, i) => (i * 60) / bpm)
    return { statusCode: 200, body: JSON.stringify({ bpm, beatGrid, trackId }) }
  } catch (e: any) {
    return { statusCode: 500, body: JSON.stringify({ title: 'Server error', detail: e?.message || String(e) }) }
  }
}
