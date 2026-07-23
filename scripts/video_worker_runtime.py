"""Pure helpers shared by the video worker and its CPU-only tests."""

from pathlib import Path


def build_avatar_motion_filter() -> str:
    """Create deterministic camera/parallax motion from the static avatar PNG."""
    return (
        "[0:v]scale=720:1280:force_original_aspect_ratio=decrease,"
        "pad=720:1280:(ow-iw)/2:(oh-ih)/2:color=black,"
        "zoompan=z='1.0+0.035*sin(on/180)':"
        "x='iw/2-(iw/zoom/2)+8*sin(on/40)':"
        "y='ih/2-(ih/zoom/2)+4*sin(on/55)':"
        "d=1:s=720x1280:fps=25,format=yuv420p[v]"
    )


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
