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
    posterUrl: Optional[str] = None


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


class TitleCard(BaseModel):
    text: str
    font: Optional[str] = None
    color: Optional[str] = "#FFFFFF"
    duration: float = 2.0


class LowerThird(BaseModel):
    name: str
    team: str
    number: str
    position: str
    color: Optional[str] = "#5B6DFA"


class Scoreboard(BaseModel):
    enabled: bool = False
    style: str = "burst"
    color: Optional[str] = "#FFD166"


class LogoOverlay(BaseModel):
    url: str
    x: float = 0.92
    y: float = 0.08
    scale: float = 0.5


class OverlayMetadata(BaseModel):
    titleCard: Optional[TitleCard] = None
    lowerThird: Optional[LowerThird] = None
    scoreboard: Optional[Scoreboard] = None
    logo: Optional[LogoOverlay] = None
    # Optional safe zones as normalized rectangle strings per aspect key
    # e.g., { "16x9": "0.08,0.08,0.92,0.92" }
    safeZones: Optional[dict] = None
    showSafeZones: Optional[bool] = False


class RenderRequest(BaseModel):
    assetId: str
    trackUrl: str
    presets: List[RenderPreset]
    metadata: Optional[dict] = None  # overlays/branding/title, etc.


class BeatsRequest(BaseModel):
    trackUrl: str


class BeatsResponse(BaseModel):
    bpm: float
    beatGrid: List[float]


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

        # Optional waveform JSON via librosa
        waveform_url = None
        try:
            import librosa  # type: ignore
            import json as _json
            wav_path = tmpdir / "audio.wav"
            subprocess.run(["ffmpeg", "-y", "-i", str(src_path), "-vn", "-ac", "1", "-ar", "22050", str(wav_path)], check=True)
            y, sr = librosa.load(str(wav_path), sr=None)
            # downsample envelope into 128 bins
            bins = 128
            step = max(1, len(y) // bins)
            env = [float(max(0.0, min(1.0, (abs(y[i:i+step]).mean() * 4)))) for i in range(0, len(y), step)][:bins]
            wf_path = tmpdir / "waveform.json"
            with open(wf_path, 'w', encoding='utf-8') as f:
                f.write(_json.dumps({"sampleRate": sr, "bins": env }))
            wkey = f"waveforms/{req.assetId}.json"
            s3.upload_file(str(wf_path), bucket, wkey, ExtraArgs={"ContentType": "application/json"})
            waveform_url = s3.generate_presigned_url("get_object", Params={"Bucket": bucket, "Key": wkey}, ExpiresIn=3600)
        except Exception:
            waveform_url = None

        # Optional poster at 1s
        poster_path = tmpdir / "poster.jpg"
        try:
            subprocess.run([
                "ffmpeg", "-y", "-ss", "1.0", "-i", str(src_path), "-frames:v", "1", "-q:v", "2", str(poster_path)
            ], check=True)
        except Exception:
            pass

        key = f"proxy/{req.assetId}.mp4"
        s3.upload_file(str(proxy_path), bucket, key, ExtraArgs={"ContentType": "video/mp4"})
        proxy_url = s3.generate_presigned_url(
            ClientMethod="get_object",
            Params={"Bucket": bucket, "Key": key},
            ExpiresIn=3600,
        )
        poster_url = None
        if poster_path.exists():
            pkey = f"thumbnails/{req.assetId}.jpg"
            s3.upload_file(str(poster_path), bucket, pkey, ExtraArgs={"ContentType": "image/jpeg"})
            poster_url = s3.generate_presigned_url("get_object", Params={"Bucket": bucket, "Key": pkey}, ExpiresIn=3600)

    return IngestResponse(proxyUrl=proxy_url, waveformUrl=waveform_url, posterUrl=poster_url)


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

        # Optional beat-aligned cut assembly with transitions and speed ramps
        input_path = src_path
        try:
            meta = req.metadata or {}
            cuts = meta.get("segments") if isinstance(meta, dict) else None
            if isinstance(cuts, list) and len(cuts) > 0:
                seg_files: list[pathlib.Path] = []
                seg_durations: list[float] = []
                tdur = float(meta.get("transitionDuration", 0.18)) if isinstance(meta, dict) else 0.18
                ttype = meta.get("transitionType", "fade") if isinstance(meta, dict) else "fade"
                allowed = {"fade", "fadeblack", "wipeleft", "wiperight", "slideleft", "slideright"}
                if ttype not in allowed:
                    # treat 'flash' as fadeblack for a punchier cut
                    if ttype == "flash":
                        ttype = "fadeblack"
                    else:
                        ttype = "fade"
                for i, seg in enumerate(cuts):
                    # Parse bounds
                    try:
                        start = float(seg.get("start", 0.0))
                        end = float(seg.get("end", 0.0))
                        impact = seg.get("impact")
                        impact_t = float(impact) if impact is not None else None
                    except Exception:
                        continue
                    if end <= start:
                        continue
                    d = max(0.1, end - start)
                    if d < 0.5:
                        continue
                    # Speed ramp window around impact (optional)
                    ramp_lo = None
                    ramp_hi = None
                    if impact_t is not None:
                        rel = max(0.0, min(d, impact_t - start))
                        ramp_lo = max(0.0, rel - 0.15)
                        ramp_hi = min(d, rel + 0.15)

                    out_seg = tmpdir / f"seg_{i:02d}.mp4"
                    if ramp_lo is not None and ramp_hi is not None and (ramp_hi - ramp_lo) >= 0.05:
                        # Apply slow-motion (0.75x) around impact for video; keep audio normal
                        fc = (
                            f"[0:v]trim=start={0}:end={d},setpts=PTS-STARTPTS[vfull];"
                            f"[vfull]split=3[v0][v1][v2];"
                            f"[v0]trim=0:{ramp_lo},setpts=PTS-STARTPTS[v0t];"
                            f"[v1]trim={ramp_lo}:{ramp_hi},setpts=(PTS-STARTPTS)/0.75[v1s];"
                            f"[v2]trim={ramp_hi}:{d},setpts=PTS-STARTPTS[v2t];"
                            f"[v0t][v1s][v2t]concat=n=3:v=1:a=0[vout]"
                        )
                        cmd_cut = [
                            "ffmpeg", "-y",
                            "-ss", str(max(0.0, start)),
                            "-to", str(max(0.1, end)),
                            "-i", str(src_path),
                            "-filter_complex", fc,
                            "-map", "[vout]",
                            "-map", "0:a?",
                            "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
                            "-c:a", "aac", "-b:a", "192k",
                            str(out_seg),
                        ]
                        subprocess.run(cmd_cut, check=True)
                        # Adjust duration for slow-motion section
                        d_adj = d + (ramp_hi - ramp_lo) * (1/0.75 - 1)
                        seg_durations.append(d_adj)
                    else:
                        cmd_cut = [
                            "ffmpeg", "-y",
                            "-ss", str(max(0.0, start)),
                            "-to", str(max(0.1, end)),
                            "-i", str(src_path),
                            "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
                            "-c:a", "aac", "-b:a", "192k",
                            str(out_seg),
                        ]
                        subprocess.run(cmd_cut, check=True)
                        seg_durations.append(d)
                    seg_files.append(out_seg)

                if len(seg_files) == 1:
                    input_path = seg_files[0]
                elif len(seg_files) > 1:
                    # Build xfade/acrossfade chain
                    out_xf = tmpdir / "edits_xfade.mp4"
                    cmd_xf: list[str] = ["ffmpeg", "-y"]
                    for p in seg_files:
                        cmd_xf += ["-i", str(p)]
                    fc_parts: list[str] = []
                    cur_v = f"[0:v]"
                    cur_a = f"[0:a]"
                    cur_len = seg_durations[0]
                    for idx in range(1, len(seg_files)):
                        off = max(0.0, cur_len - tdur)
                        vout = f"[v{idx:02d}]"
                        aout = f"[a{idx:02d}]"
                        fc_parts.append(f"{cur_v}[{idx}:v]xfade=transition={ttype}:duration={tdur}:offset={off}{vout}")
                        fc_parts.append(f"{cur_a}[{idx}:a]acrossfade=d={tdur}{aout}")
                        cur_v = vout
                        cur_a = aout
                        cur_len = cur_len + seg_durations[idx] - tdur
                    fc_graph = "; ".join(fc_parts)
                    cmd_xf += [
                        "-filter_complex", fc_graph,
                        "-map", cur_v,
                        "-map", cur_a,
                        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
                        "-c:a", "aac", "-b:a", "192k",
                        str(out_xf),
                    ]
                    subprocess.run(cmd_xf, check=True)
                    input_path = out_xf
        except Exception:
            input_path = src_path

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
                str(input_path),
            ]
            # Optional audio track mix and loudness normalization
            if req.trackUrl:
                # Mix external audio track (simple concat mix)
                music_path = tmpdir / "music.mp3"
                try:
                    urllib.request.urlretrieve(req.trackUrl, music_path)
                    # Apply EBU R128 loudness normalization to mixed audio
                    afilter = (
                        f"[0:a]volume=0.8[a0];[1:a]volume=0.5[a1];"
                        f"[a0][a1]amix=inputs=2:duration=first:dropout_transition=2,"
                        f"aloudnorm=I=-14:TP=-1.5:LRA=11:dual_mono=true[a]"
                    )
                    cmd += ["-i", str(music_path), "-filter_complex", afilter, "-map", "0:v", "-map", "[a]"]
                except Exception:
                    # fallback to original audio only
                    pass
            
            # Build filter chain: scale/pad, colorspace (BT.709), mild EQ, overlays
            vf_chain = [vf]
            # Use colorspace for portability (zscale alternative)
            vf_chain.append("colorspace=all=bt709:format=yuv420p")
            vf_chain.append("eq=contrast=1.05:saturation=1.08")
            meta = req.metadata or {}
            try:
                ov = OverlayMetadata(**(meta.get("overlay") or {}))
                # Title card text overlay for initial seconds
                if ov.titleCard and ov.titleCard.text:
                    tc = ov.titleCard
                    color = (tc.color or "#FFFFFF").replace("#", "0x")
                    draw = f"drawtext=fontsize=64:fontcolor={color}:x=(w-text_w)/2:y=(h-text_h)/3:text='{tc.text}':enable='lte(t,{tc.duration})'"
                    vf_chain.append(draw)
                # Lower third
                if ov.lowerThird:
                    lt = ov.lowerThird
                    txt = f"{lt.name}  {lt.team}  #{lt.number}  {lt.position}"
                    color = (lt.color or "#5B6DFA").replace("#", "0x")
                    box = f"drawbox=x=0:y=h-160:w=w:h=160:color={color}88:t=max"
                    text = f"drawtext=fontsize=40:fontcolor=white:x=40:y=h-120:text='{txt}'"
                    vf_chain.extend([box, text])
                # Logo image overlay
                if ov.logo and ov.logo.url:
                    logo_path = tmpdir / "logo.png"
                    try:
                        urllib.request.urlretrieve(ov.logo.url, logo_path)
                        # Scale logo based on scale factor and overlay at relative coords
                        logo_scale = max(0.1, min(2.0, ov.logo.scale or 0.5))
                        # Use overlay filter via -i additional input
                        cmd += ["-i", str(logo_path)]
                        # Map index: 0:v is video, 1:a may be music, hence logo is last index
                        overlay_idx = 2 if req.trackUrl else 1
                        # Convert relative x/y to pixels via expressions
                        xexp = f"(W-w)*{ov.logo.x or 0.9}"
                        yexp = f"(H-h)*{ov.logo.y or 0.1}"
                        vf_chain.append(f"[0:v][{overlay_idx}:v] overlay=x={xexp}:y={yexp}:format=auto")
                    except Exception:
                        pass
                # Safe zones rectangle overlay per preset if provided or toggled
                if ov.showSafeZones or (ov.safeZones and isinstance(ov.safeZones, dict)):
                    aspect_key = "16x9"
                    if p.presetId == "vertical-916":
                        aspect_key = "9x16"
                    elif p.presetId == "highlight-45":
                        aspect_key = "4x5"
                    rect = None
                    if ov.safeZones and aspect_key in ov.safeZones:
                        try:
                            parts = str(ov.safeZones[aspect_key]).split(",")
                            if len(parts) == 4:
                                x1, y1, x2, y2 = [float(v.strip()) for v in parts]
                                x = max(0.0, min(1.0, min(x1, x2)))
                                y = max(0.0, min(1.0, min(y1, y2)))
                                w = max(0.0, min(1.0, abs(x2 - x1)))
                                h = max(0.0, min(1.0, abs(y2 - y1)))
                                rect = (x, y, w, h)
                        except Exception:
                            rect = None
                    if rect is None:
                        # default 8% margin rectangle
                        rect = (0.08, 0.08, 0.84, 0.84)
                    rx, ry, rw, rh = rect
                    drawbox = f"drawbox=x=w*{rx}:y=h*{ry}:w=w*{rw}:h=h*{rh}:color=white@0.22:t=2"
                    vf_chain.append(drawbox)
            except Exception:
                pass

            cmd += [
                "-vf",
                ",".join(vf_chain),
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


@web.post("/beats", response_model=BeatsResponse)
async def beats(req: BeatsRequest, authorization: Optional[str] = Header(None)):
    _require_auth(authorization)
    # Lightweight beat detection via librosa
    import librosa  # type: ignore
    with tempfile.TemporaryDirectory() as td:
        tmpdir = pathlib.Path(td)
        audio_path = tmpdir / "track.mp3"
        urllib.request.urlretrieve(req.trackUrl, audio_path)
        y, sr = librosa.load(str(audio_path), sr=None)
        tempo, beats = librosa.beat.beat_track(y=y, sr=sr)
        times = librosa.frames_to_time(beats, sr=sr)
        return BeatsResponse(bpm=float(tempo), beatGrid=[float(t) for t in times])

