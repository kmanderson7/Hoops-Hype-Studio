import type { ExportPreset, ExportDownload } from '../../state/useStudioState'

interface ExportStageProps {
  presets: ExportPreset[]
  onTogglePreset: (presetId: string) => void
  onStartRender: () => void
  renderStatus?: string
  isRendering: boolean
  downloads?: ExportDownload[]
}

export function ExportStage({ presets, onTogglePreset, onStartRender, renderStatus, isRendering, downloads }: ExportStageProps) {
  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Export Suite</h2>
          <p className="text-sm text-slate-400">
            Encode multiple aspect ratios in parallel. We deliver signed URLs ready for Instagram, TikTok, YouTube, and
            Hudl.
          </p>
        </div>
        <button
          type="button"
          onClick={onStartRender}
          disabled={isRendering}
          className="rounded-full border border-emerald-400/50 bg-emerald-400/10 px-4 py-1.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/20 disabled:opacity-40"
        >
          {isRendering ? 'Rendering...' : 'Render Hype Video'}
        </button>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {presets.map((preset) => (
          <label
            key={preset.id}
            className={`flex cursor-pointer flex-col gap-3 rounded-3xl border p-4 transition ${
              preset.enabled
                ? 'border-indigo-400/40 bg-indigo-500/10 shadow-lg shadow-indigo-500/10'
                : 'border-white/10 bg-slate-900/60 hover:border-indigo-400/40 hover:bg-indigo-500/10'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">{preset.label}</p>
                <p className="text-xs text-slate-400">
                  {preset.aspect} / {preset.resolution}
                </p>
              </div>
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 cursor-pointer rounded border border-white/20 bg-slate-900 text-indigo-400 accent-indigo-500"
                checked={preset.enabled}
                onChange={() => onTogglePreset(preset.id)}
              />
            </div>
            <dl className="grid grid-cols-2 gap-2 text-xs uppercase tracking-[0.14em] text-slate-400">
              <Stat label="Aspect" value={preset.aspect} />
              <Stat label="Resolution" value={preset.resolution} />
              <Stat label="Bitrate" value={preset.bitrate} />
              <Stat label="Codec" value={preset.container} />
            </dl>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-400 via-sky-400 to-emerald-400 transition-[width]"
                style={{ width: `${preset.progress}%` }}
              />
            </div>
          </label>
        ))}
      </div>

      {renderStatus && (
        <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-4 text-sm text-slate-300">
          {renderStatus}
        </div>
      )}

      {downloads && downloads.length > 0 && (
        <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/5 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-emerald-200/80">Downloads</p>
          <ul className="mt-3 space-y-2 text-sm">
            {downloads.map((d) => (
              <li key={d.presetId} className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/60 p-3">
                <div>
                  <p className="font-medium text-white">{d.presetId}</p>
                  <p className="text-xs text-slate-400">Expires {new Date(d.expiresAt).toLocaleString()}</p>
                </div>
                <a
                  href={d.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-100 hover:bg-emerald-400/20"
                >
                  Download
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/60 p-2">
      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 text-xs font-semibold text-slate-100">{value}</p>
    </div>
  )
}
