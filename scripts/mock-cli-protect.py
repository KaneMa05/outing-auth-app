"""Encrypt worker receipts with the existing Windows current-user protector."""
import sys
import json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools' / 'interview-worker'))
from workerlib import Protector
if len(sys.argv) != 2 or sys.argv[1] not in ('seal', 'open'):
    raise SystemExit(2)
value = sys.stdin.buffer.read(2_000_001)
if len(value) > 2_000_000:
    raise SystemExit(2)
protector = Protector()
if sys.argv[1] == 'seal':
    sys.stdout.buffer.write(protector.seal(json.loads(value.decode('utf-8'))))
else:
    sys.stdout.buffer.write(json.dumps(protector.open(value), ensure_ascii=False).encode('utf-8'))
