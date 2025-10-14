import type { Handler } from '@netlify/functions'
export const handler: Handler = async (evt) => {
  // naive stub: return fake segments
  const body = JSON.parse(evt.body||'{}')
  const segments = [
    { id:'s1', start:1.0, end:2.6, label:'dunk', confidence:0.9, score:0.92 },
    { id:'s2', start:5.2, end:7.4, label:'three', confidence:0.85, score:0.88 },
  ]
  return { statusCode: 200, body: JSON.stringify({ segments, proxyUrl: body.videoUrl, thumbnails: [] }) }
}
