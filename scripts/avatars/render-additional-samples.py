from pathlib import Path
import subprocess,os
root=Path('/Users/ronpark/Documents/ChatGPT/RONPARK 관리반 APP');work=root/'.worktrees/ios-app';cache=root/'.tmp/avatar-local'
base=(root/'scripts/avatars/render-musetalk-sample.py').read_text()
restore=(work/'scripts/avatars/restore-lipsync-sample.py').read_text()
for name in ['interviewer-woman','interviewer-man-2']:
 s=base.replace("root=Path(__file__).resolve().parents[2]",f'root=Path({str(root)!r})')
 s=s.replace("out=root/'artifacts/interview-avatars/lipsync-sample'",f"out=root/'artifacts/interview-avatars/lipsync-sample/{name}'")
 s=s.replace('2026_10_30_10.28.20/first_frame_dir/interviewer-man-1.png','source.png').replace('2026_10_30_10.28.20/first_frame_dir/interviewer-man-1_landmarks.txt','landmarks.txt')
 r=restore.replace("p=root/'artifacts/interview-avatars/lipsync-sample'",f"p=root/'artifacts/interview-avatars/lipsync-sample/{name}'")
 for stage,code in [('render',s),('restore',r)]:
  script=cache/f'{name}-{stage}.py';script.write_text(code)
  print(name,stage,flush=True)
  subprocess.run([str(cache/'venv/bin/python'),str(script)],check=True,env={**os.environ,'PYTORCH_ENABLE_MPS_FALLBACK':'1'})
print('ALL COMPLETE',flush=True)
