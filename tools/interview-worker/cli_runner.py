"""Private single-execution subprocess. Takes data only over stdin, not argv/files."""
import json
import os
from pathlib import Path
import queue
import subprocess
import sys
import threading
import time
from cli_bridge import atomic_seal, cli_environment, command
from workerlib import Protector


def execute(packet, directory):
    protector = Protector()
    receipt_path = directory / "result.dpapi"
    process = None
    # Only completed agent messages and terminal metadata are kept, encrypted.
    receipt = {"state": "running", "tool_events": 0, "runner_pid": os.getpid(),
               "started_at": time.time()}
    atomic_seal(receipt_path, receipt, protector)
    try:
        prompt = Path(packet["guidelines"], "instructions.txt").read_text(encoding="utf-8")
        job = packet["job"]
        prompt += "\n\n입력 자료(JSON 데이터):\n" + json.dumps(
            {"kind": job["kind"], "question": job["question"], "evidence": job["sources"]},
            ensure_ascii=False)
        process = subprocess.Popen(command(packet["config"], packet["guidelines"], directory / "workspace"),
                                   stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                   env=cli_environment(), creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        receipt["cli_pid"] = process.pid
        atomic_seal(receipt_path, receipt, protector)
        events = queue.Queue()
        def read():
            try:
                for line in process.stdout:
                    if len(line) > 1000000:
                        events.put({"type": "invalid"}); break
                    try: events.put(json.loads(line))
                    except ValueError: events.put({"type": "invalid"})
            finally: events.put(None)
        threading.Thread(target=read, daemon=True).start()
        process.stdin.write(prompt.encode("utf-8"))
        process.stdin.close()
        end = time.monotonic() + 540
        answer, terminal, rejected = None, False, False
        while time.monotonic() < end:
            try: event = events.get(timeout=min(1, max(.01, end - time.monotonic())))
            except queue.Empty: continue
            if event is None: break
            kind = event.get("type")
            if kind == "thread.started":
                receipt["thread_id"] = event.get("thread_id")
            if kind in ("item.started", "item.updated", "item.completed"):
                item = event.get("item", {})
                if item.get("type") == "error":
                    # CLI diagnostics are encrypted and never displayed by the worker UI.
                    receipt["diagnostic"] = str(item.get("message", ""))[:2000]
                    continue
                if item.get("type") not in ("agent_message", "reasoning"):
                    receipt["unexpected_item_type"] = str(item.get("type", "missing"))[:100]
                    receipt["tool_events"] += 1
                    rejected = True
                    break
                if kind == "item.completed" and item.get("type") == "agent_message":
                    answer = item.get("text")
            if kind == "turn.completed":
                terminal = True
                receipt["usage"] = event.get("usage", {})
            if kind == "turn.failed":
                terminal, rejected = True, True
                break
        if process.poll() is None:
            try: process.wait(timeout=5 if terminal else .1)
            except subprocess.TimeoutExpired:
                process.terminate()
                try: process.wait(timeout=5)
                except subprocess.TimeoutExpired: process.kill(); process.wait(timeout=5)
        receipt["exit_code"] = process.returncode
        if terminal and process.returncode == 0 and not rejected and answer:
            try: receipt.update(state="completed", result=json.loads(answer))
            except ValueError: receipt["state"] = "failed"
        else:
            # Failure with a known terminal event is definitive; interrupted transport is not.
            receipt["state"] = "failed" if terminal else "uncertain"
        atomic_seal(receipt_path, receipt, protector)
    except Exception as error:
        if process is not None and process.poll() is None:
            process.terminate()
            try: process.wait(timeout=5)
            except subprocess.TimeoutExpired: process.kill(); process.wait(timeout=5)
        receipt["state"] = "uncertain"
        # Encrypted diagnostic only. Do not expose prompts or credentials in logs.
        receipt["exception_type"] = type(error).__name__
        receipt["diagnostic"] = str(error)[:1000]
        atomic_seal(receipt_path, receipt, protector)


if __name__ == "__main__":
    execute(json.loads(sys.stdin.buffer.read()), Path(sys.argv[1]).resolve())
