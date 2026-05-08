type JobStatus = 'queued' | 'running' | 'done' | 'error'

// Coarse pipeline stage. The bg fn writes transitions so the UI can show an
// honest label ("Rendering on GPU…") instead of a fake percentage. `done`/`error`
// mirror `status` and are derived, not written explicitly.
export type RenderStage = 'queued' | 'dispatched' | 'encoding' | 'done' | 'error'

export interface RenderPresetProgress {
  presetId: string
  progress: number
}

export interface RenderJob {
  id: string
  assetId?: string
  trackId?: string
  presets: string[]
  createdAt: number
  // simulated total duration (ms) — paces per-preset progress bars only
  durationMs: number
  status: JobStatus
  stage?: RenderStage
  // populated when done. `key` is the S3 object key — kept so finalizeExport
  // can re-sign a fresh presigned URL on every download (Modal's URL has a
  // 1-hour TTL).
  downloads?: { presetId: string; url: string; expiresAt: string; key?: string }[]
  // populated when the worker fails — short message for surfacing in UI/logs
  error?: string
}

const jobs = new Map<string, RenderJob>()
const useRedis = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
let redisStore: typeof import('./_jobStore_redis') | undefined
if (useRedis) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    redisStore = require('./_jobStore_redis')
  } catch {
    // ignore, fallback to memory
  }
}

// In any multi-container environment (Netlify, Vercel, etc.) the in-memory
// Map is silently broken: sync handlers, background functions, and pollers
// run in different processes, so writes vanish. Refuse to start.
const isMultiContainer = process.env.NETLIFY === 'true' || !!process.env.NETLIFY_DEV
function assertSharedStore() {
  // Reaching here means we're using the in-memory branch. That's only safe
  // for single-process local dev — never for Netlify (multi-container) and
  // never when Redis was *requested* but failed to load (require error).
  if (isMultiContainer) {
    throw new Error(
      'Job store requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in production. ' +
        'In-memory fallback only works for single-process local dev.',
    )
  }
  if (useRedis && !redisStore) {
    throw new Error('UPSTASH_REDIS env vars are set but `_jobStore_redis` failed to load. Check the deploy bundle.')
  }
}

const randomMs = (min: number, max: number) => Math.floor(min + Math.random() * (max - min))

export function createRenderJob(params: { assetId?: string; trackId?: string; presets: string[] }): RenderJob {
  if (useRedis && redisStore?.createRenderJob) {
    // @ts-expect-error async boundary hidden from caller; used only by our handlers
    return redisStore.createRenderJob(params)
  }
  assertSharedStore()
  const id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const durationMs = randomMs(4000, 9000)
  const job: RenderJob = {
    id,
    assetId: params.assetId,
    trackId: params.trackId,
    presets: params.presets,
    createdAt: Date.now(),
    durationMs,
    status: 'queued',
    stage: 'queued',
  }
  jobs.set(id, job)
  return job
}

export function getRenderJob(id: string) {
  if (useRedis && redisStore?.getRenderJob) {
    // @ts-expect-error
    return redisStore.getRenderJob(id)
  }
  assertSharedStore()
  return jobs.get(id)
}

export function getRenderJobStatus(id: string): {
  status: JobStatus
  stage?: RenderStage
  progress: number
  eta?: number
  presets: RenderPresetProgress[]
  downloads?: { presetId: string; url: string; expiresAt: string; key?: string }[]
  error?: string
} | undefined {
  if (useRedis && redisStore?.getRenderJobStatus) {
    // @ts-expect-error
    return redisStore.getRenderJobStatus(id)
  }
  assertSharedStore()
  const job = jobs.get(id)
  if (!job) return undefined

  if (job.status === 'error') {
    const presets = job.presets.map((presetId) => ({ presetId, progress: 0 }))
    return { status: 'error', stage: 'error', progress: 0, presets, error: job.error }
  }

  const elapsed = Date.now() - job.createdAt
  const ratio = Math.max(0, Math.min(1, elapsed / job.durationMs))
  const progress = Math.round(ratio * 100)

  // Status derives from BOTH simulated progress AND whether real downloads
  // are present. Don't flip to 'done' until the Modal worker has returned
  // signed URLs — otherwise we'd have a "ready" job with no actual files.
  let status: JobStatus = 'running'
  if (progress === 0) status = 'queued'
  // Only mark as done when downloads exist; the simulated timer just paces UX
  if (progress >= 100 && job.downloads && job.downloads.length > 0) status = 'done'

  // Per-preset progress (stagger slightly). Hold at 99% until real downloads land.
  const cappedProgress = job.downloads ? progress : Math.min(99, progress)
  const presets = job.presets.map((presetId, idx) => ({
    presetId,
    progress: Math.min(100, Math.max(5, Math.round(cappedProgress - idx * 5))),
  }))

  const downloads = status === 'done' ? job.downloads : undefined
  const stage: RenderStage = status === 'done' ? 'done' : (job.stage || (status === 'queued' ? 'queued' : 'encoding'))

  const eta = status === 'done' ? undefined : Math.max(1, Math.round((job.durationMs - elapsed) / 1000))
  job.status = status

  return { status, stage, progress: cappedProgress, eta, presets, downloads }
}

export function setRenderJobDownloads(id: string, outputs: { presetId: string; url: string; key?: string }[]) {
  if (useRedis && redisStore?.setRenderJobDownloads) {
    // @ts-expect-error
    return redisStore.setRenderJobDownloads(id, outputs)
  }
  assertSharedStore()
  const job = jobs.get(id)
  // Throw rather than silently no-op — a missing job here means cross-instance
  // write loss (in-memory mode in multi-container env). The bg fn's catch turns
  // this into a `persist_failed` job error, surfacing the real problem.
  if (!job) throw new Error(`job_not_found_in_memory_store: ${id}`)
  const exp = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  job.downloads = outputs.map((o) => ({ presetId: o.presetId, url: o.url, expiresAt: exp, key: o.key }))
  job.stage = 'done'
  jobs.set(id, job)
}

export function setRenderJobError(id: string, error?: string) {
  if (useRedis && redisStore?.setRenderJobError) {
    // @ts-expect-error
    return redisStore.setRenderJobError(id, error)
  }
  assertSharedStore()
  const job = jobs.get(id)
  if (!job) throw new Error(`job_not_found_in_memory_store: ${id}`)
  job.status = 'error'
  job.stage = 'error'
  if (error) job.error = error
  jobs.set(id, job)
}

export function setRenderJobStage(id: string, stage: RenderStage) {
  if (useRedis && redisStore?.setRenderJobStage) {
    // @ts-expect-error
    return redisStore.setRenderJobStage(id, stage)
  }
  assertSharedStore()
  const job = jobs.get(id)
  if (!job) throw new Error(`job_not_found_in_memory_store: ${id}`)
  job.stage = stage
  jobs.set(id, job)
}
