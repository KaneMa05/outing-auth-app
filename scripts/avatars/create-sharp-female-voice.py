from pathlib import Path
import os,json
root=Path('/Users/ronpark/Documents/ChatGPT/RONPARK 관리반 APP')
os.environ['HF_HOME']=str(root/'.tmp/voice-local/huggingface')
from mlx_audio.tts.utils import load_model
from mlx_audio.audio_io import write
import mlx.core as mx,numpy as np
out=root/'artifacts/interview-avatars/lipsync-sample/interviewer-woman-sharp';out.mkdir(exist_ok=True)
model=load_model('mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-4bit')
style='A native Korean woman in her fifties, a perceptive senior interviewer asking a pointed question face to face. Mature female timbre with a focused, incisive, slightly bright edge and firm vocal presence. Precise crisp consonants, controlled intensity, alert and probing attitude, decisive falling sentence ending. Sound sharp-minded and demanding yet professionally composed, not shouting or angry. Natural fluent Seoul Korean with smoothly connected words and a brisk conversational rhythm. Deliver the question as one connected thought, with emphasis on 의견 차이 and 해결한 경험. Avoid breathy softness, childish high pitch, exaggerated theatrical diction, drawn-out syllables and word-by-word pauses.'

for seed in [73]:
 mx.random.seed(seed)
 for r in model.generate_voice_design(text='협업 중 의견 차이를 해결한 경험을 말씀해 주세요.',instruct=style,language='korean',temperature=0.65,max_tokens=250):
  a=np.asarray(r.audio).reshape(-1);write(str(out/f'candidate-{seed}.wav'),a,r.sample_rate)
  print(json.dumps({'seed':seed,'seconds':len(a)/r.sample_rate}),flush=True)
