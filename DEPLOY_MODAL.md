# Deploying the GPU Worker on Modal

This guide sets up a personal, usage-based GPU worker that serves the heavy parts of the PRD (action detection + ffmpeg renders). The web UI and orchestration stay on Netlify.

## Prerequisites
- Modal account + CLI: `pip install modal`
- Login: `modal token set --token YOUR_TOKEN`
- Cloud storage (S3/R2) bucket created

## Files
- `workers/modal/modal_app.py` — FastAPI app served by Modal with endpoints:
  - `POST /ingest` → proxy + waveform (stubbed)
  - `POST /highlights` → highlight segments (stubbed)
  - `POST /render` → export URLs (stubbed)

## Create a Secret in Modal
Create a secret named `hoops-hype-studio` with required keys.

Examples:
```
modal secret create hoops-hype-studio \
  GPU_WORKER_TOKEN=supersecrettoken \
  STORAGE_BUCKET=s3://your-bucket \
  STORAGE_REGION=us-east-1 \
  STORAGE_ACCESS_KEY=... \
  STORAGE_SECRET_KEY=...
```

## Deploy the worker
From repo root:
```
modal deploy workers/modal/modal_app.py
```

Modal prints a public URL for the ASGI app. Copy it and set in Netlify:
```
GPU_WORKER_BASE_URL=https://your-modal-app--api.modal.run
GPU_WORKER_TOKEN=supersecrettoken
```

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

