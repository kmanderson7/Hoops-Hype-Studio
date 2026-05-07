# AI Analysis Setup Guide

This guide will help you fix the AI analysis feature in your Hoops Hype Studio video editing app.

## Problem Summary

Your AI analysis isn't working because:
1. **Missing GPU_WORKER_TOKEN** - Authentication to Modal GPU worker is failing
2. **Invalid storage credentials** - Can't upload/download videos from Upstash
3. **Modal secret not configured** - GPU worker can't access required environment variables

## Quick Setup (Automated)

### Option 1: Run Automated Setup Script

Simply run the setup script:

```bash
# Windows
setup-ai-analysis.bat

# Mac/Linux
chmod +x setup-ai-analysis.sh
./setup-ai-analysis.sh
```

The script will:
- Install and configure Modal CLI
- Prompt you for Upstash credentials
- Generate a secure GPU worker token
- Create Modal secret with all credentials
- Deploy the GPU worker to Modal
- Update your `.env` file
- Sync environment variables to Netlify

## Manual Setup (Step-by-Step)

If the automated script doesn't work, follow these manual steps:

### Step 1: Install Modal CLI

```bash
pip install modal
```

### Step 2: Authenticate with Modal

```bash
modal token new
```

This will open your browser to authenticate. Follow the prompts.

### Step 3: Get Upstash Storage Credentials

1. Go to https://console.upstash.com
2. Navigate to your bucket (or create a new one)
3. Copy the following credentials:
   - **Bucket Name**: e.g., `hoops-hype-storage`
   - **Access Key ID**: e.g., `AKxxxxxxxxx`
   - **Secret Access Key**: e.g., `ASxxxxxxxxx`
   - **Endpoint URL**: e.g., `https://us-east-1-xxxxx.upstash.io`
   - **Region**: Usually `us-east-1`

### Step 4: Generate GPU Worker Token

Generate a secure random token:

```bash
# Windows PowerShell
$bytes = New-Object byte[] 32
(New-Object Random).NextBytes($bytes)
$token = -join ($bytes | ForEach-Object {$_.ToString('x2')})
echo $token

# Mac/Linux
openssl rand -hex 32
```

Save this token - you'll need it in the next steps.

### Step 5: Create Modal Secret

Create a Modal secret named `hoops-hype-studio` with all the credentials:

```bash
modal secret create hoops-hype-studio \
  GPU_WORKER_TOKEN="<your-generated-token>" \
  STORAGE_BUCKET="<your-bucket-name>" \
  STORAGE_ACCESS_KEY="<your-access-key>" \
  STORAGE_SECRET_KEY="<your-secret-key>" \
  STORAGE_REGION="us-east-1" \
  STORAGE_ENDPOINT="<your-endpoint-url>"
```

**Example:**
```bash
modal secret create hoops-hype-studio \
  GPU_WORKER_TOKEN="a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6" \
  STORAGE_BUCKET="hoops-hype-storage" \
  STORAGE_ACCESS_KEY="AKxxxxxxxxx" \
  STORAGE_SECRET_KEY="ASxxxxxxxxx" \
  STORAGE_REGION="us-east-1" \
  STORAGE_ENDPOINT="https://us-east-1-xxxxx.upstash.io"
```

### Step 6: Update .env File

Update your `.env` file with the same credentials:

```env
# Storage (Upstash)
STORAGE_BUCKET=hoops-hype-storage
STORAGE_REGION=us-east-1
STORAGE_ACCESS_KEY=AKxxxxxxxxx
STORAGE_SECRET_KEY=ASxxxxxxxxx
STORAGE_ENDPOINT=https://us-east-1-xxxxx.upstash.io

# GPU worker (Modal) bridge
GPU_WORKER_BASE_URL=https://hoops-hype-studio-worker--fastapi-app.modal.run
GPU_WORKER_TOKEN=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6

# Music provider (Pixabay)
MUSIC_API_KEY=52760164-034d95ecfb007bf238562a15c
MUSIC_API_BASE_URL=https://pixabay.com/api

# Redis (Upstash) for job/progress + rate limiting
UPSTASH_REDIS_REST_URL=https://accurate-burro-24808.upstash.io
UPSTASH_REDIS_REST_TOKEN=AWDoAAIncDJmNTdhYmVmOWJjZjE0MDczODRhYzdmOTIyYTAyNjQyYnAyMjQ4MDg

# Observability
LOGTAIL_TOKEN=
SENTRY_DSN=

# Edge security
EDGE_HMAC_SECRET=
RATE_LIMIT_TOKENS=120
RATE_LIMIT_WINDOW_SEC=60

# Retention policy (days)
RETENTION_DAYS=7

WEB_ORIGIN=http://localhost:5173
```

### Step 7: Deploy Modal GPU Worker

```bash
modal deploy workers/modal/modal_app.py
```

You should see output like:
```
✓ Created objects.
├── 🔨 Created mount /workers/modal/modal_app.py
├── 🔨 Created image hoops-hype-studio-worker-image
├── 🔨 Created web function hoops-hype-studio-worker.fastapi_app
└── 🔨 Created app hoops-hype-studio-worker

View Deployment: https://modal.com/apps/ap-xxxxxxxxx

Web endpoint: https://hoops-hype-studio-worker--fastapi-app.modal.run
```

Verify the URL matches your `GPU_WORKER_BASE_URL` in `.env`.

### Step 8: Sync Environment Variables to Netlify

Set the environment variables in Netlify:

```bash
netlify env:set GPU_WORKER_TOKEN "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
netlify env:set STORAGE_BUCKET "hoops-hype-storage"
netlify env:set STORAGE_ACCESS_KEY "AKxxxxxxxxx"
netlify env:set STORAGE_SECRET_KEY "ASxxxxxxxxx"
netlify env:set STORAGE_REGION "us-east-1"
netlify env:set STORAGE_ENDPOINT "https://us-east-1-xxxxx.upstash.io"
netlify env:set GPU_WORKER_BASE_URL "https://hoops-hype-studio-worker--fastapi-app.modal.run"
```

**Or set them manually in Netlify Dashboard:**
1. Go to https://app.netlify.com
2. Select your site
3. Go to Site settings → Environment variables
4. Add each variable listed above

### Step 9: Redeploy Netlify

After setting environment variables, trigger a new deployment:

```bash
netlify deploy --prod
```

Or push a commit to trigger auto-deployment:

```bash
git commit --allow-empty -m "Trigger redeploy with updated env vars"
git push
```

## Testing

### Test 1: Check Modal Deployment

Verify the GPU worker is running:

```bash
modal app list
```

You should see `hoops-hype-studio-worker` in the list.

### Test 2: Check Modal Logs

```bash
modal logs hoops-hype-studio-worker
```

### Test 3: Test API Endpoint

Test the highlights endpoint:

```bash
curl -X POST https://hoops-hype-studio-worker--fastapi-app.modal.run/highlights \
  -H "Authorization: Bearer a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6" \
  -H "Content-Type: application/json" \
  -d '{"assetId": "test", "proxyUrl": "https://example.com/video.mp4"}'
```

Replace the token with your actual `GPU_WORKER_TOKEN`.

### Test 4: Upload a Video

1. Open your app: https://your-site.netlify.app
2. Drop a video file (MP4, MOV, or MKV)
3. Open browser console (F12)
4. Watch for any error messages
5. Check if highlights are detected

### Test 5: Check Netlify Function Logs

```bash
netlify logs:function detectHighlights
```

## Troubleshooting

### Issue: "Worker token not configured"

**Cause:** Modal secret doesn't have `GPU_WORKER_TOKEN`

**Fix:**
```bash
modal secret create hoops-hype-studio GPU_WORKER_TOKEN="your-token"
```

### Issue: "Invalid token" (403 error)

**Cause:** Token mismatch between `.env` and Modal secret

**Fix:** Ensure the same token is used in:
- `.env` → `GPU_WORKER_TOKEN`
- Modal secret → `GPU_WORKER_TOKEN`
- Netlify env vars → `GPU_WORKER_TOKEN`

### Issue: S3 upload fails

**Cause:** Invalid Upstash credentials

**Fix:**
1. Verify credentials in Upstash console
2. Check bucket exists
3. Update Modal secret and `.env` with correct values

### Issue: "Scene detection failed"

**Cause:** ffmpeg not available in Modal container

**Fix:** The Modal image should include ffmpeg. Check deployment logs:
```bash
modal logs hoops-hype-studio-worker
```

### Issue: Highlights return mock data

**Cause:** Error in the highlight detection pipeline (it falls back to mock data)

**Fix:** Check Modal logs for the actual error:
```bash
modal logs hoops-hype-studio-worker --follow
```

Then drop a video and watch the logs in real-time.

## Architecture Reference

### Data Flow

```
User drops video
    ↓
Frontend uploads to Upstash S3
    ↓
Netlify function calls Modal GPU worker /ingest
    ↓
Modal downloads, transcodes, uploads proxy
    ↓
Frontend calls detectHighlights
    ↓
Modal runs AI analysis pipeline:
  - Scene detection
  - Motion analysis
  - Audio peak detection
  - Action classification
  - Scoring algorithm
    ↓
Returns top 12 highlights
    ↓
Frontend displays results
```

### Key Components

| Component | Purpose | Configuration |
|-----------|---------|---------------|
| Modal GPU Worker | AI analysis (highlight detection, audio analysis, rendering) | `workers/modal/modal_app.py` |
| Netlify Functions | API gateway to GPU worker | `functions/*.ts` |
| Upstash Storage | Video file storage | `.env` STORAGE_* vars |
| Upstash Redis | Job tracking and rate limiting | `.env` UPSTASH_REDIS_* vars |

### Environment Variables Reference

| Variable | Where Used | Purpose |
|----------|------------|---------|
| `GPU_WORKER_TOKEN` | Modal secret, .env, Netlify | Authentication between Netlify and Modal |
| `STORAGE_BUCKET` | Modal secret, .env, Netlify | S3 bucket name |
| `STORAGE_ACCESS_KEY` | Modal secret, .env, Netlify | S3 access credentials |
| `STORAGE_SECRET_KEY` | Modal secret, .env, Netlify | S3 secret credentials |
| `STORAGE_ENDPOINT` | Modal secret, .env, Netlify | S3 endpoint URL (Upstash) |
| `GPU_WORKER_BASE_URL` | .env, Netlify | Modal worker URL |

## Support

If you continue to have issues:

1. Check Modal logs: `modal logs hoops-hype-studio-worker --follow`
2. Check Netlify function logs: `netlify logs:function`
3. Check browser console for frontend errors
4. Verify all environment variables are set correctly in Netlify dashboard

## Quick Checklist

- [ ] Modal CLI installed
- [ ] Authenticated with Modal (`modal token new`)
- [ ] Upstash credentials obtained
- [ ] Modal secret created with all keys
- [ ] `.env` file updated with credentials
- [ ] Modal worker deployed (`modal deploy workers/modal/modal_app.py`)
- [ ] Netlify environment variables set
- [ ] Netlify redeployed
- [ ] Tested video upload and AI analysis

## Next Steps

Once setup is complete:

1. **Test the full pipeline** - Drop a video and verify highlights are detected
2. **Monitor logs** - Watch Modal and Netlify logs during testing
3. **Adjust scoring** - Fine-tune the AI scoring algorithm in `workers/modal/modal_app.py:369-429`
4. **Train ML model** - Replace the placeholder action classifier with a real YOLOv8 model
