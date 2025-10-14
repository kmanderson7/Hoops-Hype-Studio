import { stageOrder, type StageKey, type StageStatus } from '../state/useStudioState'

interface StudioStepperProps {
  stageStatus: Record<StageKey, StageStatus>
  currentStage: StageKey
  onNavigate?: (stage: StageKey) => void
}

const statusStyle: Record<StageStatus, string> = {
  complete: 'border-emerald-400 bg-emerald-500/10 text-emerald-200',
  active: 'border-indigo-400 bg-indigo-500/10 text-indigo-100',
  pending: 'border-slate-700 bg-slate-800 text-slate-400',
}

const dotStyle: Record<StageStatus, string> = {
  complete: 'bg-emerald-400',
  active: 'bg-indigo-400',
  pending: 'bg-slate-600',
}

export function StudioStepper({ stageStatus, currentStage, onNavigate }: StudioStepperProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-5">
      {stageOrder.map(({ key, label }) => {
        const status = stageStatus[key]
        const isInteractive = status !== 'pending' || key === currentStage
        return (
          <button
            key={key}
            type="button"
            onClick={() => isInteractive && onNavigate?.(key)}
            className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
              statusStyle[status]
            } ${isInteractive ? 'hover:border-indigo-300 hover:bg-indigo-500/20' : 'cursor-default'}`}
          >
            <span className={`inline-flex h-2.5 w-2.5 rounded-full ${dotStyle[status]}`} />
            <div>
              <p className="text-xs uppercase tracking-[0.14em] text-slate-400">
                {String(stageOrder.findIndex((item) => item.key === key) + 1).padStart(2, '0')}
              </p>
              <p className="text-sm font-semibold">{label}</p>
            </div>
          </button>
        )
      })}
    </div>
  )
}
