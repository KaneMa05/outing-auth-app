# 면접 초안 자동 처리 개발문서

작성일: 2026-10-20 · 구현 버전: 1 · 연결 대상: 기존 면접반 웹앱

## 현재 상태

웹에서 요청을 등록하고 교사 PC가 처리한 결과를 학생 화면에서 조회하는 서버 API, DB 대기열, PC 처리기, 버튼 연결 모듈을 구현했다. 기존 작성 내용과 교사 피드백은 수정하지 않는다. 운영 DB 적용, 푸시, 배포, 기능 활성화는 하지 않았다.

**CLI 연결 구현·실제 생성 검증 완료:** 사용자가 CLI 방식을 허용하여 `codex exec`를 기본 경로로 연결했다. 실제 버튼 연결 모듈 → 로컬 HTTP API·DB → CLI 생성 → 결과 저장·학생 조회를 통과했다. 가상 학생 자기소개는 23.78초, 402자, 근거 9개, 경험 3개였다. 운영 적용은 최종 확인 전이다. [CLI 구현과 검증 상세](interview-ai-cli.md).

별도 API 키를 사용하지 않고 기존 ChatGPT 로그인으로 실행한다. 학생 앱의 `interview-ai-ui.js`와 `interview-workspace.js`에서 아래 모듈 연결을 확인했다. 운영 브라우저 인수는 배포 후 수행한다. 이전 데스크톱 소켓 방식과 실패 기록은 참고용으로 보존한다.

## 확정된 요구사항

학생 화면의 버튼 연결과 **기본 이력·인성 경험·가치관 전체 입력 후 활성화** 조건은 [UI 구현·검증 문서](releases/20261020-interview-ai-ui.md)에 정리했다. 추가 마이그레이션 `20261020073140_interview_ai_readiness.sql`은 `prepare`에 `dbReady`, `missing[]`을 추가하고 `generate`와 `retry_items`도 같은 완성도 기준으로 검사한다. 운영 적용은 아직 하지 않았다.

| 버튼 | kind | 생성 단위 |
|---|---|---|
| 자기소개 초안 만들기 | self_intro | 완성된 본문에 실제 경험 3개 이상을 포함한 답변 1개 |
| 지원동기 초안 만들기 | motivation | 학생이 기록한 지원 이유·준비에 근거한 답변 1개 |
| 공직관 초안 만들기 | public_service | 학생이 기록한 가치와 실천에 근거한 답변 1개 |
| 이 질문 초안 만들기 | core30 | 확정된 30문항 중 선택한 questionId 1개만 생성 |

- 사실 자료는 로그인한 학생 본인의 DB 내용만 사용한다.
- 저장·제출 자체는 AI 요청을 발생시키지 않는다. 생성 버튼 또는 명시적 재요청이 필요하다.
- 자료 부족 시 답변을 만들지 않고 보완 항목을 반환한다.
- 생성된 문항부터 바로 학생에게 표시한다. 교사 승인 단계는 없다.
- 핵심 30제의 완료 답변은 보존하고 실패·자료 부족 문항만 선택 재요청한다.
- 문항 선정은 사용자 확정 기준인 본문 25개 필수 + 부록 무작위 5개다. 선정한 ID 30개를 설정에 저장하고 재조회·부분 재요청에서 변경하지 않는다. 로컬 미리보기에 먼저 적용했으며 운영 적용은 최종 확인 후 진행한다.
- AI 초안은 기존 편집기·교사 피드백과 별도 저장한다. 학생이 채택할 때만 기존 저장 경로를 이용한다.

## 구성과 파일

```text
학생 버튼
  → 기존 학생 인증 → /api/interview-ai → DB 요청·문항 대기열
  → 교사 PC Python 처리기(기본 2초 조회) → Codex CLI 독립 생성
  → 결과 스키마·근거 검증 → 암호화된 로컬 업로드함
  → /api/interview-ai-worker → DB 결과 저장
  → 학생 화면 상태 조회 → 생성된 초안 표시
```

웹 서버는 인증·DB·대기열 API를 담당하고 AI 실행 요청과 결과 회수는 교사 PC가 담당한다. PC가 꺼지거나 절전 상태이면 새 요청은 대기한다. PC에서 조정하더라도 모델 계산 자체가 오프라인 PC에서 수행된다는 뜻은 아니다.

| 파일 | 역할 |
|---|---|
| api/interview-ai.js | 학생 요청·조회·선택 재요청, 관리자 설정·기기 관리 |
| api/interview-ai-worker.js | 범위 제한 기기 토큰으로 작업 임대·실행 기록·결과 업로드 |
| lib/interview-ai-http.js | 요청 크기, 오류 응답, 출처 확인 |
| lib/interview-ai-validation.js | 결과 형식과 원문 인용 검증 |
| client/interview-ai-client.js | 네 버튼 연결, 미저장 내용 저장 대기, 중복 클릭 방지, 상태 조회 |
| supabase/migrations/20261020063234_interview_ai_pipeline.sql | 추가 테이블·권한·RPC |
| tools/interview-worker/worker.py | 진단·토큰 등록·실행·간단한 PC 창 |
| tools/interview-worker/workerlib.py | 암호화 저장, 재시작 복구, 앱 연결 어댑터 |
| tools/interview-worker/cli_bridge.py / cli_runner.py | CLI 실행, 암호화 결과 영수증, 중복 생성 없는 복구 |
| tools/interview-worker/guidelines/instructions.txt | 실제 답변 작성 지침 |
| tools/interview-worker/guidelines/output.schema.json | 출력 계약 |
| docs/interview-ai-operations.md | 설치·운영·장애 복구·출시 조건 |

기존 `ip_service`, `ip_life_service`, 인증 모듈에 의존한다. 기존 학생 및 교사 인증을 재사용하며 신규 인증 체계를 만들지 않는다. 새 테이블은 RLS를 켜고 anon/authenticated의 직접 접근과 RPC 실행 권한을 제거한다. 서버의 service_role만 호출한다.

## 데이터 계약

새 테이블:

- `ip_ai_settings`: 기능 켜기, 지침 묶음 해시, 정확한 30개 질문 ID, 하루 호출 제한.
- `ip_ai_workers`: 기기 토큰 해시, 허용 학생 목록, 30일 만료·폐기·최근 접속.
- `ip_ai_requests`: 소유 학생, 유형, 최초 자료 사본·해시, 요청 중복 방지 키.
- `ip_ai_jobs`: 문항과 질문 버전, 상태, 임대, 결과, 선택 재요청의 자료 사본.
- `ip_ai_executions`: 실제 생성 시도 예약, 앱 세션 참조, 종료 여부.
- `ip_ai_retries`: 선택 재요청 중복 방지 영수증.
- `ip_ai_events`: 요청·결과·재시도·관리자 조치 감사 기록. 학생 원문을 로그에 복제하지 않는다.

학생의 `ip_life_profiles.content`에서 허용된 텍스트 필드와 관련 `ip_notes.fields`만 추출한다. 교사 피드백·다른 학생·예시 답안은 제외한다. 이름·인증 정보 등 별도 신원 필드는 모델에 보내지 않는다. 학생이 자유 입력란에 적은 개인정보까지 자동으로 완전히 제거하는 기능은 없다.

생성 시점의 질문·근거 자료를 고정한다. 이후 원본이 바뀌면 기존 결과에 `stale=true`를 표시한다. 선택 재요청에서는 해당 문항의 자료 사본만 교체하고 이미 완료된 문항은 유지한다. 각 문항에도 sourceHash/stale가 있어 서로 다른 자료 버전이 섞인 묶음을 구분할 수 있다.

자기소개는 상황·행동·결과가 있는 서로 다른 경험 3개가 필요하다. 동일한 세 필드를 복사한 경험은 사전 검사에서 중복으로 계산한다. 결과에는 실제 본문 구절과 경험 ID 3개 이상의 연결을 요구한다.

**검증 범위:** 스키마, 학생 소유 자료의 ID, 정확한 원문 인용, 본문 구절 존재, 경험 연결을 자동 확인한다. 자연어 서술 전체가 원문의 의미를 넘어서는지 자동 검사만으로 완벽하게 증명할 수는 없다. 출시 전 실제 샘플의 사실 충실도 평가가 필요하다.

## 학생 API

모두 `POST /api/interview-ai`, JSON, 기존 학생 로그인 쿠키 사용. 브라우저가 제공한 학생 ID는 소유권의 근거가 아니다. 미리보기 기기 인증은 기존 허용 학생 범위를 그대로 따른다. 응답은 `Cache-Control: no-store`.

| action | 입력 | 반환·동작 |
|---|---|---|
| prepare | kind | enabled, ready, dbReady, missing, sourceHash, experienceCount; core30은 questions, coreConfigured 추가 |
| generate | kind, sourceHash, requestKey, regenerate?, questionId(core30 필수) | requestId, reused 또는 자료 부족 상태 |
| requests | 없음 | 본인 최근 요청 50개 |
| status | requestId | 본인 요청 문항·상태·결과·자료 변경 여부 |
| retry_items | requestId, itemKeys[], sourceHash, requestKey | 선택한 미완료 문항만 같은 묶음에서 재요청 |

예시:

```json
{"action":"generate","kind":"core30","questionId":"선택한 설정 문항 ID","sourceHash":"prepare에서 받은 해시","requestKey":"클릭 1회에 대한 UUID"}
```

`requestKey`는 네트워크 재전송 때 재사용한다. 동일 자료·질문·지침의 일반 생성은 기존 요청을 반환한다. 사용자가 명시적으로 다시 만들기를 선택한 경우만 `regenerate:true`로 새 요청을 만든다. 전송 실패 때도 같은 키를 유지한다.

`retry_items`는 FAILED, 자료를 보완한 NEEDS_INPUT, 관리자가 실제 실행 종료를 확인한 CANCELED만 허용한다. COMPLETED/PROCESSING/QUEUED/불명 실행은 재요청하지 못한다. 같은 자료에서 최대 2회 생성 시도, 새 자료에서는 시도 수를 다시 계산한다. 전체 하루 호출 제한은 별도로 적용된다.

자료가 저장된 후 다른 탭에서 변경되면 409 `source_changed`가 반환될 수 있다. 화면은 최신 자료를 확인하고 다시 요청하도록 안내한다. 다른 학생의 requestId는 404다.

| 오류·상태 | 화면 처리 |
|---|---|
| automation_disabled | 생성 기능 준비 중, 입력·저장 기능은 계속 사용 |
| source_changed | 자료가 변경되었으므로 최신 저장 내용으로 재요청 |
| request_limit / daily_limit | 요청 한도 안내, 자동 연속 재시도 금지 |
| NEEDS_INPUT | 답변 대신 missing에 담긴 보완 사항 표시 |
| BLOCKED + dispatch_unknown | 실행 확인 중, 다시 만들기 자동 실행 금지 |
| FAILED | 해당 문항 재요청 제공 |
| stale | 이전 자료로 만든 초안 표시, 편집 내용 자동 덮어쓰기 금지 |

## 버튼 연결 예시

`client/interview-ai-client.js`는 ES 모듈이다. 기존 네 버튼의 이벤트에 연결하고, 생성 결과는 반드시 `textContent` 등 텍스트 렌더링으로 표시한다.

```javascript
import {createInterviewAI} from '/client/interview-ai-client.js';

const ai = createInterviewAI({
  request: async (url, body) => {
    const response = await fetch(url, {
      method: 'POST', credentials: 'same-origin',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body)
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw Object.assign(new Error(data.error), {code: data.error});
    }
    return data;
  },
  onUpdate: data => renderDraftPanel(data) // 기존 입력란과 분리된 결과 영역
});

// 기존 저장 함수는 DB 저장이 성공한 뒤 resolve해야 한다.
await ai.generate('self_intro', {savePending: saveCurrentStudentData});
await ai.generate('motivation', {savePending: saveCurrentStudentData});
await ai.generate('public_service', {savePending: saveCurrentStudentData});
await ai.generate('core30', {questionId: selectedQuestionId, savePending: saveCurrentStudentData});

// 보완한 문항만 다시 요청
await ai.retryItems(requestId, 'core30', [selectedQuestionId], {
  savePending: saveCurrentStudentData
});
// 다시 접속했을 때
const history = await ai.requests();
await ai.resume(selectedRequestId);
// 로그아웃/화면 해제 시
ai.destroy();
```

위 네 generate 호출은 버튼별 이벤트의 예시이며 페이지 로드 때 연속 실행하는 코드가 아니다. 앱의 실제 저장·표시 함수명으로 연결한다. `prepare.ready=false`이면 필요한 경험 입력을 안내한다. 클릭 처리 중 버튼을 비활성화하고 해제 시 예외도 처리한다.

한 인스턴스는 현재 선택한 요청을 조회한다. 다른 유형의 작업도 서버에서 계속 진행되며 요청 목록에서 전환할 수 있다. 기본 조회 간격은 5초, 연결 실패 시 15초다. 로그아웃 시 이전 화면과 연결 인스턴스를 폐기한다. 결과가 모두 종결되면 조회를 멈춘다.

## 상태와 복구 원칙

```text
QUEUED → PROCESSING → COMPLETED 또는 NEEDS_INPUT
                  → FAILED (종료가 확인된 잘못된 결과)
                  → BLOCKED (연결·설정·실행 여부 확인 필요)
BLOCKED/dispatch_unknown → 기존 실행 회수 또는 관리자 종료 확인 → CANCELED
FAILED/보완된 NEEDS_INPUT/해결된 CANCELED → 명시적 선택 재요청 → QUEUED
```

기본 동시 생성은 전체 1개다. 다른 학생에게도 차례가 돌아가도록 최근 배정 시각을 사용한다. 임대는 180초이며 PC가 약 30초마다 갱신한다. 실행 ID·기기·임대 토큰·증가 번호가 일치해야 결과를 저장한다.

PC는 전송 직전에 DISPATCHING 상태를 디스크에 먼저 저장한다. 생성이 시작되었는지 모르면 자동 재실행하지 않는다. 결과를 받으면 OUTBOX에 암호화 저장한 뒤 웹에 업로드한다. 업로드 실패나 응답 유실은 같은 결과를 재전송하며 모델을 다시 호출하지 않는다. 잘못된 결과의 재생성은 명시적 재요청으로 제한한다.

## 구현·인수 순서

1. 기존 앱의 네 버튼·저장 흐름을 위 API 계약에 연결한다.
2. 별도 테스트 DB에 마이그레이션을 적용하고 실제 PostgreSQL 다중 연결 임대 경쟁 테스트를 수행한다.
3. 본문 25개 필수와 부록 무작위 5개로 질문 목록을 저장한다. 학생은 이 목록에서 한 문항씩 생성한다. 재조회·재요청할 때 부록을 다시 추첨하지 않는다.
4. Windows Codex 앱 연결 문제를 해결하고 운영문서의 D0 검증을 통과한다.
5. 가상 학생 2명으로 웹→PC→앱→웹 전체 흐름과 자료 격리를 확인한다.
6. 소규모 실제 사용으로 사실 충실도·처리 시간·계정 사용량을 측정한다.
7. 사용자의 최종 확인 후 DB 적용·푸시·배포·기능 활성화를 진행한다.

50명 모두가 33개씩 요청하면 1,650개 생성 작업이다. 대기열 수용 테스트와 실제 생성 처리량은 다르다. 기본 하루 제한 20회는 초기 실험용이며 관리자가 승인된 사용량에 맞춰 조정한다. PC 가동 시간, 답변당 시간, 계정 한도에 따라 소요 시간이 달라진다.

## 로컬 검증

앱 저장소 루트에서 실행한다. DB 테스트는 기존 tests/helpers/interview-db.cjs와 PGlite 개발 의존성을 사용하며 운영 DB에 접속하지 않는다.

```powershell
node tests/interview-ai-api.test.cjs
node tests/interview-ai-client.test.cjs
node tests/interview-ai-db.test.cjs
python -m unittest discover -s tests -p test_worker.py -v
```

확인한 항목: 소유권 위조 차단, 직접 DB 접근 차단, 30문항 생성, 3경험 기준, 자료 변경 충돌, 중복 요청, 기기 범위·폐기, 임대 만료·오래된 결과 차단, 선택 재요청, 미확인 실행 격리, 업로드 재시도·프로세스 재시작 복구, Windows DPAPI 암호화, 가상 학생 50명의 1,650개 대기 작업.

실제 앱 모델 실행은 가상 학생 1건으로 추가 검증했다. 미검증: 일반 PC 프로그램의 즉시 실행 연결, 다양한 자료에 대한 자연어 품질, 실제 다중 연결 PostgreSQL 경쟁, 운영 배포 환경, 최종 버튼 화면 E2E. PGlite와 가짜 앱 어댑터 테스트를 운영 성능 검증으로 해석하지 않는다.

참고: [Codex CLI 공식 문서](https://learn.chatgpt.com/docs/cli/reference), [App server 공식 문서](https://learn.chatgpt.com/docs/app-server), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
