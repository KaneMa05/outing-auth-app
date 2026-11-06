from pathlib import Path
import subprocess,os,shutil
root=Path('/Users/ronpark/Documents/ChatGPT/RONPARK 관리반 APP');cache=root/'.tmp/avatar-local';folder=root/'artifacts/interview-avatars/lipsync-sample';out=folder/'interviewer-woman-female-voice'
for name in ['source.png','landmarks.txt']:shutil.copy2(folder/'interviewer-woman'/name,out/name)
for stage in ['render','restore']:
 s=(cache/f'interviewer-woman-{stage}.py').read_text().replace('lipsync-sample/interviewer-woman','lipsync-sample/interviewer-woman-female-voice')
 if stage=='render':s=s.replace("audio=root/'native/android/interview/src/debug/res/raw/interview_question_1.mp3'","audio=out/'question.wav'")
 script=cache/f'female-voice-{stage}.py';script.write_text(s)
 subprocess.run([str(cache/'venv/bin/python'),str(script)],check=True,env={**os.environ,'PYTORCH_ENABLE_MPS_FALLBACK':'1'})
(out/'voice.txt').write_text('Voice: macOS Yuna, Korean female, rate 165.\nText: 협업 중 의견 차이를 해결한 경험을 말씀해 주세요.\nMuseTalk 1.5, GFPGAN mouth restoration.\n')
