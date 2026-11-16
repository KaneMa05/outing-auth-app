"""Local-only Fish reference preparation and Qwen voice-clone smoke tests.

No uploads, paid APIs, production asset replacement, or automatic fine-tuning.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import time

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / '.tmp/qwen-tts-local'
OUT = ROOT / 'artifacts/qwen-tts-local'
os.environ.setdefault('HF_HOME', str(WORK / 'cache/huggingface'))
os.environ.setdefault('HF_HUB_DISABLE_TELEMETRY', '1')
os.environ.setdefault('HF_HUB_DISABLE_XET', '1')
MODEL = 'Qwen/Qwen3-TTS-12Hz-0.6B-Base'
REVISION = '5d83992436eae1d760afd27aff78a71d676296fc'
MODELS = {'0.6B': (MODEL, REVISION), '1.7B': ('Qwen/Qwen3-TTS-12Hz-1.7B-Base', 'fd4b254389122332181a7c3db7f27e918eec64e3')}
REFERENCE_ID = 'q-044d865aaf027ad5d5e391b4'
TARGETS = [
    '해양경찰의 임무를 설명해 주세요.',
    '민원인이 폭언하면 어떻게 대응하겠습니까?',
    '연안사고 예방에 관한 법률이 제정된 이유를 설명해 주세요.',
]


def save_json(name, value):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')


def prepare():
    import numpy as np
    import soundfile as sf
    import librosa
    catalog = json.loads((ROOT / 'artifacts/interview-question-audio/catalog.json').read_text(encoding='utf-8'))
    reference = next(q for q in catalog['clips'] if q['id'] == REFERENCE_ID)
    source = ROOT / 'artifacts/interview-question-audio' / reference['file']
    audio, rate = sf.read(source, dtype='float32', always_2d=True)
    audio = audio.mean(axis=1)
    if rate != 24000:
        audio = librosa.resample(audio, orig_sr=rate, target_sr=24000)
    if not np.isfinite(audio).all() or len(audio) < 3 * 24000:
        raise ValueError('Reference must contain at least three seconds of valid audio')
    peak = float(np.max(np.abs(audio)))
    if peak < 0.01:
        raise ValueError('Reference is silent')
    audio = audio * min(1.0, 0.9 / peak)
    OUT.mkdir(parents=True, exist_ok=True)
    sf.write(OUT / 'reference-male.wav', audio, 24000, subtype='PCM_16')
    save_json('reference.json', {'id': reference['id'], 'text': reference['spokenPrompt'],
        'source': str(source.relative_to(ROOT)), 'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'seconds': len(audio) / 24000, 'sampleRate': 24000, 'voice': 'existing Fish Audio male',
        'usage': 'user-selected local reference; synthetic speech, not an original human training recording'})
    print('Reference prepared:', round(len(audio) / 24000, 2), 'seconds', flush=True)


def generate(args):
    import numpy as np
    import soundfile as sf
    import torch
    from huggingface_hub import snapshot_download
    from qwen_tts import Qwen3TTSModel
    if not (OUT / 'reference-male.wav').exists():
        prepare()
    reference = json.loads((OUT / 'reference.json').read_text(encoding='utf-8'))
    model_id, revision = MODELS[args.model_size]
    large = args.model_size == '1.7B'
    prefix = 'qwen-1p7b-clone' if large else 'qwen-clone'
    manifest_name = 'samples-1p7b.json' if large else 'samples.json'
    gpu = torch.cuda.is_available()
    device = 'cuda:0' if gpu and args.device != 'cpu' else 'cpu'
    dtype = torch.float16 if device.startswith('cuda') else torch.float32
    hardware = {'torch': torch.__version__, 'device': device, 'dtype': str(dtype), 'cuda': torch.version.cuda,
        'model': model_id, 'revision': revision, 'finetuned': False}
    if gpu:
        free, total = torch.cuda.mem_get_info()
        hardware.update(gpu=torch.cuda.get_device_name(0), freeVram=free, totalVram=total)
    save_json('hardware-1p7b.json' if large else 'hardware.json', hardware)
    print(json.dumps(hardware), flush=True)
    model_dir = snapshot_download(model_id, revision=revision,
        allow_patterns=['*.json', '*.txt', '*.safetensors', 'speech_tokenizer/*'])
    print('Loading model', flush=True)
    model = Qwen3TTSModel.from_pretrained(model_dir, device_map=device, dtype=dtype,
        attn_implementation='eager', low_cpu_mem_usage=True)
    results = []
    manifest = OUT / manifest_name
    if manifest.exists():
        previous = json.loads(manifest.read_text(encoding='utf-8'))
        if previous.get('revision') == revision and previous.get('reference', {}).get('sourceSha256') == reference['sourceSha256']:
            results = previous.get('samples', [])
    for index, text in enumerate(TARGETS[:args.count], 1):
        filename = f'{prefix}-{index:02d}.wav'
        existing = next((r for r in results if r.get('file') == filename and r.get('text') == text), None)
        if existing and (OUT / filename).exists():
            info = sf.info(OUT / filename)
            if info.frames > info.samplerate / 2:
                print('Reusing verified sample', filename, flush=True)
                continue
        torch.manual_seed(1800 + index)
        started = time.perf_counter()
        print('Generating', index, text, flush=True)
        with torch.inference_mode():
            waves, rate = model.generate_voice_clone(text=text, language='Korean',
                ref_audio=str(OUT / 'reference-male.wav'), ref_text=reference['text'],
                max_new_tokens=512, do_sample=large)
        audio = np.asarray(waves[0], dtype=np.float32)
        if not np.isfinite(audio).all() or len(audio) < rate / 2:
            raise ValueError('Invalid synthesized audio')
        rms = float(np.sqrt(np.mean(audio ** 2)))
        if rms < 0.001:
            raise ValueError('Synthesized audio is silent')
        sf.write(OUT / filename, audio, rate, subtype='PCM_16')
        results = [r for r in results if r.get('file') != filename]
        results.append({'file': filename, 'text': text, 'sampleRate': rate,
            'seconds': len(audio) / rate, 'generationSeconds': time.perf_counter() - started,
            'rms': rms, 'peak': float(np.max(np.abs(audio))), 'finetuned': False})
        save_json(manifest_name, {'model': model_id, 'revision': revision, 'reference': reference, 'samples': results})
        print('Saved', filename, results[-1]['generationSeconds'], flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['prepare', 'generate'])
    parser.add_argument('--device', choices=['auto', 'cpu'], default='auto')
    parser.add_argument('--count', type=int, choices=[1, 2, 3], default=3)
    parser.add_argument('--model-size', choices=['0.6B', '1.7B'], default='0.6B')
    options = parser.parse_args()
    if options.action == 'prepare':
        prepare()
    else:
        generate(options)
