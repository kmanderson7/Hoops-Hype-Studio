import type { Handler } from '@netlify/functions'
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
    const body = evt.body ? JSON.parse(evt.body) : {}
    const assetId: string | undefined = body?.assetId
    if (!assetId) return { statusCode: 400, body: JSON.stringify({ title: 'Invalid input', detail: 'assetId required' }) }
    if (!STORAGE_BUCKET || !STORAGE_ACCESS_KEY || !STORAGE_SECRET_KEY) {
      return { statusCode: 500, body: JSON.stringify({ title: 'Storage not configured' }) }
    }
    const keys = [
      `uploads/${assetId}/`, // folder of original upload(s)
      `proxy/${assetId}.mp4`,
    ]

    // Best-effort deletions (DELETE object and ignore 404s); prefix delete would require list+batch which is out-of-scope here
    const results: { key: string; ok: boolean; status: number }[] = []
    for (const key of keys) {
      // If ends with '/', skip (placeholder for folder); in production you'd list and delete contents
      if (key.endsWith('/')) continue
      const url = presignS3Url({
        method: 'DELETE',
        bucket: STORAGE_BUCKET,
        key,
        region: STORAGE_REGION,
        accessKeyId: STORAGE_ACCESS_KEY,
        secretAccessKey: STORAGE_SECRET_KEY,
        endpoint: STORAGE_ENDPOINT,
        expiresIn: 300,
      })
      try {
        const res = await fetch(url, { method: 'DELETE' })
        results.push({ key, ok: res.ok, status: res.status })
      } catch (e) {
        results.push({ key, ok: false, status: 0 })
      }
    }

    return { statusCode: 200, body: JSON.stringify({ deleted: results }) }
  } catch (e: any) {
    return { statusCode: 500, body: JSON.stringify({ title: 'Server error', detail: e?.message || String(e) }) }
  }
}

