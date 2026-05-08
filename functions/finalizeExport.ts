import type { Handler } from '@netlify/functions'
import { getRenderJob } from './_jobStore'
import { requireHmacNonce } from './_auth'
import { log, captureException } from './_obs'
import { presignS3Url } from './_s3Presign'

const {
  STORAGE_BUCKET = '',
  STORAGE_REGION = 'us-east-1',
  STORAGE_ACCESS_KEY = '',
  STORAGE_SECRET_KEY = '',
  STORAGE_ENDPOINT,
} = process.env

export const handler: Handler = async (evt) => {
  try {
    const guard = await requireHmacNonce({ headers: evt.headers as any, bodyText: evt.body || '' })
    if (guard) return guard
    const body = JSON.parse(evt.body || '{}') as { renderJobId?: string }
    const id = body.renderJobId
    if (!id) return { statusCode: 400, body: JSON.stringify({ title: 'Invalid input', detail: 'renderJobId required' }) }
    const job = await getRenderJob(id)
    if (!job) return { statusCode: 404, body: JSON.stringify({ title: 'Not found' }) }
    if (!job.downloads || job.downloads.length === 0) {
      // Render hasn't completed yet (or worker failed). Don't surface fake URLs.
      return { statusCode: 409, body: JSON.stringify({ title: 'Not ready', detail: 'RENDER_IN_PROGRESS' }) }
    }

    // Re-sign every URL on each call. Modal's original presigned URL has a
    // 1-hour TTL (workers/modal/modal_app.py:1737); after that, S3 returns 403
    // and the DownloadButton at apps/web/src/components/stages/ExportStage.tsx
    // shows "HTTP 403". Re-signing here lets the user come back later and
    // still save the MP4. Falls back to the original URL if Netlify's S3
    // creds aren't configured (e.g. the env vars only live on Modal).
    const canResign = !!(STORAGE_BUCKET && STORAGE_ACCESS_KEY && STORAGE_SECRET_KEY)
    const exp = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    const downloads = (job.downloads as { presetId: string; url: string; expiresAt: string; key?: string }[]).map((d) => {
      // Stored key is preferred; fall back to the standard exports key shape
      // for jobs created before commit added `key` to the schema.
      const key = d.key || (job.assetId ? `exports/${job.assetId}-${d.presetId}.mp4` : undefined)
      if (canResign && key) {
        try {
          const url = presignS3Url({
            method: 'GET',
            bucket: STORAGE_BUCKET,
            key,
            region: STORAGE_REGION,
            accessKeyId: STORAGE_ACCESS_KEY,
            secretAccessKey: STORAGE_SECRET_KEY,
            endpoint: STORAGE_ENDPOINT,
            expiresIn: 3600,
          })
          return { presetId: d.presetId, url, expiresAt: exp, key }
        } catch {
          // Fall through to original URL
        }
      }
      return d
    })
    await log({ level: 'info', msg: 'finalize_export', renderJobId: id, count: downloads.length, resigned: canResign })
    return { statusCode: 200, body: JSON.stringify({ downloads }) }
  } catch (e: any) {
    await captureException(e, { where: 'finalizeExport' })
    return { statusCode: 500, body: JSON.stringify({ title: 'Server error', detail: e?.message || String(e) }) }
  }
}
