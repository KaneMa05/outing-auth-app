import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('revision_asr', ROOT / 'scripts/voice/check-interview-revision.py')
asr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(asr)


class RevisionASRTest(unittest.TestCase):
    def test_numbers_and_acronyms_do_not_report_false_word_changes(self):
        for expected, actual in [('사일구 혁명과 오일육 군사정변', '4.19 혁명과 5.16 군사정변'),
                                 ('브이디알에 대해 설명해 주시겠습니까?', 'VDR에 대해 설명해 주시겠습니까?'),
                                 ('범죄수사의 삼대 원칙인 쓰리에스', '범죄수사의 3대 원칙인 3S')]:
            self.assertFalse(asr.assess(expected, actual)['needsReview'])
        self.assertFalse(asr.assess('EEZ란 무엇입니까?', '이 EZ란 무엇입니까?')['needsReview'])

    def test_a_wrong_core_term_is_flagged_even_in_a_long_otherwise_correct_sentence(self):
        expected = '금어기에 수산생물을 포획한 상황을 발견하면 어떻게 대처하겠습니까?'
        result = asr.assess(expected, expected.replace('금어기', '주말'))
        self.assertTrue(result['needsReview'])
        self.assertIn('금어기', result['missingKeyTerms'])

    def test_definition_subject_is_checked(self):
        self.assertFalse(asr.assess('톤수란 무엇입니까?', '톤수란 무엇입니까?')['needsReview'])
        self.assertTrue(asr.assess('톤수란 무엇입니까?', '돈수란 무엇입니까?')['needsReview'])

    def test_changed_numbers_are_flagged(self):
        self.assertTrue(asr.assess('사일구 혁명에 대해 설명해 주시겠습니까?',
                                  '4.18 혁명에 대해 설명해 주시겠습니까?')['needsReview'])

    def test_raw_spelling_of_a_homophone_does_not_imply_a_pronunciation_error(self):
        result = asr.assess('정유기란 무엇입니까?', '정육이란 무엇입니까?')
        self.assertFalse(result['needsReview'])
        self.assertEqual(result['phoneticEquivalences'], ['정육이/정유기'])
        self.assertFalse(asr.assess('금어기에 발견하면 어떻게 대처하겠습니까?',
                                   '그 먹이에 발견하면 어떻게 대처하겠습니까?')['needsReview'])
        self.assertFalse(asr.assess('피스톤링이란 무엇입니까?', '피스톨링이란 무엇입니까?')['needsReview'])


if __name__ == '__main__':
    unittest.main()
