import hashlib
import unittest
from pathlib import Path

from imported_video_runtime import (
    build_ffmpeg_command,
    build_storage_paths,
    fingerprint_bytes,
    validate_probe_metadata,
    validate_channel_duration,
)


class ImportedVideoRuntimeTests(unittest.TestCase):
    def test_accepts_vertical_h264_aac_mp4_within_limits(self):
        result = validate_probe_metadata({
            "format_name": "mov,mp4,m4a,3gp,3g2,mj2",
            "duration": 12.5,
            "size": 2_000_000,
            "streams": [
                {"codec_type": "video", "codec_name": "h264", "width": 1080, "height": 1920, "r_frame_rate": "30/1"},
                {"codec_type": "audio", "codec_name": "aac", "sample_rate": "48000"},
            ],
        })
        self.assertTrue(result["valid"])
        self.assertEqual(result["width"], 1080)
        self.assertEqual(result["height"], 1920)

    def test_rejects_corrupt_or_oversized_probe(self):
        result = validate_probe_metadata({"format_name": "avi", "duration": 0, "size": 200_000_000, "streams": []})
        self.assertFalse(result["valid"])
        self.assertIn("INVALID_MEDIA", result["errors"])

    def test_applies_facebook_reel_duration_limit(self):
        self.assertEqual(validate_channel_duration(61, ["facebook"]), "FACEBOOK_REEL_DURATION_INVALID")
        self.assertIsNone(validate_channel_duration(30, ["instagram", "facebook"]))

    def test_generates_safe_vertical_normalization_command_without_stretching(self):
        command = build_ffmpeg_command(Path("source.mp4"), Path("processed.mp4"), width=1920, height=1080, fps=30)
        command_text = " ".join(command)
        self.assertIn("scale=1080:1920:force_original_aspect_ratio=decrease", command_text)
        self.assertIn("pad=1080:1920:(ow-iw)/2:(oh-ih)/2", command_text)
        self.assertIn("-movflags", command)
        self.assertIn("+faststart", command)

    def test_builds_isolated_asset_paths_and_sha256(self):
        paths = build_storage_paths("user-1", "offer-1", "job-1")
        self.assertEqual(paths["source"], "videos/user-1/offer-1/job-1/source.mp4")
        self.assertEqual(paths["instagram_cover"], "videos/user-1/offer-1/job-1/instagram-cover.jpg")
        self.assertEqual(fingerprint_bytes(b"video"), hashlib.sha256(b"video").hexdigest())


if __name__ == "__main__":
    unittest.main()
