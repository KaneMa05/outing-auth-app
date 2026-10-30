# 학생 실전 모의면접(AI) 연결 · 2026-10-29

면접반 학생 앱의 `모의면접 → 실전 모의면접 (AI)` 경로에 기존 Live 음성 면접을 연결했다. 기존 로그인/기기 인증 요청 함수를 사용하며 이 모드에서만 Live 코드를 불러온다. 전공·인성 컨트롤러·API·테이블과 일반 수강생 화면은 변경하지 않았다. 병행 중인 iOS 파일·무료 API 서버·package.json도 수정하지 않았다.

## 학생 흐름

1. 마이크 확인, 선택적인 카메라 미리보기, 서버 이용 가능 여부 확인.
2. 학생 인증 후 제어 연결과 음성 연결 시작. 기본 3문항, 문항별 최대 2개 꼬리질문, 최대 10분.
3. AI 질문을 듣고 답변. 음성 자막과 현재 질문을 표시하며 자동 진행과 `답변 완료`를 지원한다.
4. 꼬리질문은 기존 서버 로직으로 직전 답변의 실제 인용을 근거로 생성한다. 답변 재개 시 생성 중 후보를 폐기하고 실패 시 답변을 보존한다.
5. 학생·면접관 음성을 별도 저장한다. 연결 중 이동을 막고, 종료 시 마이크·카메라를 해제한다. 카메라는 기기 미리보기만 제공한다.
6. 정상 완료 또는 중단 시점의 저장 문답으로 서버 리포트를 생성해 DB에 보관한다. 종료 여부가 불확실한 `unknown`은 완료 리포트로 표시하지 않는다.
7. 종료 화면의 종합/질문별 기록, 내 면접 기록에서 리포트와 음성을 확인한다. 새로고침 후 본인 기록을 다시 조회할 수 있다. 조회에는 AI를 호출하지 않는다.

음성 연결·답변 경계·꼬리질문·Storage 분할 저장과 복구는 기존 `client/interview-live-client.js`, `lib/interview-live-engine.js`, `lib/interview-live-socket.js`, `api/interview-live.js` 경로를 사용한다. 이번 작업은 모델·제공자 설정과 이용 제한을 변경하지 않았다.

## 저장 리포트

새 마이그레이션 `supabase/migrations/20261029142215_interview_live_result_reports.sql`은 기존 `ip_live_runs`에 `result_report` JSONB 컬럼과 서버 트리거를 추가한다. `completed`/`interrupted` 상태 변경과 같은 DB 트랜잭션에서 기록을 저장하고 기존 종료 기록도 채운다. Storage 재시도·보관 기한 변경만으로는 리포트를 재작성하지 않는다.

- 보고서 버전·응시 ID·생성 시각·종료 상태.
- 배정 기본 문항 수, 저장된 기본/꼬리 문답 수, 완료·미완료 답변과 전사가 없는 문답 수.
- 저장 당시 질문·답변·꼬리질문 근거 인용·부모 문항 ID·음성 구간 및 원래 전사 출처.
- 문답에 답변이 남지 않은 종료 시 진행 질문.
- 원음 대조, 미완료 문항 재연습, 꼬리질문 연결 확인 등 기록에 따른 다음 연습 안내.

이것은 실시간 전사를 근거로 한 사실 기록 리포트다. AI 역량 평가·강점/약점 분석·전공 키워드 채점·인성 구조 분석을 합산하지 않는다. `grade`/`score`는 null이며 전사 확정 여부는 false다. 전사 누락을 무응답으로 단정하지 않는다. 분석 리포트를 별도로 추가하려면 검증된 기준과 모델 분석 경로가 필요하다.

기존 `get`/`admin_get` RPC가 컬럼을 포함해 반환하므로 별도 API를 추가하지 않았다. 학생은 본인 응시만 조회하며 기존 RLS·서버 역할 제한·보관 만료 차단·비공개 음성 재생 링크 정책을 그대로 따른다. 입력 API에서 학생이 리포트를 지정하거나 수정할 수 없다.

## 운영 적용 전

코드는 로컬에만 작성했다. 기존 Live 마이그레이션 뒤에 새 리포트 마이그레이션을 적용하고 기존 Live 운영 설정·기능 플래그·비공개 저장소·정리 작업을 확인해야 한다. 설정을 변경하거나 운영 DB에 마이그레이션을 적용하지 않았다. 기존 활성화 조건과 `docs/interview-live-implementation.md`를 참고한다.

실제 기기의 마이크/WebRTC, 외부 AI 음성·꼬리질문 품질·지연·비용, 운영 저장소와 서버 실행 환경은 이번 작업에서 검증하지 않았다. 실제 학생 데이터 처리·유료 생성·푸시·배포 없음.

## 검증

```sh
PGLITE_MODULE=/tmp/ronpark-exam-db-tools/node_modules/@electric-sql/pglite node --test tests/interview-live-reports.test.cjs tests/interview-live-ui.test.cjs tests/interview-student-live-routing.test.cjs
PGLITE_MODULE=/tmp/ronpark-exam-db-tools/node_modules/@electric-sql/pglite npm run test:interview-live
PGLITE_MODULE=/tmp/ronpark-exam-db-tools/node_modules/@electric-sql/pglite node scripts/interview-student-live-preview.cjs
```

`test:interview-live`의 WebSocket 검사는 localhost 포트 바인딩이 필요하다. 격리 환경의 EPERM 제한으로 해당 검사를 로컬 포트 허용 환경에서 별도 실행해 통과했다. 외부 제공자는 모의 응답이다.

- 신규 DB 리포트 검사: 종료 기록 채우기, 완료/미완료·근거 보존, 불확실 종료, 원자적 저장, Storage 재시도 시 동일 리포트, 소유권·RLS·만료, 기존 API 반환.
- Live UI 6개와 학생 경로 분리 3개 통과. 늦은 권한 응답·화면 폐기·종료 중 응답·리포트 이스케이프·이동 차단을 확인했다.
- 기존 Live 인증·입장 제한·발화 재개·문답 경계·음성 파일·WebRTC 정리·실제 로컬 WebSocket·Storage 분할 복구·만료 정리 검사 통과. 기존 엔진 검사에도 새 마이그레이션과 결과 확인을 추가했다.
- 전공/인성/공통 저장/키워드 리포트/Live 관련 통합 검사 84개 통과. 면접 DB/API, 네이티브 launcher 4개, release-safety 3개도 통과했다.
- 기존 화면 로딩·이동 검사 8개 통과. 별도 배포 지역 검사 1개는 기존 `interview-draft-worker.js`의 vercel.functions 설정 누락으로 실패한다. 이번 작업에서 vercel.json을 수정하지 않았다.
- 고유 임시 디렉터리에서 격리 빌드·변경 JS 구문 검사 통과. 루트 config.js 상태 보존.

실제 내장 브라우저에서 학생 앱의 실전 모드 → 시작 → 홈 이동 차단 → 가상 발화 → 답변 완료 → 답변 기반 꼬리질문 → 전체 종료 → 리포트 표시 → 음성 재생 → 새로고침 → 내 면접 기록 → 같은 리포트와 음성 재조회까지 확인했다. 기본 문답 3개·꼬리 문답 3개·완료 답변 6개가 저장됐다. 학생·면접관 WAV는 각각 288,044바이트이며 헤더 길이를 확인했다.

이 브라우저 검증은 실제 학생 앱·실제 로컬 HTTP/WebSocket·PGlite·임시 파일 저장을 사용한다. WebRTC Peer·마이크 스트림·제공자 응답·서버에 입력한 PCM은 격리 fixture의 모의 구현이다. 합성 음성을 실제 마이크 발화로 검증한 결과가 아니다. fixture 서버는 환경 파일을 읽지 않으며 loopback 임의 포트와 고유 임시 경로만 사용한다.

검증 화면: `output/interview-student-live/report.png` (Git 제외).
