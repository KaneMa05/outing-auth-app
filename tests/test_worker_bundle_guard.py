import sys
import threading
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools' / 'interview-worker'))
import worker


class BundleGuardLoopTests(unittest.TestCase):
    def test_version_block_is_reported_with_a_long_wait_and_remains_stoppable(self):
        store = MagicMock()
        store.active.return_value = []
        processor = MagicMock()
        processor.tick.return_value = False
        processor.last_status = 'bundle_update_required'
        stop = MagicMock()
        stop.is_set.side_effect = [False, False, True]
        with patch.object(worker, 'InstanceLock'), patch.object(worker, 'Protector') as protector, \
             patch.object(worker.Path, 'read_bytes', return_value=b'protected'), \
             patch.object(worker, 'Api'), patch.object(worker, 'Store', return_value=store), \
             patch.object(worker, 'CliBridge') as bridge, patch.object(worker, 'Worker', return_value=processor):
            protector.return_value.open.return_value = {'token': 'test'}
            messages = []
            worker.run_loop({'web_origin': 'https://example.test', 'engine': 'cli', 'poll_seconds': 2},
                            Path('.tmp/test-only'), stop, threading.Event(), messages.append)
        self.assertEqual(processor.tick.call_count, 2)
        self.assertEqual([call.args for call in stop.wait.call_args_list], [(60,), (60,)])
        self.assertEqual(messages, ['bundle_update_required', 'bundle_update_required'])
        bridge.return_value.close.assert_called_once()
        store.close.assert_called_once()


if __name__ == '__main__':
    unittest.main()
