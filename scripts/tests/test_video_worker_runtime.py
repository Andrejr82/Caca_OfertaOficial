import sys
import unittest
import json
from pathlib import Path

from video_worker_runtime import build_edge_tts_command, validate_video_template


class VideoWorkerRuntimeTests(unittest.TestCase):
    def test_uses_the_selected_python_module_and_preserves_negative_rate(self):
        command = build_edge_tts_command(
            Path("/opt/musetalk/bin/python"),
            "pt-BR-AntonioNeural",
            "-8%",
            "+0Hz",
            "Oferta válida.",
            Path("/tmp/audio.mp3"),
        )

        self.assertEqual(command[:3], [str(Path("/opt/musetalk/bin/python")), "-m", "edge_tts"])
        self.assertIn("--rate=-8%", command)
        self.assertIn("--pitch=+0Hz", command)
        self.assertEqual(command[-2:], ["--write-media", str(Path("/tmp/audio.mp3"))])

    def test_motion_template_keeps_every_overlay_inside_the_vertical_canvas(self):
        templates = json.loads(Path("scripts/video-templates.json").read_text(encoding="utf-8"))
        validate_video_template("motion-v1", templates["motion-v1"])


if __name__ == "__main__":
    unittest.main()
