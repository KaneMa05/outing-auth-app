"""Offline large-v3 adapter. stdin/stdout are private JSON-lines IPC, not logs."""
import ctypes, gc, importlib.metadata, json, os, pathlib, sys, time

sys.stdin.reconfigure(encoding='utf-8')
sys.stdout.reconfigure(encoding='utf-8')

os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['HF_HUB_DISABLE_IMPLICIT_TOKEN'] = '1'
config = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8-sig'))
handles = []
if os.name == 'nt' and config.get('cudaLibraries'):
    folder = pathlib.Path(config['cudaLibraries'])
    os.environ['PATH'] = str(folder) + os.pathsep + os.environ['PATH']
    handles.append(os.add_dll_directory(str(folder)))
    for dll in ['cublasLt64_12.dll', 'cublas64_12.dll', 'cudnn64_9.dll']:
        handles.append(ctypes.CDLL(str(folder / dll)))
from faster_whisper import WhisperModel

device, compute = 'cuda', 'float16'
def load():
    return WhisperModel(config['modelDirectory'], device=device, compute_type=compute,
                        cpu_threads=6, num_workers=1, local_files_only=True)
try:
    model = load()
except RuntimeError:
    device, compute = 'cpu', 'float32'
    model = load()
print(json.dumps({'ready': True, 'model': 'Whisper large-v3'}), flush=True)
if '--check' in sys.argv:
    sys.exit(0)

for line in sys.stdin:
    packet = {}
    try:
        packet = json.loads(line)
        file = pathlib.Path(packet['file'])
        if file.suffix not in ('.m4a', '.webm', '.ogg') or not 44 < file.stat().st_size <= 16777216:
            raise ValueError('invalid_audio')
        started = time.perf_counter()
        def run():
            chunks, info = model.transcribe(str(file), language='ko', beam_size=5, temperature=0,
                condition_on_previous_text=False, word_timestamps=True, vad_filter=False,
                initial_prompt=None)
            return list(chunks), info
        try:
            segments, info = run()
        except RuntimeError:
            if device != 'cuda':
                raise
            model = None
            gc.collect()
            device, compute = 'cpu', 'float32'
            model = load()
            segments, info = run()
        result = {'model': 'Whisper large-v3', 'modelRevision': config['modelRevision'],
            'engineVersion': importlib.metadata.version('faster-whisper'),
            'transcript': ''.join(s.text for s in segments).strip(),
            'segments': [{'start': round(s.start, 3), 'end': round(s.end, 3), 'text': s.text.strip()} for s in segments],
            'processingSeconds': round(time.perf_counter() - started, 3), 'decodedSeconds': info.duration}
        print(json.dumps({'id': packet['id'], 'result': result}, ensure_ascii=False), flush=True)
    except Exception:
        print(json.dumps({'id': packet.get('id'), 'error': 'transcription_failed'}), flush=True)
