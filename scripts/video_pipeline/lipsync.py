from __future__ import annotations

import shutil
import subprocess
from pathlib import Path


def build_musetalk_command(
    python: Path,
    musetalk_dir: Path,
    config: Path,
    result_dir: Path,
    unet: Path,
    unet_config: Path,
    version: str,
) -> tuple[list[str], Path]:
    command = [
        str(python), "-m", "scripts.inference",
        "--inference_config", str(config),
        "--result_dir", str(result_dir),
        "--unet_model_path", str(unet),
        "--unet_config", str(unet_config),
        "--version", version,
    ]
    return command, musetalk_dir


def run_lipsync(
    python: Path,
    musetalk_dir: Path,
    config: Path,
    result_dir: Path,
    unet: Path,
    unet_config: Path,
    version: str,
    output: Path,
) -> Path:
    command, cwd = build_musetalk_command(python, musetalk_dir, config, result_dir, unet, unet_config, version)
    subprocess.run(command, cwd=cwd, check=True, timeout=1800)
    generated = sorted(result_dir.rglob("*.mp4"), key=lambda path: path.stat().st_mtime, reverse=True)
    if not generated:
        raise RuntimeError("MuseTalk terminou sem produzir um MP4.")
    shutil.copyfile(generated[0], output)
    return output
