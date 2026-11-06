from pathlib import Path
import sys,time,subprocess
import torch,torchvision.transforms.functional as functional
sys.modules['torchvision.transforms.functional_tensor']=functional
from gfpgan.archs.gfpganv1_clean_arch import GFPGANv1Clean
import av,cv2,numpy as np
root=Path('/Users/ronpark/Documents/ChatGPT/RONPARK 관리반 APP')
p=root/'artifacts/interview-avatars/lipsync-sample';start=time.monotonic()
model=GFPGANv1Clean(out_size=512,num_style_feat=512,channel_multiplier=2,decoder_load_path=None,fix_decoder=False,num_mlp=8,input_is_latent=True,different_w=True,narrow=1,sft_half=True)
state=torch.load(root/'.tmp/avatar-local/SadTalker/gfpgan/weights/GFPGANv1.4.pth',map_location='cpu',weights_only=True)
model.load_state_dict(state['params_ema']);model=model.eval().to('mps')
c=av.open(str(p/'musetalk-question-1.mp4'));out=av.open(str(p/'restored-silent.mp4'),'w');stream=out.add_stream('libx264',rate=25);stream.width=512;stream.height=512;stream.pix_fmt='yuv420p';stream.options={'crf':'18'}
y,x=np.mgrid[:512,:512];mask=np.exp(-(((x-256)/115)**4+((y-363)/90)**4)).astype(np.float32)[...,None]*0.8
with torch.inference_mode():
 for i,frame in enumerate(c.decode(video=0)):
  src=cv2.resize(frame.to_ndarray(format='rgb24'),(512,512),interpolation=cv2.INTER_CUBIC)
  tensor=torch.from_numpy(src.copy()).permute(2,0,1).unsqueeze(0).float().to('mps')/127.5-1
  restored=model(tensor,return_rgb=False,weight=0.5)[0].clamp(-1,1).add(1).mul(127.5)[0].permute(1,2,0).cpu().numpy()
  result=np.clip(src*(1-mask)+restored*mask,0,255).astype(np.uint8)
  for packet in stream.encode(av.VideoFrame.from_ndarray(result,format='rgb24')):out.mux(packet)
  if i==25:cv2.imwrite(str(p/'restored-preview.jpg'),cv2.cvtColor(result,cv2.COLOR_RGB2BGR))
  if i%20==0:print(i,round(time.monotonic()-start,1),flush=True)
 for packet in stream.encode():out.mux(packet)
out.close();c.close()
subprocess.run([str(root/'.tmp/avatar-local/bin/ffmpeg'),'-y','-i',str(p/'restored-silent.mp4'),'-i',str(p/'musetalk-question-1.mp4'),'-map','0:v','-map','1:a','-c','copy','-movflags','+faststart',str(p/'musetalk-question-1-restored.mp4')],check=True)
print('COMPLETE',time.monotonic()-start)
