"""Offline Korean ASR; persistent JSON-lines mode keeps Whisper warm."""
import json, sys, wave, base64
import numpy as np
import mlx_whisper

def transcribe(audio, model, hints=''):
    if len(audio) < 1600 or np.sqrt(np.mean(audio * audio)) < 0.005:
        return ''
    result = mlx_whisper.transcribe(audio, path_or_hf_repo=model, language='ko', temperature=0,
        condition_on_previous_text=False, initial_prompt=hints[:300] or None, verbose=None)
    return ''.join(s['text'] for s in result.get('segments', []) if s.get('no_speech_prob', 0) < 0.6).strip()

if sys.argv[1] == '--stream':
    for line in sys.stdin:
        try:
            packet = json.loads(line)
            audio = np.frombuffer(base64.b64decode(packet['pcm']), dtype='<i2').astype(np.float32) / 32768
            text = transcribe(audio, sys.argv[2], packet.get('hints', ''))
            print(json.dumps({'id': packet['id'], 'text': text}, ensure_ascii=False), flush=True)
        except Exception:
            print(json.dumps({'id': packet.get('id'), 'error': 'transcription_failed'}), flush=True)
else:
    with wave.open(sys.argv[1], 'rb') as wav:
        audio = np.frombuffer(wav.readframes(wav.getnframes()), dtype='<i2').astype(np.float32) / 32768
    print(json.dumps({'text': transcribe(audio, sys.argv[2])}, ensure_ascii=False))
