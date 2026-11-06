from pathlib import Path
import os,json
root=Path('/Users/ronpark/Documents/ChatGPT/RONPARK 관리반 APP')
os.environ['HF_HOME']=str(root/'.tmp/voice-local/huggingface')
from mlx_audio.tts.utils import load_model
from mlx_audio.audio_io import write
import mlx.core as mx,numpy as np
out=root/'artifacts/interview-avatars/voice-comparison/local-mature-options';out.mkdir(parents=True,exist_ok=True)
model=load_model('mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-4bit')
text='협업 중 의견 차이를 해결한 경험을 말씀해 주세요.'
styles=[('a',51,'A Korean woman around fifty speaking naturally in a small interview room. An experienced teacher, observant and matter-of-fact. Mature mid-low female voice with clear resonance and a slightly dry texture. She asks a real question directly to one adult in front of her, with quiet confidence. Fluent native Seoul Korean. Speak in one smoothly connected phrase at a normal conversational pace, using natural Korean liaison and a brief decisive polite ending. No acting, no announcer cadence, no exaggerated stress, no pause between individual words.'),('b',92,'A native Korean woman in her late forties, a meticulous professional interviewer. Clear focused female voice with a firm, slightly bright edge, mature and composed. Sound interested in the answer but exacting, like a real person asking a practical question across a desk. Natural conversational Seoul Korean with connected phrasing and relaxed articulation, even brisk rhythm. Let the sentence flow without stopping after each word. Keep emotion subtle, ending politely and firmly. Not theatrical, not sing-song, not breathy.')]
for name,seed,style in styles:
 mx.random.seed(seed)
 for r in model.generate_voice_design(text=text,instruct=style,language='korean',temperature=0.6,max_tokens=250):
  a=np.asarray(r.audio).reshape(-1)
  if not np.isfinite(a).all():raise RuntimeError('Invalid generated audio')
  write(str(out/(name+'.wav')),a,r.sample_rate)
  (out/(name+'.json')).write_text(json.dumps({'text':text,'style':style,'seed':seed,'seconds':len(a)/r.sample_rate,'model':'mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-4bit','independentlyGenerated':True},ensure_ascii=False,indent=2))
  print(name,len(a)/r.sample_rate,flush=True)
