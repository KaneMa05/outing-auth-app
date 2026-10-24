# Codex CLI 자동 생성 연결

작성·검증: 2026-10-20. 사용자의 CLI 방식 허용에 따라 기본 실행 경로를 변경했다.

## 구현과 실제 검증

학생 버튼 → 기존 인증 API → 학생별 DB 대기열 → 선생님 PC 처리기 → `codex exec` → 출력/근거 검증 → 결과 저장 API → 학생 상태 조회로 연결한다. 학생 화면의 `interview-ai-ui.js`는 `client/interview-ai-client.js`를 사용하며 `interview-workspace.js`에 연결되어 있다.

실제 앱의 버튼 연결 모듈, HTTP 서버, API 핸들러, 새 SQL을 로컬 PGlite DB와 연결하여 가상 학생 자기소개를 생성했다.

- 실제 CLI: 0.153.4, 기존 ChatGPT 로그인. 별도 API 키 사용 없음.
- 결과: 23.78초, 자기소개 402자, 서로 다른 경험 3개, 원문 근거 9개.
- 외부 도구 실행 이벤트: 0개.
- 사용량 보고: 입력 10,165토큰, 출력 910토큰. 이번 한 건의 관측값이며 비용·평균 시간·50명 처리 시간을 보장하지 않는다.
- 결과가 `COMPLETED`로 저장되고 학생 상태 조회에 동일한 답변이 반환됨을 확인했다.
- 증거: `tests/fixtures/cli-generation.json`에는 가상 자료와 실제 생성 결과만 저장했다.

이 시험은 실제 브라우저에서 운영 버튼을 누른 시험이 아니다. 운영 DB 적용·배포·활성화는 최종 확인 전이므로 운영 학생에게 새 기능이 열렸다고 주장하지 않는다. 핵심 30제는 정확한 공개 문항 ID 30개가 별도로 필요하다.

## 실행 설정

1. `tools/interview-worker/config.example.json`을 `config.json`으로 복사한다.
2. `web_origin`을 배포 대상 앱의 HTTPS 원점으로 설정한다.
3. `engine: "cli"`, `poll_seconds: 2`, `hours: [0,24]`가 기본값이다.
4. `codex_executable`에 PATH의 `codex` 또는 실행 파일 절대 경로를 넣는다.
5. `codex login status`가 ChatGPT 로그인을 표시해야 한다. 만료되면 사용자가 `codex login`으로 다시 로그인한다.
6. 관리자 API로 발급한 해당 학생 범위 기기 토큰을 `set-token`으로 입력한다.

```powershell
.\tools\interview-worker\Start-Worker.ps1 -Command doctor
.\tools\interview-worker\Start-Worker.ps1 -Command bundle-hash
.\tools\interview-worker\Start-Worker.ps1 -Command set-token
.\tools\interview-worker\Start-Worker.ps1 -Command ui
```

시작 스크립트는 설치된 Codex Python 런타임을 우선 찾는다. 다른 환경에서는 `-Python "C:\...\python.exe"`를 지정한다. `doctor`는 로그인/실행 가능 여부만 확인하며 모델을 호출하지 않는다. 서버 토큰과 웹 연결은 실제 `once`/`run`에서 확인된다.

대기 중에는 2초마다 조회하고 완료 직후 다음 작업을 처리한다. 서버가 반환하는 대기 상태, 다른 학생의 진행 작업, 호출 한도, PC 절전·오프라인 상태에 따라 대기 시간은 늘어난다. “즉시”는 예약 시간까지 기다리지 않는 자동 접수를 뜻하며 답변 즉시 완성을 보장하지 않는다. 학생 조회 모듈 기본 간격은 5초다.

PC 창은 닫으면 새 작업 접수를 멈춘다. 이미 시작된 독립 실행기는 결과를 암호화 저장하고 종료하며, 다음 PC 처리기 실행에서 같은 결과를 업로드한다. PC를 재부팅해 실행기가 종료된 경우에는 완료 영수증이 없으면 자동 재생성하지 않는다.

## 자료 격리와 복구

- 문항마다 독립 `codex exec --ephemeral`을 실행한다. 이전 대화 이어쓰기는 하지 않는다.
- 입력은 학생 본인 DB에서 고정한 자료와 질문, 버전 관리된 작성 지침뿐이다.
- 개인 config는 읽지 않고 기본 모델을 사용한다. 모델 고정이 필요하면 PC `config.json`의 `model`을 명시한다. 개인 설정의 모델을 자동 계승하지 않는다.
- 로그인은 기존 ChatGPT 계정을 사용한다. 프로세스에서 API 키 환경변수를 제거하고 ChatGPT 인증 방식을 강제한다.
- 읽기 전용 샌드박스를 유지한다. 셸, 코드 실행, 웹, 앱, 다중 에이전트, 메모리 사용·생성을 비활성화한다. 예상 밖 도구 실행 항목은 결과 게시를 차단한다.
- 생성 지침은 `guidelines/instructions.txt`, 출력 계약은 `guidelines/output.schema.json`이다.
- 학생 입력/토큰은 명령 인자로 넣지 않는다. 입력은 파이프로 전달하고 결과 영수증·업로드함은 Windows 현재 사용자 DPAPI로 암호화한다.
- 실행 전 DB 실행 ID와 로컬 `DISPATCHING` 상태를 기록한다. 전송 직후 PC 처리기가 종료되어도 같은 실행 디렉터리의 결과만 회수한다.
- 업로드가 실패하면 기존 결과를 다시 전송한다. `codex exec resume`이나 새 실행으로 답변을 다시 만들지 않는다.
- 완료 확인 후 원문·답변이 든 로컬 영수증을 제거한다. 실행 여부가 불명확하면 보존하고 관리자 확인 전 새 생성을 중단한다.
- `--ephemeral`은 CLI 대화 파일 보존을 줄이는 옵션이며 OpenAI 측 데이터 보관 정책을 변경하는 옵션이 아니다.

원문 인용·경험 ID·본문 구절의 일치 검증은 구현했지만 모든 문장의 의미상 충실성을 자동으로 증명하지는 않는다. 운영 전 실제 작성 지침과 답변 품질을 제한된 시험 운영에서 점검한다.

## 테스트 실행

모델 호출 없는 회귀 검사:

```powershell
python tests/test_worker.py
python tests/test_cli_bridge.py
node tests/interview-ai-api.test.cjs
node tests/interview-ai-client.test.cjs
node tests/interview-ai-db.test.cjs
```

실제 계정 사용량을 소비하는 연결 시험은 명시적으로 실행한다:

```powershell
node tests/interview-ai-cli-live.test.cjs --live-cli
```

외부 운영 DB 대신 임시 로컬 DB와 가상 학생만 사용한다. 기본 실행은 SKIP이다. 다른 PC에서는 `INTERVIEW_PYTHON`, `INTERVIEW_CODEX`, 필요 시 `INTERVIEW_APP_ROOT`, `PGLITE_MODULE`을 지정한다. 테스트 토큰은 프로세스 파이프로만 전달한다.

## 운영 반영 전 남은 설정

사용자 최종 확인 후 운영 마이그레이션·푸시·배포를 진행하고 서버 지침 해시, 허용 학생 목록, 기기 토큰, 하루 생성 한도를 설정한다. 기본 하루 20회로는 핵심 30문항 한 묶음을 같은 날 모두 생성할 수 없으므로 시험 운영 범위에 맞게 명시적으로 조정한다. 정확한 30문항 목록이 없으면 자기소개·지원동기·공직관부터 열 수 있다.

API의 인증·설정 계약은 [개발문서](interview-ai-development.md), 관리자 설정과 장애 조치는 [운영문서](interview-ai-operations.md)를 따른다. 기존 데스크톱 소켓 실패는 [이전 검증 기록](interview-ai-desktop-generation.md)으로 남기며 현재 CLI 경로의 장애가 아니다.

공식 참고: [비대화형 CLI 실행](https://learn.chatgpt.com/docs/non-interactive-mode), [설정 참조](https://learn.chatgpt.com/docs/config-file/config-reference). CLI는 저장된 인증을 사용하고 JSONL 이벤트·출력 스키마를 제공한다.
