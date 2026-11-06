#!/bin/bash
set -euo pipefail
cd '/Users/ronpark/Documents/ChatGPT/RONPARK 관리반 APP/.worktrees/ios-app'
shared='/Users/ronpark/Documents/ChatGPT/RONPARK 관리반 APP'
"$shared/.tmp/avatar-local/venv/bin/python" scripts/avatars/generate-question-videos.py
"$shared/.tmp/avatar-local/venv/bin/python" - <<'PY'
from pathlib import Path
import json,shutil,av,hashlib
root=Path.cwd();source=root/'artifacts/interview-avatars/question-video/interviewer-woman';catalog=json.loads((root/'native/ios/App/DebugResources/InterviewPracticeAudio/catalog.json').read_text())['clips']
for q in catalog:
 p=source/(q['id']+'.mp4');meta=json.loads(p.with_suffix('.json').read_text());wav=root/'artifacts/interview-avatars/questions/interviewer-woman'/(q['id']+'.wav')
 assert hashlib.sha256(wav.read_bytes()).hexdigest()==meta['audioSha256']
 c=av.open(str(p));assert len(c.streams.audio)==1 and len(c.streams.video)==1;c.close()
target=root/'native/ios/App/DebugResources/InterviewQuestionVideo/interviewer-woman';target.mkdir(parents=True,exist_ok=True)
for q in catalog:shutil.copy2(source/(q['id']+'.mp4'),target/(q['id']+'.mp4'))
print('STAGED',len(catalog),'question videos',flush=True)
PY
node --test tests/ios-cloud-source.test.cjs
for configuration in Debug Release; do
 DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project native/ios/App/RonparkStudy.xcodeproj -scheme RonparkStudy -configuration "$configuration" -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath .tmp/ios-lipsync-build CODE_SIGNING_ALLOWED=NO build > ".tmp/lipsync-final-$configuration.log" 2>&1
done
if [[ -d .tmp/ios-lipsync-build/Build/Products/Release-iphonesimulator/RonparkStudy.app/InterviewQuestionVideo ]]; then
 echo 'ERROR: debug question videos present in release'; exit 1
fi
printf 'COMPLETE: 103 female question videos staged; Debug and Release builds passed. Device playback still needs verification.\n'
