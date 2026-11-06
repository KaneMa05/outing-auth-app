"""Regression checks for meaning-preserving interview script preparation."""
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    'question_endings', ROOT / 'scripts/prepare-interview-question-endings.py')
editor = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(editor)


class QuestionEndingsTest(unittest.TestCase):
    def test_definition_questions(self):
        for original, expected in [
            ('수상레저기구란', '수상레저기구란 무엇입니까?'),
            ('기선이란?', '기선이란 무엇입니까?'),
            ('본인이 생각하는 리더십이란?', '본인이 생각하는 리더십이란 무엇입니까?'),
            ('고압이란? 특고압이란?', '고압이란 무엇입니까? 특고압이란 무엇입니까?'),
        ]:
            with self.subTest(original=original):
                self.assertEqual(editor.ending(original, 'job'), expected)

    def test_complete_questions_and_actual_nouns_are_preserved(self):
        for original, expected in [
            ('수상레저기구란 무엇입니까?', '수상레저기구란 무엇입니까?'),
            ('혼란', '혼란에 대해 설명해 주시겠습니까?'),
            ('이란', '이란에 대해 설명해 주시겠습니까?'),
            ('어류의 산란', '어류의 산란에 대해 설명해 주시겠습니까?'),
            ('혼란이란?', '혼란이란 무엇입니까?'),
            ('두 제도의 차이를 설명해 주세요.', '두 제도의 차이를 설명해 주시겠습니까?'),
        ]:
            with self.subTest(original=original):
                self.assertEqual(editor.ending(original, 'job'), expected)
                self.assertTrue(editor.validate(expected))

    def test_validation_rejects_malformed_definition_requests(self):
        for text in [
            '수상레저기구란에 대해 설명해 주시겠습니까?',
            '기선이란에 대해 설명해 주시겠습니까?',
            '본인이 생각하는 리더십이란에 대해 말씀해 주시겠습니까?',
        ]:
            self.assertFalse(editor.validate(text), text)

    def test_previously_reviewed_scripts_are_all_loaded(self):
        overrides = editor.load_overrides()
        self.assertEqual(overrides['수상레저기구란'], '수상레저기구란 무엇입니까?')
        self.assertEqual(editor.ending(overrides['배타적 경제수역이란?'], 'job'),
                         '배타적 경제수역의 정의를 설명해 주시겠습니까?')
        for name in editor.OVERRIDE_NAMES:
            entries = json.loads((ROOT / f'scripts/data/interview-audio-{name}-overrides.json')
                                 .read_text(encoding='utf-8'))
            for original in entries:
                self.assertIn(original, overrides)

    def test_all_shipped_scripts_and_known_definition_errors(self):
        overrides = editor.load_overrides()
        for category in ('job', 'personality'):
            clips = json.loads((ROOT / f'assets/interview-{category}-audio/catalog.json')
                               .read_text(encoding='utf-8'))['clips']
            for clip in clips:
                text = editor.ending(overrides.get(clip['prompt'], clip['prompt']), category)
                self.assertTrue(editor.validate(text), (clip['id'], text))
                if not editor.validate(clip['spokenPrompt']):
                    self.assertNotEqual(text, clip['spokenPrompt'])


if __name__ == '__main__':
    unittest.main()
