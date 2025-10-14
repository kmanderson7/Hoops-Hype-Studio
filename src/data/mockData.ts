import type {
  BeatMarker,
  HighlightSegment,
  MusicTrack,
  TaskLog,
} from '../state/useStudioState'

export interface PipelineSnapshot {
  progress: number
  tasks: TaskLog[]
}

export const buildMockHighlights = (): HighlightSegment[] => [
  {
    id: 'seg-1',
    timestamp: '00:17',
    action: 'Steal',
    descriptor: 'Full-court pick and go-ahead layup',
    confidence: 0.88,
    audioPeak: 0.63,
    motion: 0.72,
    score: 0.84,
    clipDuration: 4.5,
  },
  {
    id: 'seg-2',
    timestamp: '01:06',
    action: 'Three Pointer',
    descriptor: 'Catch-and-shoot corner triple over double team',
    confidence: 0.93,
    audioPeak: 0.81,
    motion: 0.68,
    score: 0.91,
    clipDuration: 5.1,
  },
  {
    id: 'seg-3',
    timestamp: '02:44',
    action: 'Dunk',
    descriptor: 'Baseline reverse dunk after spin move',
    confidence: 0.97,
    audioPeak: 0.92,
    motion: 0.94,
    score: 0.98,
    clipDuration: 6.4,
  },
  {
    id: 'seg-4',
    timestamp: '03:12',
    action: 'Assist',
    descriptor: 'No-look bounce pass leading to alley-oop',
    confidence: 0.82,
    audioPeak: 0.55,
    motion: 0.76,
    score: 0.79,
    clipDuration: 4.9,
  },
  {
    id: 'seg-5',
    timestamp: '04:01',
    action: 'Block',
    descriptor: 'Chasedown block ignites transition break',
    confidence: 0.9,
    audioPeak: 0.7,
    motion: 0.88,
    score: 0.89,
    clipDuration: 5.6,
  },
]

export const buildMockBeatMarkers = (): BeatMarker[] =>
  Array.from({ length: 16 }, (_, idx) => ({
    id: `beat-${idx}`,
    time: idx * 1.8,
    intensity: idx % 4 === 0 ? 0.92 : 0.55 + Math.random() * 0.25,
  }))

export const buildMockEnergyCurve = (): number[] => [
  0.4, 0.45, 0.5, 0.58, 0.62, 0.68, 0.72, 0.78, 0.81, 0.76, 0.83, 0.88, 0.92, 0.95,
  0.89, 0.93, 0.9, 0.96, 0.98, 1,
]

export const buildMockTracks = (): MusicTrack[] => [
  {
    id: 'track-hype-1',
    title: 'Above The Rim',
    artist: 'Voltage & Keys',
    bpm: 144,
    mood: 'High Energy',
    energyLevel: 92,
    matchScore: 96,
    key: 'E Minor',
    previewUrl: '#',
    waveform: buildWaveform(32, 0.85),
  },
  {
    id: 'track-hype-2',
    title: 'Fast Break Fury',
    artist: 'Neon District',
    bpm: 152,
    mood: 'Hybrid Trap',
    energyLevel: 94,
    matchScore: 93,
    key: 'G Minor',
    previewUrl: '#',
    waveform: buildWaveform(32, 0.8),
  },
  {
    id: 'track-hype-3',
    title: 'Skyline Lights',
    artist: 'City Edge',
    bpm: 138,
    mood: 'Anthemic',
    energyLevel: 88,
    matchScore: 89,
    key: 'B Minor',
    previewUrl: '#',
    waveform: buildWaveform(32, 0.75),
  },
]

const buildWaveform = (length: number, base: number) =>
  Array.from({ length }, (_, idx) => {
    const variance = Math.sin(idx / 3) * 0.12 + Math.random() * 0.08
    return Math.min(1, Math.max(0.25, base + variance))
  })

export const buildMockInsights = () => ({
  accuracy: 0.87,
  beatAlignment: 0.82,
  crowdEnergy: 0.78,
  notes: [
    'Peak hype registered at 2:44 during baseline reverse dunk.',
    'Action density highest between 3:00 - 4:30, recommend featured segment.',
    'Music recommendation tuned to aggressive guard play & pace-and-space offense.',
  ],
})
