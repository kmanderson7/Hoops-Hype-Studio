import type { Handler } from '@netlify/functions'
import { presignS3Url } from './_s3Presign'
import { requireHmacNonce } from './_auth'
import { log, captureException } from './_obs'

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
      return { statusCode: 200, body: JSON.stringify({ proxyUrl: undefined }) }
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
      } catch (e: any) {
        // MD5 verification is best-effort — a HEAD failure shouldn't block
        // ingest. Log so the operator can spot a bucket-perm issue.
        await log({ level: 'warn', msg: 'md5_check_failed', key: body.key, error: e?.message || String(e) })
      }
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

    // Modal /ingest does an ffmpeg transcode + R2 upload; for typical clips
    // it runs 20-60+s. Our previous 8s pre-abort meant we returned
    // `proxyUrl: undefined` while Modal kept transcoding (or got cut off
    // mid-stream), and any subsequent /render would 500 because
    // proxy/{assetId}.mp4 didn't exist. Modal /render now self-heals via the
    // uploads/{assetId}/* fallback (workers/modal/modal_app.py), so this
    // function can return early without the proxy and render still works.
    //
    // Use a 9s budget — under Netlify's Hobby 10s sync cap. On Pro plans
    // (26s sync cap) this could safely go higher, but the render-side
    // fallback removes the urgency. When the abort fires, log it so the
    // operator can see the timing in Netlify logs.
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 9_000)
    try {
      const res = await fetch(`${GPU_WORKER_BASE_URL}/ingest`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${GPU_WORKER_TOKEN}`,
        },
        body: JSON.stringify({ assetId: body.assetId, sourceUrl }),
        signal: controller.signal,
      })
      if (!res.ok) return { statusCode: res.status, body: await res.text() }
      const data = await res.json()
      return { statusCode: 200, body: JSON.stringify(data) }
    } catch (abortErr: any) {
      if (abortErr?.name === 'AbortError') {
        await log({
          level: 'warn',
          msg: 'ingest_aborted_proxy_pending',
          assetId: body.assetId,
          note: 'Modal /ingest still running; render will fall back to uploads/<assetId>/*',
        })
        return { statusCode: 200, body: JSON.stringify({ proxyUrl: undefined, pending: true }) }
      }
      throw abortErr
    } finally {
      clearTimeout(timer)
    }
  } catch (e: any) {
    await captureException(e, { where: 'ingestAsset' })
    return { statusCode: 500, body: JSON.stringify({ title: 'Server error', detail: e?.message || String(e) }) }
  }
}
