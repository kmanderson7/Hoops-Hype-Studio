import { useCallback, useRef, useState } from 'react'
import type { StudioState } from '../../state/useStudioState'

interface UploadStageProps {
  fileInfo?: StudioState['fileInfo']
  onFileAccepted: (file: File, previewUrl: string) => void
  isProcessing: boolean
}

const acceptedTypes = ['video/mp4', 'video/quicktime', 'video/mkv']

export function UploadStage({ fileInfo, onFileAccepted, isProcessing }: UploadStageProps) {
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0]
      if (!file) return
      if (!acceptedTypes.includes(file.type)) {
        setError('Unsupported format. Upload .mp4, .mov, or .mkv up to 5 GB.')
        return
      }
      if (file.size > 5 * 1024 * 1024 * 1024) {
        setError('File exceeds 5 GB limit. Trim or compress before uploading.')
        return
      }
      setError('')
      const previewUrl = URL.createObjectURL(file)
      onFileAccepted(file, previewUrl)
    },
    [onFileAccepted],
  )

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLLabelElement>) => {
      event.preventDefault()
      setDragging(false)
      handleFiles(event.dataTransfer.files)
    },
    [handleFiles],
  )

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white">Game Footage Ingest</h2>
        <p className="text-sm text-slate-400">
          Drag and drop full games or raw highlights. We handle chunked uploads, resilient retries, and proxy
          transcoding automatically.
        </p>
      </div>

      <label
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`relative flex min-h-[220px] cursor-pointer flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed px-8 text-center transition ${
          dragging
            ? 'border-indigo-400 bg-indigo-500/10'
            : 'border-slate-700 bg-slate-900/50 hover:border-indigo-300 hover:bg-slate-900/70'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={acceptedTypes.join(',')}
          className="hidden"
          disabled={isProcessing}
          onChange={(event) => handleFiles(event.target.files)}
        />
        <span className="rounded-full border border-indigo-500/40 bg-indigo-500/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-indigo-200">
          Drop Footage
        </span>
        <div>
          <p className="text-lg font-semibold text-white">Upload your basketball game tape</p>
          <p className="mt-1 text-sm text-slate-400">
            Max 5 GB | Auto proxy to 720p 60fps for preview | Secure signed URLs
          </p>
        </div>
        <button
          type="button"
          className="rounded-full border border-indigo-400/60 bg-indigo-500/10 px-4 py-2 text-sm font-semibold text-indigo-100 transition hover:bg-indigo-500/20"
          onClick={() => inputRef.current?.click()}
          disabled={isProcessing}
        >
          Select From Device
        </button>
        {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}
      </label>

      {fileInfo && (
        <div className="grid gap-4 rounded-3xl border border-indigo-500/20 bg-indigo-500/5 p-5 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-indigo-300/80">Ready For Analysis</p>
            <p className="mt-1 text-sm font-medium text-indigo-100">{fileInfo.name}</p>
            <p className="text-xs text-indigo-200/70">Securely staged, chunked, and validated.</p>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-xs text-indigo-100/80">
            <InfoStat label="Duration" value={fileInfo.duration} />
            <InfoStat label="Size" value={fileInfo.sizeLabel} />
            <InfoStat label="Resolution" value={fileInfo.resolution} />
            <InfoStat label="Frame Rate" value={`${fileInfo.fps} fps`} />
          </dl>
        </div>
      )}
    </section>
  )
}

function InfoStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-indigo-400/30 bg-indigo-500/10 p-3">
      <p className="text-[10px] uppercase tracking-[0.18em] text-indigo-200/70">{label}</p>
      <p className="mt-1 text-sm font-semibold text-indigo-50">{value}</p>
    </div>
  )
}
