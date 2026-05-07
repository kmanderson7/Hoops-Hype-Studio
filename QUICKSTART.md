# Quick Start: Fix AI Analysis

## The Problem

Your AI analysis isn't working because 3 environment variables are missing or misconfigured:
- `GPU_WORKER_TOKEN` (empty)
- `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY` (placeholder values)

## The Solution (2 Minutes)

### Option 1: Automated Setup (Recommended)

Run this script and follow the prompts:

```bash
setup-ai-analysis.bat
```

The script will:
1. Install Modal CLI
2. Ask for your Upstash credentials
3. Configure everything automatically
4. Deploy the GPU worker
5. Sync to Netlify

### Option 2: Manual Setup

See [AI-ANALYSIS-SETUP.md](./AI-ANALYSIS-SETUP.md) for detailed manual instructions.

## What You Need

Before running the setup, get your Upstash credentials:

1. Go to https://console.upstash.com
2. Navigate to your storage bucket (or create one)
3. Copy these values:
   - Bucket Name
   - Access Key ID
   - Secret Access Key
   - Endpoint URL

## After Setup

### Test the Configuration

```bash
node test-ai-analysis.js
```

### Test in the App

1. Open your app
2. Drop a video file
3. Watch for AI-detected highlights

### Monitor Logs

If issues occur:

```bash
# Modal GPU worker logs
modal logs hoops-hype-studio-worker --follow

# Netlify function logs
netlify logs:function

# Browser console (F12)
```

## Common Issues

### "Modal CLI not found"

Install it:
```bash
pip install modal
modal token new
```

### "Invalid token" (403 error)

The token in `.env` doesn't match the Modal secret. Re-run `setup-ai-analysis.bat`.

### "S3 upload failed"

Check your Upstash credentials are correct in the Upstash console.

### Highlights return fake data

The GPU worker is returning fallback data due to an error. Check Modal logs:
```bash
modal logs hoops-hype-studio-worker --follow
```

Then drop a video and watch the logs.

## Architecture Overview

```
Browser → Netlify Functions → Modal GPU Worker
   ↓                              ↓
Upstash S3 ←──────────────────────┘
```

**Components:**
- **Modal GPU Worker**: Runs AI analysis (scene detection, action classification, scoring)
- **Netlify Functions**: API gateway between frontend and GPU worker
- **Upstash S3**: Video storage
- **Upstash Redis**: Job tracking

## Files Created

- `setup-ai-analysis.bat` - Automated setup script (Windows)
- `setup-ai-analysis.sh` - Automated setup script (Mac/Linux)
- `AI-ANALYSIS-SETUP.md` - Detailed setup guide
- `test-ai-analysis.js` - Test script
- `QUICKSTART.md` - This file

## Next Steps

Once AI analysis is working:

1. **Fine-tune scoring** - Adjust weights in `workers/modal/modal_app.py:369-429`
2. **Train ML model** - Replace placeholder action classifier with YOLOv8
3. **Add more actions** - Extend detection to more basketball actions
4. **Improve transitions** - Customize video rendering effects

## Support

- **Documentation**: [AI-ANALYSIS-SETUP.md](./AI-ANALYSIS-SETUP.md)
- **Test script**: `node test-ai-analysis.js`
- **Modal docs**: https://modal.com/docs
- **Netlify docs**: https://docs.netlify.com
