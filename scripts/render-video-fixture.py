#!/usr/bin/env python3
"""Render a synthetic CPU-only video fixture without API, Storage or GPU."""

from __future__ import annotations

import argparse
import shutil
import subprocess
import tempfile
from pathlib import Path

from video_pipeline.quality_gate import inspect_video


def render_fixture(output: Path) -> Path:
    if not shutil.which("ffmpeg"):
        raise RuntimeError("ffmpeg é necessário para o fixture local")
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="caca-video-fixture-") as folder:
        audio = Path(folder) / "audio.wav"
        command = [
            "ffmpeg", "-y", "-loglevel", "error",
            "-f", "lavfi", "-i", "testsrc=size=720x1280:rate=25",
            "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100",
            "-t", "2", "-map", "0:v:0", "-map", "1:a:0",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(output),
        ]
        subprocess.run(command, check=True, timeout=120)
        subprocess.run([
            "ffmpeg", "-y", "-loglevel", "error", "-i", str(output), "-map", "0:a:0", "-c:a", "pcm_s16le", str(audio),
        ], check=True, timeout=120)
        report = inspect_video(output, audio, {"canvas": {"width": 720, "height": 1280}})
        if not report.ok:
            raise RuntimeError(f"fixture rejeitado: {report.failures}")
    return output


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--lip-sync", choices=("off", "musetalk"), default="off")
    args = parser.parse_args()
    if args.lip_sync == "musetalk":
        raise SystemExit("Fixture CPU não executa MuseTalk; use o canário Lightning após o preflight.")
    print(f"Fixture offline aprovado: {render_fixture(args.output)}")


if __name__ == "__main__":
    main()
