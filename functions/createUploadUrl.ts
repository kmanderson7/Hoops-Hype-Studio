import type { Handler } from '@netlify/functions'

// NOTE: This is a minimal placeholder. In production, generate a real presigned URL
// using S3/R2 SDKs and return an assetId + uploadUrl (+ optional proxyUrl).
export const handler: Handler = async (evt) => {
  try {
    const body = JSON.parse(evt.body || '{}') as { fileName?: string; size?: number; type?: string }
    if (!body.fileName || !body.size || !body.type) {
      return {
        statusCode: 400,
        body: JSON.stringify({ title: 'Invalid input', detail: 'fileName, size, type required' }),
      }
    }
    const assetId = `asset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    // TODO: replace with real presigned URL from storage provider
    const uploadUrl = 'https://example.com/put'
    const proxyUrl = undefined
    return { statusCode: 200, body: JSON.stringify({ assetId, uploadUrl, proxyUrl }) }
  } catch (e: any) {
    return { statusCode: 500, body: JSON.stringify({ title: 'Server error', detail: e?.message || String(e) }) }
  }
}
