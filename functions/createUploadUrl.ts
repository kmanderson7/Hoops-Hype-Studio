import type { Handler } from '@netlify/functions'
import { presignS3Url } from './_s3Presign'
import { requireHmacNonce } from './_auth'

const {
  STORAGE_BUCKET = '',
  STORAGE_REGION = 'us-east-1',
  STORAGE_ACCESS_KEY = '',
  STORAGE_SECRET_KEY = '',
  STORAGE_ENDPOINT,
} = process.env

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
}

export const handler: Handler = async (evt) => {
  try {
    const guard = await requireHmacNonce({ headers: evt.headers as any, bodyText: evt.body || '' })
    if (guard) return guard
    const body = JSON.parse(evt.body || '{}') as { fileName?: string; size?: number; type?: string; scope?: 'uploads' | 'logos' }
    if (!body.fileName || !body.size || !body.type) {
      return { statusCode: 400, body: JSON.stringify({ title: 'Invalid input', detail: 'fileName, size, type required' }) }
    }

    const fileName = sanitizeFileName(body.fileName)
    const assetId = `asset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const base = body.scope === 'logos' ? 'logos' : 'uploads'
    const key = `${base}/${assetId}/${fileName}`

    if (!STORAGE_BUCKET || !STORAGE_ACCESS_KEY || !STORAGE_SECRET_KEY) {
      console.log(JSON.stringify({ level: 'info', msg: 'createUploadUrl dev fallback', assetId }))
      // Development fallback
      return { statusCode: 200, body: JSON.stringify({ assetId, uploadUrl: 'https://example.com/put', proxyUrl: undefined }) }
    }

    const uploadUrl = presignS3Url({
      method: 'PUT',
      bucket: STORAGE_BUCKET,
      key,
      region: STORAGE_REGION,
      accessKeyId: STORAGE_ACCESS_KEY,
      secretAccessKey: STORAGE_SECRET_KEY,
      endpoint: STORAGE_ENDPOINT,
      expiresIn: 900,
      contentType: body.type,
    })

    // GET URL on the same key, returned immediately so the frontend can hand
    // a real https:// URL to detectHighlights / detectBeats / recommendMusic
    // without waiting for Modal /ingest's 720p re-encode. Without this, those
    // analysis calls receive a `blob:` URL (the browser preview) which Modal
    // can't fetch — every detection call falls through to its stub branch and
    // the user sees "configure GPU_WORKER_BASE_URL" in the InsightsPanel even
    // though the worker is fully configured. 1-hour expiry covers the entire
    // analysis pipeline with margin.
    const downloadUrl = presignS3Url({
      method: 'GET',
      bucket: STORAGE_BUCKET,
      key,
      region: STORAGE_REGION,
      accessKeyId: STORAGE_ACCESS_KEY,
      secretAccessKey: STORAGE_SECRET_KEY,
      endpoint: STORAGE_ENDPOINT,
      expiresIn: 3600,
    })

    console.log(JSON.stringify({ level: 'info', msg: 'presigned_url_issued', assetId, key }))
    return { statusCode: 200, body: JSON.stringify({ assetId, uploadUrl, downloadUrl, key }) }
  } catch (e: any) {
    console.error(JSON.stringify({ level: 'error', msg: 'createUploadUrl_failed', err: e?.message }))
    return { statusCode: 500, body: JSON.stringify({ title: 'Server error', detail: e?.message || String(e) }) }
  }
}
