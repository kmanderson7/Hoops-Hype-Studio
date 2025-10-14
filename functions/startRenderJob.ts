import type { Handler } from '@netlify/functions'
import { createRenderJob } from './_jobStore'

export const handler: Handler = async (evt) => {
  try {
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
    const job = createRenderJob({ assetId: body.assetId, trackId: body.trackId, presets: presetIds })
    return { statusCode: 200, body: JSON.stringify({ renderJobId: job.id, jobId: job.id }) }
  } catch (e: any) {
    return { statusCode: 500, body: JSON.stringify({ title: 'Server error', detail: e?.message || String(e) }) }
  }
}
