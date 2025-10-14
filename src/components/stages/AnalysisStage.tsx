import type {
  BeatMarker,
  HighlightSegment,
  TaskLog,
} from '../../state/useStudioState'

interface AnalysisStageProps {
  tasks: TaskLog[]
  processingProgress: number
  highlights: HighlightSegment[]
  beatMarkers: BeatMarker[]
  energyCurve: number[]
  onProceed?: () => void
}

export function AnalysisStage({
  tasks,
  processingProgress,
  highlights,
  beatMarkers,
  energyCurve,
  onProceed,
}: AnalysisStageProps) {
  return (
    <section className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">AI Pipeline</h2>
          <p className="text-sm text-slate-400">
            Real-time breakdown of highlight detection, momentum scoring, and beat grid mapping.
          </p>
        </div>
        <span className="rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-xs uppercase tracking-[0.18em] text-indigo-200">
          {Math.round(processingProgress * 100)}% Complete
        </span>
      </header>

      <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-5 backdrop-blur">
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-400 via-sky-400 to-emerald-400 transition-[width]"
            style={{ width: `${Math.round(processingProgress * 100)}%` }}
          />
        </div>
        <ul className="mt-5 grid gap-3 md:grid-cols-2">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-sm text-slate-200"
            >
              <div className="flex items-center justify-between">
                <p className="font-semibold text-white">{task.label}</p>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] ${
                    task.status === 'done'
                      ? 'border border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
                      : task.status === 'running'
                      ? 'border border-indigo-400/30 bg-indigo-500/10 text-indigo-200'
                      : 'border border-slate-600 bg-slate-800 text-slate-400'
                  }`}
                >
                  {task.status === 'done'
                    ? 'Complete'
                    : task.status === 'running'
                    ? 'Running'
                    : 'Queued'}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-400">{task.description}</p>
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-emerald-400 transition-[width]"
                  style={{ width: `${task.progress}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>

      {highlights.length > 0 && (
        <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 backdrop-blur">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-indigo-200/80">Highlight Board</p>
              <h3 className="mt-1 text-lg font-semibold text-white">Auto-selected hype moments</h3>
            </div>
            <button
              type="button"
              onClick={onProceed}
              className="rounded-full border border-indigo-400/50 bg-indigo-500/10 px-4 py-1.5 text-sm font-medium text-indigo-100 transition hover:bg-indigo-500/20"
            >
              Advance to Music Intelligence
            </button>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {highlights.map((highlight) => (
              <article
                key={highlight.id}
                className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-950/60 p-4"
              >
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.16em] text-indigo-200/70">
                  <span>{highlight.timestamp}</span>
                  <span>{highlight.action}</span>
                </div>
                <p className="text-sm font-medium text-white">{highlight.descriptor}</p>
                <dl className="grid grid-cols-3 gap-2 text-[11px] uppercase tracking-[0.12em] text-slate-400">
                  <HighlightStat label="Score" value={`${Math.round(highlight.score * 100)}%`} />
                  <HighlightStat label="Motion" value={`${Math.round(highlight.motion * 100)}%`} />
                  <HighlightStat label="Audio" value={`${Math.round(highlight.audioPeak * 100)}%`} />
                </dl>
              </article>
            ))}
          </div>
        </div>
      )}

      {(beatMarkers.length > 0 || energyCurve.length > 0) && (
        <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 backdrop-blur">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-indigo-200/80">Beat Grid & Momentum</p>
              <h3 className="mt-1 text-lg font-semibold text-white">Sync map locked to energy spikes</h3>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[2fr,3fr]">
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Beat Markers</p>
              <div className="mt-3 flex h-24 items-end gap-1 rounded-xl border border-white/10 bg-slate-900/80 p-3">
                {beatMarkers.map((marker) => (
                  <div
                    key={marker.id}
                    className="w-full rounded-full bg-gradient-to-t from-indigo-500/20 via-indigo-400/60 to-indigo-200/80"
                    style={{ height: `${40 + marker.intensity * 50}%` }}
                  />
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Momentum Arc</p>
              <div className="mt-3 h-32 rounded-xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-900/40 to-slate-900/80 p-3">
                <svg viewBox="0 0 320 120" className="h-full w-full">
                  <polyline
                    points={energyCurve
                      .map((value, index) => {
                        const x = (index / Math.max(energyCurve.length - 1, 1)) * 320
                        const y = 110 - value * 90
                        return `${x},${y}`
                      })
                      .join(' ')}
                    fill="none"
                    stroke="url(#gradient)"
                    strokeWidth={3}
                    strokeLinecap="round"
                  />
                  <defs>
                    <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#6366f1" />
                      <stop offset="50%" stopColor="#38bdf8" />
                      <stop offset="100%" stopColor="#34d399" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function HighlightStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-900/60 p-2 text-center text-xs text-slate-300">
      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  )
}
