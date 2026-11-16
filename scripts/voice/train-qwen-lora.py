"""Local 1.7B LoRA training, using Qwen's official dataset and SFT loss.

The original model remains immutable; only adapters are saved. CPU float32
replaces the official example's GPU bf16/FlashAttention settings.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / '.tmp/qwen-tts-local'
OUT = ROOT / 'artifacts/qwen-tts-local'
os.environ['HF_HOME'] = str(WORK / 'cache/huggingface')
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
os.environ['TOKENIZERS_PARALLELISM'] = 'false'
import numpy as np
import soundfile as sf
import torch
from peft import LoraConfig, PeftModel, get_peft_model
from qwen_tts import Qwen3TTSModel, Qwen3TTSTokenizer

MODEL = WORK / 'cache/huggingface/hub/models--Qwen--Qwen3-TTS-12Hz-1.7B-Base/snapshots/fd4b254389122332181a7c3db7f27e918eec64e3'
DATA = OUT / 'training-candidates'
RUN = OUT / 'lora-1p7b'
torch.set_num_threads(4)
torch.manual_seed(20261030)

def write(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding='utf-8')
    temporary.replace(path)

def rows(split):
    return [json.loads(s) for s in (DATA / f'{split}-raw.jsonl').read_text(encoding='utf-8').splitlines()]

def prepare():
    tokenizer = None
    for split in ['train', 'validation']:
        result = []
        dest = DATA / f'{split}-codes.jsonl'
        for row in rows(split):
            cache = DATA / (Path(row['audio']).stem + '.codes.json')
            digest = hashlib.sha256(Path(row['audio']).read_bytes()).hexdigest()
            item = json.loads(cache.read_text(encoding='utf-8')) if cache.exists() else {}
            if item.get('sha256') != digest:
                if tokenizer is None:
                    tokenizer = Qwen3TTSTokenizer.from_pretrained(str(MODEL / 'speech_tokenizer'), device_map='cpu')
                with torch.inference_mode():
                    codes = tokenizer.encode(row['audio']).audio_codes[0].cpu().tolist()
                item = {'sha256': digest, 'codes': codes}
                write(cache, item)
            result.append(dict(row, language='Korean', audio_codes=item['codes']))
            print('Encoded', split, len(result), flush=True)
        dest.write_text(''.join(json.dumps(r, ensure_ascii=False) + '\n' for r in result), encoding='utf-8')

def load_model():
    return Qwen3TTSModel.from_pretrained(str(MODEL), device_map='cpu', dtype=torch.float32,
                                        attn_implementation='eager', low_cpu_mem_usage=True)

def train(epochs):
    # Dataset source was downloaded from QwenLM/Qwen3-TTS/finetuning and reviewed.
    spec = importlib.util.spec_from_file_location('official_qwen_dataset', Path(__file__).parent / 'vendor/qwen_dataset.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    qwen = load_model()
    config = LoraConfig(r=8, lora_alpha=16, lora_dropout=0.05, bias='none',
        target_modules=r'talker\.model\.layers\.\d+\.self_attn\.(q_proj|v_proj)')
    adapted = get_peft_model(qwen.model, config)
    model = adapted.get_base_model()
    adapted.print_trainable_parameters()
    model.talker.config.use_cache = False
    # Cache frozen conditioning once; gradients still flow through every LoRA layer.
    prepared = {}
    with torch.no_grad():
        for split in ['train', 'validation']:
            data = [json.loads(s) for s in (DATA / f'{split}-codes.jsonl').read_text(encoding='utf-8').splitlines()]
            dataset = module.TTSDataset(data, qwen.processor, model.config)
            prepared[split] = []
            for index in range(len(dataset)):
                b = dataset.collate_fn([dataset[index]])
                speaker = model.speaker_encoder(b['ref_mels']).detach()
                emb = model.talker.model.text_embedding(b['input_ids'][:, :, 0]) * b['text_embedding_mask']
                codec = model.talker.model.codec_embedding(b['input_ids'][:, :, 1]) * b['codec_embedding_mask']
                codec[:, 6, :] = speaker
                emb = emb + codec
                for i in range(1, 16):
                    emb = emb + model.talker.code_predictor.get_input_embeddings()[i-1](b['codec_ids'][:, :, i]) * b['codec_mask'].unsqueeze(-1)
                prepared[split].append((emb.detach(), b))
            print('Prepared', split, len(prepared[split]), flush=True)

    def loss_for(item):
        emb, b = item
        outputs = model.talker(inputs_embeds=emb[:, :-1], attention_mask=b['attention_mask'][:, :-1],
            labels=b['codec_0_labels'][:, 1:], output_hidden_states=True, use_cache=False)
        hidden = outputs.hidden_states[0][-1][b['codec_mask'][:, :-1]]
        _, subloss = model.talker.forward_sub_talker_finetune(b['codec_ids'][b['codec_mask']], hidden)
        return outputs.loss + 0.3 * subloss

    optimizer = torch.optim.AdamW([p for p in adapted.parameters() if p.requires_grad], lr=2e-5, weight_decay=0.01)
    history = []
    best = float('inf')
    started = time.time()
    adapted.eval()
    with torch.no_grad():
        baseline = sum(float(loss_for(x)) for x in prepared['validation']) / len(prepared['validation'])
    print('Baseline validation loss', baseline, flush=True)
    write(RUN / 'status.json', {'status': 'training', 'baselineValidationLoss': baseline, 'epochs': epochs})
    for epoch in range(epochs):
        adapted.train()
        losses = []
        order = torch.randperm(len(prepared['train'])).tolist()
        optimizer.zero_grad(set_to_none=True)
        for step, index in enumerate(order):
            loss = loss_for(prepared['train'][index])
            if not torch.isfinite(loss):
                raise RuntimeError('Non-finite training loss')
            (loss / 4).backward()
            losses.append(float(loss.detach()))
            if (step + 1) % 4 == 0 or step + 1 == len(order):
                torch.nn.utils.clip_grad_norm_([p for p in adapted.parameters() if p.requires_grad], 1.0)
                optimizer.step()
                optimizer.zero_grad(set_to_none=True)
            print(f'Epoch {epoch+1}/{epochs} step {step+1}/{len(order)} loss={losses[-1]:.4f}', flush=True)
        adapted.eval()
        with torch.no_grad():
            validation = sum(float(loss_for(x)) for x in prepared['validation']) / len(prepared['validation'])
        metric = {'epoch': epoch + 1, 'trainLoss': sum(losses)/len(losses), 'validationLoss': validation}
        history.append(metric)
        if validation < best:
            best = validation
            adapted.save_pretrained(str(RUN / 'best'))
        adapted.save_pretrained(str(RUN / 'last'))
        write(RUN / 'status.json', {'status': 'complete' if epoch+1 == epochs else 'training',
            'method': 'LoRA r8 q/v main talker; official SFT loss', 'baseRevision': MODEL.name,
            'baselineValidationLoss': baseline, 'history': history, 'bestValidationLoss': best,
            'seconds': time.time()-started, 'device': 'cpu', 'finetuned': True,
            'datasetSha256': hashlib.sha256((DATA / 'train-codes.jsonl').read_bytes()).hexdigest()})
        print(json.dumps(metric), flush=True)

def generate():
    spec = importlib.util.spec_from_file_location('local_qwen', Path(__file__).with_name('qwen-local.py'))
    local = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(local)
    qwen = load_model()
    qwen.model = PeftModel.from_pretrained(qwen.model, str(RUN / 'best')).merge_and_unload()
    qwen.model.eval()
    # Match official SFT export: put the reference speaker embedding at token 3000
    # and use CustomVoice synthesis without an in-context reference transcript.
    prompt = qwen.create_voice_clone_prompt(ref_audio=str(OUT / 'reference-male.wav'), x_vector_only_mode=True)[0]
    with torch.no_grad():
        qwen.model.talker.model.codec_embedding.weight[3000].copy_(prompt.ref_spk_embedding)
    qwen.model.config.tts_model_type = 'custom_voice'
    qwen.model.tts_model_type = 'custom_voice'
    qwen.model.config.talker_config.spk_id = {'interview_male': 3000}
    qwen.model.config.talker_config.spk_is_dialect = {'interview_male': False}
    qwen.model.supported_speakers = ['interview_male']
    samples = []
    for i, text in enumerate(local.TARGETS, 1):
        torch.manual_seed(1800+i)
        started = time.time()
        with torch.inference_mode():
            waves, rate = qwen.generate_custom_voice(text=text, language='Auto', speaker='interview_male',
                max_new_tokens=512, do_sample=True)
        audio = np.asarray(waves[0], dtype=np.float32)
        if not np.isfinite(audio).all() or len(audio) < rate/2 or np.sqrt(np.mean(audio**2)) < 0.001:
            raise ValueError('Invalid trained sample')
        name = f'qwen-1p7b-trained-{i:02d}.wav'
        sf.write(OUT / name, audio, rate, subtype='PCM_16')
        samples.append({'file': name, 'text': text, 'sampleRate': rate, 'seconds': len(audio)/rate,
                        'generationSeconds': time.time()-started, 'finetuned': True})
        write(OUT / 'samples-trained.json', {'model': str(MODEL), 'adapter': str(RUN / 'best'),
            'adapterSha256': hashlib.sha256((RUN / 'best/adapter_model.safetensors').read_bytes()).hexdigest(),
            'inference': 'custom_voice, Auto language, speaker token 3000', 'samples': samples})
        print('Saved', name, flush=True)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['prepare', 'train', 'generate'])
    parser.add_argument('--epochs', type=int, default=3)
    args = parser.parse_args()
    if args.action == 'prepare': prepare()
    elif args.action == 'train': train(args.epochs)
    else: generate()
