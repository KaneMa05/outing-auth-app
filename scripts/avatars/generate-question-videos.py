"""Resume question videos using approved face, lip-sync and boundary restoration."""
from pathlib import Path
import json,shutil,subprocess,os,argparse,hashlib
root=Path(__file__).resolve().parents[2];shared=Path('/Users/ronpark/Documents/ChatGPT/RONPARK 관리반 APP');cache=shared/'.tmp/avatar-local';folder=shared/'artifacts/interview-avatars/lipsync-sample'
audio=root/'artifacts/interview-avatars/questions/interviewer-woman';out=root/'artifacts/interview-avatars/question-video/interviewer-woman';out.mkdir(parents=True,exist_ok=True)
parser=argparse.ArgumentParser();parser.add_argument('--limit',type=int,default=0);args=parser.parse_args();done=0
clips=json.loads((root/'native/ios/App/DebugResources/InterviewPracticeAudio/catalog.json').read_text())['clips']
for q in clips:
 wav=audio/(q['id']+'.wav');target=out/(q['id']+'.mp4');meta=target.with_suffix('.json')
 if not wav.exists():raise RuntimeError('Missing audio '+q['id'])
 sha=hashlib.sha256(wav.read_bytes()).hexdigest()
 if target.exists() and meta.exists() and json.loads(meta.read_text()).get('audioSha256')==sha:continue
 if args.limit and done>=args.limit:break
 name='bank-'+q['id'];work=folder/name;work.mkdir(exist_ok=True)
 for f in ['source.png','landmarks.txt']:shutil.copy2(folder/'interviewer-woman'/f,work/f)
 shutil.copy2(wav,work/'question.wav')
 for stage,template in [('render','firm-render.py'),('restore','interviewer-woman-firm-restore.py'),('blend','interviewer-woman-firm-blend.py')]:
  code=(cache/template).read_text().replace('interviewer-woman-firm',name)
  script=cache/(name+'-'+stage+'.py');script.write_text(code)
  if stage!='restore':
   with (work/(stage+'.log')).open('w') as log:subprocess.run([str(cache/'venv/bin/python'),str(script)],check=True,stdout=log,stderr=subprocess.STDOUT,env={**os.environ,'PYTORCH_ENABLE_MPS_FALLBACK':'1'})
 result=work/'musetalk-question-1-restored.mp4'
 import av
 c=av.open(str(result));assert len(c.streams.audio)==1 and len(c.streams.video)==1
 durations=[float(s.duration*s.time_base) for s in c.streams];assert abs(durations[0]-durations[1])<.15;c.close()
 shutil.copy2(result,target)
 meta.write_text(json.dumps({'id':q['id'],'audioSha256':sha,'seconds':durations[0],'pipeline':'MuseTalk1.5-soft-boundaries-GFPGAN1.4'},indent=2))
 done+=1;print('COMPLETE',q['id'],done,flush=True)
print('BATCH COMPLETE',done,flush=True)
