from __future__ import annotations

import tempfile
from pathlib import Path

from imported_video_runtime import build_ffmpeg_command, fingerprint_bytes, validate_channel_duration, validate_probe_metadata
from imported_video_worker import ImportedVideoError, api, download, ffprobe, heartbeat, resolve_source, run_ffmpeg, signed_upload


def process_imported_reel(job: dict, worker_id: str) -> None:
    metadata = ((job.get("metadata") or {}).get("importedReel") or {})
    source_url = metadata.get("sourceUrl")
    if not source_url:
        raise ImportedVideoError("SOURCE_URL_MISSING")
    with tempfile.TemporaryDirectory(prefix=f"caca-reel-{job['id'][:8]}-") as folder:
        root = Path(folder)
        source = root / "source.mp4"
        processed = root / "processed.mp4"
        heartbeat(job["id"], "resolving_source", worker_id)
        _, media_url, _ = resolve_source(source_url)
        heartbeat(job["id"], "downloading", worker_id)
        download(media_url, source)
        original_fingerprint = fingerprint_bytes(source.read_bytes())
        heartbeat(job["id"], "validating", worker_id)
        probe = ffprobe(source)
        validation = validate_probe_metadata({**probe.get("format", {}), "streams": probe.get("streams", [])})
        if not validation["valid"]:
            raise ImportedVideoError(",".join(validation["errors"]))
        duration_error = validate_channel_duration(validation["duration"], list(metadata.get("channels") or ["instagram", "facebook"]))
        if duration_error:
            raise ImportedVideoError(duration_error)
        heartbeat(job["id"], "processing", worker_id)
        run_ffmpeg(build_ffmpeg_command(source, processed, validation["width"], validation["height"], 30))
        processed_fingerprint = fingerprint_bytes(processed.read_bytes())
        heartbeat(job["id"], "uploading_media", worker_id)
        video_url = signed_upload(job, "processed", processed, "video/mp4", worker_id)
        api("POST", f"/api/videos/worker/{job['id']}/complete", {"videoUrl": video_url, "workerId": worker_id, "metadata": {"originalFingerprint": original_fingerprint, "processedFingerprint": processed_fingerprint}}, worker_id)
