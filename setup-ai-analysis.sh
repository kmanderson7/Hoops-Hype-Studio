#!/bin/bash
# Setup script for Hoops Hype Studio AI Analysis
# This script helps configure Modal and Upstash for the video editing app

set -e

echo "================================================"
echo "Hoops Hype Studio - AI Analysis Setup"
echo "================================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Check/Install Modal CLI
echo "Step 1: Checking Modal CLI..."
if ! command -v modal &> /dev/null; then
    echo -e "${YELLOW}Modal CLI not found. Installing...${NC}"
    pip install modal
    echo -e "${GREEN}✓ Modal CLI installed${NC}"
else
    echo -e "${GREEN}✓ Modal CLI already installed${NC}"
fi

# Check if authenticated
if ! modal token get &> /dev/null; then
    echo -e "${YELLOW}Please authenticate with Modal:${NC}"
    modal token new
else
    echo -e "${GREEN}✓ Already authenticated with Modal${NC}"
fi

echo ""

# Step 2: Get Upstash credentials
echo "Step 2: Upstash Storage Credentials"
echo "Please provide your Upstash storage credentials"
echo "(You can find these in your Upstash console: https://console.upstash.com)"
echo ""

read -p "Upstash Bucket Name: " STORAGE_BUCKET
read -p "Upstash Access Key ID: " STORAGE_ACCESS_KEY
read -p "Upstash Secret Access Key: " STORAGE_SECRET_KEY
read -p "Upstash Endpoint URL (e.g., https://xxx.upstash.io): " STORAGE_ENDPOINT

# Default region
STORAGE_REGION="us-east-1"

echo ""
echo -e "${GREEN}✓ Storage credentials collected${NC}"
echo ""

# Step 3: Generate GPU Worker Token
echo "Step 3: Generating GPU Worker Token..."
GPU_WORKER_TOKEN=$(openssl rand -hex 32)
echo -e "${GREEN}✓ Generated secure token: ${GPU_WORKER_TOKEN:0:16}...${NC}"
echo ""

# Step 4: Create Modal Secret
echo "Step 4: Creating Modal secret 'hoops-hype-studio'..."

# Check if secret exists
if modal secret list | grep -q "hoops-hype-studio"; then
    echo -e "${YELLOW}Secret 'hoops-hype-studio' already exists. Deleting...${NC}"
    modal secret delete hoops-hype-studio -y || true
fi

# Create the secret
modal secret create hoops-hype-studio \
    GPU_WORKER_TOKEN="$GPU_WORKER_TOKEN" \
    STORAGE_BUCKET="$STORAGE_BUCKET" \
    STORAGE_ACCESS_KEY="$STORAGE_ACCESS_KEY" \
    STORAGE_SECRET_KEY="$STORAGE_SECRET_KEY" \
    STORAGE_REGION="$STORAGE_REGION" \
    STORAGE_ENDPOINT="$STORAGE_ENDPOINT"

echo -e "${GREEN}✓ Modal secret created successfully${NC}"
echo ""

# Step 5: Update .env file
echo "Step 5: Updating .env file..."
cat > .env << EOF
# Storage (Upstash)
STORAGE_BUCKET=$STORAGE_BUCKET
STORAGE_REGION=$STORAGE_REGION
STORAGE_ACCESS_KEY=$STORAGE_ACCESS_KEY
STORAGE_SECRET_KEY=$STORAGE_SECRET_KEY
STORAGE_ENDPOINT=$STORAGE_ENDPOINT

# GPU worker (Modal) bridge
GPU_WORKER_BASE_URL=https://hoops-hype-studio-worker--fastapi-app.modal.run
GPU_WORKER_TOKEN=$GPU_WORKER_TOKEN

# Music provider (Pixabay)
MUSIC_API_KEY=
MUSIC_API_BASE_URL=https://pixabay.com/api

# Redis (Upstash) for job/progress + rate limiting
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

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
EOF

echo -e "${GREEN}✓ .env file updated${NC}"
echo ""

# Step 6: Deploy Modal GPU Worker
echo "Step 6: Deploying Modal GPU worker..."
modal deploy workers/modal/modal_app.py

echo ""
echo -e "${GREEN}✓ Modal worker deployed successfully${NC}"
echo ""

# Step 7: Sync to Netlify
echo "Step 7: Syncing environment variables to Netlify..."

# Check if netlify CLI is available
if command -v netlify &> /dev/null; then
    # Import env vars to Netlify
    netlify env:set GPU_WORKER_TOKEN "$GPU_WORKER_TOKEN"
    netlify env:set STORAGE_BUCKET "$STORAGE_BUCKET"
    netlify env:set STORAGE_ACCESS_KEY "$STORAGE_ACCESS_KEY"
    netlify env:set STORAGE_SECRET_KEY "$STORAGE_SECRET_KEY"
    netlify env:set STORAGE_REGION "$STORAGE_REGION"
    netlify env:set STORAGE_ENDPOINT "$STORAGE_ENDPOINT"

    echo -e "${GREEN}✓ Environment variables synced to Netlify${NC}"
else
    echo -e "${YELLOW}⚠ Netlify CLI not found. Please set environment variables manually in Netlify dashboard:${NC}"
    echo "  - GPU_WORKER_TOKEN=$GPU_WORKER_TOKEN"
    echo "  - STORAGE_BUCKET=$STORAGE_BUCKET"
    echo "  - STORAGE_ACCESS_KEY=$STORAGE_ACCESS_KEY"
    echo "  - STORAGE_SECRET_KEY=$STORAGE_SECRET_KEY"
    echo "  - STORAGE_REGION=$STORAGE_REGION"
    echo "  - STORAGE_ENDPOINT=$STORAGE_ENDPOINT"
fi

echo ""
echo "================================================"
echo -e "${GREEN}Setup Complete!${NC}"
echo "================================================"
echo ""
echo "Next steps:"
echo "1. Test the AI analysis by dropping a video in your app"
echo "2. Check browser console for any errors"
echo "3. View Modal logs: modal logs hoops-hype-studio-worker"
echo "4. View Netlify function logs: netlify logs:function"
echo ""
echo "Credentials saved to .env file"
echo "GPU Worker Token: ${GPU_WORKER_TOKEN:0:16}..."
echo ""
