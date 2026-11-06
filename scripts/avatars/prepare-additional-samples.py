from pathlib import Path
import os,sys
import torchvision.transforms.functional as F
sys.modules['torchvision.transforms.functional_tensor']=F
import cv2,numpy as np
from PIL import Image
root=Path('/Users/ronpark/Documents/ChatGPT/RONPARK 관리반 APP');repo=root/'.tmp/avatar-local/SadTalker'
os.chdir(repo);sys.path.insert(0,str(repo))
from src.utils.croper import Preprocesser
cropper=Preprocesser('cpu')
for name in ['interviewer-woman','interviewer-man-2']:
 out=root/'artifacts/interview-avatars/lipsync-sample'/name;out.mkdir(exist_ok=True)
 src=cv2.cvtColor(cv2.imread(str(root/'artifacts/interview-avatars/sources'/f'{name}.png')),cv2.COLOR_BGR2RGB)
 frames,_,_=cropper.crop([src],xsize=512)
 frame=cv2.resize(frames[0],(256,256))
 Image.fromarray(frame).save(out/'source.png')
 cropper.predictor.extract_keypoint([Image.fromarray(frame)],str(out/'landmarks.txt'))
 print(name,flush=True)
