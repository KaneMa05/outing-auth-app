"""Standard-library worker. No API-provider fallback and no production enablement by default."""
from __future__ import annotations
import base64
import ctypes
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import queue
import sqlite3
import subprocess
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid


class WorkerError(Exception):
    pass


class ApiError(WorkerError):
    def __init__(self, code, status=0):
        super().__init__(code)
        self.code, self.status = code, status


class Uncertain(WorkerError):
    """An AI execution may have started; do not replay it."""


def bundle_hash(directory):
    data = b""
    for name in ("instructions.txt", "output.schema.json"):
        data += name.encode() + b"\0" + (Path(directory) / name).read_bytes() + b"\0"
    return hashlib.sha256(data).hexdigest()


def validate_result(result, job):
    keys = {"schema_version", "status", "answer", "source_refs", "experience_coverage", "missing"}
    if not isinstance(result, dict) or set(result) != keys:
        raise WorkerError("invalid_output")
    answer, refs, coverage, missing = (result[k] for k in ("answer", "source_refs", "experience_coverage", "missing"))
    if (result["schema_version"] != "1.0" or result["status"] not in ("ready", "needs_input")
        or not isinstance(answer, str) or len(answer) > 8000
        or not isinstance(refs, list) or len(refs) > 80
        or not isinstance(coverage, list) or len(coverage) > 40
        or not isinstance(missing, list) or len(missing) > 10
        or any(not isinstance(s, str) or not 1 <= len(s) <= 500 for s in missing)
        or len(json.dumps(result, ensure_ascii=False).encode()) > 65536):
        raise WorkerError("invalid_output")
    if result["status"] == "needs_input":
        if answer or refs or coverage or not missing:
            raise WorkerError("invalid_output")
        return result
    if not answer.strip() or not refs or missing:
        raise WorkerError("invalid_output")
    sources = {s["id"]: s for s in job["sources"]}
    for ref in refs:
        if not isinstance(ref, dict) or set(ref) != {"source_id", "quote", "answer_excerpt"}:
            raise WorkerError("invalid_output")
        if any(not isinstance(ref[k], str) or not 1 <= len(ref[k]) <= n
               for k, n in (("source_id", 160), ("quote", 2000), ("answer_excerpt", 2000))):
            raise WorkerError("invalid_output")
        if (ref["source_id"] not in sources or ref["quote"] not in sources[ref["source_id"]]["text"]
            or ref["answer_excerpt"] not in answer):
            raise WorkerError("invalid_evidence")
    for c in coverage:
        if not isinstance(c, dict) or set(c) != {"experience_id", "answer_excerpt"}:
            raise WorkerError("invalid_output")
        if (not isinstance(c["experience_id"], str) or not 1 <= len(c["experience_id"]) <= 80
            or not isinstance(c["answer_excerpt"], str) or not 1 <= len(c["answer_excerpt"]) <= 3000):
            raise WorkerError("invalid_output")
    if job["kind"] == "self_intro":
        if len({c["experience_id"] for c in coverage}) < 3 or len({c["answer_excerpt"] for c in coverage}) < 3:
            raise WorkerError("experience_required")
        for c in coverage:
            if c["answer_excerpt"] not in answer or not any(
                sources[r["source_id"]].get("experience_id") == c["experience_id"]
                and r["answer_excerpt"] in c["answer_excerpt"] for r in refs):
                raise WorkerError("experience_required")
    return result


class Protector:
    """Windows current-user DPAPI. Plain mode exists only for synthetic tests."""
    def __init__(self, test_plain=False):
        self.test_plain = test_plain
        if os.name != "nt" and not test_plain:
            raise WorkerError("windows_dpapi_required")

    def _crypt(self, value, decrypt=False):
        class Blob(ctypes.Structure):
            _fields_ = [("size", ctypes.c_ulong), ("data", ctypes.POINTER(ctypes.c_ubyte))]
        buf = ctypes.create_string_buffer(value)
        source = Blob(len(value), ctypes.cast(buf, ctypes.POINTER(ctypes.c_ubyte)))
        target = Blob()
        crypt = ctypes.windll.crypt32
        crypt.CryptProtectData.argtypes = [ctypes.POINTER(Blob), ctypes.c_wchar_p, ctypes.c_void_p,
                                           ctypes.c_void_p, ctypes.c_void_p, ctypes.c_ulong, ctypes.POINTER(Blob)]
        crypt.CryptUnprotectData.argtypes = [ctypes.POINTER(Blob), ctypes.c_void_p, ctypes.c_void_p,
                                             ctypes.c_void_p, ctypes.c_void_p, ctypes.c_ulong, ctypes.POINTER(Blob)]
        if decrypt:
            ok = crypt.CryptUnprotectData(ctypes.byref(source), None, None, None, None, 1, ctypes.byref(target))
        else:
            ok = crypt.CryptProtectData(ctypes.byref(source), "interview-worker", None, None, None, 1, ctypes.byref(target))
        if not ok:
            raise WorkerError("credential_protection_failed")
        try:
            return ctypes.string_at(target.data, target.size)
        finally:
            ctypes.windll.kernel32.LocalFree.argtypes = [ctypes.c_void_p]
            ctypes.windll.kernel32.LocalFree(ctypes.cast(target.data, ctypes.c_void_p))

    def seal(self, value):
        raw = json.dumps(value, ensure_ascii=False).encode("utf-8")
        return (b"TEST:" + raw) if self.test_plain else b"DPAPI:" + self._crypt(raw)

    def open(self, value):
        if self.test_plain and value.startswith(b"TEST:"):
            return json.loads(value[5:])
        if not value.startswith(b"DPAPI:"):
            raise WorkerError("invalid_secret_format")
        return json.loads(self._crypt(value[6:], True))


class Store:
    def __init__(self, path, protector):
        self.protector = protector
        self.db = sqlite3.connect(path)
        self.db.execute("pragma journal_mode=WAL")
        self.db.execute("pragma synchronous=FULL")
        self.db.execute("""create table if not exists runs(
          job_id text primary key, state text not null, payload blob not null,
          updated real not null)""")
        self.db.commit()

    def save(self, job_id, state, payload):
        self.db.execute("insert into runs values(?,?,?,?) on conflict(job_id) do update set state=excluded.state,payload=excluded.payload,updated=excluded.updated",
                        (job_id, state, self.protector.seal(payload), time.time()))
        self.db.commit()

    def active(self):
        return [(row[0], row[1], self.protector.open(row[2])) for row in
                self.db.execute("select job_id,state,payload from runs where state<>'DONE' order by updated")]

    def stats(self):
        return dict(self.db.execute("select state,count(*) from runs group by state"))

    def purge(self):
        self.db.execute("delete from runs where state='DONE' and updated<?", (time.time() - 86400,))
        self.db.commit()
        # Removes deleted pages from the WAL; encrypted payloads remain encrypted.
        self.db.execute("pragma wal_checkpoint(TRUNCATE)")

    def close(self):
        self.db.close()


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise ApiError("redirect_not_allowed")


class Api:
    def __init__(self, origin, token, allow_local_http=False):
        url = urllib.parse.urlsplit(origin)
        if (url.username or url.password or url.query or url.fragment or url.path not in ("", "/")
            or (url.scheme != "https" and not (allow_local_http and url.scheme == "http" and url.hostname in ("localhost", "127.0.0.1")))):
            raise WorkerError("https_origin_required")
        self.url = origin.rstrip("/") + "/api/interview-ai-worker"
        self.token = token
        self.opener = urllib.request.build_opener(NoRedirect())

    def call(self, action, **body):
        raw = json.dumps({"action": action, **body}, ensure_ascii=False).encode()
        req = urllib.request.Request(self.url, data=raw, headers={
            "Content-Type": "application/json", "Authorization": "Bearer " + self.token})
        try:
            with self.opener.open(req, timeout=30) as response:
                result = json.loads(response.read(1000000))
        except urllib.error.HTTPError as error:
            try: code = json.loads(error.read(2000)).get("error", "http_error")
            except (ValueError, AttributeError): code = "http_error"
            raise ApiError(code, error.code) from None
        except (OSError, ValueError) as error:
            raise ApiError("network_unavailable") from None
        if not result.get("ok"):
            raise ApiError(result.get("error", "request_failed"))
        return result


class Rpc:
    """JSON-lines transport to the existing desktop control socket only."""
    def __init__(self, executable="codex", socket=None):
        cmd = [executable, "app-server", "proxy"]
        if socket:
            cmd += ["--sock", socket]
        self.process = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                        text=True, encoding="utf-8", errors="replace", bufsize=1,
                                        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        self.events = queue.Queue()
        self.counter = 0
        threading.Thread(target=self._reader, daemon=True).start()
        threading.Thread(target=self._stderr, daemon=True).start()
        try:
            self.request("initialize", {"clientInfo": {"name": "interview_worker", "version": "1.0"},
                                        "capabilities": {"experimentalApi": True}})
            self.send({"method": "initialized"})
        except Exception:
            self.close()
            raise

    def _reader(self):
        try:
            for line in self.process.stdout:
                try: self.events.put(json.loads(line))
                except ValueError: continue
        finally: self.events.put(None)

    def _stderr(self):
        # Do not write app stderr to logs: it can include account/runtime details.
        for _ in self.process.stderr:
            pass

    def send(self, message):
        try:
            self.process.stdin.write(json.dumps(message, ensure_ascii=False) + "\n")
            self.process.stdin.flush()
        except (OSError, BrokenPipeError):
            raise Uncertain("desktop_connection_lost") from None

    def receive(self, timeout):
        try: message = self.events.get(timeout=timeout)
        except queue.Empty: raise WorkerError("desktop_timeout") from None
        if message is None:
            raise Uncertain("desktop_connection_lost")
        # Deny any tool approval / dynamic tool request from this connection.
        if "method" in message and "id" in message:
            self.send({"id": message["id"], "error": {"code": -32601, "message": "Tools are disabled for interview generation"}})
            raise Uncertain("unexpected_tool_request")
        return message

    def request(self, method, params, timeout=15):
        self.counter += 1
        request_id = self.counter
        self.send({"id": request_id, "method": method, "params": params})
        until = time.monotonic() + timeout
        while time.monotonic() < until:
            try:
                message = self.receive(max(.1, until - time.monotonic()))
            except WorkerError as error:
                raise Uncertain("desktop_response_unknown") from None
            if message.get("id") == request_id:
                if "error" in message:
                    raise WorkerError("desktop_rpc_rejected:" + str(message["error"].get("code")))
                return message["result"]
        raise Uncertain("desktop_response_unknown")

    def close(self):
        try: self.process.stdin.close()
        except OSError: pass
        try: self.process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            self.process.terminate()
            try: self.process.wait(timeout=2)
            except subprocess.TimeoutExpired: self.process.kill()


class DesktopBridge:
    def __init__(self, config, guidelines):
        self.config, self.guidelines = config, Path(guidelines)
        self.rpc = None

    def connect(self):
        if self.rpc is None:
            self.rpc = Rpc(self.config.get("codex_executable", "codex"), self.config.get("desktop_socket"))
        return self.rpc

    def doctor(self):
        # Read-only initialize. Does not start a model run or enable the web service.
        self.connect()
        return {"connected": True, "transport": "desktop_proxy",
                "generation_enabled": bool(self.config.get("desktop_verified", False))}

    def prepare(self):
        if not self.config.get("desktop_verified", False):
            raise WorkerError("desktop_verification_required")
        rpc = self.connect()
        # No environment, external apps, web, skills, or extra capabilities.
        # These controls must be verified by the D0 integration test before enablement.
        response = rpc.request("thread/start", {
            "cwd": str(Path(self.config["runtime_dir"]).resolve()), "sandbox": "read-only",
            "approvalPolicy": "never", "environments": [], "selectedCapabilityRoots": [],
            "dynamicTools": [], "historyMode": "legacy",
            "config": {"web_search": "disabled", "apps": {"_default": {"enabled": False}},
                       "mcp_servers": {}, "features": {"shell_tool": False, "apply_patch_freeform": False}},
            "baseInstructions": self.guidelines.joinpath("instructions.txt").read_text(encoding="utf-8"),
            "serviceName": "interview_worker"
        })
        return response["thread"]["id"]

    def start(self, session, job):
        prompt = json.dumps({"kind": job["kind"], "question": job["question"], "evidence": job["sources"]}, ensure_ascii=False)
        result = self.connect().request("turn/start", {
            "threadId": session, "environments": [], "approvalPolicy": "never",
            "input": [{"type": "text", "text": prompt, "text_elements": []}],
            "outputSchema": json.loads(self.guidelines.joinpath("output.schema.json").read_text(encoding="utf-8"))
        }, timeout=30)
        return result["turn"]["id"]

    def collect(self, session, turn_id, heartbeat, timeout=600):
        until = time.monotonic() + timeout
        while time.monotonic() < until:
            heartbeat()
            response = self.connect().request("thread/read", {"threadId": session, "includeTurns": True})
            turns = response.get("thread", {}).get("turns", [])
            turn = next((t for t in turns if t.get("id") == turn_id), None)
            if turn and turn.get("status") == "completed":
                texts = [item["text"] for item in turn.get("items", []) if item.get("type") == "agentMessage"]
                if not texts:
                    raise WorkerError("invalid_output")
                try: return json.loads(texts[-1])
                except ValueError: raise WorkerError("invalid_output") from None
            if turn and turn.get("status") in ("failed", "interrupted"):
                raise WorkerError("generation_failed")
            time.sleep(2)
        raise Uncertain("dispatch_unknown")

    def close(self):
        if self.rpc:
            self.rpc.close(); self.rpc = None


class Worker:
    def __init__(self, api, bridge, store, guidelines):
        self.api, self.bridge, self.store = api, bridge, store
        self.bundle = bundle_hash(guidelines)
        self.last_status = "idle"

    @staticmethod
    def lease(job):
        return {"jobId": job["id"], "leaseToken": job["lease_token"], "leaseEpoch": job["lease_epoch"]}

    def _save(self, state, record):
        self.store.save(record["job"]["id"], state, record)
        self.last_status = state

    def _acknowledge(self, record):
        if record.get("session") and hasattr(self.bridge, "acknowledge"):
            self.bridge.acknowledge(record["session"])

    def _upload(self, record):
        job = record["job"]
        try:
            self.api.call("complete", **self.lease(job), executionId=record["execution_id"], result=record["result"])
        except ApiError as error:
            if error.code != "lease_lost": raise
            self.api.call("recover", **self.lease(job), executionId=record["execution_id"])
            self.api.call("complete", **self.lease(job), executionId=record["execution_id"], result=record["result"])
        # Drop content immediately once confirmed; keep only an encrypted receipt for 24h.
        self.store.save(job["id"], "DONE", {"completed": time.time()})
        self._acknowledge(record)
        self.last_status = "completed"

    def _failed_output(self, record):
        self._save("FAILED", record)
        self.api.call("report", **self.lease(record["job"]), reason="invalid_output")
        self.store.save(record["job"]["id"], "DONE", {"failed": time.time()})
        self._acknowledge(record)
        self.last_status = "invalid_output"

    def recover(self):
        for job_id, state, record in self.store.active():
            job = record["job"]
            if state == "OUTBOX":
                self._upload(record)
                continue
            if state in ("DISPATCHING", "RUNNING", "UNCERTAIN"):
                server = self.api.call("inspect", jobId=job_id, executionId=record["execution_id"])
                if server["status"] in ("COMPLETED", "NEEDS_INPUT"):
                    self.store.save(job_id, "DONE", {"completed": time.time()})
                    self._acknowledge(record)
                    continue
                if server["status"] == "CANCELED" and server.get("reason") == "operator_resolved":
                    self.store.save(job_id, "DONE", {"operator_resolved": time.time()})
                    self._acknowledge(record)
                    continue
                if record.get("session") and getattr(self.bridge, "recover_by_session", False):
                    record.setdefault("turn_id", record["session"])
                if record.get("turn_id") and record.get("session"):
                    self.api.call("recover", **self.lease(job), executionId=record["execution_id"])
                    try:
                        self._collect(record)
                    except Uncertain:
                        self._save("UNCERTAIN", record)
                        return False
                    except ApiError:
                        raise
                    except WorkerError as error:
                        if str(error) not in ("invalid_output", "invalid_evidence", "experience_required", "generation_failed"):
                            self._save("UNCERTAIN", record)
                            return False
                        self._failed_output(record)
                    continue
                # A dropped turn/start response must never trigger another turn/start.
                self._save("UNCERTAIN", record)
                self.last_status = "dispatch_unknown"
                return False
            if state == "CLAIMED":
                # The durable DISPATCHING marker was never written, so no turn was sent.
                # A reservation response may have been lost, but generation did not start.
                try:
                    self.api.call("report", **self.lease(job), reason="connection_unavailable")
                except ApiError as error:
                    if error.code not in ("lease_lost", "not_found"): raise
                self.store.save(job_id, "DONE", {"abandoned_before_dispatch": time.time()})
            if state == "FAILED":
                server = self.api.call("inspect", jobId=job_id)
                if server["status"] == "PROCESSING":
                    self.api.call("report", **self.lease(job), reason=record.get("failure_reason", "invalid_output"))
                self.store.save(job_id, "DONE", {"failed": time.time()})
                self._acknowledge(record)
        return True

    def _collect(self, record):
        job = record["job"]
        next_renew = 0
        def heartbeat():
            nonlocal next_renew
            if time.monotonic() >= next_renew:
                self.api.call("renew", **self.lease(job))
                next_renew = time.monotonic() + 30
        result = self.bridge.collect(record["session"], record["turn_id"], heartbeat)
        validate_result(result, job)
        record["result"] = result
        self._save("OUTBOX", record)
        self._upload(record)

    def tick(self):
        self.store.purge()
        if not self.recover(): return False
        # Check connectivity / explicit verification before taking a server lease.
        doctor = self.bridge.doctor()
        if not doctor.get("generation_enabled"):
            self.last_status = "desktop_verification_required"
            return False
        response = self.api.call("claim", bundleHash=self.bundle)
        job = response.get("job")
        if job is None:
            self.last_status = response.get("reason", "idle")
            return False
        record = {"job": job, "execution_id": str(uuid.uuid4())}
        self._save("CLAIMED", record)
        try:
            if job["bundle_hash"] != self.bundle: raise WorkerError("bundle_mismatch")
            record["session"] = self.bridge.prepare()
            self.api.call("execution_start", **self.lease(job), executionId=record["execution_id"])
            self.api.call("session", **self.lease(job), executionId=record["execution_id"], sessionRef=record["session"])
            # Durable write BEFORE dispatch; a crash at this point is conservatively uncertain.
            record["dispatched"] = True
            self._save("DISPATCHING", record)
            record["turn_id"] = self.bridge.start(record["session"], job)
            self._save("RUNNING", record)
            self._collect(record)
            return True
        except ApiError:
            # OUTBOX / RUNNING states remain durable and recoverable.
            raise
        except Uncertain:
            if not record.get("dispatched"):
                # A lost thread/start response is not a lost turn/start response.
                # No generation has been sent yet, so this is safe to retry explicitly.
                record["failure_reason"] = "connection_unavailable"
                self._save("FAILED", record)
                try:
                    self.api.call("report", **self.lease(job), reason="connection_unavailable")
                    self.store.save(job["id"], "DONE", {"abandoned_before_dispatch": time.time()})
                except ApiError:
                    pass
                self.last_status = "connection_unavailable"
                return False
            self._save("UNCERTAIN", record)
            try: self.api.call("report", **self.lease(job), reason="dispatch_unknown")
            except ApiError: pass
            self.last_status = "dispatch_unknown"
            return False
        except WorkerError as error:
            reason = "invalid_output" if str(error) in ("invalid_output", "invalid_evidence", "experience_required", "generation_failed") else "connection_unavailable"
            if record.get("dispatched") and reason != "invalid_output":
                self._save("UNCERTAIN", record)
                try: self.api.call("report", **self.lease(job), reason="dispatch_unknown")
                except ApiError: pass
                self.last_status = "dispatch_unknown"
                return False
            record["failure_reason"] = reason
            self._save("FAILED", record)
            try:
                self.api.call("report", **self.lease(job), reason=reason)
                self.store.save(job["id"], "DONE", {"failed": time.time()})
                self._acknowledge(record)
            except ApiError: pass
            self.last_status = reason
            return False
