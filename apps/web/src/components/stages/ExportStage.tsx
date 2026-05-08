import { useState } from 'react'
import { api } from '../../lib/apiClient'
import type { ExportPreset, ExportDownload } from '../../state/useStudioState'

type ConfigHealth = Awaited<ReturnType<typeof api.getConfigHealth>>

interface ExportStageProps {
  presets: ExportPreset[]
  onTogglePreset: (presetId: string) => void
  onStartRender: () => void
  renderStatus?: string
  isRendering: boolean
  downloads?: ExportDownload[]
  onDeleteExport?: (presetId: string) => void
  onDeleteAsset?: () => void
  voiceoverEnabled?: boolean
  onVoiceoverToggle?: (enabled: boolean) => void
  sfxEnabled?: boolean
  onSfxToggle?: (enabled: boolean) => void
}

export function ExportStage({
  presets,
  onTogglePreset,
  onStartRender,
  renderStatus,
  isRendering,
  downloads,
  onDeleteExport,
  onDeleteAsset,
  voiceoverEnabled,
  onVoiceoverToggle,
  sfxEnabled,
  onSfxToggle,
}: ExportStageProps) {
  const labelFor = (presetId: string) => presets.find((p) => p.id === presetId)?.label || presetId
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
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onStartRender}
            disabled={isRendering}
            className="rounded-full border border-emerald-400/50 bg-emerald-400/10 px-4 py-1.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/20 disabled:opacity-40"
          >
            {isRendering ? 'Rendering...' : 'Render Hype Video'}
          </button>
          {onDeleteAsset && (
            <button
              type="button"
              onClick={() => {
                if (confirm('Delete asset and clear this session? This cannot be undone.')) onDeleteAsset()
              }}
              className="rounded-full border border-red-400/50 bg-red-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-red-100 transition hover:bg-red-500/20"
            >
              Delete Asset
            </button>
          )}
        </div>
      </header>
      <SystemHealthLink />

      {(onVoiceoverToggle || onSfxToggle) && (
        <div className="rounded-3xl border border-amber-400/20 bg-amber-500/5 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-amber-200/80">Broadcast Polish</p>
          <div className="mt-3 flex flex-wrap gap-3">
            {onVoiceoverToggle && (
              <label className="flex cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-900">
                <input
                  type="checkbox"
                  checked={!!voiceoverEnabled}
                  onChange={(e) => onVoiceoverToggle(e.target.checked)}
                  className="h-4 w-4 rounded border border-white/20 bg-slate-900 accent-amber-400"
                />
                <span className="font-semibold">AI Anchor Narration</span>
                <span className="text-slate-500">~$0.02/render</span>
              </label>
            )}
            {onSfxToggle && (
              <label className="flex cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-900">
                <input
                  type="checkbox"
                  checked={!!sfxEnabled}
                  onChange={(e) => onSfxToggle(e.target.checked)}
                  className="h-4 w-4 rounded border border-white/20 bg-slate-900 accent-amber-400"
                />
                <span className="font-semibold">Action SFX Stingers</span>
                <span className="text-slate-500">free</span>
              </label>
            )}
          </div>
        </div>
      )}

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
                  <p className="font-medium text-white">{labelFor(d.presetId)}</p>
                  <p className="text-xs text-slate-400">Expires {new Date(d.expiresAt).toLocaleString()}</p>
                </div>
                <div className="flex items-center gap-2">
                  <DownloadButton url={d.url} filename={`hype-${d.presetId}.mp4`} />
                  {onDeleteExport && (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Delete export ${labelFor(d.presetId)}?`)) onDeleteExport(d.presetId)
                      }}
                      title="Delete export"
                      className="rounded-full border border-red-400/40 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-100 hover:bg-red-500/20"
                    >
                      Delete
                    </button>
                  )}
                </div>
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

function SystemHealthLink() {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<ConfigHealth | undefined>()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | undefined>()
  const load = async () => {
    setBusy(true)
    setErr(undefined)
    try {
      const r = await api.getConfigHealth()
      setData(r)
      setOpen(true)
    } catch (e: any) {
      setErr(e?.message || 'Failed to load system health')
      setOpen(true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="text-xs">
      <button
        type="button"
        onClick={load}
        disabled={busy}
        className="rounded-full border border-white/15 bg-slate-950/60 px-3 py-1 font-semibold text-slate-300 hover:border-white/30 disabled:opacity-50"
      >
        {busy ? 'Checking…' : 'System Health'}
      </button>
      {open && (
        <div className="mt-2 rounded-xl border border-white/10 bg-slate-950/80 p-3">
          {err ? (
            <p className="text-red-300">{err}</p>
          ) : data ? (
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
              <HealthRow label="Redis (Upstash)" ok={data.hasRedis} required />
              <HealthRow label="GPU Worker (Modal)" ok={data.hasGpuWorker} required />
              <HealthRow label="Storage (Cloudflare R2)" ok={data.hasStorage} required />
              <HealthRow label="HMAC Secret" ok={data.hasHmacSecret} />
              <HealthRow label="OpenAI" ok={data.hasOpenAi} />
              <HealthRow label="Music API" ok={data.hasMusicApi} />
              <HealthRow label="Logtail" ok={data.hasLogtail} />
            </ul>
          ) : null}
          {data && !data.ok && (
            <p className="mt-2 text-amber-200">
              A required service (Redis, GPU Worker, or R2) is not configured. Renders will fail until these are set.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function HealthRow({ label, ok, required }: { label: string; ok: boolean; required?: boolean }) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span className={required ? 'font-semibold text-slate-100' : 'text-slate-400'}>{label}</span>
      <span className={ok ? 'text-emerald-300' : required ? 'text-red-300' : 'text-slate-500'}>
        {ok ? '✓' : required ? '✗ missing' : '— optional'}
      </span>
    </li>
  )
}

// Cross-origin downloads can't rely on the HTML `download` attribute (browsers
// ignore it for non-same-origin URLs). Fetch the blob and trigger a synthetic
// download from a same-origin object URL — guaranteed to save, no inline play.
function DownloadButton({ url, filename }: { url: string; filename: string }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | undefined>()
  const onClick = async () => {
    setErr(undefined)
    setBusy(true)
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const objUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(objUrl)
    } catch (e: any) {
      setErr(e?.message || 'Download failed')
    } finally {
      setBusy(false)
    }
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title={err || 'Save MP4 to your computer'}
      className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-wait disabled:opacity-60"
    >
      {busy ? 'Downloading…' : err ? 'Retry' : 'Download'}
    </button>
  )
}
