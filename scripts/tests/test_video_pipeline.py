import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from video_pipeline.preflight import run_preflight
from video_pipeline.tts import build_edge_tts_command
from video_worker_runtime import build_avatar_motion_filter


class VideoPipelineTests(unittest.TestCase):
    def test_edge_tts_uses_selected_python_and_safe_negative_rate(self):
        command = build_edge_tts_command(
            Path('/env/bin/python'), 'pt-BR-AntonioNeural', '-8%', '+0Hz', 'texto', Path('a.mp3')
        )
        self.assertEqual(command[0:3], [str(Path('/env/bin/python')), '-m', 'edge_tts'])
        self.assertIn('--rate=-8%', command)

    def test_preflight_rejects_missing_cuda_before_claiming_job(self):
        config = {
            'python': sys.executable,
            'lip_sync_engine': 'musetalk',
            'musetalk_dir': '/missing/MuseTalk',
            'musetalk_config': '/missing/test.yaml',
            'musetalk_unet': '/missing/unet.pth',
            'musetalk_unet_config': '/missing/musetalk.json',
            'reference_source': 'motion',
            'master_video': '/missing/master.mp4',
            'template_path': '/missing/template.json',
        }
        with patch('video_pipeline.preflight.shutil.which', return_value=None):
            report = run_preflight(config)
        self.assertFalse(report.ok)
        self.assertIn('master_video', report.checks)
        self.assertIn('musetalk_dir', report.checks)

    def test_avatar_motion_filter_is_deterministic_and_has_no_legacy_overlay(self):
        command = build_avatar_motion_filter()
        self.assertIn('zoompan', command)
        self.assertIn('sin(on/', command)
        self.assertNotIn('JBL', command)
        self.assertNotIn('OFERTA ENCONTRADA', command)


if __name__ == '__main__':
    unittest.main()
