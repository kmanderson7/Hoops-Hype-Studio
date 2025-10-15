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
    const presetId: string | undefined = body?.presetId
    if (!assetId || !presetId) return { statusCode: 400, body: JSON.stringify({ title: 'Invalid input', detail: 'assetId and presetId required' }) }
    if (!STORAGE_BUCKET || !STORAGE_ACCESS_KEY || !STORAGE_SECRET_KEY) {
      return { statusCode: 500, body: JSON.stringify({ title: 'Storage not configured' }) }
    }
    const key = `exports/${assetId}-${presetId}.mp4`
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
    const res = await fetch(url, { method: 'DELETE' })
    return { statusCode: res.ok ? 200 : res.status, body: JSON.stringify({ deleted: res.ok, key, status: res.status }) }
  } catch (e: any) {
    return { statusCode: 500, body: JSON.stringify({ title: 'Server error', detail: e?.message || String(e) }) }
  }
}

