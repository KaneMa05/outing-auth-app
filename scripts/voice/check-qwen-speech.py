"""Local ASR spot check, with original Fish clips as controls. Not a human quality rating."""
import json
import os
from pathlib import Path
import re
import argparse

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / '.tmp/qwen-tts-local'
OUT = ROOT / 'artifacts/qwen-tts-local'
os.environ.setdefault('HF_HOME', str(WORK / 'cache/huggingface'))
os.environ.setdefault('HF_HUB_DISABLE_XET', '1')
os.environ.setdefault('HF_HUB_DISABLE_TELEMETRY', '1')

from faster_whisper import WhisperModel
import soundfile as sf
import librosa

def normalize(text):
    return re.sub(r'[^가-힣a-z0-9]', '', text.lower())

def distance(left, right):
    prev = list(range(len(right) + 1))
    for i, a in enumerate(left, 1):
        row = [i]
        for j, b in enumerate(right, 1):
            row.append(min(prev[j] + 1, row[-1] + 1, prev[j - 1] + (a != b)))
        prev = row
    return prev[-1]

parser=argparse.ArgumentParser()
parser.add_argument('--model-size', choices=['0.6B','1.7B','trained'], default='0.6B')
args=parser.parse_args()
large=args.model_size=='1.7B'
manifest_name = 'samples-trained.json' if args.model_size == 'trained' else ('samples-1p7b.json' if large else 'samples.json')
report_name = 'asr-spotcheck-trained.json' if args.model_size == 'trained' else ('asr-spotcheck-1p7b.json' if large else 'asr-spotcheck.json')
manifest = json.loads((OUT / manifest_name).read_text(encoding='utf-8'))
catalog = json.loads((ROOT / 'artifacts/interview-question-audio/catalog.json').read_text(encoding='utf-8'))
model = WhisperModel('small', device='cpu', compute_type='int8', cpu_threads=4,
                     download_root=str(WORK / 'cache/whisper'))
results = []
for sample in manifest['samples']:
    control = next(q for q in catalog['clips'] if q['spokenPrompt'] == sample['text'])
    pair = {'text': sample['text'], 'file': sample['file']}
    for kind, filename in [('qwen', OUT / sample['file']),
                           ('fish_control', ROOT / 'artifacts/interview-question-audio' / control['file'])]:
        audio, rate = sf.read(filename, dtype='float32', always_2d=True)
        audio = audio.mean(axis=1)
        if rate != 16000:
            audio = librosa.resample(audio, orig_sr=rate, target_sr=16000)
        segments, info = model.transcribe(audio, language='ko', beam_size=5,
                                          condition_on_previous_text=False, vad_filter=False, temperature=0)
        transcript = ''.join(s.text for s in segments).strip()
        expected, actual = normalize(sample['text']), normalize(transcript)
        pair[kind] = {'transcript': transcript, 'normalizedExact': actual == expected,
                      'characterEdits': distance(expected, actual), 'referenceCharacters': len(expected)}
        print(kind, transcript, flush=True)
    results.append(pair)
    (OUT / report_name).write_text(json.dumps({'asrModel': 'Systran/faster-whisper-small',
        'purpose': 'diagnostic spot check only; ASR errors do not prove a TTS error; not a human naturalness rating',
        'samples': results}, ensure_ascii=False, indent=2), encoding='utf-8')
