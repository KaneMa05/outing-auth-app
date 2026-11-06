from pathlib import Path
import av,cv2,numpy as np,subprocess,sys
root=Path('/Users/ronpark/Documents/ChatGPT/RONPARK 관리반 APP');p=root/'artifacts/interview-avatars/lipsync-sample/interviewer-woman-female-voice'
original=cv2.imread(str(p/'source.png'));lm=np.loadtxt(p/'landmarks.txt').reshape(-1,2)
x1,x2=int(lm[:,0].min()),int(lm[:,0].max());y2=int(lm[:,1].max());y1=max(0,int(2*lm[29,1]-y2))
y,x=np.mgrid[:256,:256]
# Preserve the original upper face and blend all four edges with a smooth cosine ramp.
d=np.minimum.reduce([(x-x1)/18,(x2-1-x)/18,(y-y1)/24,(y2-1-y)/22]);a=(.5-.5*np.cos(np.pi*np.clip(d,0,1)))[...,None]
upper=np.clip((y-lm[29,1]+12)/24,0,1)[...,None];a*=upper
c=av.open(str(p/'musetalk-silent.mp4'));out=av.open(str(p/'blended-silent.mp4'),'w');s=out.add_stream('libx264',rate=25);s.width=256;s.height=256;s.pix_fmt='yuv420p';s.options={'crf':'18'}
for frame in c.decode(video=0):
 generated=frame.to_ndarray(format='bgr24');result=np.clip(generated*a+original*(1-a),0,255).astype(np.uint8)
 for packet in s.encode(av.VideoFrame.from_ndarray(result,format='bgr24')):out.mux(packet)
for packet in s.encode():out.mux(packet)
out.close();c.close()
subprocess.run([str(root/'.tmp/avatar-local/bin/ffmpeg'),'-y','-i',str(p/'blended-silent.mp4'),'-i',str(p/'question.wav'),'-map','0:v','-map','1:a','-c:v','copy','-c:a','aac','-shortest',str(p/'musetalk-question-1.mp4')],check=True)
subprocess.run([sys.executable,str(root/'.tmp/avatar-local/female-voice-restore.py')],check=True)
