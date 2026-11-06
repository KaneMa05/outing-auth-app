from pathlib import Path
import shutil,os,subprocess
root=Path('/Users/ronpark/Documents/ChatGPT/RONPARK 관리반 APP');cache=root/'.tmp/avatar-local';folder=root/'artifacts/interview-avatars/lipsync-sample';out=folder/'interviewer-woman-connected'
for f in ['source.png','landmarks.txt']:shutil.copy2(folder/'interviewer-woman'/f,out/f)
for name,original in [('render','firm-render.py'),('restore','interviewer-woman-firm-restore.py'),('blend','interviewer-woman-firm-blend.py')]:
 code=(cache/original).read_text().replace('interviewer-woman-firm','interviewer-woman-connected')
 path=cache/f'interviewer-woman-connected-{name}.py';path.write_text(code)
 if name!='restore':subprocess.run([str(cache/'venv/bin/python'),str(path)],check=True,env={**os.environ,'PYTORCH_ENABLE_MPS_FALLBACK':'1'})
print('COMPLETE',flush=True)
