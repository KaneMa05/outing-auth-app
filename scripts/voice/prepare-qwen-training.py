"""Prepare local synthetic-reference training candidates; does not train a model."""
import hashlib
import json
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf

from importlib.util import spec_from_file_location, module_from_spec

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'artifacts/qwen-tts-local'
spec = spec_from_file_location('qwen_local', Path(__file__).with_name('qwen-local.py'))
local = module_from_spec(spec)
spec.loader.exec_module(local)
if not (OUT / 'reference-male.wav').exists():
    local.prepare()
catalog = json.loads((ROOT / 'artifacts/interview-question-audio/catalog.json').read_text(encoding='utf-8'))
folder = OUT / 'training-candidates'
folder.mkdir(parents=True, exist_ok=True)
holdout = set(local.TARGETS)
selected = [q for q in catalog['clips'] if q['category'] == 'job' and '공채' in q.get('tracks', [])
            and q['spokenPrompt'] not in holdout and q['id'] != local.REFERENCE_ID]
train, validation, inventory, seen = [], [], [], set()
for clip in selected:
    if clip['spokenPrompt'] in seen:
        continue
    source = ROOT / 'artifacts/interview-question-audio' / clip['file']
    audio, rate = sf.read(source, dtype='float32', always_2d=True)
    audio = audio.mean(axis=1)
    if not np.isfinite(audio).all() or not 2 <= len(audio) / rate <= 15:
        continue
    if rate != 24000:
        audio = librosa.resample(audio, orig_sr=rate, target_sr=24000)
    target = folder / (clip['id'] + '.wav')
    sf.write(target, audio, 24000, subtype='PCM_16')
    row = {'audio': str(target), 'text': clip['spokenPrompt'], 'ref_audio': str(OUT / 'reference-male.wav')}
    (validation if len(inventory) % 8 == 0 else train).append(row)
    inventory.append({'id': clip['id'], 'seconds': len(audio) / 24000,
        'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'synthetic': True})
    seen.add(clip['spokenPrompt'])
    if len(inventory) >= 32:
        break
for name, rows in [('train-raw.jsonl', train), ('validation-raw.jsonl', validation)]:
    (folder / name).write_text(''.join(json.dumps(row, ensure_ascii=False) + '\n' for row in rows), encoding='utf-8')
summary = {'train': len(train), 'validation': len(validation), 'totalSeconds': sum(x['seconds'] for x in inventory),
    'source': 'user-selected existing Fish Audio synthetic male voice', 'trained': False,
    'status': 'candidates only; reference clone and pronunciation must be reviewed before training', 'clips': inventory}
(folder / 'inventory.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({k: v for k, v in summary.items() if k != 'clips'}, ensure_ascii=False))
