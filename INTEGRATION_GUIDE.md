# Hoops Hype Studio Integration Guide

This document explains how to replace the front-end mock data/hooks with live Netlify Functions and ML endpoints once they are ready. It also lists the external APIs the platform will need.

---

## 1. High-Level Workflow

1. **Upload**  
   - Request a presigned upload URL from Netlify (`createUploadUrl` function).  
   - Perform chunked upload (tus/Uppy) directly to object storage (S3 or Cloudflare R2).  
   - Notify backend when the upload completes so the proxy transcode job can start.

2. **Analysis Pipeline**  
   - Trigger the GPU worker (Python) to run action detection + motion scoring.  
   - Persist highlight metadata and status in a lightweight store (Redis/Supabase/Planetscale).  
   - Expose progress via polling (`getJobStatus`) or WebSocket channel (Pusher/Ably).

3. **Music Intelligence**  
   - Query the music recommender service (custom Python or serverless function).  
   - Fetch royalty-free tracks via partner API (Pixabay, Artlist, Epidemic).  
   - Return ranked list with BPM, mood, match score, preview URL, and license info.

4. **Preview Editor**  
   - Stream transcoded 720p proxy from storage for in-app playback.  
   - Retrieve beat markers, highlight segments, and energy curves from API responses.

5. **Render + Export**  
   - Call `startRenderJob` to queue the final ffmpeg pipeline (GPU).  
   - Poll `getJobStatus` until the render finishes and `finalizeExport` returns signed download URLs.

---

## 2. Netlify Functions (TypeScript)

Create functions under `functions/` with the following responsibilities:

| Function | Purpose | Key Inputs | Response |
|----------|---------|------------|----------|
| `createUploadUrl` | Generate signed upload + proxy manifest IDs | `fileName`, `size`, `type` | `{ uploadUrl, assetId, proxyUrl }` |
| `detectHighlights` | Kick off GPU highlight detection job | `assetId`, `duration` | `{ jobId }` |
| `detectBeats` | Run web-audio/ffmpeg beat analysis (optional serverless) | `assetId`, `trackId?` | `{ beats: BeatMarker[] }` |
| `recommendMusic` | Bridge to music ML service + external library search | `assetId`, `playStyle`, `targetLength` | `{ tracks: MusicTrack[] }` |
| `startRenderJob` | Submit render configuration to GPU worker | `assetId`, `trackId`, `presets[]` | `{ renderJobId }` |
| `getJobStatus` | Poll highlight/render job state | `jobId` | `{ status, progress, eta, payload }` |
| `finalizeExport` | Create signed download URLs for completed renders | `renderJobId` | `{ downloads: { presetId, url, expiresAt }[] }` |

Implementation tips:

- Use Netlify environment variables + secret management for API keys.  
- Prefer async polling via Redis/KV store to keep functions fast (<10s).  
- Emit structured logs (`console.log(JSON.stringify({ ... }))`) for observability dashboards.

---

## 3. ML & GPU Worker (Python)

Host a separate worker (AWS Lambda GPU, Modal, Lambda@Edge w/ GPU, RunPod, or Fly.io) that exposes REST or queue-based endpoints:

| Endpoint | Description | Input | Output |
|----------|-------------|-------|--------|
| `/ingest` | Download source video from storage, transcode proxy | `assetId`, `sourceUrl` | `{ proxyUrl, waveformUrl }` |
| `/highlights` | Run action detection, score events | `assetId`, `proxyUrl` | `{ segments: HighlightSegment[] }` |
| `/render` | Assemble final video (ffmpeg + overlays + music) | `assetId`, `trackUrl`, `presets[]`, `metadata` | `{ outputs: { presetId, url }[] }` |

Suggested stack:

- **Action detection**: PyTorch (YOLOv8/SlowFast) fine-tuned on basketball.  
- **Beat alignment**: librosa + spectral flux.  
- **Audio normalization**: ffmpeg `loudnorm` filter to -14 LUFS.  
- **Queue**: Redis Queue, Celery, or AWS SQS + Lambda.  
- **Storage**: S3/R2 for intermediate and final assets.

Ensure all endpoints are authenticated (HMAC header or signed token) before calling from Netlify Functions.

---

## 4. Front-End Integration Steps

1. **Replace Mock Builders**  
   - Remove usage of `buildMockHighlights`, `buildMockBeatMarkers`, etc. in `apps/web/src/app.tsx`.  
   - Replace with hooks that fetch from the corresponding Netlify functions (React Query is already listed in dependencies).

2. **Create API Client Layer**  
   - Define `lib/apiClient.ts` with fetch helpers (`getHighlights`, `getMusic`, etc.).  
   - Include typed responses to match the state interfaces.

3. **Status Polling**  
   - Use React Query polling or WebSocket subscription to monitor jobs.  
   - Update the Zustand store with real progress instead of the simulated timers.

4. **Upload Handling**  
   - Integrate tus.js/Uppy component so the user can upload >1 GB reliably.  
   - On completion, call `detectHighlights` and optimistically move to “AI Analysis”.

5. **Render CTA**  
   - Disable the export button until a track and highlights are confirmed.  
   - On click, call `startRenderJob` and display the server-provided progress percentages.

---

## 5. Required Environment Variables

Add these to `/.env` and configure in Netlify:

```
NETLIFY_SITE_ID=...
NETLIFY_AUTH_TOKEN=...
STORAGE_BUCKET=s3://bucket-name
STORAGE_REGION=us-east-1
STORAGE_ACCESS_KEY=...
STORAGE_SECRET_KEY=...
MUSIC_API_KEY=...              # Pixabay/Artlist/Epidemic
MUSIC_API_BASE_URL=https://...
GPU_WORKER_BASE_URL=https://gpu-worker.yourdomain.com
GPU_WORKER_TOKEN=...
QUEUE_REDIS_URL=redis://...
```

Keep secure credentials in Netlify’s environment manager (never commit `.env` with secrets).

---

## 6. External APIs & Services

| Category | Provider | Notes |
|----------|----------|-------|
| Music Library | Pixabay Music / Artlist / Epidemic Sound | Needs BPM, mood, license metadata. Some require server-side signature. |
| Object Storage | AWS S3 / Cloudflare R2 | Supports presigned URL uploads + temporary download links. |
| Email/Webhook | Resend / SendGrid / Netlify Webhooks | Optional notification when render completes. |
| Observability | Logtail / Sentry / Supabase Logging | Useful for tracing Netlify functions & workers. |
| Queue/Cache | Redis (Upstash) / Supabase Realtime | Store job statuses, enable pub/sub for progress. |

---

## 7. Testing Checklist

1. Local: use `netlify dev` to run functions alongside `pnpm -C apps/web dev`.  
2. Mock the GPU worker with JSON fixtures before connecting real hardware.  
3. Write integration tests (Vitest + MSW) for API client hooks.  
4. Verify long uploads via `tus-node-server` emulator.  
5. Run end-to-end flow on Netlify preview deploy before enabling public access.

Once these integrations are complete, the UI can drop the current mock timers and render real hype videos from user footage.
