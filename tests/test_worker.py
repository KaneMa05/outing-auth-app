import copy
import importlib.util
import json
from pathlib import Path
import sys
import shutil
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools" / "interview-worker"))
from workerlib import ApiError, Protector, Store, Worker, WorkerError, Uncertain, bundle_hash, validate_result

GUIDES = ROOT / "tools" / "interview-worker" / "guidelines"


def job():
    return {"id": str(uuid.uuid4()), "kind": "motivation", "question": "지원동기",
            "sources": [{"id": "own", "text": "학생이 직접 적은 지원 이유", "experience_id": None}],
            "bundle_hash": bundle_hash(GUIDES), "lease_token": str(uuid.uuid4()), "lease_epoch": 1}


def result():
    return {"schema_version": "1.0", "status": "ready", "answer": "학생이 직접 적은 지원 이유",
            "source_refs": [{"source_id": "own", "quote": "직접 적은 지원 이유", "answer_excerpt": "직접 적은 지원 이유"}],
            "experience_coverage": [], "missing": []}


class FakeApi:
    def __init__(self, j):
        self.job = j
        self.status = "QUEUED"
        self.execution_id = None
        self.completed = None
        self.claims = 0
        self.uploads = 0
        self.fail_upload_once = False
        self.lose_response_once = False

    def call(self, action, **body):
        if action == "claim":
            self.claims += 1
            if self.status != "QUEUED": return {"ok": True, "job": None}
            self.status = "PROCESSING"
            return {"ok": True, "job": self.job}
        if action == "execution_start": self.execution_id = body["executionId"]
        if action == "inspect":
            return {"ok": True, "status": self.status, "executionId": self.execution_id}
        if action == "complete":
            self.uploads += 1
            if self.fail_upload_once:
                self.fail_upload_once = False
                raise ApiError("network_unavailable")
            if self.completed is not None:
                assert self.completed == body["result"]
            self.completed = body["result"]; self.status = "COMPLETED"
            if self.lose_response_once:
                self.lose_response_once = False
                raise ApiError("network_unavailable")
        if action == "report": self.status = "BLOCKED" if body["reason"] == "dispatch_unknown" else "FAILED"
        return {"ok": True}


class FakeBridge:
    def __init__(self):
        self.starts = 0
        self.output = result()
        self.uncertain = False
    def doctor(self): return {"generation_enabled": True}
    def prepare(self): return str(uuid.uuid4())
    def start(self, session, job):
        self.starts += 1
        if self.uncertain: raise Uncertain("lost_response")
        return "turn-1"
    def collect(self, session, turn, heartbeat):
        heartbeat()
        return copy.deepcopy(self.output)


class WorkerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = ROOT / "tests" / (".worker-test-" + uuid.uuid4().hex)
        self.tmp.mkdir()
        self.store = Store(self.tmp / "state.db", Protector(test_plain=True))
        self.api = FakeApi(job()); self.bridge = FakeBridge()
        self.worker = Worker(self.api, self.bridge, self.store, GUIDES)
    def tearDown(self):
        self.store.close()
        assert self.tmp.resolve().parent == (ROOT / "tests").resolve()
        assert self.tmp.name.startswith(".worker-test-")
        shutil.rmtree(self.tmp)
    def test_normal_no_replay(self):
        self.assertTrue(self.worker.tick())
        self.worker.tick()
        self.assertEqual(self.bridge.starts, 1)
        self.assertEqual(self.store.active(), [])
    def test_upload_retry_without_generation(self):
        self.api.fail_upload_once = True
        with self.assertRaises(ApiError): self.worker.tick()
        self.assertEqual(self.store.active()[0][1], "OUTBOX")
        self.worker.tick()
        self.assertEqual(self.bridge.starts, 1)
        self.assertEqual(self.api.uploads, 2)
    def test_server_saved_but_response_lost(self):
        self.api.lose_response_once = True
        with self.assertRaises(ApiError): self.worker.tick()
        self.worker.tick()
        self.assertEqual(self.bridge.starts, 1)
        self.assertEqual(self.api.uploads, 2)
    def test_unknown_dispatch_never_replayed(self):
        self.bridge.uncertain = True
        self.assertFalse(self.worker.tick())
        self.assertFalse(self.worker.tick())
        self.assertEqual(self.bridge.starts, 1)
        self.assertEqual(self.store.active()[0][1], "UNCERTAIN")
    def test_no_claim_before_desktop_verification(self):
        self.bridge.doctor = lambda: {"generation_enabled": False}
        self.assertFalse(self.worker.tick())
        self.assertEqual(self.api.claims, 0)
    def test_lost_session_creation_before_generation_is_not_unknown_execution(self):
        def fail_prepare():
            raise Uncertain("session_creation_response_lost")
        self.bridge.prepare = fail_prepare
        self.assertFalse(self.worker.tick())
        self.assertEqual(self.bridge.starts, 0)
        self.assertEqual(self.store.active(), [])
        self.assertEqual(self.worker.last_status, "connection_unavailable")
    def test_invalid_foreign_source_not_uploaded(self):
        self.bridge.output["source_refs"][0]["source_id"] = "other-student"
        self.assertFalse(self.worker.tick())
        self.assertIsNone(self.api.completed)
        self.assertEqual(self.api.status, "FAILED")
    def test_restart_outbox(self):
        self.api.fail_upload_once = True
        with self.assertRaises(ApiError): self.worker.tick()
        self.store.close()
        self.store = Store(self.tmp / "state.db", Protector(test_plain=True))
        Worker(self.api, self.bridge, self.store, GUIDES).tick()
        self.assertEqual(self.bridge.starts, 1)
    def test_self_intro_requires_three_distinct_body_experiences(self):
        j = job(); j["kind"] = "self_intro"
        with self.assertRaisesRegex(WorkerError, "experience_required"):
            validate_result(result(), j)
    def test_needs_input_has_no_invented_answer(self):
        r = result(); r.update(status="needs_input", answer="", source_refs=[], experience_coverage=[], missing=["추가 자료"])
        validate_result(r, job())
        r["answer"] = "자료에 없는 경험"
        with self.assertRaises(WorkerError): validate_result(r, job())
    @unittest.skipUnless(sys.platform == "win32", "Windows DPAPI")
    def test_dpapi_encrypts_local_material(self):
        protector = Protector()
        sealed = protector.seal({"token": "private-token", "answer": "학생 자료"})
        self.assertNotIn(b"private-token", sealed)
        self.assertEqual(protector.open(sealed)["token"], "private-token")


if __name__ == "__main__":
    unittest.main(verbosity=2)
