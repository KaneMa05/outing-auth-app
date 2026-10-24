import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location('selector', pathlib.Path(__file__).parents[1] / 'scripts/ios/select-simulator.py')
selector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(selector)


class SimulatorSelectionTests(unittest.TestCase):
    def test_uses_installed_iphone_and_skips_unavailable_ipad_tv_and_old_ios(self):
        old = '11111111-1111-1111-1111-111111111111'
        current = '22222222-2222-2222-2222-222222222222'
        devices = {'devices': {
            'com.apple.CoreSimulator.SimRuntime.iOS-18-5': [{'name': 'iPhone 16', 'isAvailable': True, 'udid': old}],
            'com.apple.CoreSimulator.SimRuntime.iOS-26-2': [
                {'name': 'iPhone 17', 'isAvailable': True, 'udid': current},
                {'name': 'iPhone 17 Pro', 'isAvailable': False, 'udid': old},
                {'name': 'iPad Pro', 'isAvailable': True, 'udid': old}],
            'com.apple.CoreSimulator.SimRuntime.tvOS-99-0': [{'name': 'iPhone invalid', 'isAvailable': True, 'udid': old}]
        }}
        self.assertEqual(selector.select_device(devices), current)
        for invalid in [{}, {'devices': {'com.apple.CoreSimulator.SimRuntime.iOS-15-0': [{'name': 'iPhone', 'isAvailable': True, 'udid': old}]}},
                        {'devices': {'com.apple.CoreSimulator.SimRuntime.iOS-26-2': [{'name': 'iPhone', 'isAvailable': True, 'udid': 'invalid; shell text'}]}}]:
            with self.assertRaises(ValueError):
                selector.select_device(invalid)


if __name__ == '__main__':
    unittest.main()
