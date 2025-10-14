type JobStatus = 'queued' | 'running' | 'done' | 'error'

export interface RenderJob {
  id: string
  assetId?: string
  trackId?: string
  presets: string[]
  createdAt: number
  durationMs: number
  status: JobStatus
  downloads?: { presetId: string; url: string; expiresAt: string }[]
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
  progress: number
  eta?: number
  presets: { presetId: string; progress: number }[]
  downloads?: { presetId: string; url: string; expiresAt: string }[]
} | undefined> {
  const job = await getRenderJob(id)
  if (!job) return undefined
  const elapsed = Date.now() - job.createdAt
  const ratio = Math.max(0, Math.min(1, elapsed / job.durationMs))
  const progress = Math.round(ratio * 100)
  let status: JobStatus = progress === 0 ? 'queued' : progress >= 100 ? 'done' : 'running'
  const presets = job.presets.map((p, i) => ({ presetId: p, progress: Math.min(100, Math.max(5, progress - i * 5)) }))

  if (status === 'done' && !job.downloads) {
    const exp = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    job.downloads = job.presets.map((p) => ({ presetId: p, url: `https://example.com/exports/${job.assetId ?? 'asset'}-${p}.mp4`, expiresAt: exp }))
    await setRenderJob(job)
  }
  const eta = status === 'done' ? undefined : Math.max(1, Math.round((job.durationMs - elapsed) / 1000))
  return { status, progress, eta, presets, downloads: job.downloads }
}

export async function setRenderJobDownloads(id: string, outputs: { presetId: string; url: string }[]) {
  const job = await getRenderJob(id)
  if (!job) return
  const exp = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  job.downloads = outputs.map((o) => ({ ...o, expiresAt: exp }))
  await setRenderJob(job)
}

