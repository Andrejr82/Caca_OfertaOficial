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
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path
from textwrap import wrap

from PIL import Image, ImageDraw, ImageEnhance, ImageFont


PANEL_URL = os.environ["VIDEO_PANEL_URL"].rstrip("/")
WORKER_TOKEN = os.environ["VIDEO_WORKER_TOKEN"]
AVATAR_PATH = Path(os.environ.get("VIDEO_AVATAR_PATH", "avatar.png"))
BASE_VIDEO_PATH = Path(os.environ.get("VIDEO_BASE_VIDEO_PATH", ""))
RENDER_ENGINE = os.environ.get("VIDEO_RENDER_ENGINE", "reference" if BASE_VIDEO_PATH else "avatar")
POLL_SECONDS = max(10, int(os.environ.get("VIDEO_POLL_SECONDS", "15")))
MAX_JOBS = min(3, max(1, int(os.environ.get("VIDEO_MAX_JOBS", "3"))))
VOICE = os.environ.get("VIDEO_TTS_VOICE", "pt-BR-AntonioNeural")
LIP_SYNC_ENGINE = os.environ.get("VIDEO_LIP_SYNC_ENGINE", "off").lower()
MUSETALK_DIR = Path(os.environ["VIDEO_MUSETALK_DIR"]) if os.environ.get("VIDEO_MUSETALK_DIR") else None
MUSETALK_CONFIG = Path(os.environ["VIDEO_MUSETALK_CONFIG"]) if os.environ.get("VIDEO_MUSETALK_CONFIG") else None
MUSETALK_UNET = Path(os.environ["VIDEO_MUSETALK_UNET"]) if os.environ.get("VIDEO_MUSETALK_UNET") else None
MUSETALK_UNET_CONFIG = Path(os.environ["VIDEO_MUSETALK_UNET_CONFIG"]) if os.environ.get("VIDEO_MUSETALK_UNET_CONFIG") else None
MUSETALK_VERSION = os.environ.get("VIDEO_MUSETALK_VERSION", "v15")
MUSETALK_PYTHON = Path(os.environ["VIDEO_MUSETALK_PYTHON"]) if os.environ.get("VIDEO_MUSETALK_PYTHON") else None
REFERENCE_CLEANUP = os.environ.get("VIDEO_REFERENCE_CLEANUP", "1") != "0"
REFERENCE_SOURCE = os.environ.get("VIDEO_REFERENCE_SOURCE", "video").lower()


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
    # Keep the same compact composition validated in the local reference test.
    # The card stays on the right side, preserving the avatar's face and scenery.
    card = Image.new("RGBA", (250, 370), (0, 0, 0, 0))
    draw = ImageDraw.Draw(card)
    draw.rounded_rectangle((2, 2, 248, 368), radius=20, fill=(35, 35, 40, 248), outline=(225, 225, 225, 235), width=2)
    draw.rounded_rectangle((20, 20, 230, 198), radius=12, fill=(245, 245, 245, 255))

    product = Image.open(product_path).convert("RGB")
    # Marketplace images can be very dark; lift them slightly without
    # changing the product colors or the white card background.
    product = ImageEnhance.Brightness(product).enhance(1.10)
    product = ImageEnhance.Contrast(product).enhance(1.05)
    product.thumbnail((190, 160), Image.Resampling.LANCZOS)
    card.paste(product, (30 + (190 - product.width) // 2, 28 + (160 - product.height) // 2))

    name = str(offer.get("product_name") or "Oferta especial")
    old_price = offer.get("old_price")
    price = offer.get("current_price")
    name_lines = wrap(name, width=23)[:3]
    y = 215
    for line in name_lines:
        draw.text((20, y), line, font=font(16, bold=True), fill="white")
        y += 18
    if old_price is not None:
        old_text = f"R$ {float(old_price):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
        draw.text((20, 250), old_text, font=font(14), fill=(210, 210, 210))
    if price is not None:
        price_text = f"R$ {float(price):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
        draw.text((20, 278), price_text, font=font(23, bold=True), fill=(255, 190, 0))
    draw.text((20, 330), "OFERTA VERIFICADA", font=font(13, bold=True), fill="white")
    card.save(destination, "PNG")


def make_caption(script: str, destination: Path) -> None:
    caption = Image.new("RGBA", (1000, 180), (4, 7, 12, 180))
    draw = ImageDraw.Draw(caption)
    draw.rounded_rectangle((2, 2, 998, 178), radius=18, outline=(255, 190, 0, 190), width=2)
    lines = wrap(script, width=64)[:3]
    y = 18
    for line in lines:
        draw.text((24, y), line, font=font(22, bold=True), fill="white")
        y += 42
    caption.save(destination, "PNG")


def make_reference_badges(destination: Path) -> None:
    """Replace baked reference lower-thirds with our own neutral badges."""
    badges = Image.new("RGBA", (720, 1280), (0, 0, 0, 0))
    draw = ImageDraw.Draw(badges)
    draw.rounded_rectangle((80, 975, 640, 1085), radius=22, fill=(245, 245, 245, 245), outline=(255, 190, 0, 240), width=3)
    draw.text((125, 1008), "OFERTA VERIFICADA HOJE", font=font(24, bold=True), fill=(20, 24, 30, 255))
    draw.rounded_rectangle((150, 1165, 600, 1235), radius=16, fill=(4, 7, 12, 210), outline=(255, 190, 0, 150), width=2)
    draw.text((205, 1188), "PREÇO SUJEITO A ALTERAÇÃO", font=font(15, bold=True), fill="white")
    badges.save(destination, "PNG")


def speak(script: str, destination: Path) -> None:
    if not shutil.which("edge-tts"):
        raise RuntimeError("edge-tts não está instalado. Execute: pip install edge-tts")
    subprocess.run(
        ["edge-tts", "--voice", VOICE, "--text", script, "--write-media", str(destination)],
        check=True,
        timeout=180,
    )


def reference_cleanup_filter() -> str:
    """Remove text baked into the supplied reference video.

    The old product card is intentionally not delogged: the generated card
    covers that region from its entrance onward, while delogo caused visible
    horizontal smearing on the Lightning FFmpeg build. Only the two baked
    lower-third text areas are cleaned here.
    """
    # Solid, subtle masks avoid delogo's horizontal smearing on moving bodies.
    cleanup = (
        "drawbox=x=80:y=975:w=560:h=110:color=black@0.78:t=fill,"
        "drawbox=x=150:y=1165:w=450:h=70:color=black@0.78:t=fill"
    )
    return f",{cleanup}" if REFERENCE_CLEANUP else ""


def make_avatar_motion_video(avatar: Path, audio: Path, output: Path) -> None:
    """Create a clean, gently moving presenter clip from the avatar PNG."""
    if not avatar.exists():
        raise RuntimeError(f"Avatar não encontrado: {avatar}")
    if not shutil.which("ffmpeg"):
        raise RuntimeError("ffmpeg não está instalado.")
    filters = (
        "[0:v]scale=720:1080:force_original_aspect_ratio=decrease,"
        "pad=720:1280:(ow-iw)/2:(oh-ih)/2:color=black,"
        "zoompan=z='min(zoom+0.00035,1.035)':"
        "x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
        "d=1:s=720x1280:fps=25,format=yuv420p[v]"
    )
    subprocess.run(
        [
            "ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-i", str(avatar),
            "-i", str(audio), "-filter_complex", filters, "-map", "[v]", "-map", "1:a:0",
            "-shortest", "-r", "25", "-c:v", "libx264", "-preset", "veryfast",
            "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
            str(output),
        ],
        check=True,
        timeout=900,
    )


def render_base_for_lipsync(base_video: Path, audio: Path, output: Path, cleanup: bool = True) -> None:
    if not shutil.which("ffmpeg"):
        raise RuntimeError("ffmpeg não está instalado.")
    cleanup_filter = reference_cleanup_filter() if cleanup else ""
    filters = f"[0:v]scale=720:1280{cleanup_filter}[v]"
    subprocess.run(
        [
            "ffmpeg", "-y", "-loglevel", "error",
            "-stream_loop", "-1", "-i", str(base_video), "-i", str(audio),
            "-filter_complex", filters, "-map", "[v]", "-map", "1:a:0",
            "-shortest", "-r", "25", "-c:v", "libx264", "-preset", "veryfast",
            "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
            str(output),
        ],
        check=True,
        timeout=900,
    )


def resolve_musetalk_python() -> Path:
    candidates = [
        MUSETALK_PYTHON,
        Path.home() / "miniforge3/envs/musetalk/bin/python",
        Path(shutil.which("python") or sys.executable),
    ]
    for candidate in candidates:
        if candidate and candidate.exists():
            return candidate
    raise RuntimeError("Interpretador Python do MuseTalk não foi encontrado.")


def validate_musetalk_runtime() -> Path:
    python = resolve_musetalk_python()
    probe = subprocess.run(
        [str(python), "-c", "import cv2, torch; assert torch.cuda.is_available(), 'CUDA indisponível'"],
        capture_output=True,
        text=True,
        timeout=60,
    )
    if probe.returncode != 0:
        detail = (probe.stderr or probe.stdout or "falha desconhecida").strip().splitlines()[-1]
        raise SystemExit(f"Preflight MuseTalk falhou com {python}: {detail}")
    return python


def run_musetalk(video: Path, audio: Path, output: Path, workdir: Path) -> None:
    required = {
        "VIDEO_MUSETALK_DIR": MUSETALK_DIR,
        "VIDEO_MUSETALK_CONFIG": MUSETALK_CONFIG,
        "VIDEO_MUSETALK_UNET": MUSETALK_UNET,
        "VIDEO_MUSETALK_UNET_CONFIG": MUSETALK_UNET_CONFIG,
    }
    missing = [name for name, path in required.items() if path is None or not path.exists()]
    if missing:
        raise RuntimeError(f"MuseTalk não configurado: {', '.join(missing)}")

    config = workdir / "musetalk.yaml"
    config.write_text(
        "task_0:\n"
        f"  video_path: {json.dumps(str(video))}\n"
        f"  audio_path: {json.dumps(str(audio))}\n"
        "  bbox_shift: 0\n",
        encoding="utf-8",
    )
    result_dir = workdir / "musetalk-results"
    result_dir.mkdir()
    command = [
        str(resolve_musetalk_python()), "-m", "scripts.inference",
        "--inference_config", str(config),
        "--result_dir", str(result_dir),
        "--unet_model_path", str(MUSETALK_UNET),
        "--unet_config", str(MUSETALK_UNET_CONFIG),
        "--version", MUSETALK_VERSION,
    ]
    subprocess.run(command, cwd=MUSETALK_DIR, check=True, timeout=1800)
    generated = sorted(result_dir.rglob("*.mp4"), key=lambda path: path.stat().st_mtime, reverse=True)
    if not generated:
        raise RuntimeError("MuseTalk terminou sem produzir um MP4.")
    shutil.copyfile(generated[0], output)


def overlay_card_on_video(source: Path, card: Path, badges: Path, audio: Path, output: Path) -> None:
    if not shutil.which("ffmpeg"):
        raise RuntimeError("ffmpeg não está instalado.")
    filters = (
        "[0:v]scale=720:1280[bg];"
        "[bg][1:v]overlay="
        "x='if(lt(t,1.0),720,if(lt(t,1.5),720-(t-1.0)*580,430))':"
        "y=390:enable='gte(t,1.0)'[scene];"
        "[2:v]format=rgba[badge];[scene][badge]overlay=0:0[v]"
    )
    subprocess.run(
        [
            "ffmpeg", "-y", "-loglevel", "error", "-i", str(source),
            "-loop", "1", "-i", str(card), "-loop", "1", "-i", str(badges), "-i", str(audio),
            "-filter_complex", filters, "-map", "[v]", "-map", "3:a:0",
            "-shortest", "-r", "25", "-c:v", "libx264", "-preset", "veryfast",
            "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
            str(output),
        ],
        check=True,
        timeout=900,
    )


def render(avatar: Path, card: Path, caption: Path, audio: Path, output: Path) -> None:
    if not shutil.which("ffmpeg"):
        raise RuntimeError("ffmpeg não está instalado.")
    filters = (
        "[0:v]scale=1280:1920,crop=1080:1920[bg];"
        "[1:v]format=rgba,scale=320:-1[card];[2:v]format=rgba,scale=900:-1[caption];"
        "[bg][card]overlay=x='if(lt(t,0.8),1080-340*t/0.8,740)':y=410:enable='gte(t,0.3)'[scene];"
        "[scene][caption]overlay=60:1710:enable='gte(t,0.5)'[v]"
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


def render_from_base_video(
    base_video: Path, card: Path, badges: Path, audio: Path, output: Path, cleanup: bool = True
) -> None:
    """Preserve proven avatar motion and replace the source audio."""
    if not shutil.which("ffmpeg"):
        raise RuntimeError("ffmpeg não está instalado.")
    if not base_video.exists():
        raise RuntimeError(f"Vídeo-base não encontrado: {base_video}")
    cleanup_filter = reference_cleanup_filter() if cleanup else ""
    filters = (
        f"[0:v]scale=720:1280{cleanup_filter}[bg];"
        "[bg][1:v]overlay="
        "x='if(lt(t,1.0),720,if(lt(t,1.5),720-(t-1.0)*580,430))':"
        "y=390:enable='gte(t,1.0)'[scene];"
        "[2:v]format=rgba[badge];[scene][badge]overlay=0:0[v]"
    )
    subprocess.run(
        [
            "ffmpeg", "-y", "-loglevel", "error",
            "-stream_loop", "-1", "-i", str(base_video),
            "-loop", "1", "-i", str(card), "-loop", "1", "-i", str(badges),
            "-i", str(audio), "-filter_complex", filters,
            "-map", "[v]", "-map", "3:a:0", "-shortest", "-r", "24",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
            "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", str(output),
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
        badges = root / "reference-badges.png"
        caption = root / "caption.png"
        audio = root / "audio.mp3"
        video = root / "video.mp4"
        product_url = offer.get("image_url")
        if not product_url:
            raise RuntimeError("A oferta não possui image_url.")
        download(product_url, product)
        make_card(offer, product, card)
        make_reference_badges(badges)
        speak(script, audio)
        if RENDER_ENGINE == "reference":
            use_avatar_source = REFERENCE_SOURCE == "avatar"
            source_video = BASE_VIDEO_PATH
            source_cleanup = REFERENCE_CLEANUP
            if use_avatar_source:
                source_video = root / "avatar-motion.mp4"
                make_avatar_motion_video(AVATAR_PATH, audio, source_video)
                source_cleanup = False
            if LIP_SYNC_ENGINE == "musetalk":
                base_for_lipsync = root / "base-for-lipsync.mp4"
                lipsynced = root / "lipsynced.mp4"
                render_base_for_lipsync(source_video, audio, base_for_lipsync, cleanup=source_cleanup)
                run_musetalk(base_for_lipsync, audio, lipsynced, root)
                overlay_card_on_video(lipsynced, card, badges, audio, video)
            else:
                render_from_base_video(source_video, card, badges, audio, video, cleanup=source_cleanup)
        else:
            make_caption(script, caption)
            download(os.environ["VIDEO_AVATAR_URL"], root / "avatar.png") if os.environ.get("VIDEO_AVATAR_URL") else None
            avatar = root / "avatar.png" if (root / "avatar.png").exists() else AVATAR_PATH
            if not avatar.exists():
                raise RuntimeError("Avatar não encontrado. Configure VIDEO_AVATAR_PATH ou VIDEO_AVATAR_URL.")
            render(avatar, card, caption, audio, video)
        video_url = signed_upload(job_id, "video", video)
        audio_url = signed_upload(job_id, "audio", audio)
        api("POST", f"/api/videos/worker/{job_id}/complete", {"videoUrl": video_url, "audioUrl": audio_url})
        print(f"Job {job_id} pronto: {video_url}", flush=True)


def main() -> None:
    if not PANEL_URL or not WORKER_TOKEN:
        raise SystemExit("Configure VIDEO_PANEL_URL e VIDEO_WORKER_TOKEN.")
    if LIP_SYNC_ENGINE not in {"off", "musetalk"}:
        raise SystemExit("VIDEO_LIP_SYNC_ENGINE deve ser 'off' ou 'musetalk'.")
    if LIP_SYNC_ENGINE == "musetalk" and any(
        path is None or not path.exists()
        for path in (MUSETALK_DIR, MUSETALK_CONFIG, MUSETALK_UNET, MUSETALK_UNET_CONFIG)
    ):
        raise SystemExit("MuseTalk requer VIDEO_MUSETALK_DIR, VIDEO_MUSETALK_CONFIG, VIDEO_MUSETALK_UNET e VIDEO_MUSETALK_UNET_CONFIG.")
    if LIP_SYNC_ENGINE == "musetalk":
        validate_musetalk_runtime()
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
