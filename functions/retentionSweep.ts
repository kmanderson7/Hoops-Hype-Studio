import type { Handler } from '@netlify/functions'

// Placeholder retention sweep. In production, prefer native bucket lifecycle rules.
// This function exists to satisfy scheduling and can be extended to list+delete S3 objects.
export const handler: Handler = async () => {
  const days = Number(process.env.RETENTION_DAYS || '7')
  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, note: 'Use S3/R2 lifecycle policies for retention; function can be extended for explicit deletions.', retentionDays: days }),
  }
}

