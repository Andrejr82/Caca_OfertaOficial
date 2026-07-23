from __future__ import annotations

import importlib.util
import json
import shutil
import subprocess
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class PreflightReport:
    ok: bool
    checks: dict[str, bool] = field(default_factory=dict)
    failures: list[str] = field(default_factory=list)


def _check(report: PreflightReport, name: str, condition: bool, detail: str) -> None:
    report.checks[name] = condition
    if not condition:
        report.failures.append(detail)


def run_preflight(config: dict) -> PreflightReport:
    report = PreflightReport(ok=False)
    ffmpeg = shutil.which("ffmpeg")
    _check(report, "ffmpeg", bool(ffmpeg), "ffmpeg não encontrado")
    if ffmpeg:
        filters = subprocess.run([ffmpeg, "-hide_banner", "-filters"], capture_output=True, text=True, timeout=60)
        _check(report, "ffmpeg_filters", filters.returncode == 0 and "drawbox" in filters.stdout, "filtro drawbox ausente")

    python = Path(config.get("python", ""))
    _check(report, "python", python.exists(), "Python do ambiente não encontrado")
    if python.exists():
        probe = subprocess.run([str(python), "-c", "import edge_tts"], capture_output=True, text=True, timeout=30)
        _check(report, "edge_tts", probe.returncode == 0, "edge_tts indisponível no Python configurado")

    if config.get("lip_sync_engine", "off") == "musetalk":
        for name in ("musetalk_dir", "musetalk_config", "musetalk_unet", "musetalk_unet_config"):
            _check(report, name, Path(config.get(name, "")).exists(), f"{name} não encontrado")
        if python.exists():
            probe = subprocess.run(
                [str(python), "-c", "import cv2, torch; assert torch.cuda.is_available()"],
                capture_output=True, text=True, timeout=60,
            )
            _check(report, "cv2_cuda", probe.returncode == 0, "cv2/CUDA indisponível no ambiente MuseTalk")

    master = Path(config.get("master_video", ""))
    if config.get("reference_source") in {"motion", "video"}:
        _check(report, "master_video", master.exists(), "vídeo-mestre não encontrado")
    template = Path(config.get("template_path", ""))
    if template.exists():
        try:
            json.loads(template.read_text(encoding="utf-8"))
            template_ok = True
        except (OSError, json.JSONDecodeError):
            template_ok = False
        _check(report, "template", template_ok, "template JSON inválido")
    else:
        _check(report, "template", False, "template não encontrado")

    report.ok = not report.failures
    return report
