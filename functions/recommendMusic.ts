import type { Handler } from '@netlify/functions'
import { requireHmacNonce } from './_auth'
import { log, captureException } from './_obs'
import {
  PixabayProvider,
  scoreAndRankTracks,
  buildFallbackTracks,
  type EnergyProfile,
  type TrackCandidate,
} from '@hhs/providers'

const {
  MUSIC_API_KEY = '',
  MUSIC_API_BASE_URL = '',
  GPU_WORKER_BASE_URL = '',
  GPU_WORKER_TOKEN = '',
} = process.env

/**
 * AI-Powered Music Recommendation
 *
 * PRD Requirement: AI Music Intelligence Module (Section 6.4)
 * - Analyzes video audio energy profile via Modal `/audio-analysis`
 * - Matches Pixabay candidate tracks by BPM, energy level, and mood
 * - Returns top 3 ranked tracks with match scores
 *
 * If MUSIC_API_KEY is unset, falls back to a hardcoded demo set with silent
 * audio + `fallback: true` so the UI can label them as demos.
 */
export const handler: Handler = async (evt) => {
  try {
    const guard = await requireHmacNonce({ headers: evt.headers as any, bodyText: evt.body || '' })
    if (guard) return guard

    const body = evt.body ? JSON.parse(evt.body) : {}
    const { assetId, playStyle, targetLength, proxyUrl, query } = body as {
      assetId?: string
      playStyle?: string
      targetLength?: number
      proxyUrl?: string
      query?: string
    }

    // Step 1: Get audio energy profile from GPU worker.
    let energyProfile: EnergyProfile = { avgBpm: 135, avgEnergy: 0.75, peakMoments: [], energyCurve: [] }

    if (GPU_WORKER_BASE_URL && GPU_WORKER_TOKEN && (assetId || proxyUrl)) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 8_000)
      try {
        const analysisRes = await fetch(`${GPU_WORKER_BASE_URL}/audio-analysis`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${GPU_WORKER_TOKEN}`,
          },
          body: JSON.stringify({ assetId: assetId || 'demo', proxyUrl }),
          signal: controller.signal,
        })
        if (analysisRes.ok) {
          const j = (await analysisRes.json()) as Partial<EnergyProfile>
          energyProfile = {
            avgBpm: typeof j.avgBpm === 'number' ? j.avgBpm : 135,
            avgEnergy: typeof j.avgEnergy === 'number' ? j.avgEnergy : 0.75,
            peakMoments: Array.isArray(j.peakMoments) ? j.peakMoments : [],
            energyCurve: Array.isArray(j.energyCurve) ? j.energyCurve : [],
          }
        }
      } catch (err: any) {
        // Soft fail: keep the default energy profile so we can still return
        // ranked tracks. Logged so an unconfigured worker is visible in obs.
        await log({ level: 'warn', msg: 'audio_analysis_failed', error: err?.message || String(err) })
      } finally {
        clearTimeout(timer)
      }
    }

    // Step 2: Fetch candidate tracks from the music provider.
    let candidates: TrackCandidate[] = []
    let usedFallback = false

    if (MUSIC_API_BASE_URL && MUSIC_API_KEY) {
      const provider = new PixabayProvider(MUSIC_API_KEY, MUSIC_API_BASE_URL)
      const musicController = new AbortController()
      const musicTimer = setTimeout(() => musicController.abort(), 8_000)
      try {
        const found = await provider.search({ query, perPage: 10, signal: musicController.signal })
        // Provider returns Track[]; widen to TrackCandidate (artist + duration
        // are extras kept on the same object).
        candidates = found.map(
          (t: any): TrackCandidate => ({
            url: t.url,
            title: t.title || 'Hype Track',
            artist: t.artist || 'Unknown',
            bpm: t.bpm ?? 130,
            mood: t.mood || 'high energy',
            energy: typeof t.energy === 'number' ? t.energy : 0.85,
            duration: t.duration ?? 180,
            license: t.license || 'royalty-free',
          }),
        )
      } catch (err: any) {
        await log({ level: 'warn', msg: 'music_provider_failed', error: err?.message || String(err) })
      } finally {
        clearTimeout(musicTimer)
      }
    }

    if (candidates.length === 0) {
      candidates = buildFallbackTracks()
      usedFallback = true
    }

    // Step 3: Score and rank.
    const topTracks = scoreAndRankTracks(candidates, energyProfile, { playStyle, targetLength })

    return {
      statusCode: 200,
      body: JSON.stringify({
        tracks: topTracks,
        avgBpm: energyProfile.avgBpm,
        avgEnergy: energyProfile.avgEnergy,
        peakMoments: energyProfile.peakMoments,
        energyCurve: energyProfile.energyCurve || [],
        fallback: usedFallback,
      }),
    }
  } catch (e: any) {
    await captureException(e, { where: 'recommendMusic' })
    return {
      statusCode: 500,
      body: JSON.stringify({ title: 'Server error', detail: e?.message || String(e) }),
    }
  }
}
