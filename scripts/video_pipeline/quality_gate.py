from __future__ import annotations

import json
import subprocess
from dataclasses import asdict, dataclass
from pathlib import Path


FORBIDDEN_TEXT = (
    "OFERTA ENCONTRADA HOJE",
    "PREÇO SUJEITO A ALTERAÇÃO",
    "PRECO SUJEITO A ALTERACAO",
)


@dataclass
class QualityReport:
    ok: bool
    duration_delta_ms: int | None
    width: int | None
    height: int | None
    fps: float | None
    forbidden_text: list[str]
    failures: list[str]

    def as_dict(self) -> dict:
        return asdict(self)


def _probe(path: Path) -> dict:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)],
        check=True, capture_output=True, text=True, timeout=60,
    )
    return json.loads(result.stdout)


def _fps(value: str | None) -> float | None:
    if not value or "/" not in value:
        return None
    numerator, denominator = value.split("/", 1)
    try:
        return float(numerator) / float(denominator)
    except (ValueError, ZeroDivisionError):
        return None


def inspect_video(video: Path, audio: Path, template: dict, ocr_text: str = "") -> QualityReport:
    failures: list[str] = []
    found_forbidden = [phrase for phrase in FORBIDDEN_TEXT if phrase in ocr_text.upper()]
    failures.extend(f"texto legado detectado: {phrase}" for phrase in found_forbidden)
    width = height = None
    fps = None
    duration_delta_ms = None
    try:
        video_probe = _probe(video)
        audio_probe = _probe(audio)
        streams = video_probe.get("streams", [])
        video_stream = next((stream for stream in streams if stream.get("codec_type") == "video"), None)
        audio_stream = next((stream for stream in audio_probe.get("streams", []) if stream.get("codec_type") == "audio"), None)
        if video_stream is None:
            failures.append("vídeo sem stream de vídeo")
        else:
            width = video_stream.get("width")
            height = video_stream.get("height")
            fps = _fps(video_stream.get("r_frame_rate"))
            if (width, height) != (template["canvas"]["width"], template["canvas"]["height"]):
                failures.append("dimensões diferentes do template")
            if video_stream.get("codec_name") not in {"h264", "hevc"}:
                failures.append("codec de vídeo não suportado")
        if audio_stream is None:
            failures.append("vídeo sem faixa de áudio")
        video_duration = float(video_probe.get("format", {}).get("duration", 0))
        audio_duration = float(audio_probe.get("format", {}).get("duration", 0))
        duration_delta_ms = round(abs(video_duration - audio_duration) * 1000)
        if duration_delta_ms > 120:
            failures.append("duração do áudio e vídeo divergente")
    except (OSError, subprocess.SubprocessError, ValueError, json.JSONDecodeError, KeyError) as error:
        failures.append(f"ffprobe inválido: {error}")

    if video.exists() and video.stat().st_size > 100 * 1024 * 1024:
        failures.append("arquivo maior que 100 MB")
    elif not video.exists():
        failures.append("arquivo de vídeo não encontrado")

    return QualityReport(
        ok=not failures,
        duration_delta_ms=duration_delta_ms,
        width=width,
        height=height,
        fps=fps,
        forbidden_text=found_forbidden,
        failures=failures,
    )
