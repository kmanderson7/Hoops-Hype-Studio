# Deploying the GPU Worker on Modal

This guide sets up a personal, usage-based GPU worker that serves the heavy parts of the PRD (action detection + ffmpeg renders). The web UI and orchestration stay on Netlify.

## Prerequisites
- Modal account + CLI: `pip install modal`
- Login: `modal token set --token YOUR_TOKEN`
- Cloud storage (S3/R2) bucket created

## Files
- `workers/modal/modal_app.py` — FastAPI app served by Modal with endpoints:
  - `POST /ingest` → proxy + waveform
  - `POST /highlights` → highlight segments (GPT-4o + YOLO fallback)
  - `POST /beats` → BPM + beat grid + downbeats (librosa)
  - `POST /audio-analysis` → energy profile for music ranking
  - `POST /render` → ffmpeg encode + R2 upload, returns presigned URLs

## Create a Secret in Modal
Create a secret named `hoops-hype-studio` with **all 7 keys** below — `modal_app.py` reads each one. Missing any of them will cause endpoints to 401, 500, or silently degrade:

| Key | Required? | Used by |
|---|---|---|
| `GPU_WORKER_TOKEN` | **Yes** | `_require_auth` (returns 500 if missing, 401 on token mismatch) |
| `STORAGE_BUCKET` | **Yes** | R2/S3 upload of rendered MP4s |
| `STORAGE_REGION` | **Yes** | R2 = `auto`; AWS = `us-east-1` etc. |
| `STORAGE_ACCESS_KEY` | **Yes** | R2/S3 auth |
| `STORAGE_SECRET_KEY` | **Yes** | R2/S3 auth |
| `STORAGE_ENDPOINT` | **Yes for R2** | e.g. `https://<account>.r2.cloudflarestorage.com`. Omit only for actual AWS S3. |
| `OPENAI_API_KEY` | Optional | GPT-4o action classification + TTS narration. Without it the worker falls back to YOLO+heuristic. |

**`GPU_WORKER_TOKEN` must match the value set in Netlify** (`GPU_WORKER_TOKEN` env var). Generate a fresh one once and use it in both places.

```
modal secret create hoops-hype-studio \
  GPU_WORKER_TOKEN=<32-hex-chars> \
  STORAGE_BUCKET=hoops-hype-storage \
  STORAGE_REGION=auto \
  STORAGE_ACCESS_KEY=<r2-access-key> \
  STORAGE_SECRET_KEY=<r2-secret-key> \
  STORAGE_ENDPOINT=https://<account>.r2.cloudflarestorage.com \
  OPENAI_API_KEY=<sk-...>
```

For an automated path, use the helper scripts in the repo root: `setup-modal-secret.ps1` (Windows) or `setup-modal-secret.sh` (Linux/macOS). They read `.env`, generate the token if absent, and emit (or run) the full `modal secret create --force` command.

### Rotating the token

Modal supports `--force` to overwrite an existing secret in place:

```
modal secret create hoops-hype-studio --force \
  GPU_WORKER_TOKEN=<new-token> \
  STORAGE_BUCKET=... ...
```

After rotation:
1. Redeploy the worker so it picks up the new secret values:
   ```
   modal deploy workers/modal/modal_app.py
   ```
2. Update `GPU_WORKER_TOKEN` in the Netlify dashboard to the same new value.
3. Trigger a Netlify redeploy so the functions reload the env.

## Deploy the worker
From repo root:
```
modal deploy workers/modal/modal_app.py
```

Modal prints a public URL for the ASGI app, e.g. `https://<workspace>--<app>-fastapi-app.modal.run`. Copy it and set in Netlify (Site configuration → Environment variables, **All scopes**, **All deploy contexts**):
```
GPU_WORKER_BASE_URL=https://<workspace>--<app>-fastapi-app.modal.run
GPU_WORKER_TOKEN=<same value used in the Modal secret>
```

### Smoke test before wiring Netlify

After `modal deploy`, verify the worker is reachable and the secret bound correctly:
```
curl -X POST "$GPU_WORKER_BASE_URL/highlights" \
  -H "authorization: Bearer $GPU_WORKER_TOKEN" \
  -H "content-type: application/json" \
  -d '{"assetId":"smoke","proxyUrl":"https://example.com/x.mp4"}'
```
- HTTP 200 with a JSON body ⇒ secret + token bound. Move to Netlify wiring.
- HTTP 401 ⇒ token mismatch in the secret. Run `modal secret create … --force` with the right token.
- HTTP 500 `Worker token not configured` ⇒ secret has no `GPU_WORKER_TOKEN`. Recreate the secret.

## Wire Netlify Functions
The app already includes function stubs under `functions/`. Update them to call the Modal endpoints:
- `detectHighlights` → POST `${GPU_WORKER_BASE_URL}/highlights` with Bearer `${GPU_WORKER_TOKEN}`
- `startRenderJob`  → POST `${GPU_WORKER_BASE_URL}/render`
- (Optional) `createUploadUrl` → call `${GPU_WORKER_BASE_URL}/ingest` or keep uploads via presigned URLs from Netlify

Recommended pattern:
```
const res = await fetch(`${GPU_WORKER_BASE_URL}/highlights`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    authorization: `Bearer ${GPU_WORKER_TOKEN}`,
  },
  body: JSON.stringify({ assetId, proxyUrl }),
})
```

## Storage
- Use Netlify Functions to generate presigned URLs for direct-to-bucket uploads (`/createUploadUrl`).
- The Modal worker fetches sources and uploads exports using the credentials provided via the `hoops-hype-studio` secret.

## GPU Notes
- You can leave endpoints CPU-only while developing.
- For GPU models, change function decorators to request a GPU. Example pattern when using task functions (not needed for pure web only):
```
@app.function(image=image, gpu="T4", timeout=600)
def run_heavy_model(...):
    ...
```

## Next Steps
- Replace placeholders in `modal_app.py` with real ffmpeg + model code.
- Update Netlify functions to proxy to Modal and return typed payloads matching `API.md` and the frontend types.
- Add progress tracking via Upstash Redis if you need long-running job status.

