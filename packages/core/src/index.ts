export type Segment = {
  id: string; start: number; end: number;
  label: 'dunk'|'block'|'steal'|'three'|'fast_break'|'buzzer';
  confidence: number; score: number;
}
export type Track = { url: string; bpm?: number; mood?: string; energy?: number; title?: string; license?: string }
export type Project = {
  id: string; sourceUrl: string; proxyUrl?: string; duration?: number;
  segments: Segment[]; beatGrid?: number[]; music?: Track;
  overlays: { team?: string; color?: string; playerName?: string; number?: string; logoUrl?: string };
  targetLength: 30|60|90; aspect: '16:9'|'9:16'|'4:5';
}

export function assembleEdit(segments: Segment[], targetLength: number, beatGrid?: number[]): Segment[] {
  // very small placeholder: sort by score and cap duration
  const sorted = [...segments].sort((a,b)=> b.score - a.score)
  let total = 0
  const out: Segment[] = []
  for(const s of sorted){
    const d = s.end - s.start
    if(total + d > targetLength) continue
    out.push(s); total += d
  }
  // TODO: snap to beatGrid ±0.3s
  return out
}
