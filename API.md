# Hoops Hype Studio — API

This document defines the internal serverless APIs and external integrations required for the app to work end‑to‑end. It is derived from the current codebase, Netlify function stubs, and the PRD/Integration Guide.

## Overview
- Base: Netlify Functions (TypeScript) deployed with the web app
  - Local: `http://localhost:8888/.netlify/functions/{name}` (via `netlify dev`)
  - Prod: `https://{site}.netlify.app/.netlify/functions/{name}` or custom domain
- Storage: S3 or R2 using presigned URLs for upload/download
- GPU Worker: External service (Python/ffmpeg/ML) for heavy jobs
- Frontend state expects typed shapes defined in `apps/web/src/state/useStudioState.ts`

## Environment Variables
- `STORAGE_BUCKET`, `STORAGE_REGION`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`
- `MUSIC_API_KEY`, `MUSIC_API_BASE_URL`
- `GPU_WORKER_BASE_URL`, `GPU_WORKER_TOKEN`
- `QUEUE_REDIS_URL` (or other KV/DB for job status)

## Auth Model
- Frontend → Netlify Functions: public endpoints; validate inputs; enforce CORS; avoid exposing secrets to client.
- Netlify Functions → GPU Worker: HMAC or Bearer token via `GPU_WORKER_TOKEN` header.
- Storage access: presigned URLs only; short expirations; objects auto‑expire within 24h.

## Internal APIs (Netlify Functions)

1) POST `/createUploadUrl`
- Purpose: Issue a presigned URL for direct-to-storage upload and register an asset ID.
- Request
  - `fileName` string
  - `size` number (bytes)
  - `type` string (MIME)
- Response 200
  - `assetId` string — internal reference for this upload
  - `uploadUrl` string — presigned URL for PUT
  - `proxyUrl` string (optional) — if proxy/transcode already exists
- Notes: After client finishes upload, client should notify analysis by calling `/detectHighlights`.

2) POST `/detectHighlights`
- Purpose: Kick off GPU highlight detection and scene analysis for an uploaded asset.
- Request
  - `assetId` string
  - `duration` number (seconds)
  - `sourceUrl?` string (if needed by worker; otherwise resolvable from `assetId`)
- Response 200
  - `jobId` string — track analysis job
- Worker contract (downstream): GPU worker downloads source, computes segments, persists to KV/DB.

3) POST `/detectBeats`
- Purpose: Compute beat grid/energy markers for the source or selected track.
- Request
  - `assetId` string
  - `trackId?` string — optional if beat alignment is track‑aware
- Response 200
  - `beats` BeatMarker[]
    - `id` string
    - `time` number (s)
    - `intensity` number (0..1)

4) POST `/recommendMusic`
- Purpose: Return ranked hype tracks for the project via internal ML + external libraries.
- Request
  - `assetId` string
  - `playStyle` string (e.g., "guard", "big", "team")
  - `targetLength` number (seconds)
- Response 200
  - `tracks` MusicTrack[] (normalized to frontend expectations)
    - `id` string
    - `title` string
    - `artist` string
    - `bpm` number
    - `mood` one of: "High Energy" | "Hybrid Trap" | "Anthemic" | "Electro Drive"
    - `energyLevel` number (0..100)
    - `matchScore` number (0..100)
    - `key` string (e.g., "E Minor")
    - `previewUrl` string
    - `waveform` number[] (optional visual sparklines; fallback to empty array)

5) POST `/startRenderJob`
- Purpose: Enqueue the final render (ffmpeg, overlays, music, color) across selected presets.
- Request
  - `assetId` string
  - `trackId` string
  - `presets` string[] — preset IDs; see Export presets below
  - `metadata?` object — overlays/branding, titles, colors (see Overlay Metadata)
- Response 200
  - `renderJobId` string

6) GET `/getJobStatus`
- Purpose: Poll job status for analysis or render.
- Query
  - `jobId` string
- Response 200
  - `status` "queued" | "running" | "done" | "error"
  - `progress` number (0..100)
  - `presets` { presetId: string, progress: number }[]
  - `eta?` number (seconds)
  - `payload?` object
    - analysis jobs: `{ segments: HighlightSegment[], beats?: BeatMarker[] }`
    - render jobs: `{ presets?: { presetId: string, progress: number }[], downloads?: { presetId: string, url: string, expiresAt: string }[] }`

7) POST `/finalizeExport`
- Purpose: Create fresh signed download URLs for completed renders.
- Request
  - `renderJobId` string
- Response 200
  - `downloads` array of:
    - `presetId` string
    - `url` string (signed)
    - `expiresAt` string (ISO8601)

## Data Models (Frontend Contracts)

HighlightSegment (apps/web)
- `id` string
- `timestamp` string (MM:SS display)
- `action` one of: "Dunk" | "Three Pointer" | "Steal" | "Block" | "Assist"
- `descriptor` string — UI description
- `confidence` number (0..1)
- `audioPeak` number (0..1)
- `motion` number (0..1)
- `score` number (0..1)
- `clipDuration` number (seconds)

BeatMarker (apps/web)
- `id` string
- `time` number (s)
- `intensity` number (0..1)

MusicTrack (apps/web)
- `id`, `title`, `artist`, `bpm`, `mood`, `energyLevel`, `matchScore`, `key`, `previewUrl`, `waveform: number[]`

Export Presets (apps/web)
- Preset IDs expected by UI: `cinematic-169`, `vertical-916`, `highlight-45`

## Overlay Metadata

Pass in `metadata` to `/startRenderJob` using this shape (subset shown; extend as needed):

```
{
  "titleCard": { "text": "Skyline High Hype", "font": "Inter Bold", "color": "#FFFFFF", "duration": 2.0 },
  "lowerThird": { "name": "Jordan Ellis", "team": "Skyline High", "number": "23", "position": "G", "color": "#5B6DFA" },
  "scoreboard": { "enabled": true, "style": "burst", "color": "#FFD166" },
  "logo": { "url": "https://.../logo.png", "x": 0.92, "y": 0.08, "scale": 0.5 },
  "safeZones": { "16x9": "polygon(...)", "9x16": "polygon(...)" }
}
```

The worker should validate fonts against an allowlist, constrain positions to [0..1], and clamp scales.

## External Services

GPU Worker (Python)
- `POST /ingest` → `{ assetId, sourceUrl }` ⇒ `{ proxyUrl, waveformUrl }`
- `POST /highlights` → `{ assetId, proxyUrl }` ⇒ `{ segments: HighlightSegment[] }`
- `POST /render` → `{ assetId, trackUrl, presets[], metadata }` ⇒ `{ outputs: { presetId, url }[] }`
- Security: Require HMAC or Bearer token in `Authorization`.

Music Library
- Pixabay/Artlist/Epidemic search by BPM, mood, energy → Normalize to MusicTrack shape.
 - Required fields: `title`, `artist`, `bpm`, `mood`, `energy`, `key`, `license`, `previewUrl`, `duration`.

Object Storage
- Generate presigned `uploadUrl` and temporary `download` URLs. Apply 24h expiry policy.

## Typical Client Flow
1. `POST /createUploadUrl` → upload via presigned `uploadUrl`
2. `POST /detectHighlights` → returns `jobId`
3. Poll `GET /getJobStatus?jobId=` until `segments` ready
4. `POST /detectBeats` and `POST /recommendMusic`
5. User selects track → `POST /startRenderJob`
6. Poll `GET /getJobStatus?jobId=` for render progress
7. `POST /finalizeExport` → present `downloads[]`

## Error Model
- Use Problem Details style JSON
```
{
  "type": "https://docs.example/errors/validation",
  "title": "Invalid input",
  "status": 400,
  "detail": "fileName is required",
  "instance": "/createUploadUrl"
}
```
- Common statuses: 400 (validation), 401/403 (auth to worker), 404 (asset/job not found), 429 (rate limit), 500 (unexpected)

Standard error codes (in `detail` or `extensions.code`):
- `UPLOAD_MISSING`, `UPLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`
- `MODEL_TIMEOUT`, `MODEL_ERROR`, `FFMPEG_FAIL`
- `RATE_LIMITED`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`

## Security Headers
- Worker auth: `Authorization: Bearer <GPU_WORKER_TOKEN>`, plus a signed `x-nonce` and `x-timestamp` if using HMAC.
- Client uploads: prefer `Content-MD5` on PUT; validate against ETag or stored checksum.

## Notes for Implementation
- Keep functions under 10s; offload long work to GPU worker and persist state in Redis/KV.
- Emit structured logs; include `assetId`/`jobId` correlation IDs.
- Validate MIME, size (< 5 GB), and sanitize file names in `/createUploadUrl`.
- Normalize external music responses to `MusicTrack` to match the UI.

Additional endpoints

- POST /beats → `{ trackUrl }` ⇒ `{ bpm: number, beatGrid: number[] }`
- POST /deleteAsset → `{ assetId }` ⇒ `{ deleted: { key, ok, status }[] }`
- POST /deleteExport → `{ assetId, presetId }` ⇒ `{ deleted: boolean }`

Scheduled

- retentionSweep (cron) → daily best-effort retention; prefer S3/R2 lifecycle policies.
