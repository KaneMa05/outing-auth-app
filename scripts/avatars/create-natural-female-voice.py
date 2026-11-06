from pathlib import Path
import os
root=Path('/Users/ronpark/Documents/ChatGPT/RONPARK 관리반 APP')
os.environ['HF_HOME']=str(root/'.tmp/voice-local/huggingface');os.environ['HF_HUB_DISABLE_XET']='1'
from mlx_audio.tts.utils import load_model
import mlx.core as mx,numpy as np
from mlx_audio.audio_io import write
out=root/'artifacts/interview-avatars/lipsync-sample/interviewer-woman-natural';out.mkdir(exist_ok=True)
model=load_model('mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-4bit');mx.random.seed(42)
for r in model.generate_custom_voice(text='협업 중 의견 차이를 해결한 경험을 말씀해 주세요.',speaker='sohee',language='korean',temperature=0.5,max_tokens=300):
 write(str(out/'question.wav'),np.asarray(r.audio).reshape(-1),r.sample_rate)
print('VOICE COMPLETE',flush=True)
