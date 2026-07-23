import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from video_pipeline.quality_gate import inspect_video


def _completed_probe(streams, duration='10.0'):
    return type('Completed', (), {'stdout': json.dumps({'streams': streams, 'format': {'duration': duration}})})()


class QualityGateTests(unittest.TestCase):
    def test_rejects_video_without_audio_stream(self):
        with tempfile.TemporaryDirectory() as folder:
            video = Path(folder) / 'video.mp4'
            audio = Path(folder) / 'audio.mp3'
            video.write_bytes(b'video')
            audio.write_bytes(b'audio')
            probes = [
                _completed_probe([{'codec_type': 'video', 'codec_name': 'h264', 'width': 720, 'height': 1280, 'r_frame_rate': '25/1'}]),
                _completed_probe([]),
            ]
            with patch('video_pipeline.quality_gate.subprocess.run', side_effect=probes):
                report = inspect_video(video, audio, {'canvas': {'width': 720, 'height': 1280}})
        self.assertFalse(report.ok)
        self.assertIn('vídeo sem faixa de áudio', report.failures)

    def test_rejects_legacy_copy_detected_by_ocr(self):
        with tempfile.TemporaryDirectory() as folder:
            video = Path(folder) / 'video.mp4'
            audio = Path(folder) / 'audio.mp3'
            video.write_bytes(b'video')
            audio.write_bytes(b'audio')
            probe = _completed_probe([
                {'codec_type': 'video', 'codec_name': 'h264', 'width': 720, 'height': 1280, 'r_frame_rate': '25/1'},
                {'codec_type': 'audio'},
            ])
            with patch('video_pipeline.quality_gate.subprocess.run', side_effect=[probe, probe]):
                report = inspect_video(video, audio, {'canvas': {'width': 720, 'height': 1280}}, 'OFERTA ENCONTRADA HOJE')
        self.assertFalse(report.ok)
        self.assertIn('OFERTA ENCONTRADA HOJE', report.forbidden_text)


if __name__ == '__main__':
    unittest.main()
