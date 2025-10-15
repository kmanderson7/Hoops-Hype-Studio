import type { Handler } from '@netlify/functions'
import { requireHmacNonce } from './_auth'

const { MUSIC_API_KEY = '', MUSIC_API_BASE_URL = '' } = process.env

export const handler: Handler = async (evt) => {
  try {
    const guard = await requireHmacNonce({ headers: evt.headers as any, bodyText: evt.body || '' })
    if (guard) return guard
    const body = evt.body ? JSON.parse(evt.body) : {}
    const q = body?.query || 'trap sport hype'
    const url = MUSIC_API_BASE_URL && MUSIC_API_KEY
      ? `${MUSIC_API_BASE_URL}?key=${encodeURIComponent(MUSIC_API_KEY)}&q=${encodeURIComponent(q)}&media_type=audio&per_page=5`
      : ''

    if (url) {
      try {
        const res = await fetch(url)
        if (res.ok) {
          const data = await res.json()
          const tracks = (data?.hits || []).map((h: any) => ({
            url: h?.audioURL || h?.url || '#',
            title: h?.tags || 'Hype Track',
            bpm: h?.bpm || 130,
            mood: (h?.mood || 'High Energy').toLowerCase(),
            energy: Math.min(1, Math.max(0.6, (h?.energy || 0.85))),
            license: 'royalty-free',
          }))
          return { statusCode: 200, body: JSON.stringify({ tracks }) }
        }
      } catch {
        // fall through to stub
      }
    }

    // Fallback stub
    const tracks = [
      { url: 'https://cdn.example/hype1.mp3', title: 'Fast Break', bpm: 132, mood: 'High Energy', energy: 0.9, license: 'royalty-free' },
      { url: 'https://cdn.example/hype2.mp3', title: 'Full Court Press', bpm: 126, mood: 'Anthemic', energy: 0.86, license: 'royalty-free' },
    ]
    return { statusCode: 200, body: JSON.stringify({ tracks }) }
  } catch (e: any) {
    return { statusCode: 500, body: JSON.stringify({ title: 'Server error', detail: e?.message || String(e) }) }
  }
}
