import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).parents[1] / 'render-video-fixture.py'
SPEC = importlib.util.spec_from_file_location('render_video_fixture', SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class FixtureRendererTests(unittest.TestCase):
    def test_fixture_renderer_has_no_network_or_api_calls(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / 'out.mp4'
            with patch('urllib.request.urlopen', side_effect=AssertionError('network')):
                with patch.object(MODULE, 'shutil') as shutil_mock:
                    shutil_mock.which.return_value = None
                    with self.assertRaises(RuntimeError):
                        MODULE.render_fixture(output)
                    shutil_mock.which.assert_called_once_with('ffmpeg')


if __name__ == '__main__':
    unittest.main()
