import unittest

from imported_video_worker import extract_media_url, is_safe_network_address, worker_headers


class ImportedVideoWorkerTests(unittest.TestCase):
    def test_extracts_only_official_shopee_video_cdn_url(self):
        html = '<script>VideoUrl="https://down-zl-br.vod.susercontent.com/api/video.mp4"</script>'
        self.assertEqual(extract_media_url(html), "https://down-zl-br.vod.susercontent.com/api/video.mp4")
        self.assertIsNone(extract_media_url('"https://evil.example/video.mp4"'))

    def test_rejects_private_link_local_and_metadata_addresses(self):
        self.assertFalse(is_safe_network_address("127.0.0.1"))
        self.assertFalse(is_safe_network_address("169.254.169.254"))
        self.assertTrue(is_safe_network_address("8.8.8.8"))

    def test_uses_the_parent_worker_id_for_authenticated_requests(self):
        headers = worker_headers("parent-host-unique-id")
        self.assertEqual(headers["X-Video-Worker-Id"], "parent-host-unique-id")


if __name__ == "__main__":
    unittest.main()
