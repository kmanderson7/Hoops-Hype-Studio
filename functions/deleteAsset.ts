import type { Handler } from '@netlify/functions'
import { presignS3Url } from './_s3Presign'
import { listAndDelete } from './_s3List'
import { log, captureException } from './_obs'

const {
  STORAGE_BUCKET = '',
  STORAGE_REGION = 'us-east-1',
  STORAGE_ACCESS_KEY = '',
  STORAGE_SECRET_KEY = '',
  STORAGE_ENDPOINT,
} = process.env

/**
 * Delete every R2/S3 object associated with an asset.
 *
 * Modal writes the original upload under `uploads/<assetId>/<filename>` and
 * the generated 720p proxy at `proxy/<assetId>.mp4`. We blow away both. For
 * the upload folder we list-then-delete (S3 has no atomic prefix delete);
 * for the single proxy file a plain DELETE is enough.
 */
export const handler: Handler = async (evt) => {
  try {
    const body = evt.body ? JSON.parse(evt.body) : {}
    const assetId: string | undefined = body?.assetId
    if (!assetId) return { statusCode: 400, body: JSON.stringify({ title: 'Invalid input', detail: 'assetId required' }) }
    if (!STORAGE_BUCKET || !STORAGE_ACCESS_KEY || !STORAGE_SECRET_KEY) {
      return { statusCode: 500, body: JSON.stringify({ title: 'Storage not configured' }) }
    }

    const creds = {
      bucket: STORAGE_BUCKET,
      region: STORAGE_REGION,
      accessKeyId: STORAGE_ACCESS_KEY,
      secretAccessKey: STORAGE_SECRET_KEY,
      endpoint: STORAGE_ENDPOINT,
    }

    const results: { key: string; ok: boolean; status: number }[] = []

    // 1. Wipe the uploads/<assetId>/ folder via list+delete.
    try {
      const { deleted } = await listAndDelete(creds, `uploads/${assetId}/`, undefined, 5000)
      results.push(...deleted)
    } catch (e: any) {
      await log({ level: 'warn', msg: 'delete_asset_uploads_list_failed', assetId, error: e?.message || String(e) })
    }

    // 2. Delete the proxy file (single object).
    const proxyKey = `proxy/${assetId}.mp4`
    const proxyUrl = presignS3Url({
      method: 'DELETE',
      bucket: STORAGE_BUCKET,
      key: proxyKey,
      region: STORAGE_REGION,
      accessKeyId: STORAGE_ACCESS_KEY,
      secretAccessKey: STORAGE_SECRET_KEY,
      endpoint: STORAGE_ENDPOINT,
      expiresIn: 300,
    })
    try {
      const res = await fetch(proxyUrl, { method: 'DELETE' })
      results.push({ key: proxyKey, ok: res.ok || res.status === 404, status: res.status })
    } catch (e: any) {
      await log({ level: 'warn', msg: 'delete_object_fetch_failed', key: proxyKey, error: e?.message || String(e) })
      results.push({ key: proxyKey, ok: false, status: 0 })
    }

    await log({ level: 'info', msg: 'delete_asset_done', assetId, count: results.length, ok: results.filter((r) => r.ok).length })

    return { statusCode: 200, body: JSON.stringify({ deleted: results }) }
  } catch (e: any) {
    await captureException(e, { where: 'deleteAsset' })
    return { statusCode: 500, body: JSON.stringify({ title: 'Server error', detail: e?.message || String(e) }) }
  }
}
