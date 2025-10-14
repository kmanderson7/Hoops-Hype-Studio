import type { Handler } from '@netlify/functions'
export const handler: Handler = async () => {
  return { statusCode: 200, body: JSON.stringify({ jobId: 'job_demo_123' }) }
}
