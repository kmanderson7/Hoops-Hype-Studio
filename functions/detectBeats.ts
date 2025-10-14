import type { Handler } from '@netlify/functions'
export const handler: Handler = async () => {
  const bpm = 130
  const beatGrid = Array.from({length:20}).map((_,i)=> i*60/bpm)
  return { statusCode: 200, body: JSON.stringify({ bpm, beatGrid }) }
}
