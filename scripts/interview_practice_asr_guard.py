"""Keep practice captions within detected speech, without filtering by wording."""
import math

SAMPLE_RATE = 16000
# Preserve quiet syllables at either edge of a detected utterance.
SPEECH_MARGIN_SECONDS = 0.2


def supported_transcription(segments, speech_intervals, duration):
    """Trim only unsupported edges; keep pauses and all words between speech."""
    if not math.isfinite(duration) or duration < 0:
        raise ValueError('invalid_audio_duration')

    def supported(start, end):
        return any(start <= speech_end + SPEECH_MARGIN_SECONDS and
                   end >= speech_start - SPEECH_MARGIN_SECONDS
                   for speech_start, speech_end in speech_intervals)

    def times(item):
        start, end = item.start, item.end
        if (not math.isfinite(start) or not math.isfinite(end) or
                start < 0 or end < start or end > duration + 0.1):
            raise ValueError('invalid_transcription_timestamp')
        return min(start, duration), min(end, duration)

    output, texts = [], []
    for segment in segments:
        start, end = times(segment)
        text = segment.text
        if not text.strip() or not supported(start, end):
            continue
        words = segment.words or []
        if words:
            word_times = [times(word) for word in words]
            indices = [i for i, (left, right) in enumerate(word_times)
                       if words[i].word.strip() and supported(left, right)]
            if not indices:
                continue
            first, last = indices[0], indices[-1]
            if first != 0 or last != len(words) - 1:
                text = ''.join(word.word for word in words[first:last + 1])
                start = word_times[first][0]
                end = word_times[last][1]
        if not text.strip() or end <= start:
            continue
        output.append({'start': round(start, 3), 'end': round(end, 3), 'text': text.strip()})
        texts.append(text)
    return {'transcript': ''.join(texts).strip(), 'segments': output}


def transcribe_audio(model, audio, speech_intervals):
    # An empty VAD result is silence, not an invitation to generate an ending.
    if not speech_intervals:
        return {'transcript': '', 'segments': []}
    segments, _ = model.transcribe(
        audio, language='ko', beam_size=5, temperature=0,
        condition_on_previous_text=False, word_timestamps=True, vad_filter=True,
        vad_parameters={'min_silence_duration_ms': 500}, initial_prompt=None,
        hallucination_silence_threshold=1.0)
    return supported_transcription(segments, speech_intervals, len(audio) / SAMPLE_RATE)
