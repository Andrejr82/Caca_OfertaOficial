#!/usr/bin/env python3
"""Verify one authorized Reel outside Vercel using ffprobe.

The worker uses the existing VIDEO_WORKER_TOKEN and never receives the
Supabase service-role key. It claims only jobs from template
`authorized-reel-v1`, downloads the stored MP4, verifies the real media
metadata, and reports the result back to the panel API.
"""

from __future__ import annotations

import json
import os
import socket
import subprocess
import tempfile
import urllib.error
import urllib.request
from pathlib import Path


PANEL_URL = os.environ["VIDEO_PANEL_URL"].rstrip("/")
WORKER_TOKEN = os.environ["VIDEO_WORKER_TOKEN"]
WORKER_ID = os.environ.get("AUTHORIZED_REEL_WORKER_ID", f"{socket.gethostname()}-authorized-reel")
MAX_BYTES = 100 * 1024 * 1024
MAX_DURATION_SECONDS = 600


def api(method: str, path: str, payload: dict | None = None) -> dict:
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {
        "Authorization": f"Bearer {WORKER_TOKEN}",
        "X-Video-Worker-Id": WORKER_ID,
    }
    if body is not None:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(f"{PANEL_URL}{path}", data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"API {method} {path} retornou HTTP {error.code}: {detail[:500]}") from error


def download(url: str, destination: Path) -> int:
    request = urllib.request.Request(url, headers={"User-Agent": "caca-oferta-authorized-reel-verifier/1.0"})
    total = 0
    with urllib.request.urlopen(request, timeout=120) as response, destination.open("wb") as output:
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_BYTES:
                raise RuntimeError("Arquivo ultrapassou 100 MB durante o download.")
            output.write(chunk)
    if total <= 0:
        raise RuntimeError("Arquivo baixado está vazio.")
    return total


def probe(path: Path) -> dict:
    process = subprocess.run(
        [
            "ffprobe",
            "-v", "error",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            str(path),
        ],
        capture_output=True,
        text=True,
        timeout=60,
    )
    if process.returncode != 0:
        detail = (process.stderr or process.stdout or "ffprobe falhou").strip()
        raise RuntimeError(detail[:500])
    try:
        return json.loads(process.stdout)
    except json.JSONDecodeError as error:
        raise RuntimeError("ffprobe retornou JSON inválido.") from error


def verified_payload(probe_data: dict) -> dict:
    format_data = probe_data.get("format") or {}
    streams = probe_data.get("streams") or []
    video_stream = next((stream for stream in streams if stream.get("codec_type") == "video"), None)
    if not video_stream:
        raise RuntimeError("Nenhum stream de vídeo encontrado.")

    format_name = str(format_data.get("format_name") or "")
    if "mp4" not in format_name.split(","):
        raise RuntimeError(f"Container não reconhecido como MP4: {format_name or 'desconhecido'}")

    width = int(video_stream.get("width") or 0)
    height = int(video_stream.get("height") or 0)
    duration = float(format_data.get("duration") or video_stream.get("duration") or 0)
    codec = str(video_stream.get("codec_name") or "")
    has_audio = any(stream.get("codec_type") == "audio" for stream in streams)

    if width <= 0 or height <= 0 or width > 10000 or height > 10000:
        raise RuntimeError("Dimensões reais do vídeo são inválidas.")
    if duration <= 0 or duration > MAX_DURATION_SECONDS:
        raise RuntimeError("Duração real do vídeo está fora do limite permitido.")
    if not codec:
        raise RuntimeError("Codec de vídeo não identificado.")

    return {
        "ok": True,
        "workerId": WORKER_ID,
        "width": width,
        "height": height,
        "durationSeconds": duration,
        "formatName": format_name,
        "videoCodec": codec,
        "hasAudio": has_audio,
    }


def main() -> int:
    claimed = api("GET", "/api/reels/worker/next")
    job = claimed.get("job")
    if not job:
        print("AUTHORIZED_REEL_VERIFIER: NO_JOB")
        return 0

    job_id = str(job["id"])
    video_url = str(job.get("video_url") or "")
    expected_size = int(((job.get("metadata") or {}).get("validation") or {}).get("sizeBytes") or 0)

    try:
        if not video_url.startswith("https://"):
            raise RuntimeError("URL do vídeo ausente ou insegura.")
        if expected_size <= 0 or expected_size > MAX_BYTES:
            raise RuntimeError("Tamanho esperado do Storage é inválido.")

        with tempfile.TemporaryDirectory(prefix="authorized-reel-") as temp_dir:
            local_path = Path(temp_dir) / "creative.mp4"
            actual_size = download(video_url, local_path)
            if actual_size != expected_size:
                raise RuntimeError("Tamanho baixado não corresponde ao objeto validado no Storage.")
            payload = verified_payload(probe(local_path))

        api("POST", f"/api/reels/worker/{job_id}/complete", payload)
        print(f"AUTHORIZED_REEL_VERIFIER: READY {job_id}")
        return 0
    except Exception as error:  # fail closed and persist a bounded operational error
        message = str(error).strip()[:500] or "Falha desconhecida na verificação do Reel."
        try:
            api("POST", f"/api/reels/worker/{job_id}/complete", {
                "ok": False,
                "workerId": WORKER_ID,
                "error": message,
            })
        finally:
            print(f"AUTHORIZED_REEL_VERIFIER: FAILED {job_id}: {message}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
