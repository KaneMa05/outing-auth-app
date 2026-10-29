"""Render reusable silent interviewer loops using LivePortrait + MediaPipe locally.

Requires the isolated environment in .tmp/avatar-local; no InsightFace models,
network inference, microphone, or webcam. Source portraits must be user-owned.
"""
import argparse
import importlib.util
import math
import sys
import time
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2])
parser.add_argument('--names', nargs='+', default=['interviewer-woman', 'interviewer-man-1', 'interviewer-man-2'])
parser.add_argument('--fps', type=int, default=20)
parser.add_argument('--seconds', type=float, default=8)
parser.add_argument('--limit-frames', type=int)
args = parser.parse_args()
root = args.root.resolve()
workspace = root / '.tmp/avatar-local'
sys.path.insert(0, str(workspace / 'ComfyUI'))
# Comfy's CLI must not consume the renderer's arguments.
sys.argv = [sys.argv[0]]
import av
import cv2
import numpy as np
import torch
from PIL import Image, ImageOps
assert torch.backends.mps.is_available(), 'Run with access to the Mac GPU'
spec = importlib.util.spec_from_file_location('local_liveportrait', workspace / 'ComfyUI-LivePortraitKJ/__init__.py', submodule_search_locations=[str(workspace / 'ComfyUI-LivePortraitKJ')])
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
from local_liveportrait.nodes import DownloadAndLoadLivePortraitModels
from local_liveportrait.liveportrait.utils.cropper import CropperMediaPipe
from local_liveportrait.liveportrait.utils.camera import get_rotation_matrix
from local_liveportrait.liveportrait.utils.retargeting_utils import calc_eye_close_ratio

started = time.monotonic()
pipeline = DownloadAndLoadLivePortraitModels().loadmodel(precision='fp32')[0]
wrapper = pipeline.live_portrait_wrapper
cropper = CropperMediaPipe(onnx_device='CPU')
mask = cv2.imread(str(workspace / 'ComfyUI-LivePortraitKJ/liveportrait/utils/resources/mask_template.png')).astype(np.float32) / 255
output_dir = root / 'artifacts/interview-avatars/local-motion'
output_dir.mkdir(parents=True, exist_ok=True)
width, height = 512, 896
frames = round(args.seconds * args.fps)
if args.limit_frames: frames = min(frames, args.limit_frames)

with torch.inference_mode():
    for name in args.names:
        if name not in ['interviewer-woman', 'interviewer-man-1', 'interviewer-man-2']:
            raise ValueError('Unknown interviewer')
        image = Image.open(root / 'artifacts/interview-avatars/sources' / (name + '.png')).convert('RGB')
        source = np.array(ImageOps.fit(image, (width, height), Image.Resampling.LANCZOS))
        crop, cropped = cropper.crop_single_image(source, 512, 2.3, -0.125, 0, 0, 'large-small', True)
        if not crop: raise RuntimeError(f'No frontal face found in {name}')
        prepared = wrapper.prepare_source(cropped)
        info = wrapper.get_kp_info(prepared)
        source_kp = wrapper.transform_keypoint(info)
        features = wrapper.extract_feature_3d(prepared)
        landmarks = crop['lmk_crop']
        eye_ratio = float(calc_eye_close_ratio(landmarks[None]).mean())
        open_eye = wrapper.retarget_eye(source_kp, wrapper.calc_combined_eye_ratio([[eye_ratio]], landmarks))
        closed_eye = wrapper.retarget_eye(source_kp, wrapper.calc_combined_eye_ratio([[0.0]], landmarks))
        eye_delta = (closed_eye - open_eye).reshape_as(source_kp)
        transform = crop['M_c2o'][:2]
        full_mask = cv2.warpAffine(mask, transform, (width, height), flags=cv2.INTER_LINEAR)
        video_path = output_dir / (name + ('.smoke' if args.limit_frames else '') + '.mp4')
        output = av.open(str(video_path), 'w')
        stream = output.add_stream('libx264', rate=args.fps)
        stream.width, stream.height, stream.pix_fmt = width, height, 'yuv420p'
        stream.options = {'crf': '20', 'preset': 'medium'}
        clip_started = time.monotonic()
        try:
            for frame_number in range(frames):
                t = frame_number / args.fps
                phase = 2 * math.pi * t / args.seconds
                pose = {key: value.clone() for key, value in info.items()}
                pose['pitch'] += 0.65 * (1 - math.cos(phase))
                pose['roll'] += 0.22 * math.sin(phase)
                # Keep yaw fixed: all interviewers must keep facing the viewer.
                driven = wrapper.transform_keypoint(pose)
                closure = 0.0
                for blink_at in (2.0, 5.6):
                    distance = abs(t - blink_at)
                    if distance < 0.16: closure = max(closure, math.cos(distance / 0.16 * math.pi / 2) ** 2)
                driven += eye_delta * closure
                driven = wrapper.stitching(source_kp, driven)
                decoded = wrapper.warp_decode(features, source_kp, driven)['out']
                face = decoded[0].permute(1, 2, 0).clamp(0, 1).cpu().numpy() * 255
                warped = cv2.warpAffine(face, transform, (width, height), flags=cv2.INTER_LINEAR)
                composite = np.clip(full_mask * warped + (1 - full_mask) * source, 0, 255).astype(np.uint8)
                video_frame = av.VideoFrame.from_ndarray(composite, format='rgb24')
                for packet in stream.encode(video_frame): output.mux(packet)
                if frame_number == 0: Image.fromarray(composite).save(output_dir / (name + '.preview.png'))
                if frame_number % 20 == 0:
                    print(f'{name}: {frame_number + 1}/{frames} frames, {time.monotonic()-clip_started:.1f}s', flush=True)
            for packet in stream.encode(): output.mux(packet)
        finally:
            output.close()
        print(f'COMPLETE {video_path}: {time.monotonic()-clip_started:.1f}s', flush=True)
print(f'Total: {time.monotonic()-started:.1f}s', flush=True)
