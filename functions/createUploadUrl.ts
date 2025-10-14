import type { Handler } from '@netlify/functions'
export const handler: Handler = async () => {
  return {
    statusCode: 200,
    body: JSON.stringify({ uploadUrl: 'https://example.com/put', fileUrl: 'https://example.com/file.mp4' })
  }
}
