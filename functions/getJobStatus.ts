import type { Handler } from '@netlify/functions'
import { getRenderJobStatus } from './_jobStore'

export const handler: Handler = async (evt) => {
  try {
    const body = evt.body ? JSON.parse(evt.body) : undefined
    const query = evt.queryStringParameters || {}
    const jobId = body?.jobId || query.jobId
    if (!jobId) return { statusCode: 400, body: JSON.stringify({ title: 'Invalid input', detail: 'jobId required' }) }

    const state = getRenderJobStatus(jobId)
    if (!state) return { statusCode: 404, body: JSON.stringify({ title: 'Not found' }) }

    // Overall progress is averaged; payload includes downloads when complete
    const payload = state.downloads ? { downloads: state.downloads } : undefined
    return {
      statusCode: 200,
      body: JSON.stringify({
        status: state.status,
        progress: state.progress,
        eta: state.eta,
        payload,
      }),
    }
  } catch (e: any) {
    return { statusCode: 500, body: JSON.stringify({ title: 'Server error', detail: e?.message || String(e) }) }
  }
}
