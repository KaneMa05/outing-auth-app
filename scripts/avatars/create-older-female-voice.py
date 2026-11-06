from pathlib import Path
import os,json
root=Path('/Users/ronpark/Documents/ChatGPT/RONPARK 관리반 APP')
os.environ['HF_HOME']=str(root/'.tmp/voice-local/huggingface')
from mlx_audio.tts.utils import load_model
from mlx_audio.audio_io import write
import mlx.core as mx,numpy as np
out=root/'artifacts/interview-avatars/lipsync-sample/interviewer-woman-older';out.mkdir(exist_ok=True)
model=load_model('mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-4bit')
style='A native Korean woman in her late fifties, an experienced senior interview panelist speaking to a candidate face to face. Clearly mature middle-aged female timbre, grounded low female register with rich chest resonance and a subtle natural grain. Calm authority, conversational and assured, lively rather than frail. Fluent everyday Seoul Korean, smooth connected phrasing with natural liaison. Say the whole question as one flowing thought, grouping words by meaning. Light natural emphasis on 의견 차이 and 해결한 경험. Only a brief breath at a clause boundary. Even conversational rhythm, warm human resonance, relaxed articulation, decisive but polite ending. Avoid isolated word-by-word reading, dramatic pauses, exaggerated diction, sing-song intonation and announcer delivery.'
for seed in [73]:
 mx.random.seed(seed)
 for r in model.generate_voice_design(text='협업 중 의견 차이를 해결한 경험을 말씀해 주세요.',instruct=style,language='korean',temperature=0.65,max_tokens=250):
  a=np.asarray(r.audio).reshape(-1);write(str(out/f'candidate-{seed}.wav'),a,r.sample_rate)
  print(json.dumps({'seed':seed,'seconds':len(a)/r.sample_rate}),flush=True)
