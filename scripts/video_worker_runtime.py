"""Pure helpers shared by the video worker and its CPU-only tests."""

from pathlib import Path


def worker_requires_speech_runtime(template_id: str) -> bool:
    return template_id != "imported-video-v1"


def validate_video_template(name: str, template: dict) -> None:
    card = template.get("card", {})
    canvas = template.get("canvas", {})
    if not all(isinstance(card.get(key), int) and card[key] >= 0 for key in ("x", "y", "width", "height")):
        raise ValueError(f"Template {name} possui card inválido.")
    if not all(isinstance(canvas.get(key), int) and canvas[key] > 0 for key in ("width", "height", "fps")):
        raise ValueError(f"Template {name} possui canvas inválido.")
    if card["x"] + card["width"] > canvas["width"] or card["y"] + card["height"] > canvas["height"]:
        raise ValueError(f"Template {name} posiciona o card fora do canvas.")


def build_edge_tts_command(
    python: Path,
    voice: str,
    rate: str,
    pitch: str,
    script: str,
    destination: Path,
) -> list[str]:
    """Invoke edge-tts as a module so a negative rate is never parsed as a flag."""
    return [
        str(python), "-m", "edge_tts",
        "--voice", voice,
        f"--rate={rate}",
        f"--pitch={pitch}",
        "--text", script,
        "--write-media", str(destination),
    ]
