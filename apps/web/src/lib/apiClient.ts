export async function postJson<T>(fn: string, payload?: unknown): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 25_000)
  try {
    const res = await fetch(`/.netlify/functions/${fn}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload ?? {}),
      signal: controller.signal,
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(text || `Request failed: ${res.status}`)
    }
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

// Shapes returned by current function stubs
type DetectHighlightsFn = {
  segments: {
    id: string
    start?: number
    end?: number
    label?: string
    timestamp?: string
    action?: string
    descriptor?: string
    confidence: number
    score: number
    audioPeak?: number
    motion?: number
    clipDuration?: number
    jerseyNumbers?: string[]
    featuredBbox?: number[]
  }[]
  proxyUrl?: string
}

type DetectBeatsFn = { bpm: number; beatGrid: number[]; downbeats?: number[] }

type RecommendMusicFn = {
  tracks: {
    url: string
    title: string
    artist?: string
    bpm: number
    mood: string
    energy: number
    license: string
    matchScore?: number
    key?: string
    waveform?: number[]
  }[]
  avgBpm?: number
  avgEnergy?: number
  energyCurve?: number[]
  peakMoments?: number[]
}

export const api = {
  createUploadUrl: (payload: { fileName: string; size: number; type: string; scope?: 'uploads' | 'logos' }) =>
    postJson<{ assetId: string; uploadUrl: string; proxyUrl?: string; key?: string }>('createUploadUrl', payload),
  detectHighlights: (payload: { videoUrl?: string; assetId?: string; proxyUrl?: string; targetJersey?: string }) =>
    postJson<DetectHighlightsFn>('detectHighlights', payload),
  detectBeats: (payload: { assetId?: string; trackId?: string; trackUrl?: string; previewUrl?: string }) =>
    postJson<DetectBeatsFn>('detectBeats', payload),
  recommendMusic: (payload: { assetId?: string; proxyUrl?: string; playStyle?: string; targetLength?: number; query?: string }) =>
    postJson<RecommendMusicFn>('recommendMusic', payload),
  startRenderJob: (payload: { assetId?: string; trackId?: string; presets?: { presetId: string }[]; metadata?: any }) =>
    postJson<{ jobId: string }>('startRenderJob', payload),
  getJobStatus: (payload?: { jobId?: string }) =>
    postJson<{ status: 'queued' | 'running' | 'done' | 'error'; progress?: number; eta?: number; fileUrl?: string; presets?: { presetId: string; progress: number }[] }>(
      'getJobStatus',
      payload,
    ),
  finalizeExport: (payload: { renderJobId: string }) =>
    postJson<{ downloads: { presetId: string; url: string; expiresAt: string }[] }>('finalizeExport', payload),
  ingestAsset: (payload: { assetId: string; key: string }) => postJson<{ proxyUrl?: string; waveformUrl?: string }>('ingestAsset', payload),
  deleteAsset: (payload: { assetId: string }) => postJson<{ deleted: { key: string; ok: boolean; status: number }[] }>('deleteAsset', payload),
  deleteExport: (payload: { assetId: string; presetId: string }) => postJson<{ deleted: boolean; key: string; status: number }>('deleteExport', payload),
}
