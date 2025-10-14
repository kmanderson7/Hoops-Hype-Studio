import type { BeatMarker, HighlightSegment, MusicTrack, StudioState, OverlayConfig } from '../../state/useStudioState'

interface EditorStageProps {
  fileInfo?: StudioState['fileInfo']
  highlights: HighlightSegment[]
  beatMarkers: BeatMarker[]
  selectedTrack?: MusicTrack
  onLaunchExport: () => void
  overlayConfig?: OverlayConfig
  onOverlayChange?: (cfg: OverlayConfig) => void
}

const aspectOptions = [
  { id: 'landscape', label: '16:9 Landscape', description: 'YouTube, Hudl, Team review' },
  { id: 'vertical', label: '9:16 Vertical', description: 'TikTok, IG Reels, Shorts' },
  { id: 'highlight', label: '4:5 Highlight', description: 'Instagram main feed' },
]

export function EditorStage({ fileInfo, highlights, beatMarkers, selectedTrack, onLaunchExport, overlayConfig, onOverlayChange }: EditorStageProps) {
  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Preview & Timeline</h2>
          <p className="text-sm text-slate-400">
            Review AI-selected cuts, beat-sync transitions, and overlays before exporting your hype video.
          </p>
        </div>
        <button
          type="button"
          onClick={onLaunchExport}
          className="rounded-full border border-indigo-400/40 bg-indigo-500/20 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-indigo-500/30"
        >
          Open Export Suite
        </button>
      </header>

      <div className="grid gap-6 lg:grid-cols-[3fr,2fr]">
        <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-5 backdrop-blur">
          <div className="aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
            {fileInfo?.previewUrl ? (
              <video src={fileInfo.previewUrl} controls className="h-full w-full object-cover">
                Your browser does not support the video tag.
              </video>
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-sm text-slate-400">
                <span className="rounded-full border border-slate-800 px-3 py-1 text-xs uppercase tracking-[0.18em]">
                  Preview
                </span>
                Upload & process footage to unlock the interactive preview and beat grid editor.
              </div>
            )}
          </div>
          {selectedTrack && (
            <div className="mt-4 rounded-2xl border border-indigo-400/30 bg-indigo-500/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-indigo-200/80">Soundtrack</p>
                  <p className="text-sm font-semibold text-white">
                    {selectedTrack.title} / {selectedTrack.artist}
                  </p>
                </div>
                <div className="flex gap-3 text-xs text-indigo-100/80">
                  <span>BPM {selectedTrack.bpm}</span>
                  <span>Match {selectedTrack.matchScore}%</span>
                  <span>{selectedTrack.mood}</span>
                </div>
              </div>
            </div>
          )}

          {beatMarkers.length > 0 && (
            <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/60 p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Beat-aligned timeline</p>
              <div className="mt-3 flex h-24 gap-1">
                {beatMarkers.map((marker, index) => (
                  <div key={marker.id} className="relative flex-1">
                    <div
                      className="absolute bottom-0 left-1/2 w-1 -translate-x-1/2 rounded-full bg-gradient-to-t from-indigo-400/20 via-indigo-400 to-white"
                      style={{ height: `${30 + marker.intensity * 60}%` }}
                    />
                    {highlights[index] && (
                      <div className="absolute inset-x-0 bottom-0 translate-y-full pt-3 text-center">
                        <span className="inline-flex rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-indigo-200">
                          {highlights[index].action}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-5 backdrop-blur">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Auto-edit queue</p>
            <ul className="mt-3 space-y-3">
              {highlights.map((highlight, index) => (
                <li
                  key={highlight.id}
                  className="rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-sm text-slate-300"
                >
                  <div className="flex items-center justify-between text-xs uppercase tracking-[0.16em] text-indigo-200/70">
                    <span>{highlight.timestamp}</span>
                    <span>Clip {String(index + 1).padStart(2, '0')}</span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-white">{highlight.descriptor}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400">
                    <Tag label="Score" value={`${Math.round(highlight.score * 100)}%`} />
                    <Tag label="Confidence" value={`${Math.round(highlight.confidence * 100)}%`} />
                    <Tag label="Motion" value={`${Math.round(highlight.motion * 100)}%`} />
                    <Tag label="Audio peak" value={`${Math.round(highlight.audioPeak * 100)}%`} />
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-5 backdrop-blur">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Smart reframing</p>
            <p className="mt-2 text-sm text-slate-300">
              Intelligent subject tracking keeps the ball-handler and rim centered. Aspect presets configure safe zones
              and letterboxing automatically.
            </p>
            <div className="mt-4 space-y-3">
              {aspectOptions.map((option) => (
                <div
                  key={option.id}
                  className="rounded-2xl border border-white/10 bg-slate-950/60 p-3 text-sm text-slate-200"
                >
                  <p className="font-semibold text-white">{option.label}</p>
                  <p className="text-xs text-slate-400">{option.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-5 backdrop-blur">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Overlay & Branding</p>
            <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
              <LabeledInput
                label="Player Name"
                value={overlayConfig?.lowerThird?.name || ''}
                onChange={(v) => onOverlayChange?.({ ...overlayConfig!, lowerThird: { ...overlayConfig?.lowerThird!, name: v } })}
              />
              <LabeledInput
                label="Team"
                value={overlayConfig?.lowerThird?.team || ''}
                onChange={(v) => onOverlayChange?.({ ...overlayConfig!, lowerThird: { ...overlayConfig?.lowerThird!, team: v } })}
              />
              <LabeledInput
                label="Number"
                value={overlayConfig?.lowerThird?.number || ''}
                onChange={(v) => onOverlayChange?.({ ...overlayConfig!, lowerThird: { ...overlayConfig?.lowerThird!, number: v } })}
              />
              <LabeledInput
                label="Position"
                value={overlayConfig?.lowerThird?.position || ''}
                onChange={(v) => onOverlayChange?.({ ...overlayConfig!, lowerThird: { ...overlayConfig?.lowerThird!, position: v } })}
              />
              <LabeledInput
                label="Primary Color"
                value={overlayConfig?.lowerThird?.color || ''}
                onChange={(v) => onOverlayChange?.({ ...overlayConfig!, lowerThird: { ...overlayConfig?.lowerThird!, color: v } })}
              />
              <LabeledInput
                label="Logo URL"
                value={overlayConfig?.logo?.url || ''}
                onChange={(v) => onOverlayChange?.({ ...overlayConfig!, logo: { ...(overlayConfig?.logo || { x: 0.92, y: 0.08, scale: 0.5 }), url: v } })}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function Tag({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-full border border-white/10 bg-slate-950/70 px-3 py-0.5 text-[11px] uppercase tracking-[0.16em] text-slate-300">
      {label}: {value}
    </span>
  )
}

function LabeledInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-400"
        placeholder={label}
      />
    </label>
  )
}
