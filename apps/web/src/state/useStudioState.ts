import { create } from 'zustand'

export type StageKey = 'upload' | 'analysis' | 'music' | 'editor' | 'export'
export type StageStatus = 'pending' | 'active' | 'complete'
export type TaskStatus = 'queued' | 'running' | 'done'

export interface HighlightSegment {
  id: string
  timestamp: string
  action: 'Dunk' | 'Three Pointer' | 'Steal' | 'Block' | 'Assist'
  descriptor: string
  confidence: number
  audioPeak: number
  motion: number
  score: number
  clipDuration: number
}

export interface BeatMarker {
  id: string
  time: number
  intensity: number
}

export interface TaskLog {
  id: string
  label: string
  description: string
  status: TaskStatus
  eta?: string
  progress: number
}

export interface MusicTrack {
  id: string
  title: string
  artist: string
  bpm: number
  mood: 'High Energy' | 'Hybrid Trap' | 'Anthemic' | 'Electro Drive'
  energyLevel: number
  matchScore: number
  key: string
  previewUrl: string
  waveform: number[]
}

export interface ExportPreset {
  id: string
  label: string
  aspect: string
  resolution: string
  bitrate: string
  container: string
  enabled: boolean
  progress: number
}

export interface ExportDownload {
  presetId: string
  url: string
  expiresAt: string
}

export interface OverlayConfig {
  titleCard?: { text: string; font: string; color: string; duration: number }
  lowerThird?: { name: string; team: string; number: string; position: string; color: string }
  scoreboard?: { enabled: boolean; style: 'burst' | 'minimal'; color: string }
  logo?: { url: string; x: number; y: number; scale: number }
}

interface StageMeta {
  key: StageKey
  label: string
}

export const stageOrder: StageMeta[] = [
  { key: 'upload', label: 'Upload Footage' },
  { key: 'analysis', label: 'AI Analysis' },
  { key: 'music', label: 'Music Intelligence' },
  { key: 'editor', label: 'Preview Editor' },
  { key: 'export', label: 'Export Suite' },
]

export interface StudioState {
  currentStage: StageKey
  stageStatus: Record<StageKey, StageStatus>
  uploadRunId: number
  fileInfo?: {
    name: string
    duration: string
    durationSeconds: number
    sizeLabel: string
    resolution: string
    fps: number
    previewUrl: string
  }
  processingProgress: number
  tasks: TaskLog[]
  highlights: HighlightSegment[]
  beatMarkers: BeatMarker[]
  energyCurve: number[]
  musicTracks: MusicTrack[]
  selectedTrackId?: string
  exportPresets: ExportPreset[]
  exportDownloads: ExportDownload[]
  overlayConfig: OverlayConfig
  renderStatus?: string
  insights: {
    accuracy: number
    beatAlignment: number
    crowdEnergy: number
    notes: string[]
  }
  ingestUpload: (payload: { file: File; previewUrl: string }) => void
  updateTask: (taskId: string, partial: Partial<TaskLog>) => void
  setProcessingProgress: (value: number) => void
  setStageStatus: (stage: StageKey, status: StageStatus) => void
  setCurrentStage: (stage: StageKey) => void
  setHighlights: (segments: HighlightSegment[]) => void
  setBeatMarkers: (markers: BeatMarker[]) => void
  setEnergyCurve: (curve: number[]) => void
  setMusicTracks: (tracks: MusicTrack[]) => void
  selectTrack: (trackId: string) => void
  togglePreset: (presetId: string) => void
  markPresetProgress: (presetId: string, progress: number) => void
  setRenderStatus: (message?: string) => void
  setExportDownloads: (items: ExportDownload[]) => void
  setOverlayConfig: (config: OverlayConfig) => void
  setInsights: (metrics: StudioState['insights']) => void
  reset: () => void
}

const initialStageStatus: Record<StageKey, StageStatus> = {
  upload: 'pending',
  analysis: 'pending',
  music: 'pending',
  editor: 'pending',
  export: 'pending',
}

const baseTasks: TaskLog[] = [
  {
    id: 'chunk-encoder',
    label: 'Chunk Upload & Proxy Transcode',
    description: 'Preparing 720p proxy for smooth timeline scrubbing.',
    status: 'queued',
    progress: 0,
  },
  {
    id: 'highlight-detection',
    label: 'Highlight Detection',
    description: 'Detecting dunks, 3PTs, steals, and momentum swings.',
    status: 'queued',
    progress: 0,
  },
  {
    id: 'beat-sync',
    label: 'Beat Grid Sync',
    description: 'Mapping BPM and energetic downbeats for auto-cut.',
    status: 'queued',
    progress: 0,
  },
  {
    id: 'music-intel',
    label: 'Music Intelligence',
    description: 'Ranking hype tracks by BPM, mood, and play style.',
    status: 'queued',
    progress: 0,
  },
]

const defaultPresets: ExportPreset[] = [
  {
    id: 'cinematic-169',
    label: 'Cinematic 16:9',
    aspect: '16:9',
    resolution: '1920 x 1080',
    bitrate: '18 Mbps VBR',
    container: 'MP4 / H.264',
    enabled: true,
    progress: 0,
  },
  {
    id: 'vertical-916',
    label: 'Social Vertical 9:16',
    aspect: '9:16',
    resolution: '1080 x 1920',
    bitrate: '15 Mbps VBR',
    container: 'MP4 / H.264',
    enabled: true,
    progress: 0,
  },
  {
    id: 'highlight-45',
    label: 'Highlight Reel 4:5',
    aspect: '4:5',
    resolution: '1350 x 1080',
    bitrate: '16 Mbps VBR',
    container: 'MP4 / H.264',
    enabled: false,
    progress: 0,
  },
]

export const useStudioState = create<StudioState>((set) => ({
  currentStage: 'upload',
  stageStatus: { ...initialStageStatus, upload: 'active' },
  uploadRunId: 0,
  processingProgress: 0,
  tasks: baseTasks,
  highlights: [],
  beatMarkers: [],
  energyCurve: [],
  musicTracks: [],
  exportPresets: defaultPresets,
  exportDownloads: [],
  overlayConfig: {
    titleCard: { text: 'Hype Highlights', font: 'Inter Bold', color: '#FFFFFF', duration: 2 },
    lowerThird: { name: 'Player Name', team: 'Team', number: '00', position: 'G', color: '#5B6DFA' },
    scoreboard: { enabled: true, style: 'burst', color: '#FFD166' },
    logo: { url: '', x: 0.92, y: 0.08, scale: 0.5 },
  },
  insights: {
    accuracy: 0,
    beatAlignment: 0,
    crowdEnergy: 0,
    notes: [],
  },
  ingestUpload: ({ file, previewUrl }) =>
    set(() => {
      const sizeMB = Math.max(file.size / (1024 * 1024), 1)
      const durationSeconds = Math.min(Math.max(sizeMB * 1.35, 95), 240)
      const minutes = Math.floor(durationSeconds / 60)
      const seconds = Math.round(durationSeconds % 60)
      const duration =
        minutes > 0
          ? `${minutes}m ${seconds.toString().padStart(2, '0')}s`
          : `${seconds}s`

      return {
        uploadRunId: Date.now(),
        fileInfo: {
          name: file.name,
          duration,
          durationSeconds,
          sizeLabel: `${sizeMB.toFixed(1)} MB`,
          resolution: '3840 x 2160',
          fps: 60,
          previewUrl,
        },
        processingProgress: 0,
        tasks: baseTasks.map((task) => ({ ...task, status: 'queued', progress: 0 })),
        currentStage: 'analysis',
        stageStatus: {
          upload: 'complete',
          analysis: 'active',
          music: 'pending',
          editor: 'pending',
          export: 'pending',
        },
        highlights: [],
        beatMarkers: [],
        energyCurve: [],
        musicTracks: [],
        selectedTrackId: undefined,
        exportPresets: defaultPresets.map((preset) => ({ ...preset, progress: 0 })),
        renderStatus: undefined,
        insights: {
          accuracy: 0,
          beatAlignment: 0,
          crowdEnergy: 0,
          notes: [],
        },
      }
    }),
  updateTask: (taskId, partial) =>
    set((state) => ({
      tasks: state.tasks.map((task) =>
        task.id === taskId ? { ...task, ...partial } : task,
      ),
    })),
  setProcessingProgress: (processingProgress) => set({ processingProgress }),
  setStageStatus: (stage, status) =>
    set((state) => ({
      stageStatus: { ...state.stageStatus, [stage]: status },
    })),
  setCurrentStage: (stage) => set({ currentStage: stage }),
  setHighlights: (segments) => set({ highlights: segments }),
  setBeatMarkers: (markers) => set({ beatMarkers: markers }),
  setEnergyCurve: (curve) => set({ energyCurve: curve }),
  setMusicTracks: (tracks) => set({ musicTracks: tracks }),
  selectTrack: (trackId) => set({ selectedTrackId: trackId }),
  togglePreset: (presetId) =>
    set((state) => ({
      exportPresets: state.exportPresets.map((preset) =>
        preset.id === presetId
          ? { ...preset, enabled: !preset.enabled }
          : preset,
      ),
    })),
  markPresetProgress: (presetId, progress) =>
    set((state) => ({
      exportPresets: state.exportPresets.map((preset) =>
        preset.id === presetId ? { ...preset, progress } : preset,
      ),
    })),
  setRenderStatus: (renderStatus) => set({ renderStatus }),
  setExportDownloads: (items) => set({ exportDownloads: items }),
  setOverlayConfig: (config) => set({ overlayConfig: config }),
  setInsights: (metrics) => set({ insights: metrics }),
  reset: () =>
    set({
      currentStage: 'upload',
      stageStatus: { ...initialStageStatus, upload: 'active' },
      uploadRunId: 0,
      fileInfo: undefined,
      processingProgress: 0,
      tasks: baseTasks,
      highlights: [],
      beatMarkers: [],
      energyCurve: [],
      musicTracks: [],
      selectedTrackId: undefined,
      exportPresets: defaultPresets,
      exportDownloads: [],
      overlayConfig: {
        titleCard: { text: 'Hype Highlights', font: 'Inter Bold', color: '#FFFFFF', duration: 2 },
        lowerThird: { name: 'Player Name', team: 'Team', number: '00', position: 'G', color: '#5B6DFA' },
        scoreboard: { enabled: true, style: 'burst', color: '#FFD166' },
        logo: { url: '', x: 0.92, y: 0.08, scale: 0.5 },
      },
      renderStatus: undefined,
      insights: {
        accuracy: 0,
        beatAlignment: 0,
        crowdEnergy: 0,
        notes: [],
      },
    }),
}))
