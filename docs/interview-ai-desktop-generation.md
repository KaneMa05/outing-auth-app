# 실제 Codex 앱 생성 검증

검증일: 2026-10-20

## 실제로 확인한 결과

사용자의 명시적인 허용으로 Codex 데스크톱 앱에 `면접 초안 생성 테스트` 작업을 만들었다. 가상 학생의 서로 다른 경험 3개만 전달하여 자기소개를 생성했다. 실제 학생 데이터나 운영 DB는 사용하지 않았다.

- 앱 작업 ID: `01a15820-48c4-7a72-9936-ebc562ec070e`
- 실행 ID: `01a15820-4d83-70b0-8f0a-4c197d053b38`
- 실제 앱 실행 시간: 32.765초
- 결과: 한국어 자기소개 504자, 근거 연결 9개, 본문 경험 3개
- 외부 웹·파일·도구를 사용하지 않도록 요청했고, 해당 실행 기록에는 생성 작업 인수 항목과 최종 답변만 있었다.
- 모델이나 추론 설정을 별도로 지정하지 않고 앱 기본 설정을 사용했다.

원본 JSON은 `tests/fixtures/desktop-app-generation.json`에 보관했다. 모두 합성 자료다. `wait_threads`의 요약·잘린 텍스트를 결과로 저장하지 않고 `read_thread`의 완전한 최종 메시지를 사용했다.

## 후속 저장 검증

`tests/interview-ai-desktop-result.test.cjs`에서 실제 생성된 결과를 수정하지 않고 다음 경로에 넣었다.

```text
같은 합성 자료를 테스트 DB에 저장
→ 실제 학생 API prepare/generate
→ 실제 기기 API claim/execution_start/session
→ 앱에서 생성된 원본 결과 complete
→ DB 근거·경험 검증
→ 학생 status에서 COMPLETED 및 동일한 답변 확인
→ 동일 결과 재업로드 시 중복 저장 방지 확인
```

PGlite 테스트 DB를 사용했고 운영 DB에는 연결하지 않았다. Node 결과 검증과 Python `validate_result`도 각각 통과했다. 이 테스트를 재실행해도 새로운 모델 호출은 발생하지 않는다.

## 아직 구분해야 하는 경계

앱 자체의 작업 도구를 통한 실제 생성 성공과, 일반 PC 프로그램이 웹 버튼을 받아 즉시 앱에 새 작업을 만드는 자동 연결은 다르다. 현재 프로세스 조사에서 데스크톱의 app-server는 stdio로 연결되어 있고, 기존 worker의 Unix 소켓 proxy 대상은 존재하지 않았다.

앱의 내부 파이프 도구 구현도 읽었지만, 이를 통해 승인 절차를 우회하거나 비공개 호출을 운영 자동화에 사용하지 않았다.

사용자는 주기적인 예약 작업 방식 대신 **버튼 클릭 직후 실행**을 요구했고, CLI/SDK 직접 실행도 허용하지 않고 **반드시 Codex 앱 창을 통해 처리**하도록 확정했다. 예약 자동화나 CLI 직접 실행으로 변경하지 않았다. 현재 저장된 CLI 인증은 읽기 전용 `codex login status`로 ChatGPT 로그인임만 확인했다. 인증 파일이나 토큰 값은 읽거나 복사하지 않았다.

현재 제공된 Windows Computer Use 지침에는 ChatGPT 데스크톱 앱 UI와 Codex CLI/확장 UI 자동 조작 금지가 명시되어 있다. 따라서 UI 클릭·키보드 입력으로 우회하는 테스트나 그 방식의 운영 연결은 수행하지 않았다.

최종 구현 상태: 실제 앱에서 합성 자료로 생성·회수·검증·테스트 저장은 성공했다. 웹 버튼 클릭이 일반 PC 프로그램을 거쳐 앱 창에서 생성을 자동 시작하는 연결은 미완료다. 기존 `desktop_verified=false`를 유지한다. 이 제약을 이유로 다른 실행 방식으로 임의 변경하지 않는다.

현재까지의 이 기록을 “운영 웹 버튼부터 전체 자동 생성까지 완료”로 해석하지 않는다. 아직 운영 배포·DB 적용·실제 웹 버튼 E2E는 수행하지 않았다.

참고: [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk), [비대화형 실행](https://learn.chatgpt.com/docs/non-interactive-mode), [앱 서버](https://learn.chatgpt.com/docs/app-server).
