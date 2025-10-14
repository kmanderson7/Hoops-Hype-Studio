import type { Handler } from '@netlify/functions'
import { presignS3Url } from './_s3Presign'

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
    const body = JSON.parse(evt.body || '{}') as { fileName?: string; size?: number; type?: string }
    if (!body.fileName || !body.size || !body.type) {
      return { statusCode: 400, body: JSON.stringify({ title: 'Invalid input', detail: 'fileName, size, type required' }) }
    }

    const fileName = sanitizeFileName(body.fileName)
    const assetId = `asset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const key = `uploads/${assetId}/${fileName}`

    if (!STORAGE_BUCKET || !STORAGE_ACCESS_KEY || !STORAGE_SECRET_KEY) {
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

    return { statusCode: 200, body: JSON.stringify({ assetId, uploadUrl, key }) }
  } catch (e: any) {
    return { statusCode: 500, body: JSON.stringify({ title: 'Server error', detail: e?.message || String(e) }) }
  }
}
