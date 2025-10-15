import type { Handler } from '@netlify/functions'
import { presignS3Url } from './_s3Presign'
import { requireHmacNonce } from './_auth'

const {
  GPU_WORKER_BASE_URL = '',
  GPU_WORKER_TOKEN = '',
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
    const body = JSON.parse(evt.body || '{}') as { assetId?: string; key?: string; md5?: string }
    if (!body.assetId || !body.key) {
      return { statusCode: 400, body: JSON.stringify({ title: 'Invalid input', detail: 'assetId and key required', code: 'UPLOAD_MISSING' }) }
    }
    if (!STORAGE_BUCKET || !STORAGE_ACCESS_KEY || !STORAGE_SECRET_KEY) {
      return { statusCode: 500, body: JSON.stringify({ title: 'Storage not configured' }) }
    }
    if (!GPU_WORKER_BASE_URL || !GPU_WORKER_TOKEN) {
      return { statusCode: 500, body: JSON.stringify({ title: 'Worker not configured' }) }
    }

    // Optional integrity check: if MD5 provided and single-part upload, compare to ETag
    if (body.md5) {
      try {
        const headUrl = presignS3Url({
          method: 'HEAD',
          bucket: STORAGE_BUCKET,
          key: body.key,
          region: STORAGE_REGION,
          accessKeyId: STORAGE_ACCESS_KEY,
          secretAccessKey: STORAGE_SECRET_KEY,
          endpoint: STORAGE_ENDPOINT,
          expiresIn: 300,
        })
        const head = await fetch(headUrl, { method: 'HEAD' })
        const etag = head.headers.get('etag')?.replace(/"/g, '')
        if (etag && etag.length === 32 && etag !== body.md5) {
          return { statusCode: 400, body: JSON.stringify({ title: 'Integrity error', detail: 'MD5_MISMATCH' }) }
        }
      } catch {}
    }

    // Presign GET for source object so worker can download
    const sourceUrl = presignS3Url({
      method: 'GET',
      bucket: STORAGE_BUCKET,
      key: body.key,
      region: STORAGE_REGION,
      accessKeyId: STORAGE_ACCESS_KEY,
      secretAccessKey: STORAGE_SECRET_KEY,
      endpoint: STORAGE_ENDPOINT,
      expiresIn: 900,
    })

    const res = await fetch(`${GPU_WORKER_BASE_URL}/ingest`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${GPU_WORKER_TOKEN}`,
      },
      body: JSON.stringify({ assetId: body.assetId, sourceUrl }),
    })
    if (!res.ok) return { statusCode: res.status, body: await res.text() }
    const data = await res.json()
    return { statusCode: 200, body: JSON.stringify(data) }
  } catch (e: any) {
    return { statusCode: 500, body: JSON.stringify({ title: 'Server error', detail: e?.message || String(e) }) }
  }
}
