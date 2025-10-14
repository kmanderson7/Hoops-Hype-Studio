import { useEffect, useMemo, useRef, useState } from 'react'
import { StudioStepper } from './components/StudioStepper'
import { InsightsPanel } from './components/InsightsPanel'
import { UploadStage } from './components/stages/UploadStage'
import { AnalysisStage } from './components/stages/AnalysisStage'
import { MusicStage } from './components/stages/MusicStage'
import { EditorStage } from './components/stages/EditorStage'
import { ExportStage } from './components/stages/ExportStage'
import { useStudioState, type StageKey } from './state/useStudioState'
import {
  buildMockBeatMarkers,
  buildMockEnergyCurve,
  buildMockHighlights,
  buildMockInsights,
  buildMockTracks,
} from './data/mockData'

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

    let progressValue = 0.2
    setProcessingProgress(progressValue)
    setStageStatus('analysis', 'active')
    updateTask('chunk-encoder', { status: 'running', progress: 15 })

    const timeouts: number[] = []
    const intervals: number[] = []

    intervals.push(
      window.setInterval(() => {
        progressValue = Math.min(0.98, progressValue + 0.05)
        setProcessingProgress(progressValue)
      }, 420),
    )

    timeouts.push(
      window.setTimeout(() => {
        updateTask('chunk-encoder', { status: 'done', progress: 100 })
        updateTask('highlight-detection', { status: 'running', progress: 15 })
      }, 900),
    )

    timeouts.push(
      window.setTimeout(() => {
        const highlights = buildMockHighlights()
        setHighlights(highlights)
        updateTask('highlight-detection', { status: 'done', progress: 100 })
        updateTask('beat-sync', { status: 'running', progress: 20 })
      }, 1700),
    )

    timeouts.push(
      window.setTimeout(() => {
        setBeatMarkers(buildMockBeatMarkers())
        setEnergyCurve(buildMockEnergyCurve())
        updateTask('beat-sync', { status: 'done', progress: 100 })
        updateTask('music-intel', { status: 'running', progress: 25 })
      }, 2500),
    )

    timeouts.push(
      window.setTimeout(() => {
        const tracks = buildMockTracks()
        setMusicTracks(tracks)
        setInsights(buildMockInsights())
        updateTask('music-intel', { status: 'done', progress: 100 })
        progressValue = 1
        setProcessingProgress(progressValue)
        setStageStatus('analysis', 'complete')
        setStageStatus('music', 'active')
        setCurrentStage('music')
      }, 3300),
    )

    return () => {
      intervals.forEach((intervalId) => window.clearInterval(intervalId))
      timeouts.forEach((timeoutId) => window.clearTimeout(timeoutId))
    }
  }, [
    uploadRunId,
    setProcessingProgress,
    setStageStatus,
    updateTask,
    setHighlights,
    setBeatMarkers,
    setEnergyCurve,
    setMusicTracks,
    setInsights,
    setCurrentStage,
  ])

  const selectedTrack = useMemo(
    () => musicTracks.find((track) => track.id === selectedTrackId),
    [musicTracks, selectedTrackId],
  )

  const handleFileAccepted = (file: File, previewUrl: string) => {
    ingestUpload({ file, previewUrl })
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
    setRenderStatus('Initializing serverless render workers...')
    setStageStatus('export', 'active')

    const timers: number[] = []
    enabled.forEach((preset, index) => {
      markPresetProgress(preset.id, 5)
      timers.push(
        window.setTimeout(() => {
          markPresetProgress(preset.id, 35)
          setRenderStatus(`Rendering ${preset.label} / Stage 1/3 (ffmpeg warmup)`)
        }, 600 + index * 180),
      )
      timers.push(
        window.setTimeout(() => {
          markPresetProgress(preset.id, 65)
          setRenderStatus(`Rendering ${preset.label} / Stage 2/3 (motion-aware color grade)`)
        }, 1500 + index * 220),
      )
      timers.push(
        window.setTimeout(() => {
          markPresetProgress(preset.id, 100)
          setRenderStatus(`Rendering ${preset.label} / Complete! Signed URL generated.`)
        }, 2600 + index * 260),
      )
    })

    timers.push(
      window.setTimeout(() => {
        setRenderStatus('All exports complete. Share-ready files staged for 24h download window.')
        setStageStatus('export', 'complete')
        setIsRendering(false)
      }, 3400 + enabled.length * 260),
    )

    renderTimers.current = timers
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
