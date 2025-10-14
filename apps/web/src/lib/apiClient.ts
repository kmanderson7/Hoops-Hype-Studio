export async function postJson<T>(fn: string, payload?: unknown): Promise<T> {
  const res = await fetch(`/.netlify/functions/${fn}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload ?? {}),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `Request failed: ${res.status}`)
  }
  return (await res.json()) as T
}

// Shapes returned by current function stubs
type DetectHighlightsFn = {
  segments: { id: string; start: number; end: number; label: string; confidence: number; score: number }[]
  proxyUrl?: string
}

type DetectBeatsFn = { bpm: number; beatGrid: number[] }

type RecommendMusicFn = {
  tracks: { url: string; title: string; bpm: number; mood: string; energy: number; license: string }[]
}

export const api = {
  createUploadUrl: (payload: { fileName: string; size: number; type: string; scope?: 'uploads' | 'logos' }) =>
    postJson<{ assetId: string; uploadUrl: string; proxyUrl?: string; key?: string }>('createUploadUrl', payload),
  detectHighlights: (payload: { videoUrl?: string }) => postJson<DetectHighlightsFn>('detectHighlights', payload),
  detectBeats: (payload: { assetId?: string; trackId?: string }) => postJson<DetectBeatsFn>('detectBeats', payload),
  recommendMusic: (payload: { assetId?: string; playStyle?: string; targetLength?: number }) =>
    postJson<RecommendMusicFn>('recommendMusic', payload),
  startRenderJob: (payload: { assetId?: string; trackId?: string; presets?: { presetId: string }[]; metadata?: any }) =>
    postJson<{ jobId: string }>('startRenderJob', payload),
  getJobStatus: (payload?: { jobId?: string }) =>
    postJson<{ status: 'queued' | 'running' | 'done' | 'error'; progress?: number; eta?: number; fileUrl?: string }>(
      'getJobStatus',
      payload,
    ),
  finalizeExport: (payload: { renderJobId: string }) =>
    postJson<{ downloads: { presetId: string; url: string; expiresAt: string }[] }>('finalizeExport', payload),
}
