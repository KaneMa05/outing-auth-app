"""Live test helper: synthetic token via stdin; uses the production worker classes."""
import json
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools" / "interview-worker"))
from workerlib import Api, Protector, Store, Worker
from cli_bridge import CliBridge

packet = json.loads(sys.stdin.buffer.read())
config = packet["config"]
runtime = Path(config["runtime_dir"])
runtime.mkdir(parents=True, exist_ok=True)
metadata = {}

class ObservedBridge(CliBridge):
    def acknowledge(self, session):
        receipt = self.protector.open((self.directory(session) / "result.dpapi").read_bytes())
        metadata.update({k: receipt[k] for k in ("tool_events", "usage", "thread_id") if k in receipt})
        super().acknowledge(session)

bridge = ObservedBridge(config, ROOT / "tools/interview-worker/guidelines")
store = Store(runtime / "test.sqlite3", Protector())
started = time.monotonic()
try:
    worker = Worker(Api(config["web_origin"], packet["token"], True), bridge, store,
                    ROOT / "tools/interview-worker/guidelines")
    success = worker.tick()
    print(json.dumps({"ok": success, "status": worker.last_status,
                      "seconds": round(time.monotonic() - started, 2), **metadata}), flush=True)
    if not success:
        # Keep encrypted receipts for diagnosis without exposing source data.
        for _, state, record in store.active():
            if record.get("session"):
                path = bridge.directory(record["session"]) / "result.dpapi"
                if path.exists():
                    receipt = bridge.protector.open(path.read_bytes())
                    print(json.dumps({k: v for k, v in receipt.items() if k != "result"}), flush=True)
        sys.exit(1)
finally:
    bridge.close()
    store.close()
