import { useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { StudioStepper } from './components/StudioStepper'
import { InsightsPanel } from './components/InsightsPanel'
import { UploadStage } from './components/stages/UploadStage'
import { AnalysisStage } from './components/stages/AnalysisStage'
import { MusicStage } from './components/stages/MusicStage'
import { EditorStage } from './components/stages/EditorStage'
import { ExportStage } from './components/stages/ExportStage'
import { useStudioState, type StageKey } from './state/useStudioState'
import { api } from './lib/apiClient'
import { assembleEdit, toSeconds as toSecondsFromTs, type Segment as CoreSegment } from '@hhs/core'
import {
  buildMockHighlights,
  buildMockBeatMarkers,
  buildMockEnergyCurve,
  buildMockTracks,
  buildMockInsights,
} from './data/mockData'

export default function App() {
  const [isRendering, setIsRendering] = useState(false)
  const renderTimers = useRef<number[]>([])
  const assetIdRef = useRef<string | undefined>(undefined)
  const proxyUrlRef = useRef<string | undefined>(undefined)
  const {
    assetId,
    proxyUrl,
    currentStage,
    stageStatus,
    fileInfo,
    ingestUpload,
    tasks,
    processingProgress,
    highlights,
    beatMarkers,
    energyCurve,
    musicTracks,
    selectedTrackId,
    exportPresets,
    exportDownloads,
    renderStatus,
    insights,
    updateTask,
    setProcessingProgress,
    setStageStatus,
    setCurrentStage,
    setHighlights,
    setBeatMarkers,
    setEnergyCurve,
    setMusicTracks,
    selectTrack,
    markPresetProgress,
    togglePreset,
    setRenderStatus,
    setExportDownloads,
    overlayConfig,
    setOverlayConfig,
    setInsights,
    setAssetInfo,
    targetJersey,
    setTargetJersey,
    uploadRunId,
    reset,
  } = useStudioState(useShallow((state) => ({
    assetId: state.assetId,
    proxyUrl: state.proxyUrl,
    currentStage: state.currentStage,
    stageStatus: state.stageStatus,
    fileInfo: state.fileInfo,
    ingestUpload: state.ingestUpload,
    tasks: state.tasks,
    processingProgress: state.processingProgress,
    highlights: state.highlights,
    beatMarkers: state.beatMarkers,
    energyCurve: state.energyCurve,
    musicTracks: state.musicTracks,
    selectedTrackId: state.selectedTrackId,
    exportPresets: state.exportPresets,
    exportDownloads: state.exportDownloads,
    renderStatus: state.renderStatus,
    insights: state.insights,
    updateTask: state.updateTask,
    setProcessingProgress: state.setProcessingProgress,
    setStageStatus: state.setStageStatus,
    setCurrentStage: state.setCurrentStage,
    setHighlights: state.setHighlights,
    setBeatMarkers: state.setBeatMarkers,
    setEnergyCurve: state.setEnergyCurve,
    setMusicTracks: state.setMusicTracks,
    selectTrack: state.selectTrack,
    markPresetProgress: state.markPresetProgress,
    togglePreset: state.togglePreset,
    setRenderStatus: state.setRenderStatus,
    setExportDownloads: state.setExportDownloads,
    overlayConfig: state.overlayConfig,
    setOverlayConfig: state.setOverlayConfig,
    setInsights: state.setInsights,
    setAssetInfo: state.setAssetInfo,
    targetJersey: state.targetJersey,
    setTargetJersey: state.setTargetJersey,
    uploadRunId: state.uploadRunId,
    reset: state.reset,
  })))

  assetIdRef.current = assetId
  proxyUrlRef.current = proxyUrl

  // Hoisted above the analysis effect so the new track-bound beat effect
  // can depend on `selectedTrack?.previewUrl` without forward-reference woes.
  const selectedTrack = useMemo(
    () => musicTracks.find((track) => track.id === selectedTrackId),
    [musicTracks, selectedTrackId],
  )

  useEffect(() => {
    if (!uploadRunId) return

    let progressValue = 0.15
    setProcessingProgress(progressValue)
    setStageStatus('analysis', 'active')
    updateTask('chunk-encoder', { status: 'running', progress: 10 })

    const tick = window.setInterval(() => {
      progressValue = Math.min(0.97, progressValue + 0.03)
      setProcessingProgress(progressValue)
    }, 450)

    ;(async () => {
      const fallbackNotes: string[] = []

      // Offline dev mode: skip every API call, seed the store from
      // `data/mockData.ts`, and short-circuit straight to the music stage.
      // Useful for local UI work without Modal/Pixabay creds.
      if (import.meta.env.VITE_USE_MOCK_DATA === 'true') {
        const mockHi = buildMockHighlights()
        const mockBeats = buildMockBeatMarkers()
        const mockCurve = buildMockEnergyCurve()
        const mockTracks = buildMockTracks()
        const mockInsights = buildMockInsights()
        setHighlights(mockHi)
        setBeatMarkers(mockBeats)
        setEnergyCurve(mockCurve)
        setMusicTracks(mockTracks)
        setInsights({
          ...mockInsights,
          notes: [...mockInsights.notes, 'Mock-data mode (VITE_USE_MOCK_DATA=true) — no API calls were made.'],
        })
        updateTask('highlight-detection', { status: 'done', progress: 100 })
        updateTask('beat-sync', { status: 'done', progress: 100 })
        updateTask('music-intel', { status: 'done', progress: 100 })
        progressValue = 1
        setProcessingProgress(progressValue)
        setStageStatus('analysis', 'complete')
        setStageStatus('music', 'active')
        setCurrentStage('music')
        setRenderStatus('Running with mock data (VITE_USE_MOCK_DATA=true).')
        window.clearInterval(tick)
        return
      }

      try {
        // Step 1: Highlights
        updateTask('highlight-detection', { status: 'running', progress: 10 })
        const hi = await api.detectHighlights({ videoUrl: proxyUrlRef.current || fileInfo?.previewUrl })
        if ((hi as any).fallback) {
          fallbackNotes.push('Highlights are demo data — configure GPU_WORKER_BASE_URL for real GPT-4o detection.')
        }
        const mapped = (hi as any).segments?.map((s: any, i: number) => {
          if (s?.timestamp && s?.action) return s
          const action = s.label === 'dunk' ? 'Dunk' : s.label === 'three' ? 'Three Pointer' : 'Assist'
          const clipDuration = Math.max(0, (s.end ?? 0) - (s.start ?? 0))
          const mm = Math.floor((s.start ?? 0) / 60)
          const ss = Math.round((s.start ?? 0) % 60)
          const timestamp = `${mm > 0 ? `${mm}m ` : ''}${String(ss).padStart(2, '0')}`
          return {
            id: s.id || `seg-${i + 1}`,
            timestamp,
            action: action as any,
            descriptor: `${action} - auto-detected`,
            confidence: s.confidence ?? 0.9,
            audioPeak: 0.6,
            motion: 0.7,
            score: s.score ?? 0.85,
            clipDuration,
          }
        })
        setHighlights(mapped || [])
        updateTask('highlight-detection', { status: 'done', progress: 100 })

        // Step 2: Beats — emphasize downbeats (every 4th beat) when no explicit downbeat array is provided
        updateTask('beat-sync', { status: 'running', progress: 20 })
        const beats = await api.detectBeats({ assetId: assetIdRef.current, trackId: selectedTrackId, trackUrl: selectedTrack?.previewUrl, previewUrl: selectedTrack?.previewUrl })
        if ((beats as any).fallback) {
          fallbackNotes.push('Beat grid is the canned 130 BPM stub — configure GPU_WORKER_BASE_URL for librosa-based BPM/beat detection.')
        }
        const downbeatSet = new Set((beats.downbeats || []).map((t) => t.toFixed(3)))
        const markers = beats.beatGrid.map((t, idx) => {
          const isDownbeat = downbeatSet.size > 0 ? downbeatSet.has(t.toFixed(3)) : idx % 4 === 0
          return { id: `beat-${idx}`, time: t, intensity: isDownbeat ? 0.95 : 0.55 }
        })
        setBeatMarkers(markers)
        updateTask('beat-sync', { status: 'done', progress: 100 })

        // Step 3: Music — also pulls audio energy profile so we can render an honest momentum arc
        updateTask('music-intel', { status: 'running', progress: 25 })
        const rec = await api.recommendMusic({ assetId: assetIdRef.current, proxyUrl: proxyUrlRef.current })
        if (rec.fallback) {
          fallbackNotes.push('Music is demo silent audio — configure MUSIC_API_KEY (Pixabay) for real previews.')
        }
        const tracks = rec.tracks.map((t, i) => ({
          id: `track-${i + 1}`,
          title: t.title,
          artist: t.artist || 'Unknown',
          bpm: t.bpm,
          mood: (['High Energy', 'Hybrid Trap', 'Anthemic', 'Electro Drive'].includes(t.mood)
            ? t.mood
            : 'High Energy') as any,
          energyLevel: Math.round(Math.min(1, Math.max(0, t.energy / (t.energy > 1 ? 100 : 1))) * 100),
          matchScore: typeof t.matchScore === 'number' ? t.matchScore : 90 - i * 3,
          key: t.key || 'E Minor',
          previewUrl: t.url,
          waveform: Array.isArray(t.waveform) && t.waveform.length > 0
            ? t.waveform.slice(0, 32).map((v) => Math.min(1, Math.max(0.25, v)))
            : Array.from({ length: 32 }, (_, idx) => Math.min(1, Math.max(0.25, 0.7 + Math.sin(idx / 3) * 0.15))),
          fallback: !!t.fallback || !!rec.fallback,
        }))
        setMusicTracks(tracks)

        // Use server-derived energy curve when present (audio analysis from worker), else synthesize from beats
        const serverCurve = Array.isArray(rec.energyCurve) ? rec.energyCurve : []
        const curve = serverCurve.length > 0
          ? serverCurve.slice(0, 32)
          : Array.from({ length: Math.min(24, markers.length) }, (_, i) => 0.5 + 0.5 * Math.sin(i / 3))
        setEnergyCurve(curve)

        // Insights — averages reflect real signal from worker when available
        const avgConf = mapped.reduce((a: number, b: any) => a + (b.confidence || 0.8), 0) / Math.max(mapped.length, 1)
        const downbeatCount = markers.filter((m) => m.intensity >= 0.9).length
        const beatAlignment = markers.length > 0 ? Math.min(1, downbeatCount / Math.max(1, markers.length / 4)) : 0.8
        const crowdEnergy = curve.length > 0
          ? Math.min(1, curve.reduce((a, b) => a + b, 0) / curve.length)
          : Math.min(1, markers.reduce((a, b) => a + b.intensity, 0) / Math.max(markers.length, 1))
        setInsights({
          accuracy: avgConf,
          beatAlignment,
          crowdEnergy,
          notes: [
            mapped[0]?.descriptor ? `Top moment: ${mapped[0].descriptor}` : 'Highlights detected',
            `Beat grid length: ${markers.length} (${downbeatCount} downbeats)`,
            tracks[0]?.title ? `Top track match: ${tracks[0].title} @ ${tracks[0].bpm} BPM` : 'Music ranked by BPM/energy fit',
            ...fallbackNotes,
          ],
        })

        if (fallbackNotes.length > 0) {
          setRenderStatus('Analysis used stub data for one or more steps. Open System Health (Export panel) for details.')
        }

        progressValue = 1
        setProcessingProgress(progressValue)
        setStageStatus('analysis', 'complete')
        setStageStatus('music', 'active')
        setCurrentStage('music')
      } catch (err) {
        setRenderStatus(`Analysis error: ${err}`)
        setStageStatus('analysis', 'pending')
      } finally {
        window.clearInterval(tick)
      }
    })()
  }, [
    uploadRunId,
    fileInfo?.previewUrl,
    setProcessingProgress,
    setStageStatus,
    updateTask,
    setHighlights,
    setBeatMarkers,
    setEnergyCurve,
    setMusicTracks,
    setInsights,
    setCurrentStage,
    setRenderStatus,
  ])

  // Re-run beat detection once the user picks a track. The first-pass
  // detection in the analysis effect runs before track selection so it
  // can only return the canned 130 BPM grid; here we feed the chosen
  // track's previewUrl to the worker for a real BPM/beatGrid/downbeats.
  // The `cancelled` guard avoids race conditions when the user clicks
  // through several tracks quickly.
  useEffect(() => {
    if (!selectedTrackId || !selectedTrack?.previewUrl) return
    // Skip URLs that Modal /beats can't fetch + analyze:
    //   - data: URIs (silent demo WAVs — librosa on silence is meaningless)
    //   - non-http URLs ('#' from broken provider responses, blob:, etc.)
    // Without this guard, librosa 500s on the HTML/empty payload and we burn
    // a Modal cold-start every track click for no benefit.
    if (!/^https?:\/\//i.test(selectedTrack.previewUrl)) return
    let cancelled = false
    ;(async () => {
      try {
        const beats = await api.detectBeats({
          assetId: assetIdRef.current,
          trackId: selectedTrackId,
          trackUrl: selectedTrack.previewUrl,
          previewUrl: selectedTrack.previewUrl,
        })
        if (cancelled) return
        const downbeatSet = new Set((beats.downbeats || []).map((t) => t.toFixed(3)))
        const markers = beats.beatGrid.map((t, idx) => {
          const isDownbeat = downbeatSet.size > 0 ? downbeatSet.has(t.toFixed(3)) : idx % 4 === 0
          return { id: `beat-${idx}`, time: t, intensity: isDownbeat ? 0.95 : 0.55 }
        })
        setBeatMarkers(markers)
      } catch (err) {
        console.warn('[detectBeats track-bound] failed; keeping first-pass grid', err)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedTrackId, selectedTrack?.previewUrl, setBeatMarkers])

  const handleFileAccepted = async (file: File, previewUrl: string) => {
    try {
      updateTask('chunk-encoder', { status: 'running', progress: 5 })
      setStageStatus('analysis', 'active')

      // Prefer Uppy + Tus if configured via Vite env
      const tusEndpoint = (import.meta as any).env?.VITE_TUS_ENDPOINT as string | undefined
      if (tusEndpoint) {
        try {
          const [{ default: Uppy }, { default: Tus }] = await Promise.all([
            import('@uppy/core'),
            import('@uppy/tus'),
          ])
          const uppy = new Uppy({ autoProceed: false })
          uppy.use(Tus, {
            endpoint: tusEndpoint,
            retryDelays: [0, 1000, 3000, 5000],
            chunkSize: 5 * 1024 * 1024,
            removeFingerprintOnSuccess: true,
          })
          uppy.on('upload-progress', (_file: any, progress: any) => {
            const pct = Math.min(95, Math.round(progress.percentage || 0))
            updateTask('chunk-encoder', { progress: pct })
            setProcessingProgress(Math.max(0.05, pct / 100))
          })
          uppy.on('complete', () => {
            updateTask('chunk-encoder', { status: 'done', progress: 100 })
            ;(uppy as any).close?.()
            ingestUpload({ file, previewUrl })
          })
          uppy.addFile({ data: file, name: file.name, type: file.type })
          await uppy.upload()
          return
        } catch (e) {
          // Fall back to presigned PUT if Uppy fails
        }
      }

      const { uploadUrl, assetId: newAssetId, key } = await api.createUploadUrl({ fileName: file.name, size: file.size, type: file.type })

      // Upload via XHR to track progress (fetch lacks upload progress events)
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', uploadUrl, true)
        xhr.upload.onprogress = (evt) => {
          if (!evt.lengthComputable) return
          const pct = Math.min(95, Math.round((evt.loaded / evt.total) * 100))
          updateTask('chunk-encoder', { progress: pct })
          setProcessingProgress(Math.max(0.05, pct / 100))
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            updateTask('chunk-encoder', { status: 'done', progress: 100 })
            resolve()
          } else {
            reject(new Error(`Upload failed: ${xhr.status}`))
          }
        }
        xhr.onerror = () => reject(new Error('Upload network error'))
        xhr.setRequestHeader('content-type', file.type)
        xhr.send(file)
      })

      // Start analysis pipeline immediately; ingest runs in background
      ingestUpload({ file, previewUrl })
      if (newAssetId && key) {
        api.ingestAsset({ assetId: newAssetId, key })
          .then(ingest => {
            if (ingest?.proxyUrl) setRenderStatus('Proxy generated; proceeding to analysis...')
            setAssetInfo({ assetId: newAssetId, proxyUrl: ingest?.proxyUrl })
          })
          .catch(e => setRenderStatus(`Ingest error: ${e}`))
      }
    } catch (e) {
      setRenderStatus(`Upload error: ${e}`)
    }
  }

  const handleAdvanceFromAnalysis = () => {
    setCurrentStage('music')
  }

  // "Lock tracking" — re-runs /highlights with the chosen jersey so GPT-4o
  // returns per-scene bboxes for that player. Merges bboxes into existing
  // highlights so the user keeps their list/order; segments where the player
  // wasn't found get no bbox and fall back to ball-weighted reframe.
  const [isLockingTracking, setIsLockingTracking] = useState(false)
  const [voiceoverEnabled, setVoiceoverEnabled] = useState(false)
  const [sfxEnabled, setSfxEnabled] = useState(true)
  const handleLockTracking = async () => {
    if (!targetJersey || !assetId) return
    setIsLockingTracking(true)
    try {
      const hi = await api.detectHighlights({
        assetId,
        proxyUrl: proxyUrlRef.current,
        videoUrl: proxyUrlRef.current || fileInfo?.previewUrl,
        targetJersey,
      })
      const segs = (hi as any).segments || []
      // Index incoming bboxes by id, fall back to timestamp+action match
      const bboxById = new Map<string, number[]>()
      const bboxByTs = new Map<string, number[]>()
      for (const s of segs) {
        if (s?.featuredBbox && Array.isArray(s.featuredBbox) && s.featuredBbox.length >= 2) {
          if (s.id) bboxById.set(String(s.id), s.featuredBbox)
          if (s.timestamp && s.action) bboxByTs.set(`${s.timestamp}|${s.action}`, s.featuredBbox)
        }
      }
      const merged = highlights.map((h) => {
        const next = bboxById.get(h.id) || bboxByTs.get(`${h.timestamp}|${h.action}`)
        return next ? { ...h, featuredBbox: next } : h
      })
      setHighlights(merged)
      setRenderStatus(`Tracking locked on #${targetJersey}.`)
    } catch (e: any) {
      setRenderStatus(`Lock tracking failed: ${e?.message || e}`)
    } finally {
      setIsLockingTracking(false)
    }
  }

  const handleSelectTrack = (trackId: string) => {
    selectTrack(trackId)
  }

  const handleLockTrack = (trackId: string) => {
    setStageStatus('music', 'complete')
    if (stageStatus.editor === 'pending') {
      setStageStatus('editor', 'active')
    }
    setCurrentStage('editor')
  }

  const handleOpenExport = () => {
    setStageStatus('editor', 'complete')
    setStageStatus('export', 'active')
    setCurrentStage('export')
  }

  const handleStartRender = () => {
    renderTimers.current.forEach((id: number) => window.clearTimeout(id))
    renderTimers.current = []

    const enabled = exportPresets.filter((preset) => preset.enabled)
    if (enabled.length === 0 || isRendering) {
      setRenderStatus('Enable at least one preset to start rendering.')
      return
    }

    setIsRendering(true)
    setRenderStatus('Submitting render job...')
    setStageStatus('export', 'active')

    enabled.forEach((p) => markPresetProgress(p.id, 5))

    ;(async () => {
      try {
        // Build beat-aligned cut list (±0.3s) via the shared @hhs/core engine.
        // Filter to selected jersey first so the targetLength budget is spent
        // on the right plays.
        const filteredHighlights = targetJersey
          ? highlights.filter((h) => (h.jerseyNumbers || []).includes(targetJersey))
          : highlights

        // Map UI HighlightSegment → core Segment shape so assembleEdit can do
        // the heavy lifting (sort by score, action multipliers, beat snap,
        // clamp, impact bias, target-length cap).
        const inputSegments: CoreSegment[] = filteredHighlights.map((h) => ({
          id: h.id,
          start: toSecondsFromTs(h.timestamp),
          end: toSecondsFromTs(h.timestamp) + (h.clipDuration || 2),
          label: h.action,
          action: h.action,
          confidence: h.confidence,
          score: h.score,
          // Pass through bbox only when tracking is locked on a player.
          bbox:
            targetJersey && h.featuredBbox && h.featuredBbox.length >= 2
              ? h.featuredBbox
              : undefined,
        }))
        const grid = beatMarkers.map((b) => b.time)
        const tunedSegments = assembleEdit(inputSegments, 60, grid)

        // Drop bbox unless tracking is locked (stripping undefined keeps the
        // payload lean for the GPU worker).
        const segments = tunedSegments.map((s) => {
          const base: { start: number; end: number; impact?: number; action?: string; bbox?: number[] } = {
            start: s.start,
            end: s.end,
            impact: s.impact,
            action: s.action,
          }
          if (s.bbox) base.bbox = s.bbox
          return base
        })

        const payload = {
          assetId,
          trackId: selectedTrack?.id,
          presets: enabled.map((p) => ({ presetId: p.id })),
          metadata: {
            overlay: overlayConfig,
            trackUrl: selectedTrack?.previewUrl,
            segments,
            targetJersey,
            voiceover: voiceoverEnabled,
            sfx: sfxEnabled,
          },
        }
        const { jobId } = await api.startRenderJob(payload)
        setRenderStatus(`Render job queued: ${jobId}`)

        // Poll job status
        const pollStartedAt = Date.now()
        // Past Modal's 12-min budget + 2-min buffer for cold start. If we're
        // still polling after this, the bg fn died silently and the user
        // would otherwise be stuck staring at a stage label forever.
        const STALL_FLOOR_MS = 14 * 60 * 1000
        const fmtElapsed = (ms: number) => {
          const s = Math.floor(ms / 1000)
          return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
        }
        const stageLabel = (stage?: string) => {
          switch (stage) {
            case 'queued': return 'Queued…'
            case 'dispatched': return 'Sending to GPU worker…'
            case 'encoding': return 'Rendering on GPU (this can take 2–12 min)…'
            default: return 'Rendering…'
          }
        }
        const poll = window.setInterval(async () => {
          try {
            const status = await api.getJobStatus({ jobId })
            console.debug('[render-poll]', { jobId, ...status })
            const presetProgress = status.presets
            if (presetProgress && Array.isArray(presetProgress)) {
              presetProgress.forEach((pp) => markPresetProgress(pp.presetId, Math.min(99, pp.progress)))
            }

            if (status.status === 'done') {
              enabled.forEach((p) => markPresetProgress(p.id, 100))
              // Visible-by-default log so we can triage "done but no downloads"
              // without enabling Verbose level in the browser console.
              console.warn('[render-done] payload', {
                jobId,
                hasPayloadDownloads: !!status.payload?.downloads,
                count: status.payload?.downloads?.length ?? 0,
                status,
              })
              if (status.payload?.downloads && status.payload.downloads.length > 0) {
                setExportDownloads(status.payload.downloads)
              }
              // Refresh signed URLs via finalizeExport — but don't silently
              // swallow errors. If re-signing fails, leave the payload-set
              // URLs alone (they're valid for 1h) and surface the failure.
              let finalizeFailed = false
              try {
                const fz = await api.finalizeExport({ renderJobId: jobId })
                if (fz?.downloads && fz.downloads.length > 0) {
                  setExportDownloads(fz.downloads)
                } else {
                  console.warn('[finalize] returned empty downloads', fz)
                }
              } catch (e: any) {
                finalizeFailed = true
                console.error('[finalize] failed', e)
              }
              const finalDownloads = useStudioState.getState().exportDownloads
              if (finalDownloads.length === 0) {
                // Lying "All exports complete" with no actual files would send
                // the user looking in the wrong place. Tell them the truth.
                setRenderStatus(
                  finalizeFailed
                    ? 'Render finished but URL re-signing failed. Refresh the page and try again.'
                    : 'Render reported complete but no downloads were produced. Check Modal logs for ffmpeg/upload errors.',
                )
                setStageStatus('export', 'active')
              } else {
                setRenderStatus('All exports complete. Signed URLs ready.')
                setStageStatus('export', 'complete')
              }
              setIsRendering(false)
              window.clearInterval(poll)
            } else if (status.status === 'error') {
              const reason = status.error
              const friendly =
                reason === 'modal_timeout'
                  ? 'Render timed out — the GPU worker took too long to respond. Please retry.'
                  : reason === 'no_outputs'
                    ? 'Render failed — the worker returned no files (likely an ffmpeg or storage error). Please retry.'
                    : reason === 'no_worker_configured'
                      ? 'Render failed — GPU worker is not configured on the server. Open System Health to verify.'
                      : reason === 'persist_failed'
                        ? 'Render failed — the server could not save the result. The job store may be misconfigured (Redis not set?). Open System Health to verify.'
                        : reason && reason.startsWith('kickoff_')
                          ? "Render couldn't be dispatched to the GPU worker. Please retry."
                          : reason && reason.startsWith('modal_')
                            ? `Render failed (worker error ${reason.replace('modal_', '')}). Please retry.`
                            : 'Render failed. Please retry.'
              setRenderStatus(friendly)
              setIsRendering(false)
              window.clearInterval(poll)
            } else if (Date.now() - pollStartedAt > STALL_FLOOR_MS) {
              // Final safety net: bg fn died without writing an error and the
              // job is past Modal's own timeout budget.
              setRenderStatus('Render is taking longer than expected and may have failed silently. Please retry.')
              setIsRendering(false)
              window.clearInterval(poll)
            } else {
              const elapsed = fmtElapsed(Date.now() - pollStartedAt)
              setRenderStatus(`${stageLabel(status.stage)} ${elapsed} — ${jobId.slice(-8)}`)
            }
          } catch (e) {
            setRenderStatus(`Render polling error: ${e}`)
            setIsRendering(false)
          }
        }, 800)
        renderTimers.current.push(poll)
      } catch (e: any) {
        let msg = `Failed to start render: ${e}`
        const raw = typeof e?.message === 'string' ? e.message : ''
        try {
          const parsed = JSON.parse(raw)
          if (parsed?.detail === 'RENDER_CONCURRENCY_LIMIT') {
            msg = 'You already have a render in progress. Please wait for it to finish, or check the export panel below.'
          } else if (parsed?.title) {
            msg = `Failed to start render: ${parsed.title}${parsed.detail ? ` (${parsed.detail})` : ''}`
          }
        } catch (parseErr) {
          // Server returned a non-JSON 5xx body. Useful when Netlify itself
          // is throwing (e.g. function bundle error — the body is HTML).
          console.warn('[render-error] non-JSON response from startRenderJob', parseErr, raw)
        }
        setRenderStatus(msg)
        setIsRendering(false)
      }
    })()
  }

  const handleDeleteExport = async (presetId: string) => {
    try {
      if (!assetId) {
        setRenderStatus('Cannot delete export: missing assetId')
        return
      }
      const res = await api.deleteExport({ assetId, presetId })
      if ((res as any).deleted) {
        setExportDownloads(exportDownloads.filter((d) => d.presetId !== presetId))
        markPresetProgress(presetId, 0)
        setRenderStatus(`Deleted export for ${presetId}.`)
      } else {
        setRenderStatus(`Failed to delete export ${presetId}.`)
      }
    } catch (e) {
      setRenderStatus(`Delete export error: ${e}`)
    }
  }

  const handleDeleteAsset = async () => {
    try {
      if (!assetId) {
        reset()
        return
      }
      await api.deleteAsset({ assetId })
      reset()
      setRenderStatus('Asset deleted and session cleared.')
    } catch (e) {
      setRenderStatus(`Delete asset error: ${e}`)
    }
  }

  useEffect(
    () => () => {
      renderTimers.current.forEach((id: number) => window.clearTimeout(id))
    },
    [],
  )

  useEffect(() => {
    const url = fileInfo?.previewUrl
    if (!url) return
    return () => URL.revokeObjectURL(url)
  }, [fileInfo?.previewUrl])

  const renderPrimaryStage = (stage: StageKey) => {
    switch (stage) {
      case 'upload':
        return (
          <UploadStage fileInfo={fileInfo} onFileAccepted={handleFileAccepted} isProcessing={stageStatus.analysis !== 'pending'} />
        )
      case 'analysis':
        return (
          <AnalysisStage
            tasks={tasks}
            processingProgress={processingProgress}
            highlights={highlights}
            beatMarkers={beatMarkers}
            energyCurve={energyCurve}
            targetJersey={targetJersey}
            onTargetJerseyChange={setTargetJersey}
            onLockTracking={handleLockTracking}
            isLockingTracking={isLockingTracking}
            onProceed={handleAdvanceFromAnalysis}
          />
        )
      case 'music':
        return (
          <MusicStage
            tracks={musicTracks}
            selectedTrackId={selectedTrackId}
            onSelect={handleSelectTrack}
            onLock={handleLockTrack}
          />
        )
      case 'editor':
        return (
          <EditorStage
            fileInfo={fileInfo}
            highlights={highlights}
            beatMarkers={beatMarkers}
            selectedTrack={selectedTrack}
            onLaunchExport={handleOpenExport}
            overlayConfig={overlayConfig}
            onOverlayChange={setOverlayConfig}
          />
        )
      case 'export':
        return (
          <ExportStage
            presets={exportPresets}
            onTogglePreset={togglePreset}
            onStartRender={handleStartRender}
            renderStatus={renderStatus}
            isRendering={isRendering}
            downloads={exportDownloads}
            onDeleteExport={handleDeleteExport}
            onDeleteAsset={handleDeleteAsset}
            voiceoverEnabled={voiceoverEnabled}
            onVoiceoverToggle={setVoiceoverEnabled}
            sfxEnabled={sfxEnabled}
            onSfxToggle={setSfxEnabled}
          />
        )
      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#312e81,_#020617)] text-slate-100">
      <div className="border-b border-white/10 bg-slate-950/60">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-indigo-300/80">Hoops Hype Studio</p>
              <h1 className="mt-2 text-3xl font-bold text-white">AI-Powered Basketball Hype Lab</h1>
              <p className="mt-2 max-w-xl text-sm text-slate-300">
                Upload raw games. We auto-detect highlights, sync to hype tracks, apply motion-aware color, and export in
                every format your audience needs.
              </p>
            </div>
            <div className="flex flex-col items-end gap-3">
              <div className="rounded-2xl border border-indigo-400/40 bg-indigo-500/10 px-5 py-4 text-sm text-indigo-100 shadow-lg shadow-indigo-500/20">
                <p className="text-xs uppercase tracking-[0.18em] text-indigo-200/80">Deployment</p>
                <p className="mt-1 font-semibold text-white">Netlify Edge / Serverless Functions / GPU Worker</p>
                <p className="text-xs text-indigo-100/70">Built for high-volume weekend tournaments & AAU seasons.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  reset()
                  setRenderStatus(undefined)
                  setIsRendering(false)
                }}
                className="rounded-full border border-white/20 bg-slate-900/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-200 transition hover:border-white/40 hover:bg-slate-900/80"
              >
                Start New Session
              </button>
            </div>
          </header>
          <div className="mt-6">
            <StudioStepper
              stageStatus={stageStatus}
              currentStage={currentStage}
              onNavigate={(stage) => {
                const isUnlocked = stageStatus[stage] !== 'pending' || stage === 'upload'
                if (isUnlocked) {
                  setCurrentStage(stage)
                }
              }}
            />
          </div>
        </div>
      </div>

      <main className="relative -mt-10 pb-20 pt-14">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 lg:flex-row">
          <section className="flex-1 space-y-6 rounded-3xl border border-white/10 bg-slate-950/60 p-6 backdrop-blur">
            {renderPrimaryStage(currentStage)}
          </section>
          <InsightsPanel insights={insights} fileInfo={fileInfo} highlights={highlights} selectedTrack={selectedTrack} />
        </div>
      </main>
    </div>
  )
}
