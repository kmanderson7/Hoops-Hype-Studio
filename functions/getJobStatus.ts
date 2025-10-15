import type { Handler } from '@netlify/functions'
import { getRenderJobStatus } from './_jobStore'
import { log, captureException } from './_obs'
import { requireHmacNonce } from './_auth'

export const handler: Handler = async (evt) => {
  try {
    const guard = await requireHmacNonce({ headers: evt.headers as any, bodyText: evt.body || '' })
    if (guard) return guard
    const body = evt.body ? JSON.parse(evt.body) : undefined
    const query = evt.queryStringParameters || {}
    const jobId = body?.jobId || query.jobId
    if (!jobId) return { statusCode: 400, body: JSON.stringify({ title: 'Invalid input', detail: 'jobId required' }) }

    const state = await (getRenderJobStatus as any)(jobId)
    if (!state) return { statusCode: 404, body: JSON.stringify({ title: 'Not found' }) }

    // Overall progress is averaged; payload includes downloads when complete
    const payload = state.downloads ? { downloads: state.downloads } : undefined
    await log({ level: 'info', msg: 'job_status', jobId, status: state.status, progress: state.progress })
    return {
      statusCode: 200,
      body: JSON.stringify({
        status: state.status,
        progress: state.progress,
        eta: state.eta,
        presets: state.presets,
        payload,
      }),
    }
  } catch (e: any) {
    await captureException(e, { where: 'getJobStatus' })
    return { statusCode: 500, body: JSON.stringify({ title: 'Server error', detail: e?.message || String(e) }) }
  }
}
