import sys
from pathlib import Path
from types import SimpleNamespace as Item
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from interview_practice_asr_guard import supported_transcription, transcribe_audio


def word(start, end, text):
    return Item(start=start, end=end, word=text)


def segment(start, end, text, words=None):
    return Item(start=start, end=end, text=text, words=words)


class PracticeASRGuardTest(unittest.TestCase):
    def test_silence_does_not_reach_the_speech_decoder(self):
        class NoDecoder:
            def transcribe(self, *_args, **_kwargs):
                raise AssertionError('silence reached ASR')
        self.assertEqual(transcribe_audio(NoDecoder(), [0] * 16000, []),
                         {'transcript': '', 'segments': []})

    def test_detached_ending_is_removed_without_changing_the_answer(self):
        answer = segment(0.8, 15, ' 저는 파출소에서 잘할 수 있습니다.')
        ending = segment(20, 23, ' 다음 영상에서 만나요.', [
            word(20, 20.5, ' 다음'), word(20.5, 21.5, ' 영상에서'), word(21.5, 23, ' 만나요.')])
        result = supported_transcription([answer, ending], [(0.8, 15)], 24)
        self.assertEqual(result['transcript'], answer.text.strip())
        self.assertEqual(result['segments'], [{'start': 0.8, 'end': 15, 'text': answer.text.strip()}])

    def test_unsupported_words_are_trimmed_even_in_the_same_segment(self):
        words = [word(0, 0.4, ' 자막'), word(1, 2, ' 실제'), word(2, 3, ' 답변입니다.'),
                 word(3.6, 4.2, ' 다음'), word(4.2, 5, ' 영상에서 만나요.')]
        result = supported_transcription([segment(0, 5, ''.join(w.word for w in words), words)], [(1, 3)], 6)
        self.assertEqual(result, {'transcript': '실제 답변입니다.',
                                 'segments': [{'start': 1, 'end': 3, 'text': '실제 답변입니다.'}]})

    def test_the_same_ending_is_preserved_when_it_is_actually_spoken(self):
        words = [word(20, 20.5, ' 다음'), word(20.5, 21.5, ' 영상에서'), word(21.5, 23, ' 만나요.')]
        result = supported_transcription([segment(20, 23, ' 다음 영상에서 만나요.', words)], [(20, 23)], 24)
        self.assertEqual(result['transcript'], '다음 영상에서 만나요.')

    def test_quiet_syllables_and_internal_pauses_do_not_change_the_text(self):
        words = [word(0.85, 1, ' 저는'), word(1, 1.8, ' 안전을'), word(2.5, 2.7, ' 어'),
                 word(3, 3.8, ' 지키겠습니다.'), word(3.8, 3.95, ' 네.')]
        text = ''.join(w.word for w in words)
        result = supported_transcription([segment(0.85, 3.95, text, words)], [(1, 1.8), (3, 3.8)], 5)
        self.assertEqual(result['transcript'], text.strip())
        self.assertEqual(result['segments'][0]['start'], 0.85)
        self.assertEqual(result['segments'][0]['end'], 3.95)

    def test_missing_word_alignment_preserves_supported_speech(self):
        result = supported_transcription([segment(1, 3, ' 아니요. 20명입니다.')], [(1, 3)], 4)
        self.assertEqual(result['transcript'], '아니요. 20명입니다.')

    def test_word_times_overrule_a_segment_that_spans_both_speech_and_silence(self):
        result = supported_transcription([segment(1, 9, ' 허위 문장', [word(8, 9, ' 허위 문장')])], [(1, 2)], 10)
        self.assertEqual(result, {'transcript': '', 'segments': []})

    def test_malformed_timestamps_do_not_become_a_successful_caption(self):
        for start, end in [(float('nan'), 2), (2, 1), (-1, 1), (0, float('inf')), (0, 20)]:
            with self.subTest(start=start, end=end), self.assertRaises(ValueError):
                supported_transcription([segment(start, end, ' 내용')], [(0, 3)], 4)

    def test_original_offsets_survive_filtering(self):
        result = supported_transcription([segment(12.4, 13.7, ' 두 번째 답변입니다.')], [(12.4, 13.7)], 20)
        self.assertEqual(result['segments'][0]['start'], 12.4)
        self.assertEqual(result['segments'][0]['end'], 13.7)


if __name__ == '__main__':
    unittest.main()
