import { useEffect, useMemo, useRef, useState } from 'react'
import { StudioStepper } from './components/StudioStepper'
import { InsightsPanel } from './components/InsightsPanel'
import { UploadStage } from './components/stages/UploadStage'
import { AnalysisStage } from './components/stages/AnalysisStage'
import { MusicStage } from './components/stages/MusicStage'
import { EditorStage } from './components/stages/EditorStage'
import { ExportStage } from './components/stages/ExportStage'
import { useStudioState, type StageKey } from './state/useStudioState'
import { api } from './lib/apiClient'

export default function App() {
  const [isRendering, setIsRendering] = useState(false)
  const renderTimers = useRef<number[]>([])
  const {
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
    setInsights,
    uploadRunId,
    reset,
  } = useStudioState((state) => ({
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
    setInsights: state.setInsights,
    uploadRunId: state.uploadRunId,
    reset: state.reset,
  }))

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
      try {
        // Step 1: Highlights
        updateTask('highlight-detection', { status: 'running', progress: 10 })
        const hi = await api.detectHighlights({ videoUrl: fileInfo?.previewUrl })
        const mapped = hi.segments.map((s, i) => {
          const action = s.label === 'dunk' ? 'Dunk' : s.label === 'three' ? 'Three Pointer' : 'Assist'
          const clipDuration = Math.max(0, s.end - s.start)
          const mm = Math.floor(s.start / 60)
          const ss = Math.round(s.start % 60)
          const timestamp = `${mm > 0 ? `${mm}m ` : ''}${String(ss).padStart(2, '0')}`
          return {
            id: s.id || `seg-${i + 1}`,
            timestamp,
            action: action as any,
            descriptor: `${action} — auto-detected`,
            confidence: s.confidence ?? 0.9,
            audioPeak: 0.6,
            motion: 0.7,
            score: s.score ?? 0.85,
            clipDuration,
          }
        })
        setHighlights(mapped)
        updateTask('highlight-detection', { status: 'done', progress: 100 })

        // Step 2: Beats
        updateTask('beat-sync', { status: 'running', progress: 20 })
        const beats = await api.detectBeats({})
        const markers = beats.beatGrid.map((t, idx) => ({ id: `beat-${idx}`, time: t, intensity: idx % 4 === 0 ? 0.92 : 0.6 }))
        setBeatMarkers(markers)
        // derive a lightweight energy curve from beats
        const curve = Array.from({ length: Math.min(20, markers.length) }, (_, i) =>
          0.5 + 0.5 * Math.sin(i / 3),
        )
        setEnergyCurve(curve)
        updateTask('beat-sync', { status: 'done', progress: 100 })

        // Step 3: Music
        updateTask('music-intel', { status: 'running', progress: 25 })
        const rec = await api.recommendMusic({})
        const tracks = rec.tracks.map((t, i) => ({
          id: `track-${i + 1}`,
          title: t.title,
          artist: 'Unknown',
          bpm: t.bpm,
          mood: (['High Energy', 'Hybrid Trap', 'Anthemic', 'Electro Drive'].includes(t.mood)
            ? t.mood
            : 'High Energy') as any,
          energyLevel: Math.round(Math.min(1, Math.max(0, t.energy)) * 100),
          matchScore: 90 - i * 3,
          key: 'E Minor',
          previewUrl: t.url,
          waveform: Array.from({ length: 32 }, (_, idx) => {
            const v = 0.7 + Math.sin(idx / 3) * 0.15
            return Math.min(1, Math.max(0.25, v))
          }),
        }))
        setMusicTracks(tracks)

        // Insights (basic derived placeholder)
        const avgConf = mapped.reduce((a, b) => a + (b.confidence || 0.8), 0) / Math.max(mapped.length, 1)
        const avgBeat = 0.8
        const avgEnergy = markers.reduce((a, b) => a + b.intensity, 0) / Math.max(markers.length, 1)
        setInsights({
          accuracy: avgConf,
          beatAlignment: avgBeat,
          crowdEnergy: Math.min(1, avgEnergy),
          notes: [
            mapped[0]?.descriptor ? `Top moment: ${mapped[0].descriptor}` : 'Highlights detected',
            `Beat grid length: ${markers.length}`,
          ],
        })

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

  const selectedTrack = useMemo(
    () => musicTracks.find((track) => track.id === selectedTrackId),
    [musicTracks, selectedTrackId],
  )

  const handleFileAccepted = async (file: File, previewUrl: string) => {
    try {
      updateTask('chunk-encoder', { status: 'running', progress: 5 })
      setStageStatus('analysis', 'active')

      const { uploadUrl } = await api.createUploadUrl({ fileName: file.name, size: file.size, type: file.type })

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

      // Trigger ingest to analysis pipeline (UI effect will handle API calls)
      ingestUpload({ file, previewUrl })
    } catch (e) {
      setRenderStatus(`Upload error: ${e}`)
    }
  }

  const handleAdvanceFromAnalysis = () => {
    setCurrentStage('music')
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
    renderTimers.current.forEach((id) => window.clearTimeout(id))
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
        const payload = {
          // Wire real values when available
          assetId: undefined,
          trackId: selectedTrack?.id,
          presets: enabled.map((p) => ({ presetId: p.id })),
          metadata: {},
        }
        const { jobId } = await api.startRenderJob(payload)
        setRenderStatus(`Render job queued: ${jobId}`)

        // Poll job status
        let progress = 10
        const poll = window.setInterval(async () => {
          try {
            const status = await api.getJobStatus({ jobId })
            if (status.progress != null) progress = Math.max(progress, status.progress)
            // Distribute progress across enabled presets
            enabled.forEach((p) => markPresetProgress(p.id, Math.min(99, progress)))

            if (status.status === 'done') {
              enabled.forEach((p) => markPresetProgress(p.id, 100))
              if (status.fileUrl) {
                setRenderStatus(`Complete. Download: ${status.fileUrl}`)
              } else {
                setRenderStatus('All exports complete. Signed URLs ready.')
              }
              setStageStatus('export', 'complete')
              setIsRendering(false)
              window.clearInterval(poll)
            } else if (status.status === 'error') {
              setRenderStatus('Render failed. Please retry.')
              setIsRendering(false)
              window.clearInterval(poll)
            } else {
              progress = Math.min(98, progress + 8)
              setRenderStatus(`Rendering... ${progress}%`)
            }
          } catch (e) {
            setRenderStatus(`Render polling error: ${e}`)
            setIsRendering(false)
          }
        }, 800)
        renderTimers.current.push(poll)
      } catch (e) {
        setRenderStatus(`Failed to start render: ${e}`)
        setIsRendering(false)
      }
    })()
  }

  useEffect(
    () => () => {
      renderTimers.current.forEach((id) => window.clearTimeout(id))
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
