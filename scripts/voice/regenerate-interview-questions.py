"""Regenerate changed interview scripts locally with the existing male reference."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import time

ROOT = Path(__file__).resolve().parents[2]
FOLDER = ROOT / 'artifacts/interview-question-audio'
MODEL = 'Qwen/Qwen3-TTS-12Hz-0.6B-Base'
REVISION = '5d83992436eae1d760afd27aff78a71d676296fc'
os.environ.setdefault('HF_HOME', str(ROOT / '.tmp/interview-voice-cache/huggingface'))
os.environ.setdefault('HF_HUB_DISABLE_XET', '1')
os.environ.setdefault('HF_HUB_DISABLE_TELEMETRY', '1')
os.environ.setdefault('TOKENIZERS_PARALLELISM', 'false')


def digest(data):
    return hashlib.sha256(data).hexdigest()


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def pronunciation_key(text):
    text = re.sub(r'[\s,.?!]', '', text).lower()
    for spelling, acronym in [('에스씨알', 'scr'), ('이이제트', 'eez')]:
        text = text.replace(spelling, acronym)
    return text


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    temporary.replace(path)


def prepare_requests(bank, output):
    questions = {q['id']: q for q in read(bank)['questions']}
    manifest = output / 'requests.json'
    if manifest.exists():
        requests = read(manifest)['questions']
        for q in requests:
            target = questions[q['id']]
            if any(q[key] != target[key] for key in ('prompt', 'category', 'spokenPrompt')):
                raise ValueError('Revision bank changed; use a new output directory: ' + q['id'])
        return requests
    requests = []
    for category in ('job', 'personality'):
        for clip in read(ROOT / f'assets/interview-{category}-audio/catalog.json')['clips']:
            target = questions.pop(clip['id'])
            if target['prompt'] != clip['prompt'] or target['category'] != category:
                raise ValueError('Original question changed: ' + clip['id'])
            if target['spokenPrompt'] != clip['spokenPrompt']:
                requests.append({**target, 'previousSpokenPrompt': clip['spokenPrompt'],
                                 'previousFile': clip['file'], 'previousSha256': clip['sha256']})
    if questions:
        raise ValueError('Revision bank contains questions missing from the app catalogs')
    write(manifest, {'questions': requests})
    return requests


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bank', type=Path, default=FOLDER / 'questions-interviewer-wording-review-20261106.json')
    parser.add_argument('--output', type=Path, default=FOLDER / 'wording-audio-20261106')
    parser.add_argument('--device', choices=('auto', 'cpu', 'cuda'), default='auto')
    parser.add_argument('--precision', choices=('auto', 'float32', 'float16'), default='auto')
    parser.add_argument('--attention', choices=('eager', 'sdpa'), default='sdpa')
    parser.add_argument('--limit', type=int, default=0)
    parser.add_argument('--id', action='append', default=[])
    parser.add_argument('--regenerate-id', action='append', default=[],
                        help='Replace a reused recording with a newly synthesized candidate')
    args = parser.parse_args()
    if args.limit < 0:
        parser.error('--limit must not be negative')
    requests = prepare_requests(args.bank, args.output)
    import numpy as np
    import soundfile as sf
    import torch
    from huggingface_hub import snapshot_download
    from qwen_tts import Qwen3TTSModel

    torch.set_num_threads(4)
    device = 'cuda:0' if args.device != 'cpu' and torch.cuda.is_available() else 'cpu'
    if args.device == 'cuda' and device == 'cpu':
        raise RuntimeError('CUDA was requested but is unavailable')
    dtype = torch.float16 if device.startswith('cuda') else torch.float32
    if args.precision != 'auto':
        dtype = getattr(torch, args.precision)
    original = ROOT / 'native/android/interview/src/debug/assets/interview-question-audio'
    reference = next(q for q in read(original / 'catalog.json')['clips'] if q['id'] == 'practice-job-1')
    reference_path = original / reference['file']
    provenance = {'model': MODEL, 'revision': REVISION, 'backend': 'qwen-tts-pytorch',
                  'device': device, 'dtype': str(dtype), 'torch': torch.__version__,
                  'reference': reference, 'referenceSha256': digest(reference_path.read_bytes()),
                  'language': 'Korean', 'temperature': 0.5, 'maxNewTokens': 512,
                  'doSample': True, 'nonStreamingMode': False, 'seed': 42,
                  'reuseReviewedRecordings': True,
                  'attention': args.attention,
                  'voiceSimilarityHumanVerified': False}
    config = args.output / 'voice.json'
    if config.exists() and read(config) != provenance:
        raise ValueError('Generation settings changed; use a new output directory')
    write(config, provenance)
    reviewed = {q['id']: q for q in read(FOLDER / 'catalog.json')['clips']}
    pronunciations = read(ROOT / 'scripts/data/interview-audio-pronunciation-overrides.json')
    reused = 0
    pending = []
    for q in requests:
        pronunciation = pronunciations.get(q['id'])
        synthesis_text = q['spokenPrompt']
        seed = 42
        if pronunciation:
            if pronunciation['spokenPrompt'] != q['spokenPrompt']:
                raise ValueError('Pronunciation cue needs review: ' + q['id'])
            synthesis_text = pronunciation['synthesisText']
            seed = pronunciation.get('seed', 42)
            if not isinstance(seed, int) or not 0 <= seed < 2**31:
                raise ValueError('Invalid generation seed: ' + q['id'])
            if pronunciation_key(synthesis_text) != pronunciation_key(q['spokenPrompt']):
                raise ValueError('Pronunciation cues may change spacing or reviewed acronym spelling only: ' + q['id'])
        fingerprint_input = [q['id'], q['spokenPrompt'], provenance]
        if pronunciation:
            fingerprint_input.append(pronunciation)
        fingerprint = digest(json.dumps(fingerprint_input,
                                        ensure_ascii=False, sort_keys=True).encode('utf-8'))
        target = args.output / (q['id'] + '.wav')
        metadata = target.with_suffix('.json')
        if target.exists() and metadata.exists():
            entry = read(metadata)
            if (not (q['id'] in args.regenerate_id and entry.get('origin'))
                    and entry.get('fingerprint') == fingerprint
                    and entry.get('sha256') == digest(target.read_bytes())):
                continue
        if not args.id or q['id'] in args.id:
            existing = reviewed.get(q['id'])
            if (not pronunciation and q['id'] not in args.regenerate_id and existing and existing['prompt'] == q['prompt']
                    and existing['spokenPrompt'] == q['spokenPrompt']):
                source = FOLDER / existing['file']
                if digest(source.read_bytes()) != existing['sha256']:
                    raise ValueError('Reviewed recording checksum mismatch: ' + q['id'])
                samples, rate = sf.read(source, dtype='float32', always_2d=True)
                samples = samples.mean(axis=1)
                if rate != 24000:
                    import librosa
                    samples = librosa.resample(samples, orig_sr=rate, target_sr=24000)
                if not np.isfinite(samples).all() or len(samples) < 12000:
                    raise ValueError('Invalid reviewed recording: ' + q['id'])
                sf.write(target, samples, 24000, subtype='PCM_16')
                write(metadata, {**q, 'fingerprint': fingerprint,
                    'origin': {'provider': 'fish.audio', 'file': existing['file'],
                               'sha256': existing['sha256'], 'reusedReviewedRecording': True},
                    'seconds': len(samples) / 24000, 'generationSeconds': 0,
                    'sha256': digest(target.read_bytes())})
                reused += 1
                continue
            pending.append((q, fingerprint, target, metadata, synthesis_text, seed))
    if args.limit:
        pending = pending[:args.limit]
    print(json.dumps({'total': len(requests), 'reusedThisRun': reused,
                      'pendingThisRun': len(pending), 'device': device}), flush=True)
    if not pending:
        return
    model_path = snapshot_download(MODEL, revision=REVISION, local_files_only=True)
    print('Loading fixed-reference model', flush=True)
    model = Qwen3TTSModel.from_pretrained(model_path, device_map=device, dtype=dtype,
                                        attn_implementation=args.attention, low_cpu_mem_usage=True)
    with torch.inference_mode():
        prompt = model.create_voice_clone_prompt(ref_audio=str(reference_path),
                                                ref_text=reference['spokenPrompt'])
    for index, (q, fingerprint, target, metadata, synthesis_text, seed) in enumerate(pending, 1):
        started = time.monotonic()
        torch.manual_seed(seed)
        with torch.inference_mode():
            waves, rate = model.generate_voice_clone(text=synthesis_text, language='Korean',
                voice_clone_prompt=prompt, temperature=0.5, max_new_tokens=512,
                do_sample=True, subtalker_dosample=True, non_streaming_mode=False)
        samples = np.asarray(waves[0], dtype=np.float32).reshape(-1)
        rms = float(np.sqrt(np.mean(samples ** 2)))
        if (rate != 24000 or not np.isfinite(samples).all() or len(samples) < rate / 2
                or len(samples) > rate * 35 or rms < 0.001):
            raise ValueError('Invalid generated audio: ' + q['id'])
        temporary = target.with_suffix('.partial.wav')
        sf.write(temporary, samples, rate, subtype='PCM_16')
        temporary.replace(target)
        write(metadata, {**q, 'fingerprint': fingerprint, 'seconds': len(samples) / rate,
                         'generationSeed': seed,
                         **({'synthesisText': synthesis_text} if synthesis_text != q['spokenPrompt'] else {}),
                         'generationSeconds': time.monotonic() - started, 'rms': rms,
                         'sha256': digest(target.read_bytes())})
        print(json.dumps({'id': q['id'], 'doneThisRun': index, 'remainingThisRun': len(pending)-index,
                          'seconds': round(len(samples) / rate, 2),
                          'generationSeconds': round(time.monotonic()-started, 2)}), flush=True)


if __name__ == '__main__':
    main()
