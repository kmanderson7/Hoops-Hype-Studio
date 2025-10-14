"""
Modal GPU Worker for Hoops Hype Studio

Exposes FastAPI web endpoints for:
- POST /ingest      → prepare proxy/waveform for preview
- POST /highlights  → run action detection and scoring
- POST /render      → assemble final video with ffmpeg

Security: Bearer token in Authorization header, validated against GPU_WORKER_TOKEN.

Note: This is a scaffold with stubbed responses and structure for later ML/ffmpeg logic.
"""

import os
from typing import List, Optional

import modal
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field
import boto3
from botocore.config import Config as BotoConfig


app = modal.App("hoops-hype-studio-worker")

# Base image with ffmpeg and Python libs commonly needed for ML/audio/video
image = (
    modal.Image.debian_slim()
    .apt_install("ffmpeg")
    .pip_install(
        "fastapi==0.115.2",
        "uvicorn==0.30.6",
        "pydantic==2.9.2",
        # ML/audio/processing libs — pin or adjust as needed
        "torch",
        "torchaudio",
        "numpy",
        "librosa",
        "ffmpeg-python",
        "boto3",
    )
)

# Expect a Modal secret named "hoops-hype-studio" with keys such as:
# - GPU_WORKER_TOKEN
# - STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY, STORAGE_REGION, STORAGE_BUCKET
secrets = [modal.Secret.from_name("hoops-hype-studio")]  # create via `modal secret create ...`


# ----- FastAPI models -----
class IngestRequest(BaseModel):
    assetId: str
    sourceUrl: str


class IngestResponse(BaseModel):
    proxyUrl: str
    waveformUrl: Optional[str] = None


class HighlightRequest(BaseModel):
    assetId: str
    proxyUrl: str


class HighlightSegment(BaseModel):
    id: str
    timestamp: str
    action: str
    descriptor: str
    confidence: float
    audioPeak: float
    motion: float
    score: float
    clipDuration: float


class HighlightResponse(BaseModel):
    segments: List[HighlightSegment]


class RenderPreset(BaseModel):
    presetId: str = Field(description="e.g., cinematic-169 | vertical-916 | highlight-45")


class RenderRequest(BaseModel):
    assetId: str
    trackUrl: str
    presets: List[RenderPreset]
    metadata: Optional[dict] = None  # overlays/branding/title, etc.


class RenderOutput(BaseModel):
    presetId: str
    url: str


class RenderResponse(BaseModel):
    outputs: List[RenderOutput]


def _require_auth(authorization: Optional[str]):
    token = os.environ.get("GPU_WORKER_TOKEN")
    if not token:
        raise HTTPException(status_code=500, detail="Worker token not configured")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    supplied = authorization.split(" ", 1)[1].strip()
    if supplied != token:
        raise HTTPException(status_code=403, detail="Invalid token")


web = FastAPI(title="Hoops Hype Studio — GPU Worker")


@web.post("/ingest", response_model=IngestResponse)
async def ingest(req: IngestRequest, authorization: Optional[str] = Header(None)):
    _require_auth(authorization)
    # TODO: download from storage, transcode to 720p proxy, compute waveform
    # For now, return stubbed URLs pointing to where your storage would place them
    return IngestResponse(
        proxyUrl=f"https://storage.example/proxy/{req.assetId}.mp4",
        waveformUrl=f"https://storage.example/waveform/{req.assetId}.json",
    )


@web.post("/highlights", response_model=HighlightResponse)
async def highlights(req: HighlightRequest, authorization: Optional[str] = Header(None)):
    _require_auth(authorization)
    # TODO: run ML action detection (e.g., YOLO/SlowFast), scoring, etc.
    segments = [
        HighlightSegment(
            id="seg-1",
            timestamp="00:17",
            action="Steal",
            descriptor="Full-court pick and go-ahead layup",
            confidence=0.88,
            audioPeak=0.63,
            motion=0.72,
            score=0.84,
            clipDuration=4.5,
        ),
        HighlightSegment(
            id="seg-2",
            timestamp="02:44",
            action="Dunk",
            descriptor="Baseline reverse dunk after spin move",
            confidence=0.97,
            audioPeak=0.92,
            motion=0.94,
            score=0.98,
            clipDuration=6.4,
        ),
    ]
    return HighlightResponse(segments=segments)


@web.post("/render", response_model=RenderResponse)
async def render(req: RenderRequest, authorization: Optional[str] = Header(None)):
    _require_auth(authorization)
    # TODO: orchestrate ffmpeg pipeline, overlays/branding, and upload outputs to storage
    # Placeholder: generate signed GET URLs for expected export keys
    bucket = os.environ.get("STORAGE_BUCKET", "")
    region = os.environ.get("STORAGE_REGION", "us-east-1")
    access = os.environ.get("STORAGE_ACCESS_KEY", "")
    secret = os.environ.get("STORAGE_SECRET_KEY", "")
    endpoint = os.environ.get("STORAGE_ENDPOINT")

    s3 = None
    if bucket and access and secret:
        session = boto3.session.Session()
        s3 = session.client(
            "s3",
            region_name=region,
            aws_access_key_id=access,
            aws_secret_access_key=secret,
            endpoint_url=endpoint,
            config=BotoConfig(s3={"addressing_style": "path"}),
        )

    outputs: list[RenderOutput] = []
    for p in req.presets:
        key = f"exports/{req.assetId}-{p.presetId}.mp4"
        if s3:
            try:
                url = s3.generate_presigned_url(
                    ClientMethod="get_object",
                    Params={"Bucket": bucket, "Key": key},
                    ExpiresIn=3600,
                )
            except Exception:
                url = f"https://example.com/{key}"
        else:
            url = f"https://example.com/{key}"
        outputs.append(RenderOutput(presetId=p.presetId, url=url))

    return RenderResponse(outputs=outputs)


@app.asgi_app()
def fastapi_app():
    return web

