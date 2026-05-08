import type { Handler } from '@netlify/functions'
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
 * Daily retention sweep (scheduled in netlify.toml at 06:00 UTC).
 *
 * For each managed prefix (uploads/, proxy/, exports/), list every object
 * older than RETENTION_DAYS and delete it. Hard-capped at 5000 deletes per
 * prefix per run so we don't blow past Netlify's function budget on a
 * pathologically large bucket — re-runs the next day will catch the rest.
 *
 * Production note: the cleanest path is to set R2/S3 bucket lifecycle rules,
 * but those aren't always available (free-tier R2 has no lifecycle UI as of
 * writing), so this provides an explicit fallback.
 */
const MANAGED_PREFIXES = ['uploads/', 'proxy/', 'exports/']

export const handler: Handler = async () => {
  try {
    const days = Number(process.env.RETENTION_DAYS || '7')
    if (!Number.isFinite(days) || days <= 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: 'RETENTION_DAYS must be a positive number' }),
      }
    }

    if (!STORAGE_BUCKET || !STORAGE_ACCESS_KEY || !STORAGE_SECRET_KEY) {
      // Don't crash a scheduled run on a misconfigured deploy; log and exit clean.
      await log({ level: 'warn', msg: 'retention_sweep_skipped_no_storage' })
      return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: 'storage_not_configured', retentionDays: days }) }
    }

    const cutoffMs = Date.now() - days * 86_400_000
    const creds = {
      bucket: STORAGE_BUCKET,
      region: STORAGE_REGION,
      accessKeyId: STORAGE_ACCESS_KEY,
      secretAccessKey: STORAGE_SECRET_KEY,
      endpoint: STORAGE_ENDPOINT,
    }

    let scannedTotal = 0
    let deletedTotal = 0
    let errorsTotal = 0
    const perPrefix: Record<string, { scanned: number; deleted: number; errors: number }> = {}

    for (const prefix of MANAGED_PREFIXES) {
      try {
        const { scanned, deleted } = await listAndDelete(
          creds,
          prefix,
          (obj) => obj.lastModified.getTime() < cutoffMs,
          5000,
        )
        const okCount = deleted.filter((d) => d.ok).length
        const errCount = deleted.length - okCount
        perPrefix[prefix] = { scanned, deleted: okCount, errors: errCount }
        scannedTotal += scanned
        deletedTotal += okCount
        errorsTotal += errCount
      } catch (e: any) {
        await log({ level: 'error', msg: 'retention_sweep_prefix_failed', prefix, error: e?.message || String(e) })
        perPrefix[prefix] = { scanned: 0, deleted: 0, errors: 1 }
        errorsTotal += 1
      }
    }

    await log({
      level: 'info',
      msg: 'retention_sweep_done',
      retentionDays: days,
      scanned: scannedTotal,
      deleted: deletedTotal,
      errors: errorsTotal,
      perPrefix,
    })

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        retentionDays: days,
        cutoff: new Date(cutoffMs).toISOString(),
        scanned: scannedTotal,
        deleted: deletedTotal,
        errors: errorsTotal,
        perPrefix,
      }),
    }
  } catch (e: any) {
    await captureException(e, { where: 'retentionSweep' })
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: e?.message || String(e) }),
    }
  }
}
