from __future__ import annotations

import subprocess
from pathlib import Path


def build_edge_tts_command(
    python: Path,
    voice: str,
    rate: str,
    pitch: str,
    text: str,
    output: Path,
) -> list[str]:
    """Use the selected interpreter and equals syntax for negative rates."""
    return [
        str(python), "-m", "edge_tts",
        "--voice", voice,
        f"--rate={rate}",
        f"--pitch={pitch}",
        "--text", text,
        "--write-media", str(output),
    ]


def synthesize_audio(
    python: Path,
    voice: str,
    rate: str,
    pitch: str,
    text: str,
    output: Path,
) -> Path:
    command = build_edge_tts_command(python, voice, rate, pitch, text, output)
    subprocess.run(command, check=True, timeout=180)
    if not output.exists() or output.stat().st_size == 0:
        raise RuntimeError("TTS terminou sem produzir áudio.")
    return output
