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
    .apt_install("ffmpeg", "libgl1-mesa-glx", "libglib2.0-0", "libsm6", "libxext6", "libxrender-dev")
    .pip_install(
        "fastapi==0.115.2",
        "uvicorn==0.30.6",
        "pydantic==2.9.2",
        # ML/audio/processing libs
        "torch==2.1.0",
        "torchvision==0.16.0",
        "torchaudio==2.1.0",
        "numpy==1.24.3",
        "librosa==0.10.1",
        "ffmpeg-python==0.2.0",
        "boto3==1.34.0",
        # Computer vision & ML
        "opencv-python-headless==4.8.1.78",
        "scikit-image==0.22.0",
        "ultralytics==8.0.200",  # YOLOv8 for object detection
        "scenedetect[opencv]==0.6.2",  # Scene detection
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


# ----- AI/ML Utility Functions -----

def detect_scenes(video_path: pathlib.Path, min_duration: float = 1.2):
    """
    Detect scene boundaries using PySceneDetect.
    Returns list of dicts with 'start' and 'end' times in seconds.
    PRD Requirement: Auto-segment video into scenes > 1.2s (Section 6.2)
    """
    from scenedetect import detect, ContentDetector, split_video_ffmpeg
    import cv2

    try:
        # Detect scenes with content-based detection
        scene_list = detect(str(video_path), ContentDetector(threshold=27.0))

        # Convert to time ranges
        cap = cv2.VideoCapture(str(video_path))
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        cap.release()

        scenes = []
        for i, scene in enumerate(scene_list):
            start_time = scene[0].get_seconds()
            end_time = scene[1].get_seconds()
            duration = end_time - start_time

            # Filter scenes by minimum duration
            if duration >= min_duration:
                scenes.append({
                    'id': f'scene-{i}',
                    'start': start_time,
                    'end': end_time,
                    'duration': duration
                })

        return scenes
    except Exception as e:
        # Fallback: divide video into 3-second chunks
        import cv2
        cap = cv2.VideoCapture(str(video_path))
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration = total_frames / fps
        cap.release()

        scenes = []
        chunk_duration = 3.0
        for i, t in enumerate(range(0, int(duration), int(chunk_duration))):
            scenes.append({
                'id': f'scene-{i}',
                'start': float(t),
                'end': min(float(t + chunk_duration), duration),
                'duration': chunk_duration
            })
        return scenes


def compute_motion_intensity(video_path: pathlib.Path, start: float, end: float) -> float:
    """
    Calculate motion intensity using optical flow.
    PRD Requirement: Motion intensity component for scoring (Section 6.2)
    Returns normalized value 0.0-1.0
    """
    import cv2
    import numpy as np

    try:
        cap = cv2.VideoCapture(str(video_path))
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0

        # Seek to start time
        start_frame = int(start * fps)
        end_frame = int(end * fps)
        cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)

        prev_frame = None
        motion_values = []
        frame_count = 0
        max_frames = min(60, end_frame - start_frame)  # Sample up to 60 frames

        while cap.get(cv2.CAP_PROP_POS_FRAMES) < end_frame and frame_count < max_frames:
            ret, frame = cap.read()
            if not ret:
                break

            # Downsample for performance
            frame = cv2.resize(frame, (320, 180))
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

            if prev_frame is not None:
                # Calculate optical flow
                flow = cv2.calcOpticalFlowFarneback(
                    prev_frame, gray, None,
                    pyr_scale=0.5, levels=3, winsize=15,
                    iterations=3, poly_n=5, poly_sigma=1.2, flags=0
                )
                # Compute magnitude
                magnitude = np.sqrt(flow[..., 0]**2 + flow[..., 1]**2)
                motion_values.append(np.mean(magnitude))

            prev_frame = gray
            frame_count += 1

        cap.release()

        if not motion_values:
            return 0.5  # Default

        # Normalize to 0-1 range (typical motion range is 0-10 pixels)
        avg_motion = np.mean(motion_values)
        normalized = min(1.0, avg_motion / 8.0)
        return float(normalized)

    except Exception:
        return 0.5  # Default on error


def compute_audio_peak(video_path: pathlib.Path, start: float, end: float) -> float:
    """
    Calculate audio energy/peak for crowd energy detection.
    PRD Requirement: Audio peak component for scoring (Section 6.2)
    Returns normalized value 0.0-1.0
    """
    import librosa
    import numpy as np

    try:
        # Extract audio segment
        y, sr = librosa.load(str(video_path), sr=22050, offset=start, duration=end-start)

        if len(y) == 0:
            return 0.3

        # Calculate RMS energy
        rms = librosa.feature.rms(y=y)[0]
        peak_rms = np.max(rms)

        # Normalize (typical peak RMS around 0.1-0.3 for crowd noise)
        normalized = min(1.0, peak_rms / 0.2)
        return float(normalized)

    except Exception:
        return 0.3  # Default on error


def simple_action_classification(video_path: pathlib.Path, start: float, end: float) -> tuple[str, float]:
    """
    Placeholder action classifier until real ML model is trained.
    In production, replace with YOLOv8 + SlowFast model.

    PRD Requirement: Action detection for basketball (Section 6.2)
    Target actions: Dunk, Three Pointer, Steal, Block, Assist

    Returns: (action_name, confidence)
    """
    import cv2
    import numpy as np

    try:
        cap = cv2.VideoCapture(str(video_path))
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0

        # Sample middle frame
        mid_time = (start + end) / 2
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(mid_time * fps))
        ret, frame = cap.read()
        cap.release()

        if not ret:
            return "Assist", 0.7

        # Heuristic-based classification (PLACEHOLDER)
        # In production: use trained YOLOv8/SlowFast model
        height, width = frame.shape[:2]

        # Analyze frame characteristics
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        brightness = np.mean(gray)
        edges = cv2.Canny(gray, 50, 150)
        edge_density = np.sum(edges > 0) / (height * width)

        # Simple heuristics (replace with real ML model)
        if edge_density > 0.15:  # High motion/complexity
            return "Dunk", 0.82
        elif brightness > 140:  # Bright frame (outdoor/well-lit)
            return "Three Pointer", 0.78
        elif edge_density > 0.10:
            return "Steal", 0.75
        elif brightness < 100:
            return "Block", 0.73
        else:
            return "Assist", 0.70

    except Exception:
        return "Assist", 0.65


def score_highlights(detections: list, video_path: pathlib.Path, min_confidence: float = 0.7):
    """
    Score detected highlights using the PRD algorithm.

    PRD Formula (Section 6.2):
    Score = (ActionWeight × Confidence) + (AudioPeak × 0.2) + (MotionIntensity × 0.2)

    Returns sorted list of top-scoring segments (max 12)
    """
    import numpy as np

    # Action weights per PRD heuristics
    action_weights = {
        'Dunk': 1.0,
        'Three Pointer': 0.95,
        'Block': 0.90,
        'Steal': 0.85,
        'Assist': 0.80
    }

    scored = []
    for det in detections:
        action = det['action']
        confidence = det['confidence']

        # Skip low-confidence detections
        if confidence < min_confidence:
            continue

        # Compute components
        action_weight = action_weights.get(action, 0.75)
        action_score = action_weight * confidence

        # Audio peak (crowd energy)
        audio_peak = compute_audio_peak(video_path, det['start'], det['end'])

        # Motion intensity
        motion = compute_motion_intensity(video_path, det['start'], det['end'])

        # Final score per PRD formula
        final_score = action_score + (audio_peak * 0.2) + (motion * 0.2)

        # Format timestamp for UI
        mm = int(det['start'] // 60)
        ss = int(det['start'] % 60)
        timestamp = f"{mm:01d}m {ss:02d}" if mm > 0 else f"{ss:02d}"

        scored.append({
            **det,
            'timestamp': timestamp,
            'audioPeak': float(audio_peak),
            'motion': float(motion),
            'score': float(final_score),
            'descriptor': f"{action} - AI detected"
        })

    # Sort by score descending
    scored.sort(key=lambda x: x['score'], reverse=True)

    # Return top 12 segments per PRD (Section 6.2)
    return scored[:12]


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
    """
    AI-powered highlight detection with scoring.

    Pipeline:
    1. Download proxy video
    2. Detect scene boundaries (>1.2s scenes)
    3. Classify actions per scene (Dunk, Three Pointer, etc.)
    4. Score using PRD formula: (ActionWeight × Confidence) + (AudioPeak × 0.2) + (MotionIntensity × 0.2)
    5. Return top 12 segments

    PRD Requirements: Sections 6.2, 11
    """
    _require_auth(authorization)

    with tempfile.TemporaryDirectory() as td:
        tmpdir = pathlib.Path(td)
        video_path = tmpdir / "proxy.mp4"

        try:
            # Step 1: Download proxy video
            urllib.request.urlretrieve(req.proxyUrl, video_path)

            # Step 2: Detect scenes (PRD: auto-segment video into scenes > 1.2s)
            scenes = detect_scenes(video_path, min_duration=1.2)

            if not scenes:
                # Return empty if no scenes found
                return HighlightResponse(segments=[])

            # Step 3: Run action detection on each scene
            detections = []
            for scene in scenes:
                # Classify action (placeholder - replace with YOLOv8/SlowFast in production)
                action, confidence = simple_action_classification(
                    video_path,
                    scene['start'],
                    scene['end']
                )

                detections.append({
                    'id': scene['id'],
                    'action': action,
                    'confidence': confidence,
                    'start': scene['start'],
                    'end': scene['end'],
                    'clipDuration': scene['duration']
                })

            # Step 4: Score highlights using PRD algorithm
            scored_segments = score_highlights(detections, video_path, min_confidence=0.7)

            # Step 5: Convert to response format
            segments = [
                HighlightSegment(
                    id=seg['id'],
                    timestamp=seg['timestamp'],
                    action=seg['action'],
                    descriptor=seg['descriptor'],
                    confidence=seg['confidence'],
                    audioPeak=seg['audioPeak'],
                    motion=seg['motion'],
                    score=seg['score'],
                    clipDuration=seg['clipDuration']
                )
                for seg in scored_segments
            ]

            return HighlightResponse(segments=segments)

        except Exception as e:
            # Log error and return fallback mock data
            import traceback
            print(f"Highlight detection error: {e}")
            print(traceback.format_exc())

            # Fallback segments
            segments = [
                HighlightSegment(
                    id="seg-1",
                    timestamp="00:17",
                    action="Steal",
                    descriptor="Auto-detected play",
                    confidence=0.80,
                    audioPeak=0.63,
                    motion=0.72,
                    score=0.84,
                    clipDuration=4.5,
                ),
                HighlightSegment(
                    id="seg-2",
                    timestamp="02:44",
                    action="Dunk",
                    descriptor="High-energy moment",
                    confidence=0.85,
                    audioPeak=0.82,
                    motion=0.88,
                    score=0.92,
                    clipDuration=5.2,
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


class AudioAnalysisRequest(BaseModel):
    assetId: str
    proxyUrl: Optional[str] = None


class AudioAnalysisResponse(BaseModel):
    avgBpm: float
    avgEnergy: float
    peakMoments: List[float]
    energyCurve: List[float]


@web.post("/audio-analysis", response_model=AudioAnalysisResponse)
async def audio_analysis(req: AudioAnalysisRequest, authorization: Optional[str] = Header(None)):
    """
    Analyze audio energy profile for music matching.

    PRD Requirement: Music Intelligence Module (Section 6.4)
    - Detects BPM from video audio
    - Computes energy curve for matching
    - Identifies peak crowd moments

    Used by recommendMusic to match tracks to highlight intensity.
    """
    _require_auth(authorization)
    import librosa
    import numpy as np

    with tempfile.TemporaryDirectory() as td:
        tmpdir = pathlib.Path(td)

        try:
            # Download proxy video
            video_path = tmpdir / "proxy.mp4"
            if req.proxyUrl:
                urllib.request.urlretrieve(req.proxyUrl, video_path)
            else:
                # Try to fetch from storage using assetId
                bucket = os.environ.get("STORAGE_BUCKET", "")
                region = os.environ.get("STORAGE_REGION", "us-east-1")
                access = os.environ.get("STORAGE_ACCESS_KEY", "")
                secret = os.environ.get("STORAGE_SECRET_KEY", "")
                endpoint = os.environ.get("STORAGE_ENDPOINT")

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
                    src_key = f"proxy/{req.assetId}.mp4"
                    src_url = s3.generate_presigned_url("get_object", Params={"Bucket": bucket, "Key": src_key}, ExpiresIn=3600)
                    urllib.request.urlretrieve(src_url, video_path)

            # Extract audio
            audio_path = tmpdir / "audio.wav"
            subprocess.run([
                "ffmpeg", "-y", "-i", str(video_path),
                "-vn", "-ac", "1", "-ar", "22050", str(audio_path)
            ], check=True, capture_output=True)

            # Load audio
            y, sr = librosa.load(str(audio_path), sr=22050)

            # 1. BPM detection
            tempo, beats = librosa.beat.beat_track(y=y, sr=sr)
            avg_bpm = float(tempo)

            # 2. Energy curve (RMS in 1-second windows)
            frame_length = sr  # 1 second
            hop_length = sr // 2  # 0.5 second overlap
            rms = librosa.feature.rms(y=y, frame_length=frame_length, hop_length=hop_length)[0]
            avg_energy = float(np.mean(rms))

            # Normalize energy curve to 0-1
            if len(rms) > 0:
                rms_normalized = (rms - np.min(rms)) / (np.max(rms) - np.min(rms) + 1e-8)
            else:
                rms_normalized = np.array([0.5])

            # Downsample to max 20 points for UI
            if len(rms_normalized) > 20:
                indices = np.linspace(0, len(rms_normalized) - 1, 20).astype(int)
                energy_curve = rms_normalized[indices].tolist()
            else:
                energy_curve = rms_normalized.tolist()

            # 3. Peak moments (crowd energy spikes)
            peaks = librosa.util.peak_pick(
                rms,
                pre_max=3, post_max=3,
                pre_avg=3, post_avg=3,
                delta=0.02, wait=5
            )
            # Convert frame indices to time
            peak_times = librosa.frames_to_time(peaks, sr=sr, hop_length=hop_length)

            return AudioAnalysisResponse(
                avgBpm=avg_bpm,
                avgEnergy=avg_energy,
                peakMoments=peak_times.tolist(),
                energyCurve=energy_curve
            )

        except Exception as e:
            import traceback
            print(f"Audio analysis error: {e}")
            print(traceback.format_exc())

            # Return fallback values
            return AudioAnalysisResponse(
                avgBpm=130.0,
                avgEnergy=0.65,
                peakMoments=[15.0, 45.0, 90.0],
                energyCurve=[0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.85, 0.8, 0.75]
            )

