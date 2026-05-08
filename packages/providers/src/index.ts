import type { Track } from '@hhs/core'

/**
 * @hhs/providers — pluggable music providers used by `functions/recommendMusic`.
 *
 * Currently ships a Pixabay-backed implementation; the interface is structured
 * so new providers (Epidemic, Artlist, etc.) can drop in without rewriting the
 * scoring layer below.
 */

export interface MusicSearchOpts {
  query?: string
  bpmMin?: number
  bpmMax?: number
  mood?: string
  energyMin?: number
  length?: number
  perPage?: number
  /** Abort signal to cancel an in-flight search. */
  signal?: AbortSignal
}

export interface MusicProvider {
  search(opts: MusicSearchOpts): Promise<Track[]>
}

/**
 * 1-second silent WAV data URI used for fallback tracks when no music API is
 * configured. Plays cleanly in <audio> elements (no broken-URL spinner) and
 * is small enough to inline. Real previews come from the provider when keys
 * are present.
 */
export const SILENT_WAV_DATA_URI =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA='

interface PixabayHit {
  id?: number
  audioURL?: string
  url?: string
  user?: string
  tags?: string
  bpm?: number
  mood?: string
  energy?: number
  duration?: number
}

export class PixabayProvider implements MusicProvider {
  constructor(private apiKey: string, private baseUrl: string = 'https://pixabay.com/api') {}

  async search(opts: MusicSearchOpts): Promise<Track[]> {
    if (!this.apiKey) return []
    const q = opts.query || 'trap sport hype'
    const perPage = Math.max(3, Math.min(50, opts.perPage ?? 10))
    const url = `${this.baseUrl}?key=${encodeURIComponent(this.apiKey)}&q=${encodeURIComponent(
      q,
    )}&media_type=audio&per_page=${perPage}`

    const res = await fetch(url, { signal: opts.signal })
    if (!res.ok) return []
    const data = (await res.json().catch(() => null)) as { hits?: PixabayHit[] } | null
    const hits = data?.hits ?? []
    // Pixabay's standard /api/ endpoint doesn't actually serve audio for most
    // queries — `media_type=audio` is often silently ignored and the response
    // is image hits with no `audioURL` and `url` either missing or pointing
    // at a webpage. If we surface those as tracks, the frontend ships their
    // bogus URLs to Modal /beats and librosa 500s on the HTML response.
    // Drop hits without a usable HTTPS audio URL; if nothing's left, return
    // empty so recommendMusic falls through to the demo silent-WAV tracks.
    const isPlayable = (u: string | undefined): u is string =>
      !!u && /^https?:\/\//i.test(u) && u !== '#'
    return hits
      .filter((h) => isPlayable(h.audioURL) || isPlayable(h.url))
      .map(
        (h): Track & { artist?: string; duration?: number } => ({
          url: (isPlayable(h.audioURL) ? h.audioURL : h.url) as string,
          title: h.tags || 'Hype Track',
          bpm: typeof h.bpm === 'number' ? h.bpm : 130,
          mood: h.mood || 'high energy',
          energy: Math.min(1, Math.max(0.6, typeof h.energy === 'number' ? h.energy : 0.85)),
          license: 'royalty-free',
          // Extras kept on the object for downstream scoring; not strictly part
          // of `Track` but harmless additions.
          artist: h.user || 'Unknown',
          duration: typeof h.duration === 'number' ? h.duration : 180,
        }),
      )
  }
}

/**
 * Fallback demo tracks served when no MUSIC_API_KEY is configured. Uses a
 * silent WAV data URI so <audio> elements don't show a broken-URL state, and
 * carries `fallback: true` so the UI can render a "Demo" badge.
 */
export function buildFallbackTracks(): TrackCandidate[] {
  return [
    {
      url: SILENT_WAV_DATA_URI,
      title: 'Fast Break',
      artist: 'Voltage',
      bpm: 140,
      mood: 'high energy',
      energy: 0.92,
      duration: 180,
      license: 'royalty-free',
      fallback: true,
    },
    {
      url: SILENT_WAV_DATA_URI,
      title: 'Full Court Press',
      artist: 'Neon District',
      bpm: 128,
      mood: 'anthemic',
      energy: 0.88,
      duration: 170,
      license: 'royalty-free',
      fallback: true,
    },
    {
      url: SILENT_WAV_DATA_URI,
      title: 'Skyline Lights',
      artist: 'City Edge',
      bpm: 135,
      mood: 'hybrid trap',
      energy: 0.85,
      duration: 195,
      license: 'royalty-free',
      fallback: true,
    },
  ]
}

export interface EnergyProfile {
  avgBpm: number
  avgEnergy: number
  peakMoments?: number[]
  energyCurve?: number[]
}

export interface ScoreOpts {
  playStyle?: string
  targetLength?: number
}

export interface TrackCandidate {
  url: string
  title: string
  artist?: string
  bpm: number
  mood: string
  energy: number
  duration?: number
  license?: string
  fallback?: boolean
}

export interface ScoredTrack {
  url: string
  title: string
  artist: string
  bpm: number
  mood: string
  energy: number
  matchScore: number
  license?: string
  key: string
  waveform: number[]
  fallback?: boolean
}

/**
 * Score and rank candidate tracks against the clip's energy profile.
 * Implements the PRD §6.4 weighting (BPM 35% + Energy 40% + Duration 10% + Style 15%).
 */
export function scoreAndRankTracks(
  candidates: TrackCandidate[],
  energyProfile: EnergyProfile,
  opts: ScoreOpts = {},
  topN: number = 3,
): ScoredTrack[] {
  const { playStyle, targetLength } = opts

  const scored = candidates.map((track): ScoredTrack => {
    // BPM matching (±5 BPM ideal, ±20 falloff).
    const bpmDiff = Math.abs(track.bpm - energyProfile.avgBpm)
    const bpmScore = 1.0 - Math.min(1, bpmDiff / 20)

    // Energy level matching.
    const energyDiff = Math.abs(track.energy - energyProfile.avgEnergy)
    const energyScore = 1.0 - Math.min(1, energyDiff)

    // Duration matching (prefer tracks ≥ targetLength).
    const durationScore = targetLength
      ? (track.duration ?? 180) >= targetLength
        ? 1.0
        : 0.7
      : 0.9

    // Play style heuristic — same rules as before but defensive against unknown styles.
    let styleScore = 0.8
    const moodLower = (track.mood || '').toLowerCase()
    if (playStyle === 'guard' && track.bpm > 140) styleScore = 1.0
    if (playStyle === 'big' && moodLower.includes('powerful')) styleScore = 1.0
    if (playStyle === 'team' && moodLower.includes('anthemic')) styleScore = 0.95

    const matchScore = bpmScore * 0.35 + energyScore * 0.4 + durationScore * 0.1 + styleScore * 0.15

    // Normalize mood to one of the four UI buckets.
    let normalizedMood = 'High Energy'
    if (moodLower.includes('trap')) normalizedMood = 'Hybrid Trap'
    else if (moodLower.includes('anthem')) normalizedMood = 'Anthemic'
    else if (moodLower.includes('electro') || moodLower.includes('drive')) normalizedMood = 'Electro Drive'

    // Synthesize a deterministic 32-bin waveform shape from mood + energy so
    // the UI has something visual even before audio analysis runs.
    const baseAmp = Math.min(1, Math.max(0.4, track.energy))
    const moodPhase = normalizedMood === 'Hybrid Trap' ? 1.7 : normalizedMood === 'Anthemic' ? 0.5 : 1.1
    const waveform = Array.from({ length: 32 }, (_, idx) => {
      const v = baseAmp + Math.sin((idx / 32) * Math.PI * 4 + moodPhase) * 0.18 + (idx % 4 === 0 ? 0.08 : 0)
      return Math.min(1, Math.max(0.2, v))
    })

    const moodKey =
      normalizedMood === 'Hybrid Trap'
        ? 'F# Minor'
        : normalizedMood === 'Anthemic'
          ? 'C Major'
          : normalizedMood === 'Electro Drive'
            ? 'A Minor'
            : 'E Minor'

    return {
      url: track.url,
      title: track.title,
      artist: track.artist || 'Unknown',
      bpm: track.bpm,
      mood: normalizedMood,
      energy: Math.round(track.energy * 100),
      matchScore: Math.round(matchScore * 100),
      license: track.license,
      key: moodKey,
      waveform,
      fallback: track.fallback,
    }
  })

  scored.sort((a, b) => b.matchScore - a.matchScore)
  return scored.slice(0, topN)
}
