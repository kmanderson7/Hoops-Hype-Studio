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
import subprocess
import tempfile
import pathlib
import urllib.request


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
    bucket = os.environ.get("STORAGE_BUCKET", "")
    region = os.environ.get("STORAGE_REGION", "us-east-1")
    access = os.environ.get("STORAGE_ACCESS_KEY", "")
    secret = os.environ.get("STORAGE_SECRET_KEY", "")
    endpoint = os.environ.get("STORAGE_ENDPOINT")

    session = boto3.session.Session()
    s3 = session.client(
        "s3",
        region_name=region,
        aws_access_key_id=access,
        aws_secret_access_key=secret,
        endpoint_url=endpoint,
        config=BotoConfig(s3={"addressing_style": "path"}),
    )

    with tempfile.TemporaryDirectory() as td:
        tmpdir = pathlib.Path(td)
        src_path = tmpdir / "source.mp4"
        proxy_path = tmpdir / "proxy.mp4"
        # Download source
        urllib.request.urlretrieve(req.sourceUrl, src_path)
        # Transcode to 720p60 proxy
        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            str(src_path),
            "-vf",
            "scale=-2:720,fps=60",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-b:v",
            "6000k",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            str(proxy_path),
        ]
        subprocess.run(cmd, check=True)

        key = f"proxy/{req.assetId}.mp4"
        s3.upload_file(str(proxy_path), bucket, key, ExtraArgs={"ContentType": "video/mp4"})
        proxy_url = s3.generate_presigned_url(
            ClientMethod="get_object",
            Params={"Bucket": bucket, "Key": key},
            ExpiresIn=3600,
        )
    return IngestResponse(proxyUrl=proxy_url, waveformUrl=None)


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
    # Minimal ffmpeg render: scale/reframe to preset and upload; mix music if provided
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
    if not s3:
        return RenderResponse(outputs=outputs)

    # Resolve source: use proxy in proxy/{assetId}.mp4
    src_key = f"proxy/{req.assetId}.mp4"
    src_url = s3.generate_presigned_url(
        ClientMethod="get_object",
        Params={"Bucket": bucket, "Key": src_key},
        ExpiresIn=3600,
    )

    with tempfile.TemporaryDirectory() as td:
        tmpdir = pathlib.Path(td)
        src_path = tmpdir / "src.mp4"
        urllib.request.urlretrieve(src_url, src_path)

        for p in req.presets:
            out_path = tmpdir / f"out-{p.presetId}.mp4"
            if p.presetId == "vertical-916":
                vf = "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2"
            elif p.presetId == "highlight-45":
                vf = "scale=1080:1350:force_original_aspect_ratio=decrease,pad=1080:1350:(ow-iw)/2:(oh-ih)/2"
            else:
                vf = "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2"

            cmd = [
                "ffmpeg",
                "-y",
                "-i",
                str(src_path),
            ]
            if req.trackUrl:
                # Mix external audio track (simple concat mix)
                music_path = tmpdir / "music.mp3"
                try:
                    urllib.request.urlretrieve(req.trackUrl, music_path)
                    cmd += ["-i", str(music_path), "-filter_complex", f"[0:a]volume=0.8[a0];[1:a]volume=0.5[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=2[a]", "-map", "0:v", "-map", "[a]"]
                except Exception:
                    # fallback to original audio only
                    pass
            cmd += [
                "-vf",
                vf,
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-b:v",
                "6000k",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-b:a",
                "320k",
                "-movflags",
                "+faststart",
                str(out_path),
            ]
            subprocess.run(cmd, check=True)
            key = f"exports/{req.assetId}-{p.presetId}.mp4"
            s3.upload_file(str(out_path), bucket, key, ExtraArgs={"ContentType": "video/mp4"})
            url = s3.generate_presigned_url("get_object", Params={"Bucket": bucket, "Key": key}, ExpiresIn=3600)
            outputs.append(RenderOutput(presetId=p.presetId, url=url))

    return RenderResponse(outputs=outputs)


@app.asgi_app()
def fastapi_app():
    return web

