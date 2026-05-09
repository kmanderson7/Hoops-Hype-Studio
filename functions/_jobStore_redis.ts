type JobStatus = 'queued' | 'running' | 'done' | 'error'
export type RenderStage = 'queued' | 'dispatched' | 'encoding' | 'done' | 'error'

export interface RenderJob {
  id: string
  assetId?: string
  trackId?: string
  presets: string[]
  createdAt: number
  durationMs: number
  status: JobStatus
  stage?: RenderStage
  downloads?: { presetId: string; url: string; expiresAt: string; key?: string }[]
  error?: string
}

const base = process.env.UPSTASH_REDIS_REST_URL || ''
const token = process.env.UPSTASH_REDIS_REST_TOKEN || ''

async function redisCmd(cmd: string[]): Promise<any> {
  if (!base || !token) throw new Error('Upstash Redis env not configured')
  const url = `${base}/${cmd.map((s) => encodeURIComponent(s)).join('/')}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Redis error: ${res.status}`)
  return res.json()
}

interface RealProgress {
  progress: number
  stage?: RenderStage
  presets?: { presetId: string; progress: number }[]
  note?: string
  ts?: number
}

/**
 * Read Modal-written progress from Upstash. Modal writes the JSON via
 * `_write_progress(...)` at job:<id>:progress. Returns null if absent or
 * malformed — caller falls back to the simulated elapsed-vs-randomMs path.
 */
async function readRealProgress(id: string): Promise<RealProgress | null> {
  try {
    const out = await redisCmd(['GET', `job:${id}:progress`])
    const val = out?.result
    if (!val || typeof val !== 'string') return null
    const parsed = JSON.parse(val) as RealProgress
    if (typeof parsed?.progress !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

const randomMs = (min: number, max: number) => Math.floor(min + Math.random() * (max - min))

export async function createRenderJob(params: { assetId?: string; trackId?: string; presets: string[] }): Promise<RenderJob> {
  const id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const job: RenderJob = {
    id,
    assetId: params.assetId,
    trackId: params.trackId,
    presets: params.presets,
    createdAt: Date.now(),
    durationMs: randomMs(5000, 12000),
    status: 'queued',
    stage: 'queued',
  }
  await redisCmd(['SET', `job:${id}`, JSON.stringify(job)])
  return job
}

export async function getRenderJob(id: string): Promise<RenderJob | undefined> {
  const out = await redisCmd(['GET', `job:${id}`])
  const val = out?.result
  if (!val) return undefined
  try {
    return JSON.parse(val)
  } catch {
    return undefined
  }
}

export async function setRenderJob(job: RenderJob): Promise<void> {
  await redisCmd(['SET', `job:${job.id}`, JSON.stringify(job)])
}

export async function getRenderJobStatus(id: string): Promise<{
  status: JobStatus
  stage?: RenderStage
  progress: number
  eta?: number
  presets: { presetId: string; progress: number }[]
  downloads?: { presetId: string; url: string; expiresAt: string; key?: string }[]
  error?: string
} | undefined> {
  const job = await getRenderJob(id)
  if (!job) return undefined
  if (job.status === 'error') {
    const presets = job.presets.map((p) => ({ presetId: p, progress: 0 }))
    return { status: 'error', stage: 'error', progress: 0, presets, error: job.error }
  }
  // Prefer real progress written by Modal (`_write_progress`) over the
  // simulated elapsed-vs-randomMs path. Real values give the UI a smooth
  // climb from source-resolved → encoding → upload → done over the actual
  // 30-180s rather than hitting 99% in 9s and stalling.
  const real = await readRealProgress(id)
  const hasDownloads = !!(job.downloads && job.downloads.length > 0)

  if (real) {
    const status: JobStatus =
      real.progress === 0 && !hasDownloads ? 'queued' :
      real.progress >= 100 && hasDownloads ? 'done' :
      'running'
    const cappedProgress = hasDownloads ? real.progress : Math.min(99, real.progress)
    const presets = real.presets && real.presets.length === job.presets.length
      ? real.presets
      : job.presets.map((p, i) => ({
          presetId: p,
          progress: Math.min(100, Math.max(5, cappedProgress - i * 5)),
        }))
    const stage: RenderStage = status === 'done' ? 'done' : (real.stage || job.stage || 'encoding')
    return {
      status,
      stage,
      progress: cappedProgress,
      eta: status === 'done' ? undefined : undefined,
      presets,
      downloads: status === 'done' ? job.downloads : undefined,
    }
  }

  // Simulated fallback. Capped at 25% so when Modal's first real
  // _write_progress lands (5/30/preset-bands/100) the curve doesn't visibly
  // jump backwards. Without this cap, the simulated value can hit 99% in
  // 9s while Modal is still starting up and then drops to 5 when the real
  // value arrives.
  const elapsed = Date.now() - job.createdAt
  const ratio = Math.max(0, Math.min(1, elapsed / job.durationMs))
  const rawProgress = Math.round(ratio * 100)
  const progress = hasDownloads ? rawProgress : Math.min(25, rawProgress)
  // Don't flip to 'done' until real downloads exist — otherwise we'd surface
  // a "ready" job whose files don't exist anywhere.
  const status: JobStatus = progress === 0 ? 'queued' : rawProgress >= 100 && hasDownloads ? 'done' : 'running'
  const cappedProgress = hasDownloads ? rawProgress : progress
  const presets = job.presets.map((p, i) => ({ presetId: p, progress: Math.min(100, Math.max(5, cappedProgress - i * 5)) }))
  const eta = status === 'done' ? undefined : Math.max(1, Math.round((job.durationMs - elapsed) / 1000))
  const stage: RenderStage = status === 'done' ? 'done' : (job.stage || (status === 'queued' ? 'queued' : 'encoding'))
  return { status, stage, progress: cappedProgress, eta, presets, downloads: status === 'done' ? job.downloads : undefined }
}

export async function setRenderJobDownloads(id: string, outputs: { presetId: string; url: string; key?: string }[]) {
  const job = await getRenderJob(id)
  if (!job) throw new Error(`job_not_found_in_redis_store: ${id}`)
  const exp = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  job.downloads = outputs.map((o) => ({ presetId: o.presetId, url: o.url, expiresAt: exp, key: o.key }))
  job.stage = 'done'
  await setRenderJob(job)
}

export async function setRenderJobError(id: string, error?: string) {
  const job = await getRenderJob(id)
  if (!job) throw new Error(`job_not_found_in_redis_store: ${id}`)
  job.status = 'error'
  job.stage = 'error'
  if (error) job.error = error
  await setRenderJob(job)
}

export async function setRenderJobStage(id: string, stage: RenderStage) {
  const job = await getRenderJob(id)
  if (!job) throw new Error(`job_not_found_in_redis_store: ${id}`)
  job.stage = stage
  await setRenderJob(job)
}

