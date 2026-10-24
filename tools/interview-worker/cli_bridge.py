"""One isolated `codex exec` per job; encrypted completion survives worker restart."""
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import uuid
from workerlib import Protector, WorkerError, Uncertain


def cli_environment():
    env = os.environ.copy()
    # Reuse saved ChatGPT login. Never fall back to a separately billed API key.
    for key in ("OPENAI_API_KEY", "CODEX_API_KEY", "CODEX_THREAD_ID"):
        env.pop(key, None)
    return env


def command(config, guidelines, cwd):
    args = [config.get("codex_executable", "codex"), "exec",
            "--ignore-user-config", "--ephemeral", "--skip-git-repo-check",
            "--sandbox", "read-only", "--json", "--color", "never",
            "--cd", str(cwd), "--output-schema", str(Path(guidelines) / "output.schema.json")]
    for setting in (
        'approval_policy="never"', 'web_search="disabled"', 'model_provider="openai"',
        'forced_login_method="chatgpt"', 'apps._default.enabled=false',
        'features.shell_tool=false', 'features.apply_patch_freeform=false',
        'features.code_mode=false', 'features.code_mode_host=false',
        'features.multi_agent=false', 'features.js_repl=false',
        'memories.use_memories=false', 'memories.generate_memories=false',
    ):
        args += ["-c", setting]
    if config.get("model"):
        args += ["--model", config["model"]]
    return args + ["-"]


def atomic_seal(path, value, protector):
    temp = path.with_suffix(".tmp")
    with temp.open("wb") as stream:
        stream.write(protector.seal(value))
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temp, path)


class CliBridge:
    recover_by_session = True

    def __init__(self, config, guidelines):
        self.config, self.guidelines = config, Path(guidelines).resolve()
        self.root = Path(config["runtime_dir"]).resolve() / "cli-runs"
        self.root.mkdir(parents=True, exist_ok=True)
        self.protector = Protector()
        self.checked_at = 0
        self.children = []

    def directory(self, session):
        if str(uuid.UUID(session)) != session:
            raise WorkerError("invalid_session")
        return self.root / session

    def doctor(self):
        # No model invocation. Cache for a minute rather than starting CLI every poll.
        if time.monotonic() - self.checked_at > 60:
            try:
                proc = subprocess.run(
                    [self.config.get("codex_executable", "codex"), "login", "status"],
                    capture_output=True, encoding="utf-8", errors="replace", timeout=20,
                    env=cli_environment(), creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
                if proc.returncode or "Logged in using ChatGPT" not in proc.stdout + proc.stderr:
                    raise WorkerError("chatgpt_login_required")
            except (OSError, subprocess.TimeoutExpired):
                raise WorkerError("cli_unavailable") from None
            self.checked_at = time.monotonic()
        return {"connected": True, "transport": "codex_exec", "auth": "ChatGPT",
                "generation_enabled": True}

    def prepare(self):
        session = str(uuid.uuid4())
        directory = self.directory(session)
        directory.mkdir()
        (directory / "workspace").mkdir()
        return session

    def start(self, session, job):
        directory = self.directory(session)
        # Never overwrite a started runner. Exclusive marker precedes process creation.
        try:
            with (directory / "dispatched").open("x") as stream:
                stream.write("1")
            child = subprocess.Popen(
                [sys.executable, str(Path(__file__).with_name("cli_runner.py")), str(directory)],
                stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0), env=cli_environment())
            self.children.append(child)
            packet = {"config": self.config, "guidelines": str(self.guidelines),
                      "job": {key: job[key] for key in ("kind", "question", "sources")}}
            child.stdin.write(json.dumps(packet, ensure_ascii=False).encode("utf-8"))
            child.stdin.close()
        except (OSError, ValueError):
            raise Uncertain("dispatch_unknown") from None
        return session

    def collect(self, session, turn_id, heartbeat, timeout=600):
        directory = self.directory(session)
        until = time.monotonic() + timeout
        while time.monotonic() < until:
            heartbeat()
            path = directory / "result.dpapi"
            if path.exists():
                receipt = self.protector.open(path.read_bytes())
                if receipt["state"] == "completed":
                    return receipt["result"]
                if receipt["state"] == "failed":
                    raise WorkerError("generation_failed")
                if receipt["state"] == "uncertain":
                    raise Uncertain("dispatch_unknown")
            time.sleep(.5)
        # Missing/unfinished spool is ambiguous. No automatic model retry.
        raise Uncertain("dispatch_unknown")

    def acknowledge(self, session):
        directory = self.directory(session)
        # Exact fixed files only. Never recursively remove a computed directory.
        for name in ("result.dpapi", "result.tmp", "dispatched"):
            (directory / name).unlink(missing_ok=True)
        try:
            (directory / "workspace").rmdir()
            directory.rmdir()
        except OSError:
            pass

    def close(self):
        # A running child owns its encrypted receipt and survives a UI/worker exit.
        self.children = [child for child in self.children if child.poll() is None]
