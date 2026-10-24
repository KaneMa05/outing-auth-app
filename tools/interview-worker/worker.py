"""Usage: python worker.py --config config.json doctor|run|once|ui|set-token|status"""
import argparse
import getpass
import json
import os
from pathlib import Path
import sys
import threading
import time
from workerlib import Api, ApiError, DesktopBridge, Protector, Store, Worker, WorkerError, bundle_hash
from cli_bridge import CliBridge


class InstanceLock:
    def __init__(self, path):
        self.file = open(path, "a+b")
        self.file.seek(0)
        if not self.file.read(1):
            self.file.write(b"0"); self.file.flush()
        self.file.seek(0)
        try:
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(self.file.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(self.file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            self.file.close()
            raise WorkerError("worker_already_running")

    def close(self):
        self.file.close()


def allowed_time(config):
    # PC local timezone must be Asia/Seoul; schedule wraps midnight if needed.
    schedule = config.get("hours", [0, 24])
    hour = time.localtime().tm_hour
    a, b = schedule
    return a <= hour < b if a < b else hour >= a or hour < b


def load(config_path):
    config_path = Path(config_path).resolve()
    cfg = json.loads(config_path.read_text(encoding="utf-8-sig"))
    runtime = Path(os.path.expandvars(cfg.get("runtime_dir", "%LOCALAPPDATA%/InterviewDraftWorker")))
    if "%" in str(runtime):
        raise WorkerError("invalid_runtime_path")
    if not runtime.is_absolute():
        runtime = config_path.parent / runtime
    runtime.mkdir(parents=True, exist_ok=True)
    cfg["runtime_dir"] = str(runtime.resolve())
    cfg.setdefault("desktop_verified", False)
    cfg.setdefault("engine", "cli")
    cfg.setdefault("poll_seconds", 2)
    if (cfg["engine"] not in ("cli", "desktop") or
        type(cfg["poll_seconds"]) not in (int, float) or not 1 <= cfg["poll_seconds"] <= 60):
        raise WorkerError("invalid_config")
    if not isinstance(cfg["desktop_verified"], bool):
        raise WorkerError("invalid_config")
    hours = cfg.get("hours", [0, 24])
    if not isinstance(hours, list) or len(hours) != 2 or any(type(h) is not int or not 0 <= h <= 24 for h in hours):
        raise WorkerError("invalid_config")
    return cfg, runtime


def run_loop(cfg, runtime, stop, pause, notify, once=False):
    lock = None
    store, bridge = None, None
    try:
        lock = InstanceLock(runtime / "worker.lock")
        protector = Protector()
        token = protector.open((runtime / "token.dpapi").read_bytes())["token"]
        api = Api(cfg["web_origin"], token, cfg.get("allow_local_http", False))
        guidelines = Path(__file__).parent / "guidelines"
        store = Store(runtime / "state.sqlite3", protector)
        bridge = (CliBridge if cfg["engine"] == "cli" else DesktopBridge)(cfg, guidelines)
        worker = Worker(api, bridge, store, guidelines)
        backoff = 10
        while not stop.is_set():
            completed = False
            try:
                # Finish/reconcile work in progress even outside the admission window.
                if store.active():
                    worker.recover()
                if pause.is_set() or not allowed_time(cfg):
                    notify("paused")
                else:
                    completed = worker.tick()
                    notify(worker.last_status)
                backoff = .1 if not pause.is_set() and allowed_time(cfg) and completed else cfg["poll_seconds"]
                if not completed and worker.last_status in ("daily_limit", "automation_disabled", "dispatch_unknown", "worker_busy"):
                    backoff = max(backoff, 60)
                if pause.is_set() or not allowed_time(cfg):
                    backoff = max(backoff, 10)
            except (WorkerError, OSError, KeyError, ValueError):
                # Sanitized status only. Never log prompts, results, HTTP bodies or tokens.
                notify("connection_or_configuration_error")
                bridge.close()
                backoff = min(300, max(10, backoff * 2))
                if once:
                    raise
            if once:
                break
            stop.wait(backoff)
    except (WorkerError, OSError, KeyError, ValueError):
        notify("connection_or_configuration_error")
        if once:
            raise
    finally:
        if bridge: bridge.close()
        if store: store.close()
        if lock: lock.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", default=str(Path(__file__).with_name("config.json")))
    parser.add_argument("command", choices=["doctor", "run", "once", "ui", "set-token", "status", "bundle-hash"])
    args = parser.parse_args()
    if args.command == "bundle-hash":
        print(bundle_hash(Path(__file__).parent / "guidelines")); return
    cfg, runtime = load(args.config)
    if args.command == "set-token":
        token = getpass.getpass("Worker token (hidden): ").strip()
        import re
        if not re.fullmatch(r"[A-Za-z0-9_-]{43}", token): raise WorkerError("invalid_token")
        (runtime / "token.dpapi").write_bytes(Protector().seal({"token": token}))
        print("기기 토큰을 Windows 사용자 암호화 저장소에 저장했습니다."); return
    if args.command == "doctor":
        bridge = (CliBridge if cfg["engine"] == "cli" else DesktopBridge)(cfg, Path(__file__).parent / "guidelines")
        try:
            result = bridge.doctor()
            print(json.dumps(result, ensure_ascii=False))
        finally: bridge.close()
        return
    if args.command == "status":
        store = Store(runtime / "state.sqlite3", Protector())
        try:
            print(json.dumps(store.stats(), ensure_ascii=False))
        finally: store.close()
        return
    stop, pause = threading.Event(), threading.Event()
    if args.command == "ui":
        import tkinter as tk
        root = tk.Tk(); root.title("면접 초안 PC 처리기"); root.geometry("480x220")
        state = tk.StringVar(value="준비 중")
        labels = {
            "idle": "대기 중", "completed": "웹 저장 완료", "paused": "새 작업 일시중지",
            "desktop_verification_required": "Codex 앱 연결 검증 필요",
            "dispatch_unknown": "실행 여부 확인 필요 — 자동 재생성 중단",
            "daily_limit": "오늘 호출 한도 도달", "worker_busy": "진행 작업 또는 불명 실행 확인 중",
            "connection_or_configuration_error": "연결·설정 확인 필요",
            "automation_disabled": "웹 자동 생성 기능 꺼짐"
        }
        tk.Label(root, text="학생 본인 DB 기반 초안 생성", font=("", 14)).pack(pady=14)
        tk.Label(root, textvariable=state, wraplength=440).pack(pady=12)
        tk.Button(root, text="일시중지", command=pause.set).pack(side="left", padx=25)
        tk.Button(root, text="재개", command=pause.clear).pack(side="left", padx=25)
        closing = [False]
        def notify(value):
            if not closing[0]:
                root.after(0, state.set, labels.get(value, value))
        thread = threading.Thread(target=run_loop, args=(cfg, runtime, stop, pause, notify), daemon=True)
        thread.start()
        def close():
            closing[0] = True; stop.set(); pause.set()
            root.destroy()
            # Durable store allows recovery if the process exits during generation.
        root.protocol("WM_DELETE_WINDOW", close)
        root.mainloop()
    else:
        run_loop(cfg, runtime, stop, pause, lambda s: print(s, flush=True), once=args.command == "once")


if __name__ == "__main__":
    try: main()
    except (WorkerError, OSError, ValueError, KeyError) as error:
        # Do not expose exception payloads containing HTTP or model data.
        print("실행할 수 없습니다. 개발문서의 설정·연결 점검 절차를 확인하세요.", file=sys.stderr)
        sys.exit(1)
