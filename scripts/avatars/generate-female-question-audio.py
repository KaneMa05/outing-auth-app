"""Resumable local generation against the approved voice; never modifies app assets."""
from pathlib import Path
import os,json,hashlib,argparse,time
root=Path(__file__).resolve().parents[2];shared=Path('/Users/ronpark/Documents/ChatGPT/RONPARK 관리반 APP')
os.environ.setdefault('HF_HOME',str(shared/'.tmp/voice-local/huggingface'))
from mlx_audio.tts.utils import load_model
from mlx_audio.audio_io import write
import mlx.core as mx,numpy as np
parser=argparse.ArgumentParser();parser.add_argument('--limit',type=int,default=0);args=parser.parse_args()
profile=json.loads((root/'scripts/avatars/profiles/interviewer-woman.json').read_text());reference=root/profile['referenceAudio']
assert hashlib.sha256(reference.read_bytes()).hexdigest()==profile['referenceSha256']
clips=json.loads((root/'native/ios/App/DebugResources/InterviewPracticeAudio/catalog.json').read_text())['clips'];out=root/'artifacts/interview-avatars/questions/interviewer-woman';out.mkdir(parents=True,exist_ok=True)
model=load_model('mlx-community/Qwen3-TTS-12Hz-0.6B-Base-4bit');done=0
for q in clips:
 fingerprint=hashlib.sha256((q['spokenPrompt']+profile['referenceSha256']).encode()).hexdigest();p=out/(q['id']+'.wav');meta=p.with_suffix('.json')
 if p.exists() and meta.exists() and json.loads(meta.read_text()).get('fingerprint')==fingerprint:continue
 if args.limit and done>=args.limit:break
 mx.random.seed(42);start=time.monotonic()
 for r in model.generate(text=q['spokenPrompt'],lang_code='korean',ref_audio=str(reference),ref_text=profile['referenceText'],temperature=0.5,max_tokens=800):
  a=np.asarray(r.audio).reshape(-1)
  if not np.isfinite(a).all() or len(a)<r.sample_rate//2:raise RuntimeError('Invalid audio '+q['id'])
  write(str(p),a,r.sample_rate)
  meta.write_text(json.dumps({**q,'fingerprint':fingerprint,'seconds':len(a)/r.sample_rate,'model':'mlx-community/Qwen3-TTS-12Hz-0.6B-Base-4bit','referenceSha256':profile['referenceSha256']},ensure_ascii=False,indent=2))
 done+=1;print(q['id'],round(time.monotonic()-start,1),flush=True);mx.clear_cache()
print('COMPLETE',done,flush=True)
