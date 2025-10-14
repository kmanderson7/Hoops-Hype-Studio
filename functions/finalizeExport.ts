import type { Handler } from '@netlify/functions'
import { getRenderJob } from './_jobStore'

export const handler: Handler = async (evt) => {
  try {
    const body = JSON.parse(evt.body || '{}') as { renderJobId?: string }
    const id = body.renderJobId
    if (!id) return { statusCode: 400, body: JSON.stringify({ title: 'Invalid input', detail: 'renderJobId required' }) }
    const job = getRenderJob(id)
    if (!job) return { statusCode: 404, body: JSON.stringify({ title: 'Not found' }) }
    const downloads = (job.downloads || job.presets.map((p) => ({
      presetId: p,
      url: `https://example.com/exports/${job.assetId ?? 'asset'}-${p}.mp4`,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })))
    return { statusCode: 200, body: JSON.stringify({ downloads }) }
  } catch (e: any) {
    return { statusCode: 500, body: JSON.stringify({ title: 'Server error', detail: e?.message || String(e) }) }
  }
}
