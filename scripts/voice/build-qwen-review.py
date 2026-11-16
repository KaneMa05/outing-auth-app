"""Build a local listening comparison without publishing audio."""
import html
import json
from pathlib import Path
import soundfile as sf

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'artifacts/qwen-tts-local'
manifest = json.loads((OUT / 'samples.json').read_text(encoding='utf-8'))
catalog = json.loads((ROOT / 'artifacts/interview-question-audio/catalog.json').read_text(encoding='utf-8'))
large_manifest = OUT / 'samples-1p7b.json'
large = json.loads(large_manifest.read_text(encoding='utf-8')) if large_manifest.exists() else {'samples': []}
trained_path = OUT / 'samples-trained.json'
trained = json.loads(trained_path.read_text(encoding='utf-8')) if trained_path.exists() else {'samples': []}
sections = []
for index, sample in enumerate(manifest['samples'], 1):
    original = next(q for q in catalog['clips'] if q['spokenPrompt'] == sample['text'])
    audio, rate = sf.read(ROOT / 'artifacts/interview-question-audio' / original['file'], dtype='float32')
    control = f'fish-control-{index:02d}.wav'
    sf.write(OUT / control, audio, rate, subtype='PCM_16')
    larger = next((r for r in large['samples'] if r['text'] == sample['text']), None)
    large_audio = f'<div><h3>Qwen 1.7B 복제</h3><audio controls preload="none" src="{html.escape(larger["file"])}"></audio><p>{larger["seconds"]:.2f}초 · CPU 생성 {larger["generationSeconds"]:.1f}초</p></div>' if larger else ''
    learned = next((r for r in trained['samples'] if r['text'] == sample['text']), None)
    if learned:
        large_audio += f'<div><h3>Qwen 1.7B 맞춤 학습 · LoRA</h3><audio controls preload="none" src="{html.escape(learned["file"])}"></audio><p>{learned["seconds"]:.2f}초 · CPU 생성 {learned["generationSeconds"]:.1f}초</p></div>'
    sections.append(f'<section><h2>{index}. {html.escape(sample["text"])}</h2><div class="pair"><div><h3>기존 Fish Audio</h3><audio controls preload="none" src="{control}"></audio></div><div><h3>Qwen 0.6B 복제 · 비교용</h3><audio controls preload="none" src="{html.escape(sample["file"])}"></audio><p>{sample["seconds"]:.2f}초 · CPU 생성 {sample["generationSeconds"]:.1f}초</p></div>{large_audio}</div></section>')
(OUT / 'review.html').write_text('''<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>면접관 음성 비교</title><style>body{max-width:1000px;margin:32px auto;padding:0 20px;font:16px/1.7 system-ui;color:#152c43;background:#f5f7fa}section{background:white;border:1px solid #dce4ec;border-radius:16px;padding:22px;margin:22px 0}.pair{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:24px}audio{width:100%}h2{font-size:20px}h3{font-size:16px}p{color:#536477}</style><h1>공채 면접관 음성 비교</h1><p>Qwen3-TTS Base · 기존 남성 음성 5.22초 참조 · CPU 실행</p><p>새 샘플은 미세 조정 학습을 완료한 모델이 아니라 참조 음성을 이용한 복제 결과입니다. 발음·속도·문장 끝 억양·음색의 자연스러움을 비교해 주세요. 운영 앱의 기존 음성은 교체하지 않았습니다.</p>''' + ''.join(sections) + '<section><h2>복제에 사용한 참조 음성</h2><audio controls preload="none" src="reference-male.wav"></audio></section></html>', encoding='utf-8')
print('Created local comparison:', OUT / 'review.html')
if trained['samples']:
    page = OUT / 'review.html'
    content = page.read_text(encoding='utf-8')
    content = content.replace('새 샘플은 미세 조정 학습을 완료한 모델이 아니라 참조 음성을 이용한 복제 결과입니다.',
        '‘맞춤 학습 · LoRA’는 공채 직무 음성 28개로 학습하고 별도 4개로 검증한 결과입니다. 다른 Qwen 항목은 학습 전 참조 복제 결과입니다.')
    content = content.replace('</h1>', '</h1><p>학습은 완료됐지만 자동 전사에서 ‘임무→인물’, ‘폭언→포근’으로 인식되는 현상이 남아 있습니다. 전사 오류일 수도 있으므로 해당 단어의 실제 발음을 들어 확인해 주세요. 검증 손실 감소는 자연스러움의 향상을 보장하지 않습니다.</p>', 1)
    page.write_text(content, encoding='utf-8')
