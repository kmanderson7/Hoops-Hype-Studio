type JobStatus = 'queued' | 'running' | 'done' | 'error'

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
  // simulated total duration (ms)
  durationMs: number
  status: JobStatus
  // populated when done
  downloads?: { presetId: string; url: string; expiresAt: string }[]
}

const jobs = new Map<string, RenderJob>()

const randomMs = (min: number, max: number) => Math.floor(min + Math.random() * (max - min))

export function createRenderJob(params: { assetId?: string; trackId?: string; presets: string[] }): RenderJob {
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
  }
  jobs.set(id, job)
  return job
}

export function getRenderJob(id: string) {
  return jobs.get(id)
}

export function getRenderJobStatus(id: string): {
  status: JobStatus
  progress: number
  eta?: number
  presets: RenderPresetProgress[]
  downloads?: { presetId: string; url: string; expiresAt: string }[]
} | undefined {
  const job = jobs.get(id)
  if (!job) return undefined

  const elapsed = Date.now() - job.createdAt
  const ratio = Math.max(0, Math.min(1, elapsed / job.durationMs))
  const progress = Math.round(ratio * 100)

  let status: JobStatus = 'running'
  if (progress === 0) status = 'queued'
  if (progress >= 100) status = 'done'

  // Per-preset progress (stagger slightly)
  const presets = job.presets.map((presetId, idx) => ({
    presetId,
    progress: Math.min(100, Math.max(5, Math.round(progress - idx * 5))),
  }))

  // When complete, synthesize downloads and persist to job
  let downloads: { presetId: string; url: string; expiresAt: string }[] | undefined
  if (status === 'done') {
    if (!job.downloads) {
      const exp = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      job.downloads = job.presets.map((p) => ({
        presetId: p,
        url: `https://example.com/exports/${job.assetId ?? 'asset'}-${p}.mp4`,
        expiresAt: exp,
      }))
      jobs.set(id, job)
    }
    downloads = job.downloads
  }

  const eta = status === 'done' ? undefined : Math.max(1, Math.round((job.durationMs - elapsed) / 1000))
  job.status = status

  return { status, progress, eta, presets, downloads }
}

