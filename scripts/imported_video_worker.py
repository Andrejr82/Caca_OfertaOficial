#!/usr/bin/env python3
"""Worker path for authorized imported Shopee videos."""

from __future__ import annotations

import ipaddress
import json
import os
import re
import shutil
import socket
import subprocess
import tempfile
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urljoin, urlparse

from imported_video_runtime import build_ffmpeg_command, build_storage_paths, fingerprint_bytes, validate_channel_duration, validate_probe_metadata


PANEL_URL = os.environ.get("VIDEO_PANEL_URL", "").rstrip("/")
WORKER_TOKEN = os.environ.get("VIDEO_WORKER_TOKEN", "")
WORKER_ID = os.environ.get("VIDEO_WORKER_ID", socket.gethostname())
MAX_REDIRECTS = 5
MAX_PAGE_BYTES = 2 * 1024 * 1024
MAX_SOURCE_BYTES = 100 * 1024 * 1024


class ImportedVideoError(RuntimeError):
    pass


def is_safe_network_address(value: str) -> bool:
    address = ipaddress.ip_address(value)
    return not (address.is_loopback or address.is_private or address.is_link_local or address.is_unspecified or address.is_multicast)


def assert_safe_url(url: str, *, allow_media: bool = False) -> None:
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.username or parsed.password or parsed.port not in (None, 443):
        raise ImportedVideoError("SOURCE_URL_NOT_ALLOWED")
    allowed = {"br.shp.ee", "s.shopee.com.br", "shopee.com.br", "sv.shopee.com.br"}
    media_allowed = re.fullmatch(r"[a-z0-9-]+\.vod\.susercontent\.com", parsed.hostname or "", re.I)
    if parsed.hostname not in allowed and not (allow_media and media_allowed):
        raise ImportedVideoError("SOURCE_HOST_NOT_ALLOWED")
    addresses = {item[4][0] for item in socket.getaddrinfo(parsed.hostname, 443, type=socket.SOCK_STREAM)}
    if not addresses or any(not is_safe_network_address(address) for address in addresses):
        raise ImportedVideoError("SSRF_BLOCKED")


def open_without_redirect(url: str):
    opener = urllib.request.build_opener(NoRedirectHandler())
    request = urllib.request.Request(url, headers={"User-Agent": "caca-oferta-authorized-video-import/1.0", "Accept": "text/html,video/mp4"})
    return opener.open(request, timeout=20)


class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def extract_media_url(html: str) -> str | None:
    for candidate in re.findall(r"https?://[^\"'<>\s]+\.(?:mp4|m3u8)(?:\?[^\"'<>\s]*)?", html, flags=re.I):
        parsed = urlparse(candidate)
        if parsed.scheme == "https" and re.fullmatch(r"[a-z0-9-]+\.vod\.susercontent\.com", parsed.hostname or "", re.I):
            return candidate
    return None


def resolve_source(source_url: str) -> tuple[str, str, int]:
    assert_safe_url(source_url)
    current = source_url
    for redirects in range(MAX_REDIRECTS + 1):
        try:
            response = open_without_redirect(current)
        except urllib.error.HTTPError as error:
            if error.code not in {301, 302, 303, 307, 308}:
                raise ImportedVideoError(f"SOURCE_HTTP_{error.code}") from error
            location = error.headers.get("Location")
            if not location:
                raise ImportedVideoError("REDIRECT_LOCATION_MISSING")
            current = urljoin(current, location)
            assert_safe_url(current, allow_media=False)
            continue
        content_type = (response.headers.get("Content-Type") or "").lower()
        if content_type.startswith("video/"):
            return current, current, redirects
        html = response.read(MAX_PAGE_BYTES + 1).decode("utf-8", errors="replace")
        if len(html.encode("utf-8")) > MAX_PAGE_BYTES:
            raise ImportedVideoError("SOURCE_PAGE_TOO_LARGE")
        media_url = extract_media_url(html)
        if not media_url:
            raise ImportedVideoError("MEDIA_URL_NOT_FOUND")
        assert_safe_url(media_url, allow_media=True)
        return current, media_url, redirects
    raise ImportedVideoError("REDIRECT_LIMIT")


def download(url: str, destination: Path) -> None:
    assert_safe_url(url, allow_media=True)
    response = open_without_redirect(url)
    content_length = int(response.headers.get("Content-Length") or 0)
    if content_length > MAX_SOURCE_BYTES:
        raise ImportedVideoError("SOURCE_TOO_LARGE")
    total = 0
    with destination.open("wb") as output:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_SOURCE_BYTES:
                raise ImportedVideoError("SOURCE_TOO_LARGE")
            output.write(chunk)


def ffprobe(path: Path) -> dict:
    result = subprocess.run(["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path)], capture_output=True, text=True, timeout=60, check=True)
    return json.loads(result.stdout)


def run_ffmpeg(command: list[str]) -> None:
    subprocess.run(command, capture_output=True, text=True, timeout=900, check=True)


def worker_headers(worker_id: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {WORKER_TOKEN}", "X-Video-Worker-Id": worker_id, "Content-Type": "application/json"}


def api(method: str, path: str, payload: dict, worker_id: str | None = None) -> dict:
    request = urllib.request.Request(f"{PANEL_URL}{path}", data=json.dumps(payload).encode(), headers=worker_headers(worker_id or WORKER_ID), method=method)
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.loads(response.read().decode())


def heartbeat(job_id: str, stage: str, worker_id: str) -> None:
    api("POST", f"/api/videos/worker/{job_id}/heartbeat", {"workerId": worker_id, "stage": stage}, worker_id)


def signed_upload(job: dict, kind: str, path: Path, content_type: str, worker_id: str) -> str:
    signed = api("POST", "/api/videos/worker/upload-url", {"jobId": job["id"], "kind": kind, "workerId": worker_id}, worker_id)
    request = urllib.request.Request(signed["signedUrl"], data=path.read_bytes(), headers={"Content-Type": content_type, "x-upsert": "true"}, method="PUT")
    with urllib.request.urlopen(request, timeout=180) as response:
        if response.status not in (200, 201):
            raise ImportedVideoError(f"STORAGE_UPLOAD_{kind}")
    return signed["publicUrl"]


def process_imported_video(job: dict, worker_id: str | None = None) -> None:
    active_worker_id = worker_id or WORKER_ID
    metadata = ((job.get("metadata") or {}).get("importedVideo") or {})
    source_url = metadata.get("sourceUrl")
    if not source_url:
        raise ImportedVideoError("SOURCE_URL_MISSING")
    with tempfile.TemporaryDirectory(prefix=f"caca-import-{job['id'][:8]}-") as folder:
        root = Path(folder)
        source = root / "source.mp4"
        processed = root / "processed.mp4"
        instagram = root / "instagram.mp4"
        facebook = root / "facebook.mp4"
        instagram_cover = root / "instagram-cover.jpg"
        facebook_cover = root / "facebook-cover.jpg"
        thumbnail = root / "thumbnail.jpg"
        reference = root / "reference-frame.jpg"
        heartbeat(job["id"], "resolving_source", active_worker_id)
        resolved_page, media_url, redirects = resolve_source(source_url)
        heartbeat(job["id"], "downloading", active_worker_id)
        download(media_url, source)
        original_fingerprint = fingerprint_bytes(source.read_bytes())
        heartbeat(job["id"], "validating", active_worker_id)
        probe = ffprobe(source)
        validation = validate_probe_metadata({**probe.get("format", {}), "streams": probe.get("streams", [])})
        if not validation["valid"]:
            raise ImportedVideoError(",".join(validation["errors"]))
        duration_error = validate_channel_duration(validation["duration"], list(metadata.get("channels") or ["instagram", "facebook"]))
        if duration_error:
            raise ImportedVideoError(duration_error)
        heartbeat(job["id"], "processing", active_worker_id)
        run_ffmpeg(build_ffmpeg_command(source, processed, validation["width"], validation["height"], 30))
        shutil.copy2(processed, instagram)
        shutil.copy2(processed, facebook)
        heartbeat(job["id"], "generating_assets", active_worker_id)
        for output, scale in ((instagram_cover, "1080:1920"), (facebook_cover, "1080:1920"), (thumbnail, "360:640"), (reference, "720:1280")):
            run_ffmpeg(["ffmpeg", "-y", "-loglevel", "error", "-ss", "1", "-i", str(processed), "-frames:v", "1", "-vf", f"scale={scale}:force_original_aspect_ratio=decrease,pad={scale}:(ow-iw)/2:(oh-ih)/2", str(output)])
        heartbeat(job["id"], "uploading_media", active_worker_id)
        urls = {
            "videoUrl": signed_upload(job, "processed", processed, "video/mp4", active_worker_id),
            "instagramUrl": signed_upload(job, "instagram", instagram, "video/mp4", active_worker_id),
            "facebookUrl": signed_upload(job, "facebook", facebook, "video/mp4", active_worker_id),
            "instagramCoverUrl": signed_upload(job, "instagram-cover", instagram_cover, "image/jpeg", active_worker_id),
            "facebookCoverUrl": signed_upload(job, "facebook-cover", facebook_cover, "image/jpeg", active_worker_id),
            "thumbnailUrl": signed_upload(job, "thumbnail", thumbnail, "image/jpeg", active_worker_id),
            "referenceFrameUrl": signed_upload(job, "reference-frame", reference, "image/jpeg", active_worker_id),
        }
        api("POST", f"/api/videos/worker/{job['id']}/complete", {**urls, "workerId": active_worker_id}, active_worker_id)
