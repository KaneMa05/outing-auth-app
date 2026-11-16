"""Edit all scripts locally, synthesize the revised voice bank, then verify it."""
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]

def run(script, *args):
    subprocess.run([sys.executable, str(ROOT / 'scripts' / script), *args], cwd=ROOT, check=True)

def main():
    print('PHASE: question script editing', flush=True)
    run('prepare-interview-question-endings.py')
    folder = ROOT / 'artifacts/interview-question-audio'
    original = json.loads((folder / 'questions-20261030.json').read_text())['questions']
    revised = json.loads((folder / 'questions-interviewer.json').read_text())['questions']
    from importlib.util import spec_from_file_location, module_from_spec
    spec = spec_from_file_location('scripts_editor', ROOT / 'scripts/prepare-interview-question-endings.py')
    editor = module_from_spec(spec)
    spec.loader.exec_module(editor)
    assert len(original) == len(revised) == 5128
    assert {q['id']: q['prompt'] for q in original} == {q['id']: q['prompt'] for q in revised}
    assert all(editor.validate(q['spokenPrompt']) for q in revised)
    print('PHASE: fixed reference voice synthesis', flush=True)
    run('generate-interview-local-voice.py', '--bank', 'questions-interviewer.json', '--output', 'local-qwen-interviewer', '--batch-size', '64')
    print('PHASE: full audio verification', flush=True)
    run('verify-interview-local-voice.py', '--bank', 'questions-interviewer.json', '--output', 'local-qwen-interviewer', '--require-complete')
    print('REVISION COMPLETE: 5128', flush=True)

if __name__ == '__main__':
    main()
