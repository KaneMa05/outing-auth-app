"""Finish local verification once the already-running generation job ends."""
from pathlib import Path
import subprocess
import sys
import time

root = Path(__file__).resolve().parents[1]
log = root / '.tmp/voice-local/generation.log'
while True:
    text = log.read_text(errors='replace') if log.exists() else ''
    if 'Traceback (most recent call last)' in text:
        print('Generation failed; retained audio can be resumed. See generation.log.', flush=True)
        raise SystemExit(1)
    if '\nFinished: ' in text:
        result = subprocess.run([sys.executable, str(root / 'scripts/verify-interview-local-voice.py')], cwd=root)
        raise SystemExit(result.returncode)
    time.sleep(20)
