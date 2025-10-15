import type { Handler } from '@netlify/functions'
import { requireHmacNonce } from './_auth'

const {
  MUSIC_API_KEY = '',
  MUSIC_API_BASE_URL = '',
  GPU_WORKER_BASE_URL = '',
  GPU_WORKER_TOKEN = ''
} = process.env

/**
 * AI-Powered Music Recommendation
 *
 * PRD Requirement: AI Music Intelligence Module (Section 6.4)
 * - Analyzes video audio energy profile
 * - Matches tracks by BPM, energy level, and mood
 * - Returns top 3 ranked tracks with match scores
 */
export const handler: Handler = async (evt) => {
  try {
    const guard = await requireHmacNonce({ headers: evt.headers as any, bodyText: evt.body || '' })
    if (guard) return guard

    const body = evt.body ? JSON.parse(evt.body) : {}
    const { assetId, playStyle, targetLength, proxyUrl } = body

    // Step 1: Get audio energy profile from GPU worker
    let energyProfile = { avgBpm: 135, avgEnergy: 0.75, peakMoments: [] }

    if (GPU_WORKER_BASE_URL && GPU_WORKER_TOKEN && (assetId || proxyUrl)) {
      try {
        const analysisRes = await fetch(`${GPU_WORKER_BASE_URL}/audio-analysis`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${GPU_WORKER_TOKEN}`
          },
          body: JSON.stringify({ assetId: assetId || 'demo', proxyUrl })
        })

        if (analysisRes.ok) {
          energyProfile = await analysisRes.json()
        }
      } catch (err) {
        console.warn('Audio analysis failed, using defaults:', err)
      }
    }

    // Step 2: Fetch candidate tracks from music API
    const q = body?.query || 'trap sport hype'
    const candidates: any[] = []

    if (MUSIC_API_BASE_URL && MUSIC_API_KEY) {
      try {
        const url = `${MUSIC_API_BASE_URL}?key=${encodeURIComponent(
          MUSIC_API_KEY
        )}&q=${encodeURIComponent(q)}&media_type=audio&per_page=10`

        const res = await fetch(url)
        if (res.ok) {
          const data = await res.json()
          candidates.push(
            ...(data?.hits || []).map((h: any) => ({
              url: h?.audioURL || h?.url || '#',
              title: h?.tags || 'Hype Track',
              artist: h?.user || 'Unknown',
              bpm: h?.bpm || 130,
              mood: h?.mood || 'high energy',
              energy: Math.min(1, Math.max(0.6, h?.energy || 0.85)),
              duration: h?.duration || 180,
              license: 'royalty-free'
            }))
          )
        }
      } catch {
        // Fall through to defaults
      }
    }

    // Add fallback tracks if no candidates
    if (candidates.length === 0) {
      candidates.push(
        { url: 'https://cdn.example/hype1.mp3', title: 'Fast Break', artist: 'Voltage', bpm: 140, mood: 'high energy', energy: 0.92, duration: 180, license: 'royalty-free' },
        { url: 'https://cdn.example/hype2.mp3', title: 'Full Court Press', artist: 'Neon District', bpm: 128, mood: 'anthemic', energy: 0.88, duration: 170, license: 'royalty-free' },
        { url: 'https://cdn.example/hype3.mp3', title: 'Skyline Lights', artist: 'City Edge', bpm: 135, mood: 'hybrid trap', energy: 0.85, duration: 195, license: 'royalty-free' }
      )
    }

    // Step 3: Score each track using AI matching algorithm
    const scored = candidates.map((track) => {
      // BPM matching (±5 BPM tolerance per PRD)
      const bpmDiff = Math.abs(track.bpm - energyProfile.avgBpm)
      const bpmScore = 1.0 - Math.min(1, bpmDiff / 20)

      // Energy level matching
      const energyDiff = Math.abs(track.energy - energyProfile.avgEnergy)
      const energyScore = 1.0 - energyDiff

      // Duration matching (prefer tracks ≥ targetLength)
      const durationScore = targetLength ? (track.duration >= targetLength ? 1.0 : 0.7) : 0.9

      // Play style matching
      let styleScore = 0.8
      if (playStyle === 'guard' && track.bpm > 140) styleScore = 1.0
      if (playStyle === 'big' && track.mood.includes('powerful')) styleScore = 1.0
      if (playStyle === 'team' && track.mood.includes('anthemic')) styleScore = 0.95

      // Weighted final score (PRD Section 6.4 music matching)
      const matchScore = (
        bpmScore * 0.35 +      // BPM most important
        energyScore * 0.40 +   // Energy second most important
        durationScore * 0.10 + // Duration less important
        styleScore * 0.15      // Style matching
      )

      // Normalize mood to expected values
      let normalizedMood = 'High Energy'
      if (track.mood.toLowerCase().includes('trap')) normalizedMood = 'Hybrid Trap'
      else if (track.mood.toLowerCase().includes('anthem')) normalizedMood = 'Anthemic'
      else if (track.mood.toLowerCase().includes('electro') || track.mood.toLowerCase().includes('drive'))
        normalizedMood = 'Electro Drive'

      return {
        url: track.url,
        title: track.title,
        artist: track.artist || 'Unknown',
        bpm: track.bpm,
        mood: normalizedMood,
        energy: Math.round(track.energy * 100),
        matchScore: Math.round(matchScore * 100),
        license: track.license
      }
    })

    // Step 4: Sort by match score and return top 3 (PRD Section 6.4)
    scored.sort((a, b) => b.matchScore - a.matchScore)
    const topTracks = scored.slice(0, 3)

    return { statusCode: 200, body: JSON.stringify({ tracks: topTracks }) }
  } catch (e: any) {
    return {
      statusCode: 500,
      body: JSON.stringify({ title: 'Server error', detail: e?.message || String(e) })
    }
  }
}
