"""Check generated audio coverage, hashes and WAV integrity without touching DB."""
import hashlib
import argparse
import json
from pathlib import Path
import wave

ROOT = Path(__file__).resolve().parents[1]
folder = ROOT / 'artifacts/interview-question-audio'
parser = argparse.ArgumentParser()
parser.add_argument('--bank', default='questions-20261030.json')
parser.add_argument('--output', default='local-qwen')
parser.add_argument('--require-complete', action='store_true')
args = parser.parse_args()
output = folder / args.output
bank = json.loads((folder / args.bank).read_text())['questions']
assert len({q['id'] for q in bank}) == len(bank)
ready, missing, errors = [], [], []
for q in bank:
    audio = output / (q['id'] + '.wav')
    metadata = audio.with_suffix('.json')
    if not audio.exists() or not metadata.exists():
        missing.append(q['id'])
        continue
    try:
        entry = json.loads(metadata.read_text())
        assert entry['id'] == q['id'] and entry['prompt'] == q['prompt']
        if q.get('spokenPrompt'):
            assert entry['spokenPrompt'] == q['spokenPrompt']
        assert hashlib.sha256(audio.read_bytes()).hexdigest() == entry['sha256']
        with wave.open(str(audio)) as wav:
            assert wav.getnchannels() == 1 and wav.getframerate() == 24000
            assert wav.getnframes() > 8000
            assert len(wav.readframes(wav.getnframes())) == wav.getnframes() * wav.getsampwidth()
        ready.append({**entry, 'file': audio.name})
    except Exception as exc:
        errors.append({'id': q['id'], 'error': repr(exc)})
report = {'total': len(bank), 'ready': len(ready), 'missing': len(missing), 'errors': errors, 'complete': not missing and not errors, 'voiceSimilarityHumanVerified': False}
(output / 'verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
(output / 'catalog.json').write_text(json.dumps({'clips': ready, 'missing': missing, 'verification': report}, ensure_ascii=False, indent=2))
print(json.dumps(report, ensure_ascii=False))
if errors or (args.require_complete and missing):
    raise SystemExit(1)
