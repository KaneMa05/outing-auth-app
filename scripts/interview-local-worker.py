"""Local preview worker. Ephemeral token arrives over stdin, never command line."""
import json
from pathlib import Path
import sys
import threading

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools/interview-worker"))
from workerlib import Protector
from cli_bridge import CliBridge
from worker import run_loop

packet = json.loads(sys.stdin.readline())
config = packet["config"]
runtime = Path(config["runtime_dir"])
runtime.mkdir(parents=True, exist_ok=True)
(runtime / "token.dpapi").write_bytes(Protector().seal({"token": packet["token"]}))
stop, pause = threading.Event(), threading.Event()
# Parent closes the pipe on preview shutdown. No orphan idle worker remains.
def watch_parent():
    sys.stdin.read()
    stop.set()
threading.Thread(target=watch_parent, daemon=True).start()
bridge = CliBridge(config, ROOT / "tools/interview-worker/guidelines")
bridge.doctor()
bridge.close()
print("LOCAL_WORKER_READY", flush=True)
last = [None]
def notify(status):
    if status != last[0]:
        print("LOCAL_WORKER " + status, flush=True)
        last[0] = status
try:
    run_loop(config, runtime, stop, pause, notify)
finally:
    (runtime / "token.dpapi").unlink(missing_ok=True)
