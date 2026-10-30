"""Local, resumable question synthesis. Never writes to DB or app assets."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import time

ROOT = Path(__file__).resolve().parents[1]
os.environ.setdefault('HF_HOME', str(ROOT / '.tmp/voice-local/huggingface'))

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--limit', type=int, default=0)
    parser.add_argument('--batch-size', type=int, default=8)
    parser.add_argument('--bank', default='questions-20261030.json')
    parser.add_argument('--output', default='local-qwen')
    args = parser.parse_args()
    import mlx.core as mx
    import numpy as np
    from mlx_audio.tts.utils import load_model
    from mlx_audio.audio_io import write

    folder = ROOT / 'artifacts/interview-question-audio'
    output = folder / args.output
    output.mkdir(parents=True, exist_ok=True)
    bank = json.loads((folder / args.bank).read_text())['questions']
    original = ROOT / 'native/android/interview/src/debug/assets/interview-question-audio'
    clips = json.loads((original / 'catalog.json').read_text())['clips']
    ref = next(c for c in clips if c['id'] == 'practice-job-1')
    reference = original / ref['file']
    overrides = {}
    for name in ['personality', 'spoken']:
        overrides.update(json.loads((ROOT / f'scripts/data/interview-audio-{name}-overrides.json').read_text()))
    model_id = 'mlx-community/Qwen3-TTS-12Hz-0.6B-Base-4bit'
    provenance = {'model': model_id, 'reference': ref, 'referenceSha256': hashlib.sha256(reference.read_bytes()).hexdigest(), 'language': 'korean', 'temperature': 0.5}
    config = output / 'voice.json'
    if config.exists() and json.loads(config.read_text()) != provenance:
        raise RuntimeError('Voice configuration changed; use a separate output folder')
    config.write_text(json.dumps(provenance, ensure_ascii=False, indent=2))
    print('Loading fixed reference voice', flush=True)
    model = load_model(model_id)
    pending = []
    for q in bank:
        target = output / (q['id'] + '.wav')
        spoken = q.get('spokenPrompt') or overrides.get(q['prompt'], q['prompt'])
        fingerprint = hashlib.sha256(json.dumps([q['id'], spoken, provenance], ensure_ascii=False, sort_keys=True).encode()).hexdigest()
        metadata = target.with_suffix('.json')
        if target.exists() and metadata.exists() and json.loads(metadata.read_text()).get('fingerprint') == fingerprint:
            continue
        pending.append((q, target, spoken, fingerprint, metadata))
    if args.limit:
        pending = pending[:args.limit]
    if args.batch_size < 1:
        raise ValueError('batch-size must be positive')
    done = 0
    for offset in range(0, len(pending), args.batch_size):
        batch = pending[offset:offset + args.batch_size]
        start = time.monotonic()
        mx.random.seed(42)
        results = model.batch_generate(texts=[item[2] for item in batch], lang_code='korean', ref_audio=str(reference), ref_text=ref['spokenPrompt'], temperature=0.5, max_tokens=1200)
        for result in results:
            q, target, spoken, fingerprint, metadata = batch[result.sequence_idx]
            samples = np.array(result.audio).reshape(-1)
            if not np.isfinite(samples).all() or len(samples) < model.sample_rate // 3 or np.max(np.abs(samples)) < 0.001:
                raise RuntimeError('Invalid generated audio: ' + q['id'])
            temporary = target.with_suffix('.partial.wav')
            write(str(temporary), samples, model.sample_rate)
            temporary.replace(target)
            metadata.write_text(json.dumps({**q, 'spokenPrompt': spoken, 'fingerprint': fingerprint, 'seconds': len(samples)/model.sample_rate, 'generationSeconds': time.monotonic()-start, 'sha256': hashlib.sha256(target.read_bytes()).hexdigest()}, ensure_ascii=False, indent=2))
            done += 1
            print(json.dumps({'id': q['id'], 'generatedThisRun': done, 'remaining': len(pending)-done, 'batchSeconds': round(time.monotonic()-start, 1)}, ensure_ascii=False), flush=True)
        mx.clear_cache()
    print('Finished: ' + str(done), flush=True)

if __name__ == '__main__':
    main()
