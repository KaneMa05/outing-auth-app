import io
import json
import os
from pathlib import Path
import shutil
import sys
import unittest
from unittest.mock import patch
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools/interview-worker"))
from cli_bridge import CliBridge, atomic_seal, cli_environment, command
from cli_runner import execute
from workerlib import Protector, Store, Worker, Uncertain, validate_result
from test_worker import FakeApi, FakeBridge, job, result, GUIDES


class Process:
    def __init__(self, events, code=0):
        self.stdin = io.BytesIO()
        self.stdout = [json.dumps(e).encode()+b"\n" for e in events]
        self.returncode = code
        self.pid = 12345
    def poll(self): return self.returncode
    def wait(self, timeout=None): return self.returncode
    def terminate(self): self.returncode = -1


class CliTests(unittest.TestCase):
    def setUp(self):
        self.tmp = ROOT / "tests" / (".cli-test-" + uuid.uuid4().hex)
        self.tmp.mkdir()
        self.config = {"runtime_dir": str(self.tmp), "codex_executable": "codex"}
        self.bridge = CliBridge(self.config, GUIDES)
    def tearDown(self):
        assert self.tmp.resolve().parent == (ROOT/"tests").resolve()
        assert self.tmp.name.startswith(".cli-test-")
        shutil.rmtree(self.tmp)
    def test_saved_login_and_restricted_invocation(self):
        with patch.dict(os.environ, {"OPENAI_API_KEY": "test", "CODEX_API_KEY": "test"}):
            self.assertNotIn("OPENAI_API_KEY", cli_environment())
            self.assertNotIn("CODEX_API_KEY", cli_environment())
        args = command(self.config, GUIDES, self.tmp)
        for value in ("--ignore-user-config", "--ephemeral", "read-only",
                      'forced_login_method="chatgpt"', "features.shell_tool=false",
                      "memories.use_memories=false", 'web_search="disabled"'):
            self.assertIn(value, args)
        self.assertNotIn("--dangerously-bypass-approvals-and-sandbox", args)
    def test_receipt_survives_bridge_restart_without_new_process(self):
        session = self.bridge.prepare()
        path = self.bridge.directory(session)/"result.dpapi"
        atomic_seal(path, {"state":"completed", "result":result()}, Protector())
        fresh = CliBridge(self.config, GUIDES)
        with patch("cli_bridge.subprocess.Popen", side_effect=AssertionError("must not regenerate")):
            self.assertEqual(fresh.collect(session,session,lambda:None),result())
        self.assertNotIn("학생".encode(),path.read_bytes())
        fresh.acknowledge(session)
        self.assertFalse(path.exists())
    def test_unknown_receipt_blocks_without_replay(self):
        session = self.bridge.prepare()
        atomic_seal(self.bridge.directory(session)/"result.dpapi", {"state":"uncertain"}, Protector())
        with self.assertRaises(Uncertain):
            self.bridge.collect(session,session,lambda:None)
    def test_lost_start_reply_recovers_same_spool(self):
        session = self.bridge.prepare()
        atomic_seal(self.bridge.directory(session)/"result.dpapi", {"state":"completed","result":result()}, Protector())
        api = FakeApi(job()); api.status = "PROCESSING"
        store = Store(self.tmp/"state.db", Protector())
        try:
            record = {"job":api.job,"session":session,"execution_id":str(uuid.uuid4()),"dispatched":True}
            store.save(api.job["id"],"DISPATCHING",record)
            with patch.object(self.bridge,"start",side_effect=AssertionError("must not regenerate")):
                self.assertTrue(Worker(api,self.bridge,store,GUIDES).recover())
            self.assertEqual(api.completed,result())
            self.assertEqual(store.active(),[])
        finally: store.close()
    def test_runner_handles_diagnostic_then_structured_result(self):
        session=self.bridge.prepare(); directory=self.bridge.directory(session)
        events=[
            {"type":"thread.started","thread_id":"synthetic"},
            {"type":"item.completed","item":{"type":"error","message":"diagnostic"}},
            {"type":"item.completed","item":{"type":"agent_message","text":json.dumps(result())}},
            {"type":"turn.completed","usage":{"output_tokens":10}},
        ]
        with patch("cli_runner.subprocess.Popen",return_value=Process(events)):
            execute({"config":self.config,"guidelines":str(GUIDES),"job":job()},directory)
        receipt=Protector().open((directory/"result.dpapi").read_bytes())
        self.assertEqual(receipt["state"],"completed")
        self.assertEqual(receipt["tool_events"],0)
        self.assertEqual(receipt["result"],result())
    def test_runner_never_publishes_output_with_tool_execution(self):
        session=self.bridge.prepare(); directory=self.bridge.directory(session)
        events=[{"type":"item.started","item":{"type":"command_execution","command":"untrusted"}}]
        with patch("cli_runner.subprocess.Popen",return_value=Process(events)):
            execute({"config":self.config,"guidelines":str(GUIDES),"job":job()},directory)
        receipt=Protector().open((directory/"result.dpapi").read_bytes())
        self.assertEqual(receipt["state"],"uncertain")
        self.assertNotIn("result",receipt)
    def test_actual_cli_result_has_three_grounded_experiences(self):
        fixture=json.loads((ROOT/"tests/fixtures/cli-generation.json").read_text(encoding="utf-8"))
        validate_result(fixture["result"],fixture["job"])
        self.assertEqual(fixture["tool_events"],0)


if __name__ == "__main__": unittest.main(verbosity=2)
