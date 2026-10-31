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
