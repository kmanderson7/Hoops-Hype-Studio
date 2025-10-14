import {
  type HighlightSegment,
  type MusicTrack,
  type StudioState,
} from '../state/useStudioState'

interface InsightsPanelProps {
  fileInfo?: StudioState['fileInfo']
  insights: StudioState['insights']
  highlights: HighlightSegment[]
  selectedTrack?: MusicTrack
}

const metricLabel = (value: number) => `${Math.round(value * 100)}%`

export function InsightsPanel({ fileInfo, insights, highlights, selectedTrack }: InsightsPanelProps) {
  return (
    <aside className="space-y-5 rounded-3xl border border-white/10 bg-slate-900/70 p-6 backdrop-blur">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-indigo-300/70">Session Insights</p>
        <h2 className="mt-1 text-2xl font-semibold">Hype Forecast</h2>
        <p className="mt-2 text-sm text-slate-400">
          Real-time signal from the AI pipeline. Update auto-refreshes as footage is analyzed, scored, and matched to
          music.
        </p>
      </div>

      {fileInfo ? (
        <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Footage</p>
          <div className="mt-2 space-y-1 text-sm">
            <p className="font-medium text-slate-100">{fileInfo.name}</p>
            <div className="flex flex-wrap gap-3 text-slate-400">
              <span>{fileInfo.duration}</span>
              <span>{fileInfo.sizeLabel}</span>
              <span>{fileInfo.resolution}</span>
              <span>{fileInfo.fps} FPS</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-700 p-4 text-sm text-slate-500">
          Upload a game tape to unlock actionable insights, highlight scores, and music intelligence.
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-center">
        <MetricCard label="Action Accuracy" value={metricLabel(insights.accuracy)} />
        <MetricCard label="Beat Alignment" value={metricLabel(insights.beatAlignment)} />
        <MetricCard label="Crowd Energy" value={metricLabel(insights.crowdEnergy)} />
      </div>

      {highlights.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-indigo-200">Top Moments</p>
          <ul className="mt-3 space-y-3 text-sm text-slate-300">
            {highlights.slice(0, 3).map((highlight) => (
              <li key={highlight.id} className="rounded-lg border border-white/10 bg-slate-900/60 p-3">
                <div className="flex items-center justify-between text-xs uppercase text-indigo-200">
                  <span>{highlight.timestamp}</span>
                  <span>{highlight.action}</span>
                </div>
                <p className="mt-1 text-sm font-medium text-white/90">{highlight.descriptor}</p>
                <div className="mt-2 flex items-center gap-3 text-xs uppercase tracking-[0.12em] text-slate-500">
                  <span>Score {Math.round(highlight.score * 100)}</span>
                  <span>Motion {Math.round(highlight.motion * 100)}</span>
                  <span>Peak {Math.round(highlight.audioPeak * 100)}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {selectedTrack && (
        <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-indigo-200/90">Selected Track</p>
          <div className="mt-2">
            <p className="text-base font-semibold text-white">{selectedTrack.title}</p>
            <p className="text-sm text-indigo-100/80">{selectedTrack.artist}</p>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-indigo-100/70">
            <div>
              <dt className="uppercase tracking-[0.12em] text-indigo-200/70">BPM</dt>
              <dd className="text-sm font-semibold text-white">{selectedTrack.bpm}</dd>
            </div>
            <div>
              <dt className="uppercase tracking-[0.12em] text-indigo-200/70">Mood</dt>
              <dd className="text-sm font-semibold text-white">{selectedTrack.mood}</dd>
            </div>
            <div>
              <dt className="uppercase tracking-[0.12em] text-indigo-200/70">Key</dt>
              <dd className="text-sm font-semibold text-white">{selectedTrack.key}</dd>
            </div>
            <div>
              <dt className="uppercase tracking-[0.12em] text-indigo-200/70">Match</dt>
              <dd className="text-sm font-semibold text-white">{selectedTrack.matchScore}%</dd>
            </div>
          </dl>
        </div>
      )}

      {insights.notes.length > 0 && (
        <div className="space-y-2 rounded-2xl border border-white/10 bg-slate-950/70 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Analyst Notes</p>
          <ul className="space-y-2 text-sm text-slate-300">
            {insights.notes.map((note, index) => (
              <li key={index} className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-indigo-400" />
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-3">
      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-white">{value}</p>
    </div>
  )
}
