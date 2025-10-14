# Hoops Hype Studio  
**AI-Powered Basketball Hype Video Creator**  
**Product Requirements Document (PRD)**  
**Version:** 1.1  
**Owner:** Kirk Anderson (Founder - INP Labs)  
**Target Deployment:** Netlify (Serverless React App)  
**Last Updated:** October 2025  

---

## 1. Product Overview

### 1.1 Purpose  
Hoops Hype Studio transforms raw home basketball footage into professional-quality highlight reels. Using AI for **action detection, beat-synced editing, intelligent music selection, and motion-aware color/audio enhancement**, the platform turns any user's video into a share-ready hype montage—no editing skills required.

### 1.2 Product Vision  
> "Turn every game into SportsCenter."  
Make high-end sports video editing accessible to youth athletes, coaches, and parents. Deliver ESPN-style quality automatically from a smartphone upload.

### 1.3 Value Proposition  
- **For players:** showcase skills for recruitment or social media.  
- **For coaches:** auto-generate highlight tapes for team morale or scouting.  
- **For parents/fans:** share professional edits without learning editing tools.  
- **For creators:** leverage AI to automate beat cuts, effects, music, and motion tracking.

---

## 2. Goals and Non-Goals

| **Goals (Phase 1-3)** | **Non-Goals** |
|-----------------------|---------------|
| Automate highlight detection for basketball | Full manual editing suite (Premiere-style) |
| Create 30-90 s hype videos synced to music | Real-time live broadcast overlays |
| Enable one-click export for social media | Multi-camera live capture |
| Maintain brand-quality UI/UX using modern React stack | Monetization / payment gateway (Phase 4) |

---

## 3. Target Users

| Persona | Description | Key Need |
|----------|--------------|-----------|
| **Youth athlete (14-20)** | Uploads phone video; wants a short highlight edit | Speed, style, social export |
| **Coach / parent** | Manages team videos; highlights each player | Batch editing, simple UI |
| **Videographer / recruiter** | Evaluates talent; uses premium version | Color accuracy, pro-grade audio & export |
| **Casual fan** | Wants a "hype reel" for fun | Ease, templates, automatic polish |

---

## 4. Product Scope

### 4.1 Core Capabilities
1. **Upload & Ingest** - Chunked uploads up to 5 GB, automatic transcoding to 720p proxy.  
2. **Highlight Detection** - AI detects dunks, 3-pointers, steals, blocks, and crowd peaks.  
3. **Auto Editing & Syncing** - Beat detection, cut-to-beat editing, speed ramps, transitions.  
4. **AI Music Intelligence** - Automatically selects the best hype tracks matched to play style and energy.  
5. **Overlays & Branding** - Name, team colors, scoreboard, logo integration.  
6. **Export** - 16:9, 9:16, 4:5 formats; optimized for social media platforms.  
7. **User Controls** - "One-Click Hype" mode + manual timeline for advanced users.

---

## 5. System Architecture Overview

### 5.1 Frontend
- **Framework:** React 18 + TypeScript + Vite + Tailwind + shadcn/ui  
- **State:** Zustand + React Query  
- **Media Processing:** ffmpeg.wasm (preview tasks), WebAudio API (beat detection)  
- **UX:** Framer Motion animations, waveform timeline, action chips  

### 5.2 Backend / Serverless Functions
- **Platform:** Netlify Functions (TypeScript)  
- **Endpoints:**  
  - `/createUploadUrl`  
  - `/detectHighlights`  
  - `/detectBeats`  
  - `/recommendMusic`  
  - `/startRenderJob`  
  - `/getJobStatus`  
  - `/finalizeExport`  
- **External Worker (GPU Path):** Python + ffmpeg + PyTorch (action detection model)  
- **Storage:** AWS S3 / R2 (Signed URLs for uploads & exports)  

### 5.3 ML Model Integration
| Pipeline | Source | Output |
|-----------|---------|---------|
| Action Detection | PyTorch YOLO-variant (basketball fine-tuned) | JSON segments w/ confidence |
| Audio Peak Detection | WebAudio + Spectral Flux | List of timestamps |
| Beat Sync | WebAudio BPM estimation + quantization | Beat markers per track |
| Music Recommender | BPM/mood classifier + track metadata | Ranked list of hype tracks |

---

## 6. Functional Requirements

### 6.1 Upload Module
- Support `.mp4`, `.mov`, `.mkv`.  
- Resume uploads (tus.js / Uppy).  
- Validate < 5 GB, ≤ 4 min duration.  
- Generate thumbnail + waveform + motion heatmap.  
- Display upload progress bar and status chips.  

### 6.2 Highlight Detection Engine
- Auto-segment video into scenes > 1.2 s.  
- Apply AI model to tag key actions.  
- Score events:  
  ```
  Score = (ActionWeight x Confidence) + (AudioPeak x 0.2) + (MotionIntensity x 0.2)
  ```
- Select top scoring segments until target runtime (30-90 s).  

### 6.3 Editing & Assembly Engine
- Trim scenes to beats ± 0.3 s.  
- Apply speed ramp (0.75x) on impact frames.  
- Apply transition templates (hard cut / crossfade / flash).  
- Merge clips in order of strength.  
- Normalize audio (-14 LUFS).  

### 6.4 AI Music Intelligence Module
- Integrates with royalty-free music APIs (Pixabay, Artlist, Epidemic Sound).  
- Fetches songs by BPM, genre, and energy level.  
- Matches track to highlight intensity and player style.  
- Performs beat alignment to sync edits to downbeats.  
- Applies adaptive ducking to crowd/ambient noise.  
- Provides "Auto Match" and "Manual Pick" modes.  
- Mix output normalized to -14 LUFS.  
- Recommends top 3 tracks per project, showing preview and license info.  

### 6.5 Overlays & Branding
- Team color selection (color picker or preset).  
- Dynamic lower thirds (name, number, position).  
- Scoreboard burst animation (JSON Lottie).  
- Title & end card templates with animated text.  

### 6.6 Export Module
- Encode via ffmpeg:  
  - 1080p H.264 / 18 Mbps VBR / AAC 320 kbps  
  - Presets: 16:9 / 9:16 / 4:5  
- Output to temporary signed URL (download + share buttons).  
- Optional multi-aspect export batch.  

### 6.7 User Experience Flow
1. **Landing Page** → Upload Video  
2. **Processing Screen** → AI Analyzes Footage  
3. **Music Selection** → Auto Music Match or Manual Pick  
4. **Preview Editor** → Auto Highlights + Beat Grid  
5. **Generate Hype Video** → AI Syncs Music, Motion & Effects  
6. **Download/Share** → Post to Instagram / TikTok / YouTube  

---

## 7. Non-Functional Requirements

| Category | Requirement |
|-----------|-------------|
| **Performance** | Preview generation < 30 s; Full render < 10 min (3 min video). |
| **Scalability** | Serverless auto-scale for ≈ 100 simultaneous renders. |
| **Availability** | 99.5% uptime SLA. |
| **Security** | Signed URLs; object storage auto-expire 24 h; no public access. |
| **Accessibility** | WCAG AA contrast; keyboard shortcuts; captions for titles. |
| **Localization** | I18n ready (en default). |
| **Compliance** | GDPR/CCPA delete on request. |

---

## 8. User Interface Requirements

| Screen | Description | Key Elements |
|---------|--------------|--------------|
| **Home** | Marketing pitch + upload button | Gradient hero w/ "Create Your Hype Video" CTA |
| **Upload** | Drag-and-drop zone + progress bar | File status, cancel option |
| **Processing** | AI analysis progress | "Analyzing your game." + spinner |
| **Music Selector** | Auto/Manual choice | Track previews, mood chips, energy meter |
| **Editor/Preview** | Timeline + highlight chips + preview | Beat grid, moment tags, music selector |
| **Export** | Export settings and status | Aspect ratio presets + download link |

---

## 9. Integration Points

| Integration | Purpose |
|--------------|----------|
| **Pixabay/Epidemic Music API** | Fetch royalty-free hype tracks with BPM & mood metadata |
| **Cloud Storage (S3 / R2)** | Video storage & download links |
| **ML Model Endpoint** | Action detection, beat sync, and track recommendation |
| **Email/Webhook** | Job status notifications (optional) |

---

## 10. Phased Roadmap

| Phase | Milestone | Deliverables |
|--------|------------|---------------|
| **1** | MVP - Auto Highlight & Music Match | Upload, AI highlight cut, basic music match, single export |
| **2** | Advanced Editing & Overlays | Beat sync, slow-mo, color grade, branding |
| **3** | Pro Export Suite & Smart Reframe | Multi-aspect outputs, subject tracking |
| **4** | Monetization & Mobile | Freemium plan, mobile responsive UI |

---

## 11. Success Metrics

| Metric | Target |
|---------|---------|
| Time to first export | < 10 minutes (p95, 3±0.5 min source) |
| Auto-edit accuracy (action correctness) | ≥ 85% |
| Beat alignment accuracy | ≥ 80% |
| Music recommendation accuracy | ≥ 85% mood match |
| User satisfaction (score ≥ 4.5 / 5) | > 90% positive feedback |
| Render failure rate | < 1% |

---

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
|-------|---------|-------------|
| Long render times on free tier | High | Queue limit + external GPU worker |
| Music licensing | Medium | Use royalty-free libraries only |
| Large file uploads failing | High | Chunked uploads + retry logic |
| Browser ffmpeg limits | Medium | Offload to serverless pipeline |
| ML model bias (low accuracy) | Medium | Feedback loop + model retraining |
| Music metadata quality inconsistent | Medium | Cache high-confidence datasets |

---

## 13. Future Enhancements

- Multi-sport support (soccer, football, volleyball).  
- Personalized voiceover generation ("AI Announcer").  
- Cloud Project Library & Team Collaboration.  
- Adaptive music layering (per quarter or play style).  
- Crowd energy detection influencing soundtrack.  

---

## 14. Acceptance Criteria (Phase 1)

1. User uploads basketball video ≤ 5 GB.  
2. System detects ≥ 5 highlight moments automatically.  
3. AI recommends at least 3 hype tracks based on energy and tempo.  
4. Generates 30 s and 60 s cuts with beat-synced music.  
5. Video exports successfully in 16:9 and 9:16.  
6. End-to-end flow < 10 min.  
7. App runs entirely on Netlify with serverless functions.  

---

## 15. Appendix

### 15.1 Core Tech Stack
| Layer | Tech |
|-------|------|
| UI | React + TypeScript + Tailwind + shadcn/ui |
| Media | ffmpeg.wasm + WebAudio API |
| Backend | Netlify Functions (TS) + Python ML Worker |
| Data Store | AWS S3 / R2 (Signed URLs) |
| State Mgmt | Zustand + React Query |
| Tests | Vitest + Playwright |
| CI/CD | Netlify Deploy Pipeline + GitHub Actions |

### 15.2 Open-Source Models (Candidates)
- **Action Recognition:** PyTorch + SlowFast (Transfer Learning on Basketball)  
- **Pose Estimation:** MediaPipe Pose / OpenPose  
- **Beat Detection:** WebAudio Tempo Estimation  
- **Music Recommender:** OpenAI Embeddings + BPM metadata ranking  

---

## 16. Security & Auth Model

- Worker authentication: Bearer token (Functions → GPU Worker) with `x-nonce` and `x-timestamp`. Reject if clock skew > 5 minutes or nonce replayed within 10 minutes. Optional HMAC: `X-Signature = HMAC-SHA256(secret, body + timestamp + nonce)`.
- Public Functions: strict input validation; IP rate limit (e.g., 60/min) and per-user concurrency caps (e.g., 1 render). Return 429 with `retry_after`.
- Data retention: uploads and exports auto-expire ≤ 24h; user-initiated deletion removes source, intermediates, exports within 7 days.
- Secret management: Netlify/Modal secrets only; rotate quarterly.

## 17. Upload & Ingest Details

- Methods:
  - Tus/Uppy (5–8 MB chunks; retry [0, 1s, 3s, 5s]; 24h resume).
  - S3/R2 presigned PUT for small/stable uploads.
- Limits: size < 5 GB; duration ≤ 4 min; max bitrate 50 Mbps.
- CORS: allow PUT/HEAD/OPTIONS; expose `ETag`; allow headers `content-type`, `content-md5`.
- Integrity: use `Content-MD5` and validate against ETag (single-part) or store checksum for multipart.
- Ingest: `/ingest` produces 720p60 proxy and waveform JSON.

## 18. Overlay & Branding Schema

```
{
  "titleCard": { "text": string, "font": string, "color": string, "duration": number },
  "lowerThird": { "name": string, "team": string, "number": string, "position": string, "color": string },
  "scoreboard": { "enabled": boolean, "style": "burst"|"minimal", "color": string },
  "logo": { "url": string, "x": number, "y": number, "scale": number },
  "safeZones": { "16x9": string, "9x16": string, "4x5": string }
}
```
- Fonts limited to licensed families; logo: PNG/SVG ≤ 1 MB; sRGB color space; safe zones as normalized polygons.

## 19. Render Pipeline Specification

- Transitions: hard cut; crossfade `xfade=transition=fade:duration=0.18`; flash (luma overlay).
- Speed ramps: `setpts` around impact frames; maintain audio sync.
- Color: `zscale` to BT.709; optional `eq=contrast=1.05:saturation=1.08`.
- Presets:
  - 16:9 1080p: H.264 (libx264) High@4.2, 18 Mbps VBR, keyint=60, yuv420p.
  - 9:16 1080x1920: H.264 15 Mbps VBR, keyint=60.
  - 4:5 1350x1080: H.264 16 Mbps VBR, keyint=60.
- Audio: 48 kHz; `loudnorm` to -14 LUFS; AAC 320 kbps; MP4 `-movflags faststart`.

## 20. Music Provider Integration

- Provider: Pixabay (Phase 1), optional Artlist/Epidemic later.
- Required fields: title, artist, bpm, mood, energy, key, license, previewUrl, duration.
- Quotas/caching: cache 24h in Redis; fallback to cache on provider errors.
- Auth: previews via provider links; final assets only via licensed, controlled storage.

## 21. ML Model & Data

- Dataset: 50–100 hours diverse amateur games; action-balanced; augments for blur/lighting.
- Model: YOLOv8/SlowFast hybrid; TorchScript for server.
- Evaluation: precision/recall/F1 per action; overall accuracy ≥ 85%.
- Retrain: quarterly or after 10k new labeled clips.
- Infra: GPUs T4/A10; cold start ≤ 20s; throughput ≥ 10 jobs/hour on T4.

## 22. Job Orchestration & Progress

- Queue: Redis-backed; per-user concurrency ≤ 1 render; global tuned to GPU capacity.
- Retries: backoff [5s, 15s, 45s], max 3; DLQ with `error.code`.
- Status: `queued` → `running` → `done|error`; per-preset progress; payload includes `downloads` on completion.

## 23. Observability & Operations

- Logs: JSON `{ ts, level, assetId, jobId, userId, event, details }` across Functions/Worker.
- Metrics: p95 time-to-export, success rate, failure reasons, queue depth, GPU utilization.
- SLOs: 99.5% availability; p95 render < 10 min; alerts at 80% SLO burn.

## 24. Accessibility & UX Criteria

- Keyboard workflows; logical focus order; visible focus rings.
- ARIA: labels/roles; progress bars with `aria-live=polite` updates.
- Contrast: WCAG AA; responsive layout (≥ 375px width supported).

## 25. Acceptance Criteria Clarifications

- Performance: p95 end-to-end < 10 min on 3±0.5 min, 1080p sources.
- Highlights: ≥ 5 correct moments (confidence ≥ 0.7; score threshold per 6.2).
- Music: ≥ 3 tracks; BPM within ±5 of detected tempo; mood match ≥ 0.8.
- Export: 16:9 and 9:16 with yuv420p, AAC 320 kbps, keyint=60; signed URLs valid ≥ 1h.
- Definition of Done:
  - Phase 1: Upload (Tus/PUT), basic highlights, one preset export.
  - Phase 2: Beat sync + overlays schema applied, two presets.
  - Phase 3: Multi-aspect outputs, smart reframe, Redis jobs, hardened worker.
