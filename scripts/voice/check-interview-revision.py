"""Local ASR diagnostics for regenerated interview questions; no uploads."""
import argparse
from collections import Counter
import json
import os
from pathlib import Path
import re
import time

ROOT = Path(__file__).resolve().parents[2]
os.environ.setdefault('HF_HOME', str(ROOT / '.tmp/interview-voice-cache/huggingface'))
os.environ.setdefault('HF_HUB_DISABLE_XET', '1')
os.environ.setdefault('HF_HUB_DISABLE_TELEMETRY', '1')


def normalize(text):
    text = re.sub(r'[^가-힣a-z0-9]', '', text.lower())
    for spoken, written in {
        '브이디알': 'vdr', '엔엘엘': 'nll', '쓰리에스': '3s',
        '에스엠씨피': 'smcp', '지엠디에스에스': 'gmdss', '브이패스': 'vpass',
        '에이아이에스': 'ais', '엠알씨씨': 'mrcc', '에스씨알': 'scr',
        '에스에이알': 'sar', '엔지오': 'ngo', '엘피지': 'lpg',
        '씨피에이': 'cpa', '시피에이': 'cpa', '지엠': 'gm',
        '이이제트': 'eez', '이이젯': 'eez', '이이지': 'eez',
        '이ez': 'eez',
        '사일구': '419', '오일육': '516', '오일팔': '518',
        '사행정': '4행정', '이행정': '2행정', '칠급': '7급',
        '삼대원칙': '3대원칙', '세가지': '3가지', '두가지': '2가지',
    }.items():
        text = text.replace(spoken, written)
    return text


def edits(left, right):
    previous = list(range(len(right) + 1))
    for i, a in enumerate(left, 1):
        row = [i]
        for j, b in enumerate(right, 1):
            row.append(min(previous[j] + 1, row[-1] + 1, previous[j-1] + (a != b)))
        previous = row
    return previous[-1]


def assess(expected_text, transcript):
    expected, actual = normalize(expected_text), normalize(transcript)
    # "정육이" and "정유기" have the same linked pronunciation. Preserve
    # the raw transcript while comparing the intended technical term.
    homophones = []
    for intended, spelling in [('정유기', '정육이'), ('금어기', '그먹이'), ('피스톤링', '피스톨링'), ('옴의법칙', '오메법칙')]:
        if intended in expected and spelling in actual:
            actual = actual.replace(spelling, intended)
            homophones.append(spelling + '/' + intended)
    count = edits(expected, actual)
    terms = re.findall(r'([가-힣a-zA-Z0-9]+?)(?:이란|란)\s', expected_text)
    terms += [term for term in ('금어기', '우현', '친고죄', '브이디알', '엔엘엘') if term in expected_text]
    terms = list(dict.fromkeys(terms))
    missing = [term for term in terms if normalize(term) not in actual]
    missing_numbers = Counter(re.findall(r'\d+', expected)) - Counter(re.findall(r'\d+', actual))
    missing += ['number:' + number for number in missing_numbers.elements()]
    return {'characterEdits': count, 'referenceCharacters': len(expected),
            'characterErrorRate': round(count / max(1, len(expected)), 4),
            'missingKeyTerms': missing,
            'phoneticEquivalences': homophones,
            'needsReview': bool(missing) or count / max(1, len(expected)) > 0.15}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=ROOT / 'artifacts/interview-question-audio/wording-audio-20261106')
    parser.add_argument('--id', action='append', default=[])
    parser.add_argument('--model', choices=('small', 'turbo'), default='small')
    parser.add_argument('--flagged-only', action='store_true')
    args = parser.parse_args()
    from faster_whisper import WhisperModel
    from huggingface_hub import snapshot_download
    import librosa
    import soundfile as sf
    model_id = 'Systran/faster-whisper-small' if args.model == 'small' else 'mobiuslabsgmbh/faster-whisper-large-v3-turbo'
    model_path = snapshot_download(model_id, local_files_only=True)
    model = WhisperModel(model_path, device='cpu', compute_type='int8', cpu_threads=4)
    report_path = args.source / ('asr-diagnostics.json' if args.model == 'small' else 'asr-turbo-diagnostics.json')
    results = {}
    if report_path.exists():
        results = {q['id']: q for q in json.loads(report_path.read_text(encoding='utf-8'))['questions']}
        for result in results.values():
            result.update(assess(result['expected'], result['transcript']))
    def persist():
        report = {'model': model_id, 'revision': Path(model_path).name,
                  'humanListeningVerified': False, 'normalizationVersion': 2,
                  'purpose': 'ASR diagnostics; transcription errors can also come from ASR',
                  'checked': len(results), 'flagged': sum(r['needsReview'] for r in results.values()),
                  'questions': list(results.values())}
        temporary = report_path.with_suffix('.tmp')
        temporary.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        temporary.replace(report_path)
    requests = json.loads((args.source / 'requests.json').read_text(encoding='utf-8'))['questions']
    flagged = None
    if args.flagged_only:
        baseline = json.loads((args.source / 'asr-diagnostics.json').read_text(encoding='utf-8'))
        flagged = {q['id'] for q in baseline['questions'] if q['needsReview']}
    for q in requests:
        if args.id and q['id'] not in args.id:
            continue
        if flagged is not None and q['id'] not in flagged:
            continue
        audio = args.source / (q['id'] + '.wav')
        metadata = audio.with_suffix('.json')
        if not audio.exists() or not metadata.exists():
            continue
        entry = json.loads(metadata.read_text(encoding='utf-8'))
        if results.get(q['id'], {}).get('sha256') == entry['sha256']:
            continue
        started = time.monotonic()
        samples, rate = sf.read(audio, dtype='float32', always_2d=True)
        samples = samples.mean(axis=1)
        if rate != 16000:
            samples = librosa.resample(samples, orig_sr=rate, target_sr=16000)
        segments, _ = model.transcribe(samples, language='ko', beam_size=5,
            temperature=0, vad_filter=False, condition_on_previous_text=False)
        transcript = ''.join(segment.text for segment in segments).strip()
        results[q['id']] = {'id': q['id'], 'expected': q['spokenPrompt'], 'transcript': transcript,
                           **assess(q['spokenPrompt'], transcript),
                           'sha256': entry['sha256']}
        persist()
        print(json.dumps({**results[q['id']], 'seconds': round(time.monotonic()-started, 2)}, ensure_ascii=False), flush=True)
    persist()


if __name__ == '__main__':
    main()
