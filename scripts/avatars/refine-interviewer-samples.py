from pathlib import Path
import subprocess,os,shutil
root=Path('/Users/ronpark/Documents/ChatGPT/RONPARK 관리반 APP');work=root/'.worktrees/ios-app';cache=root/'.tmp/avatar-local';folder=root/'artifacts/interview-avatars/lipsync-sample'
blend=(work/'scripts/avatars/blend-sample-boundaries.py').read_text()
restore=(work/'scripts/avatars/restore-lipsync-sample.py').read_text()
def run(code,name):
 p=cache/(name+'.py');p.write_text(code);subprocess.run([str(cache/'venv/bin/python'),str(p)],check=True,env={**os.environ,'PYTORCH_ENABLE_MPS_FALLBACK':'1'})
for name in ['interviewer-man-1-blended','interviewer-man-2-blended','interviewer-woman-firm']:
 out=folder/name;out.mkdir(exist_ok=True)
 if name=='interviewer-man-1-blended':
  src=folder/'2026_10_30_10.28.20/first_frame_dir'
  shutil.copy2(src/'interviewer-man-1.png',out/'source.png');shutil.copy2(src/'interviewer-man-1_landmarks.txt',out/'landmarks.txt');shutil.copy2(folder/'musetalk-silent.mp4',out/'musetalk-silent.mp4')
 else:
  src=folder/('interviewer-man-2' if name.startswith('interviewer-man') else 'interviewer-woman')
  for f in ['source.png','landmarks.txt']:shutil.copy2(src/f,out/f)
  if name.startswith('interviewer-man'):shutil.copy2(src/'musetalk-silent.mp4',out/'musetalk-silent.mp4')
 if name.startswith('interviewer-man'):
  subprocess.run([str(cache/'bin/ffmpeg'),'-y','-i',str(root/'native/android/interview/src/debug/res/raw/interview_question_1.mp3'),str(out/'question.wav')],check=True)
 else:
  code=(cache/'female-voice-render.py').read_text().replace('lipsync-sample/interviewer-woman-female-voice',f'lipsync-sample/{name}')
  run(code,'firm-render')
 r=restore.replace("p=root/'artifacts/interview-avatars/lipsync-sample'",f"p=root/'artifacts/interview-avatars/lipsync-sample/{name}'")
 rp=cache/(name+'-restore.py');rp.write_text(r)
 b=blend.replace('lipsync-sample/interviewer-woman-female-voice',f'lipsync-sample/{name}').replace('.tmp/avatar-local/female-voice-restore.py',f'.tmp/avatar-local/{name}-restore.py')
 run(b,name+'-blend')
 print('FINISHED',name,flush=True)
