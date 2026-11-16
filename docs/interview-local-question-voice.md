# 면접 질문 로컬 음성 생성

운영 DB의 `ip_questions`에서 읽기 전용으로 5,128개 질문을 추출했다.
질문 스냅샷은 `artifacts/interview-question-audio/questions-20261030.json`에 있다.
개인별 답변이나 학생 데이터는 추출하지 않는다.

생성기는 Qwen3-TTS 0.6B Base의 MLX 4bit 모델을 사용한다.
한국어와 참조 음성 복제는 https://github.com/QwenLM/Qwen3-TTS 에서 설명한다.
Mac 실행기는 https://github.com/Blaizzy/mlx-audio 이며 설치한 커밋은
`8c244a1faff44cfa69e3151c195f52a4c1c90be5`다.
모델 스냅샷은 `0d6bb6fe33f92d47a507e23b9148940e8366ab5b`다.
설치 환경은 `.tmp/voice-local/venv312`, 의존성 기록은
`.tmp/voice-local/requirements.lock`에 있다.

기존 `practice-job-1.mp3`와 정확한 대본을 모든 질문의 공통 참조로 사용한다.
참조 파일의 SHA-256 및 생성 설정은 결과 폴더의 `voice.json`에 고정한다.
같은 참조를 사용해도 기존 Fish Audio 음성과 청감상 완전히 같다고
보장할 수 없으므로 `voiceSimilarityHumanVerified`는 false로 기록한다.

생성 및 재개:

```sh
.tmp/voice-local/venv312/bin/python scripts/generate-interview-local-voice.py --batch-size 64
```

출력은 `artifacts/interview-question-audio/local-qwen/`의 WAV와 질문별 JSON이다.
완성된 파일은 해시와 문장 지문을 기록하며, 재실행 시 지문이 같은 항목을 건너뛴다.
기존 앱의 MP3나 카탈로그는 변경하지 않는다.
로컬 WAV는 아직 앱 패키지에 연결하지 않은 별도 생성 결과다.

검증:

```sh
.tmp/voice-local/venv312/bin/python scripts/verify-interview-local-voice.py
```

`verification.json`과 `catalog.json`에 전체 개수, 누락, 오류, 완료 여부를 기록한다.
검증 항목은 질문 원문 일치, SHA-256, WAV 프레임, 24kHz 모노 형식이다.
첫 샘플은 로컬 Whisper large-v3-turbo로 원문과 같은 문장임을 확인했다.
음색 동일성이나 모든 질문의 발음 품질을 파일 무결성 검사만으로 확정하지 않는다.

진행 로그는 `.tmp/voice-local/generation.log`에 있다.
`watch-interview-local-voice.py`는 로그의 정상 종료를 감지한 후 전체 검증을 실행한다.
이 작업은 운영 DB 쓰기, 푸시, 배포를 수행하지 않는다.

## 면접 질문 말투 교정본

사용자가 문장 끝을 면접 질문처럼 수정하도록 요청했다.
문장 종결 규칙으로 원문의 반말·축약형·메모형을 격식체 의문문으로 다듬는다.
원문은 `prompt`, 교정본은 `spokenPrompt`에 분리한다.
로컬 언어 모델의 샘플 교정에서 질문 의미가 달라지는 사례를 발견하여
모델 교정본은 채택하지 않았다. 기존 검토된 대본과 원문을 기준으로
종결 표현을 교체하거나 설명 요청을 붙인다.
자동 종결 검사는 5,128개 모두의 의미·자연스러움을 사람이 확인했다는 뜻은 아니다.

2026-11-06 점검에서 `수상레저기구란에 대해 설명해 주시겠습니까?`처럼
정의형 메모 뒤에 설명 요청을 붙인 오류를 직무 76개·인성 17개 확인했다.
`~(이)란`은 `~(이)란 무엇입니까?`로 처리하고, `혼란`·`이란`처럼
실제 명사인 표현은 구분한다. 종결 검사에서도 잘못된 조합을 거부한다.
기존 `additional`·`public-track` 교정문이 종결 교정 과정에서 누락된 문제도 수정했다.
후기·괄호 메모가 섞인 복합 문항 11개는 `interview-audio-wording-overrides.json`에서
원문을 기준으로 교정한다.

현재 보유한 2026-10-27 원문 스냅샷으로 교정 대본만 검토하려면 다음을 실행한다.
이 명령은 음성을 생성하지 않고 앱에 연결된 제목·대본·MP3를 변경하지 않는다.

```sh
python scripts/prepare-interview-question-endings.py --bank artifacts/interview-question-audio/questions-20261027.json --output artifacts/interview-question-audio/questions-interviewer-wording-review-20261106.json
python tests/interview-question-endings.test.py
```

5,128개 원문·ID·유형을 유지한 대본 중 기존 앱 대본과 달라진 것은 187개다.
위 정의형 오류 93개와 누락된 교정문 등 94개를 포함한다.
기존 음성 파일의 대본을 새 교정문으로 바꿔 기록하지 않는다.
교정 대본으로 음성을 재생성·검증한 후 패키징해야 제목과 실제 음성이 함께 바뀐다.

### Windows에서 변경 문항만 교체

`scripts/voice/regenerate-interview-questions.py`는 앱의 두 카탈로그와 교정 대본을
대조하여 변경 문항만 `requests.json`에 고정한다. 같은 원문·대본으로 이미 보관된
Fish 녹음은 원본 해시를 검증해 재사용하고, 나머지는 기존 `practice-job-1.mp3`를
참조해 Qwen 0.6B의 PyTorch 경로로 생성한다. 문항별 출처와 생성 설정을 기록하며,
파일·대본·설정의 지문이 같은 완료 항목은 재실행 시 건너뛴다.
출력은 앱 자산과 분리된 `wording-audio-20261106/`에 저장한다.

이번 Windows 실행 환경은 격리된 `.tmp/qwen-tts-local/venv`와
`.tmp/interview-voice-gpu`의 PyTorch 2.6.0+cu124를 사용한다.
모델 캐시는 `.tmp/interview-voice-cache/huggingface`다.
GPU에서는 float32와 SDPA 조합으로 샘플을 확인했다. 모델 리비전과 참조 음성 해시는
출력 폴더의 `voice.json`에 기록한다. 기존 Mac MLX 결과와 파형·음색이 동일하다는
검증은 아니며 `voiceSimilarityHumanVerified`는 false를 유지한다.

```powershell
$env:PYTHONUTF8='1'
$env:PYTHONPATH=Join-Path (Get-Location) '.tmp/interview-voice-gpu'
& .tmp/qwen-tts-local/venv/Scripts/python.exe scripts/voice/regenerate-interview-questions.py --device cuda --precision float32
& .tmp/qwen-tts-local/venv/Scripts/python.exe scripts/verify-interview-local-voice.py --bank wording-audio-20261106/requests.json --output wording-audio-20261106 --require-complete
```

`scripts/voice/check-interview-revision.py`는 로컬 Whisper로 대본과 발화를 대조한다.
`--model turbo --flagged-only`로 small 모델이 표시한 항목을 다른 모델로 재확인할 수 있다.
인식기의 오인식 가능성이 있으므로 이 보고서를 사람의 전체 청취 검증으로 표시하지 않는다.

전체 WAV 검증을 마친 뒤 다음 명령으로 변경 음성을 MP3로 변환하고 앱에 연결한다.
패키징은 모든 대본·원문·해시 검사를 먼저 수행하며, 기존 MP3를 삭제하지 않는다.
두 카탈로그의 원문·ID·순서와 대상 외 문항은 유지한다. 새 파일명에 음성 해시를 넣어
이전 캐시와 구분하며, 앱의 기존 카탈로그 로딩과 제목 표시 경로를 그대로 사용한다.

```powershell
node scripts/package-interview-revised-audio.cjs artifacts/interview-question-audio/wording-audio-20261106 .tmp/interview-audio-tools/node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe
node --test tests/interview-revised-audio.test.cjs
```

이 과정에는 운영 DB 변경·푸시·배포가 포함되지 않는다.

2026-11-06 로컬 반영 결과는 187개(직무 170·인성 17)다. 새로 생성한 149개와
해시를 검증해 재사용한 보관 음성 38개를 연결했다. 대상 외 4,941개 카탈로그 항목과
기존 녹음 파일 5,128개를 보존했다. 숫자·약어·띄어쓰기 표시 제목 14개를 추가하여
기존 41개와 합쳐 55개를 관리한다.

발음 조정은 `scripts/data/interview-audio-pronunciation-overrides.json`에서 대본을
정확히 대조한 뒤 공백·쉼표·검토한 약어 철자 읽기·생성 시드만 조정한다.
긴 선행 무음이 발생한 애국 문항은 자동 단어 시작 시각 5.54초를 확인하여
발화 전 여유 0.3초를 남기고 5.24초를 제거했다. 처리 전 WAV와 메타데이터를
출력 폴더의 `untrimmed/`에 보관하고 처리 내역과 새 해시를 기록했다.

187개 WAV의 개수·해시·프레임·형식 검사와 전체 5,128개 앱 음성 연결·해시 검사,
직무·인성 각각의 모바일/브라우저 재생 및 격리 빌드 검증을 통과했다.
자동 인식 결과가 일치하지 않는 무해통항권·친고죄 관련 3개와 특수폭행죄 등
복합 정의 문항 1개는 최종 청취 확인 대상으로 남겼다. ASR만으로 실제 발음 오류를
단정하거나 전체 청취 검증을 완료했다고 표시하지 않는다.
출력 폴더의 `review.html`에서 4개 확인 대상과 전체 187개 음성을 재생할 수 있다.
`app-verification.json`은 원문 보존·변경 범위·청취 확인 항목을,
`release-files.json`은 이 작업에 해당하는 배포 파일만 기록한다.

```sh
.tmp/voice-local/venv312/bin/python scripts/run-interview-question-revision.py
```

위 명령은 대본 교정 → 원문·개수·종결 검사 → 같은 참조 음성으로 재생성 →
전체 오디오 검증을 순서대로 수행한다. 실패 시 다음 단계를 실행하지 않는다.
실험용 모델 교정본은 `artifacts/interview-question-audio/interviewer-scripts/`에 남아 있으나 사용하지 않는다.
채택된 대본은 `questions-interviewer.json`,
수정 음성은 `local-qwen-interviewer/`에 저장한다.
기존 `local-qwen/` 결과와 앱의 음성 파일은 보존한다.

## 관리자 인성·직무 기출 음성 연결

검증 완료된 `local-qwen-interviewer/catalog.json` 중 직무 질문 2,131개와 인성 질문 2,997개를
`scripts/package-interview-job-audio.cjs`로 MP3로 패키징했다.
실행 시 ffmpeg 실행 파일 경로를 첫 번째 인수로 지정할 수 있다.
두 번째 인수는 `job`(기본값) 또는 `personality`다.
새 음성을 생성하거나 유료 API를 호출하지 않는다.

배포 대상은 `assets/interview-job-audio/`(약 48 MiB),
`assets/interview-personality-audio/`(약 67 MiB)의 MP3와 `catalog.json`이다.
관리자 인성·직무 기출 목록과 검토·수정 화면에서 질문 ID와 원문이 모두 일치할 때만
재생한다. 질문 원문을 수정하면 재연결 필요로 표시한다. 미생성 질문 및 목록·파일
로딩 실패도 구분해서 표시한다. 음성은 재생 요청 전에는 내려받지 않는다.
연결된 질문 제목은 음성 대본의 내용을 기준으로 표시한다. 숫자 읽기는
`displayPrompt`로 구분해 5단계·2차 피해처럼 표시하고, 실제 발음 대본인
`spokenPrompt`와 음성 파일은 유지한다. 기출 원문은
별도 펼침 항목과 원문 수정란에 유지한다. 수강생 화면에는 플레이어를 추가하지 않는다.

`tests/interview-job-question-audio.test.cjs`는 전체 파일 해시와 브라우저 재생,
질문 수정, 제목·음성 대본 일치, 원문 보존, 미연결, 목록 실패 복구,
모바일 크기와 카테고리별 연결 분리를 검증한다. 인수 `personality`로 인성을 검증한다.
배포는 사용자 최종 확인 후 별도로 진행한다.

숫자 표기 교정은 `scripts/data/interview-audio-display-titles.json`에서 질문 ID와
기존 음성 대본을 대조해 관리한다. 패키징 시 대본이 변경되면 검토 오류로 중단한다.
현재 교정은 매슬로우 욕구 5단계, 성범죄 2차 피해, 서해5도, 단점 3가지, 장점 2가지다.

후속 점검에서 사용자가 선택한 질문 개수 숫자 통일 31개, 전문기호 표기 1개,
조문·서수 표기 4개를 추가로 반영했다. 기존 교정 5개와 합쳐 표시 제목 41개를
관리한다. 예: 다섯 가지→5가지, 알피엠→rpm, 제1조1항→제1조 제1항, 제 3자→제3자.
원문·음성 대본·MP3·공개 상태는 변경하지 않았다. 중복 문항은 별도로 검토하며
표기 교정 과정에서 삭제·병합하지 않는다.
