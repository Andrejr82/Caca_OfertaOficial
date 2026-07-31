"""Pure policies for authorized imported-video processing."""

from __future__ import annotations

import hashlib
from pathlib import Path


MAX_SOURCE_BYTES = 100 * 1024 * 1024
MAX_DURATION_SECONDS = 900


def validate_channel_duration(duration: float, channels: list[str]) -> str | None:
    if "instagram" in channels and duration < 3:
        return "INSTAGRAM_REEL_DURATION_INVALID"
    if "facebook" in channels and (duration < 4 or duration > 60):
        return "FACEBOOK_REEL_DURATION_INVALID"
    return None


def validate_probe_metadata(probe: dict) -> dict:
    streams = probe.get("streams") if isinstance(probe.get("streams"), list) else []
    video = next((stream for stream in streams if stream.get("codec_type") == "video"), None)
    audio = next((stream for stream in streams if stream.get("codec_type") == "audio"), None)
    errors: list[str] = []
    duration = float(probe.get("duration") or 0)
    size = int(probe.get("size") or 0)
    if not str(probe.get("format_name") or "").lower().split(",")[0] in {"mov", "mp4"}:
        errors.append("INVALID_MEDIA")
    if not video or int(video.get("width") or 0) < 1 or int(video.get("height") or 0) < 1:
        errors.append("INVALID_VIDEO_STREAM")
    if duration <= 0 or duration > MAX_DURATION_SECONDS:
        errors.append("INVALID_DURATION")
    if size > MAX_SOURCE_BYTES:
        errors.append("SOURCE_TOO_LARGE")
    return {
        "valid": not errors,
        "errors": errors,
        "duration": duration,
        "size": size,
        "width": int(video.get("width") or 0) if video else 0,
        "height": int(video.get("height") or 0) if video else 0,
        "videoCodec": video.get("codec_name") if video else None,
        "audioCodec": audio.get("codec_name") if audio else None,
        "hasAudio": audio is not None,
    }


def build_ffmpeg_command(source: Path, destination: Path, width: int, height: int, fps: int) -> list[str]:
    target_width, target_height = (1080, 1920)
    filter_graph = (
        f"scale={target_width}:{target_height}:force_original_aspect_ratio=decrease,"
        f"pad={target_width}:{target_height}:(ow-iw)/2:(oh-ih)/2,"
        "format=yuv420p"
    )
    return [
        "ffmpeg", "-y", "-i", str(source),
        "-vf", filter_graph,
        "-r", str(fps if fps in {25, 30} else 30),
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart", str(destination),
    ]


def build_storage_paths(user_id: str, offer_id: str, job_id: str) -> dict[str, str]:
    prefix = f"videos/{user_id}/{offer_id}/{job_id}"
    return {
        "source": f"{prefix}/source.mp4",
        "processed": f"{prefix}/processed.mp4",
        "instagram": f"{prefix}/instagram.mp4",
        "facebook": f"{prefix}/facebook.mp4",
        "instagram_cover": f"{prefix}/instagram-cover.jpg",
        "facebook_cover": f"{prefix}/facebook-cover.jpg",
        "thumbnail": f"{prefix}/thumbnail.jpg",
        "reference_frame": f"{prefix}/reference-frame.jpg",
    }


def fingerprint_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()
