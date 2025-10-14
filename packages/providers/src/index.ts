import type { Track } from '@hhs/core'

export interface MusicProvider {
  search(opts: { bpmMin?: number; bpmMax?: number; mood?: string; energyMin?: number; length?: number }): Promise<Track[]>
}

export class PixabayProvider implements MusicProvider {
  constructor(private apiKey: string) {}
  async search(opts: { bpmMin?: number; bpmMax?: number; mood?: string; energyMin?: number; length?: number }): Promise<Track[]> {
    // Placeholder for real API call
    return [
      { url:'https://cdn.example/hype1.mp3', title:'Fast Break', bpm:132, mood:'hype', energy:0.9, license:'royalty-free' }
    ]
  }
}
