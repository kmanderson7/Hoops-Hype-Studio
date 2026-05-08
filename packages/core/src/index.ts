/**
 * @hhs/core — shared types and the edit-assembly engine that turns detected
 * highlight scenes into a beat-aligned, action-tuned cut list.
 *
 * The cut-list logic lives here (rather than inline in the web app or Modal
 * worker) so the frontend, Netlify functions, and the GPU worker can all
 * agree on what a "hype edit" looks like for a given clip + beat grid.
 */

export type ActionLabel =
  | 'dunk' | 'block' | 'steal' | 'three' | 'fast_break' | 'buzzer'
  // Display-cased aliases the web app emits — kept first-class so callers
  // don't have to lowercase before lookups.
  | 'Dunk' | 'Block' | 'Steal' | 'Three' | 'Three Pointer' | 'Layup'
  | 'Rebound' | 'Assist' | 'Pass' | 'Foul' | 'Other'

export type Segment = {
  id: string
  start: number
  end: number
  label: ActionLabel | string
  confidence: number
  score: number
  /** 0..1 along clip length where the impact frame lands (dunk apex, block swat). */
  impact?: number
  /** Display action used by SFX/voiceover routing on the worker side. */
  action?: string
  /** [cx, cy, w, h] in 0-1 units of the middle frame; drives smart reframe. */
  bbox?: number[]
}

export type Track = {
  url: string
  bpm?: number
  mood?: string
  energy?: number
  title?: string
  license?: string
  /** True for stub/demo tracks served when the music API is unconfigured. */
  fallback?: boolean
}

export type Project = {
  id: string
  sourceUrl: string
  proxyUrl?: string
  duration?: number
  segments: Segment[]
  beatGrid?: number[]
  music?: Track
  overlays: { team?: string; color?: string; playerName?: string; number?: string; logoUrl?: string }
  targetLength: 30 | 60 | 90
  aspect: '16:9' | '9:16' | '4:5'
}

/**
 * ESPN-style action-aware cut multipliers. Hold dunks/blocks longer (savor
 * the impact); cut quickly on rhythm plays (passes, threes, steals).
 * Multipliers are applied to the detected scene clipDuration before clamping.
 */
export const DEFAULT_ACTION_DURATION_MULT: Record<string, number> = {
  Dunk: 1.5,
  dunk: 1.5,
  Block: 1.35,
  block: 1.35,
  Three: 1.2,
  'Three Pointer': 1.2,
  three: 1.2,
  Steal: 1.15,
  steal: 1.15,
  Layup: 1.1,
  Rebound: 0.95,
  Assist: 1.0,
  Pass: 0.85,
  Foul: 0.9,
  fast_break: 1.1,
  buzzer: 1.3,
  Other: 1.0,
}

export const MIN_CLIP_SECONDS = 1.0
export const MAX_CLIP_SECONDS = 5.0
/** Snap window per the PRD's "beat-aligned cuts within ±0.3s" requirement. */
export const BEAT_SNAP_WINDOW_SECONDS = 0.3

export interface AssembleOptions {
  /** Override the action→multiplier map (merged onto DEFAULT_ACTION_DURATION_MULT). */
  actionDurationMult?: Record<string, number>
  /** Tolerance window for beat snapping (default ±0.3s). */
  snapWindow?: number
  /** Hard cap on number of segments returned (default 12). */
  maxSegments?: number
  /** Min/max clamp on per-clip duration (defaults 1.0 / 5.0 s). */
  minClip?: number
  maxClip?: number
}

/**
 * Convert UI timestamps like "1m 23", "00:17", or "23" to seconds.
 * Defensive: returns 0 for unparseable input rather than NaN.
 */
export function toSeconds(ts: string | number | undefined | null): number {
  if (typeof ts === 'number') return Math.max(0, ts)
  if (!ts) return 0
  const s = String(ts).trim()
  // "Mm SS" or "Mm SSs"
  const mIdx = s.indexOf('m')
  if (mIdx > -1) {
    const m = parseInt(s.slice(0, mIdx).trim() || '0', 10)
    const rest = s
      .slice(mIdx + 1)
      .replace(/[^0-9]/g, '')
      .trim()
    const sec = parseInt(rest || '0', 10)
    return Math.max(0, m * 60 + sec)
  }
  // "MM:SS"
  if (s.includes(':')) {
    const [mm, ss] = s.split(':').map((x) => parseInt(x.trim() || '0', 10))
    return Math.max(0, (Number.isFinite(mm) ? mm : 0) * 60 + (Number.isFinite(ss) ? ss : 0))
  }
  const n = parseInt(s.replace(/[^0-9]/g, '') || '0', 10)
  return Math.max(0, n)
}

/**
 * Snap `t` to the nearest beat in `grid` if within `window` seconds.
 * Otherwise return `t` unchanged. Grid is assumed sorted ascending; if not,
 * we sort defensively (cost is O(n log n) once per assembly call).
 */
export function snapToBeat(t: number, grid: number[] | undefined, window: number = BEAT_SNAP_WINDOW_SECONDS): number {
  if (!grid || grid.length === 0) return t
  // Binary search for the closest beat.
  const sorted = grid[0] <= grid[grid.length - 1] ? grid : [...grid].sort((a, b) => a - b)
  let lo = 0
  let hi = sorted.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (sorted[mid] < t) lo = mid + 1
    else hi = mid
  }
  // Compare neighbour candidates around the lower-bound index.
  const candidates = [sorted[lo]]
  if (lo > 0) candidates.push(sorted[lo - 1])
  let best = candidates[0]
  let bestDiff = Math.abs(best - t)
  for (const c of candidates) {
    const d = Math.abs(c - t)
    if (d < bestDiff) {
      bestDiff = d
      best = c
    }
  }
  return bestDiff <= window ? best : t
}

export interface AssembleInput {
  /** Detected scenes; will be sorted by score desc. */
  segments: Segment[]
  /** Soft cumulative cap on total cut duration (seconds). */
  targetLength: number
  /** Beat grid in seconds for snapping cut starts. */
  beatGrid?: number[]
  /** Optional knobs. */
  options?: AssembleOptions
}

/**
 * Build a beat-aligned, action-tuned cut list from detected segments.
 *
 * Behaviour:
 *   1. Sort by `score` desc.
 *   2. Each segment's effective duration = clamp((end-start) * actionMult, [minClip, maxClip]).
 *   3. Snap `start` to the nearest beat in `beatGrid` within ±snapWindow seconds.
 *   4. `end` = start + tunedDuration; `impact` lands later for held actions
 *      (dunk apex, block swat) and earlier for rhythm cuts (steal, three release).
 *   5. Greedily accumulate until cumulative duration would exceed `targetLength`.
 *   6. Cap output at `maxSegments`.
 *
 * Backward compatible with the old signature: `assembleEdit(segments, targetLength, beatGrid)`.
 */
export function assembleEdit(
  segmentsOrInput: Segment[] | AssembleInput,
  targetLength?: number,
  beatGrid?: number[],
  options?: AssembleOptions,
): Segment[] {
  const input: AssembleInput = Array.isArray(segmentsOrInput)
    ? { segments: segmentsOrInput, targetLength: targetLength ?? 60, beatGrid, options }
    : segmentsOrInput

  const opts: Required<AssembleOptions> = {
    actionDurationMult: { ...DEFAULT_ACTION_DURATION_MULT, ...(input.options?.actionDurationMult || {}) },
    snapWindow: input.options?.snapWindow ?? BEAT_SNAP_WINDOW_SECONDS,
    maxSegments: input.options?.maxSegments ?? 12,
    minClip: input.options?.minClip ?? MIN_CLIP_SECONDS,
    maxClip: input.options?.maxClip ?? MAX_CLIP_SECONDS,
  }

  // Sort high-score scenes first; stable for ties via insertion order.
  const sorted = [...input.segments].sort((a, b) => b.score - a.score)

  const out: Segment[] = []
  let total = 0

  for (const s of sorted) {
    if (out.length >= opts.maxSegments) break
    const baseDur = Math.max(0, (s.end ?? 0) - (s.start ?? 0)) || 2
    const actionKey = s.action || (typeof s.label === 'string' ? s.label : '')
    const mult = opts.actionDurationMult[actionKey] ?? 1.0
    const tunedDur = Math.max(opts.minClip, Math.min(opts.maxClip, baseDur * mult))

    // Skip if adding this would push total beyond the soft cap.
    if (total + tunedDur > input.targetLength && out.length > 0) continue

    const start = snapToBeat(s.start, input.beatGrid, opts.snapWindow)
    const end = Math.max(start + 0.8, start + tunedDur)

    // Impact lands later for held actions (dunk apex, block swat),
    // earlier for rhythm cuts (steal, three release).
    const impactBias = mult >= 1.3 ? 0.4 : mult >= 1.15 ? 0.3 : 0.2
    const impactOffset = Math.min(impactBias * tunedDur, tunedDur / 2)
    const impact = Math.min(end, start + impactOffset)

    out.push({ ...s, start, end, impact, action: s.action || actionKey })
    total += tunedDur
  }

  return out
}
