import type { MusicTrack } from '../../state/useStudioState'

interface MusicStageProps {
  tracks: MusicTrack[]
  selectedTrackId?: string
  onSelect: (trackId: string) => void
  onLock: (trackId: string) => void
}

export function MusicStage({ tracks, selectedTrackId, onSelect, onLock }: MusicStageProps) {
  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Music Intelligence</h2>
          <p className="text-sm text-slate-400">
            Auto-ranked by BPM, energy, and stylistic fit. Choose the vibe or let One-Click Hype do it for you.
          </p>
        </div>
        {selectedTrackId ? (
          <button
            type="button"
            onClick={() => onLock(selectedTrackId)}
            className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-4 py-1.5 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/20"
          >
            Lock Track & Continue
          </button>
        ) : (
          <span className="rounded-full border border-slate-700 bg-slate-900/60 px-4 py-1.5 text-xs uppercase tracking-[0.16em] text-slate-500">
            Select a track to continue
          </span>
        )}
      </header>

      <div className="space-y-4">
        {tracks.map((track) => {
          const isSelected = track.id === selectedTrackId
          return (
            <button
              key={track.id}
              type="button"
              onClick={() => onSelect(track.id)}
              className={`w-full rounded-3xl border px-5 py-4 text-left transition focus-visible:outline focus-visible:outline-2 ${
                isSelected
                  ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100 shadow-lg shadow-emerald-500/10'
                  : 'border-white/10 bg-slate-900/60 text-slate-200 hover:border-indigo-400/40 hover:bg-indigo-500/10'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className={`text-sm font-semibold ${isSelected ? 'text-white' : 'text-slate-100'}`}>
                    {track.title}
                  </p>
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-400">{track.artist}</p>
                </div>
                <div className="flex gap-4 text-xs uppercase tracking-[0.16em] text-slate-400">
                  <InfoPill label="BPM" value={track.bpm} />
                  <InfoPill label="Mood" value={track.mood} />
                  <InfoPill label="Key" value={track.key} />
                  <InfoPill label="Match" value={`${track.matchScore}%`} />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <Waveform waveform={track.waveform} active={isSelected} />
                <div className="text-xs text-slate-400">
                  <p className="font-medium text-slate-200">Energy Meter</p>
                  <EnergyMeter value={track.energyLevel} />
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function InfoPill({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="rounded-full border border-white/10 bg-slate-900/80 px-3 py-0.5 text-[11px] text-slate-400">
      <span className="mr-2 text-slate-500">{label}</span>
      <span className="text-slate-200">{value}</span>
    </span>
  )
}

function Waveform({ waveform, active }: { waveform: number[]; active: boolean }) {
  return (
    <div className="flex h-16 flex-1 items-end gap-[3px] overflow-hidden rounded-xl border border-white/10 bg-slate-950/70 p-3">
      {waveform.map((value, index) => (
        <div
          key={`${index}-${value}`}
          className={`w-full rounded-full ${
            active
              ? 'bg-gradient-to-t from-emerald-400/30 via-indigo-400/70 to-white'
              : 'bg-gradient-to-t from-indigo-500/10 via-indigo-500/30 to-indigo-100/60'
          }`}
          style={{ height: `${25 + value * 70}%` }}
        />
      ))}
    </div>
  )
}

function EnergyMeter({ value }: { value: number }) {
  return (
    <div className="mt-1 flex h-2 w-40 overflow-hidden rounded-full bg-slate-800">
      <div
        className="h-full rounded-full bg-gradient-to-r from-indigo-400 via-sky-400 to-emerald-400"
        style={{ width: `${Math.min(100, value)}%` }}
      />
    </div>
  )
}
