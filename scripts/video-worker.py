#!/usr/bin/env python3
"""Low-cost video worker for the Caca Oferta manual approval queue.

The worker keeps secrets only in environment variables. It renders an MVP
vertical video with the supplied avatar, product card and Portuguese speech,
then uploads media directly to Supabase using a short-lived signed URL.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path
from textwrap import wrap

from PIL import Image, ImageDraw, ImageFont


PANEL_URL = os.environ["VIDEO_PANEL_URL"].rstrip("/")
WORKER_TOKEN = os.environ["VIDEO_WORKER_TOKEN"]
AVATAR_PATH = Path(os.environ.get("VIDEO_AVATAR_PATH", "avatar.png"))
POLL_SECONDS = max(10, int(os.environ.get("VIDEO_POLL_SECONDS", "15")))
MAX_JOBS = min(3, max(1, int(os.environ.get("VIDEO_MAX_JOBS", "3"))))
VOICE = os.environ.get("VIDEO_TTS_VOICE", "pt-BR-AntonioNeural")


def headers(content_type: str | None = None) -> dict[str, str]:
    result = {"Authorization": f"Bearer {WORKER_TOKEN}"}
    if content_type:
        result["Content-Type"] = content_type
    return result


def api(method: str, path: str, payload: dict | None = None) -> dict:
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(
        f"{PANEL_URL}{path}", data=body, headers=headers("application/json") if body else headers(), method=method
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"API {method} {path} retornou HTTP {error.code}: {detail[:500]}") from error


def download(url: str, destination: Path) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": "caca-oferta-video-worker/1.0"})
    with urllib.request.urlopen(request, timeout=90) as response:
        destination.write_bytes(response.read())


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


def make_card(offer: dict, product_path: Path, destination: Path) -> None:
    card = Image.new("RGBA", (440, 610), (10, 12, 18, 245))
    draw = ImageDraw.Draw(card)
    draw.rounded_rectangle((2, 2, 438, 608), radius=28, fill=(18, 22, 30, 248), outline=(255, 190, 0, 230), width=3)
    draw.rounded_rectangle((26, 26, 414, 320), radius=18, fill=(248, 248, 248, 255))

    product = Image.open(product_path).convert("RGB")
    product.thumbnail((340, 250), Image.Resampling.LANCZOS)
    card.paste(product, (220 - product.width // 2, 175 - product.height // 2))

    name = str(offer.get("product_name") or "Oferta especial")
    price = offer.get("current_price")
    name_lines = wrap(name, width=28)[:3]
    y = 350
    for line in name_lines:
        draw.text((28, y), line, font=font(24, bold=True), fill="white")
        y += 31
    if price is not None:
        price_text = f"R$ {float(price):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
        draw.text((28, 475), price_text, font=font(38, bold=True), fill=(255, 194, 0))
    draw.text((28, 555), "OFERTA VERIFICADA", font=font(17, bold=True), fill=(240, 240, 240))
    card.save(destination, "PNG")


def make_caption(script: str, destination: Path) -> None:
    caption = Image.new("RGBA", (1000, 300), (4, 7, 12, 220))
    draw = ImageDraw.Draw(caption)
    draw.rounded_rectangle((2, 2, 998, 298), radius=24, outline=(255, 190, 0, 220), width=3)
    lines = wrap(script, width=48)[:5]
    y = 28
    for line in lines:
        draw.text((28, y), line, font=font(27, bold=True), fill="white")
        y += 48
    caption.save(destination, "PNG")


def speak(script: str, destination: Path) -> None:
    if not shutil.which("edge-tts"):
        raise RuntimeError("edge-tts não está instalado. Execute: pip install edge-tts")
    subprocess.run(
        ["edge-tts", "--voice", VOICE, "--text", script, "--write-media", str(destination)],
        check=True,
        timeout=180,
    )


def render(avatar: Path, card: Path, caption: Path, audio: Path, output: Path) -> None:
    if not shutil.which("ffmpeg"):
        raise RuntimeError("ffmpeg não está instalado.")
    filters = (
        "[0:v]scale=1280:1920,crop=1080:1920[bg];"
        "[1:v]format=rgba[card];[2:v]format=rgba[caption];"
        "[bg][card]overlay=x='if(lt(t,0.8),1080-540*t/0.8,540)':y=430:enable='gte(t,0.3)'[scene];"
        "[scene][caption]overlay=40:1550:enable='gte(t,0.5)'[v]"
    )
    subprocess.run(
        [
            "ffmpeg", "-y", "-loglevel", "error",
            "-loop", "1", "-i", str(avatar),
            "-loop", "1", "-i", str(card),
            "-loop", "1", "-i", str(caption),
            "-i", str(audio),
            "-filter_complex", filters,
            "-map", "[v]", "-map", "3:a:0",
            "-shortest", "-r", "30", "-c:v", "libx264", "-preset", "veryfast",
            "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
            str(output),
        ],
        check=True,
        timeout=900,
    )


def signed_upload(job_id: str, kind: str, file_path: Path) -> str:
    signed = api("POST", "/api/videos/worker/upload-url", {"jobId": job_id, "kind": kind})
    request = urllib.request.Request(
        signed["signedUrl"],
        data=file_path.read_bytes(),
        headers={"Content-Type": "video/mp4" if kind == "video" else "audio/mpeg", "x-upsert": "true"},
        method="PUT",
    )
    with urllib.request.urlopen(request, timeout=180) as response:
        if response.status not in (200, 201):
            raise RuntimeError(f"Upload {kind} retornou HTTP {response.status}")
    return signed["publicUrl"]


def process(job: dict) -> None:
    job_id = job["id"]
    offer = job.get("offers") or {}
    script = job.get("script") or "Confira esta oferta especial agora!"
    with tempfile.TemporaryDirectory(prefix=f"caca-video-{job_id[:8]}-") as folder:
        root = Path(folder)
        product = root / "product.jpg"
        card = root / "card.png"
        caption = root / "caption.png"
        audio = root / "audio.mp3"
        video = root / "video.mp4"
        product_url = offer.get("image_url")
        if not product_url:
            raise RuntimeError("A oferta não possui image_url.")
        download(product_url, product)
        download(os.environ["VIDEO_AVATAR_URL"], root / "avatar.png") if os.environ.get("VIDEO_AVATAR_URL") else None
        avatar = root / "avatar.png" if (root / "avatar.png").exists() else AVATAR_PATH
        if not avatar.exists():
            raise RuntimeError("Avatar não encontrado. Configure VIDEO_AVATAR_PATH ou VIDEO_AVATAR_URL.")
        make_card(offer, product, card)
        make_caption(script, caption)
        speak(script, audio)
        render(avatar, card, caption, audio, video)
        video_url = signed_upload(job_id, "video", video)
        audio_url = signed_upload(job_id, "audio", audio)
        api("POST", f"/api/videos/worker/{job_id}/complete", {"videoUrl": video_url, "audioUrl": audio_url})
        print(f"Job {job_id} pronto: {video_url}", flush=True)


def main() -> None:
    if not PANEL_URL or not WORKER_TOKEN:
        raise SystemExit("Configure VIDEO_PANEL_URL e VIDEO_WORKER_TOKEN.")
    processed = 0
    print(f"Worker iniciado; limite desta execução: {MAX_JOBS} jobs.", flush=True)
    while processed < MAX_JOBS:
        payload = api("GET", "/api/videos/worker/next")
        job = payload.get("job")
        if not job:
            if processed:
                break
            print(f"Nenhum job. Nova consulta em {POLL_SECONDS}s.", flush=True)
            time.sleep(POLL_SECONDS)
            continue
        try:
            process(job)
        except Exception as error:  # keep the worker alive for the next job
            message = str(error)[:900]
            print(f"Job {job['id']} falhou: {message}", flush=True)
            try:
                api("POST", f"/api/videos/worker/{job['id']}/fail", {"error": message})
            except Exception as fail_error:
                print(f"Não foi possível marcar falha: {fail_error}", flush=True)
        processed += 1
    print("Worker finalizado com segurança.", flush=True)


if __name__ == "__main__":
    main()
