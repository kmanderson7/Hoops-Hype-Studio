import type { Handler } from '@netlify/functions'
export const handler: Handler = async () => {
  return { statusCode: 200, body: JSON.stringify({ status: 'done', fileUrl: 'https://example.com/hype.mp4' }) }
}
