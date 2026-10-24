# 2026-10-24 통합 변경 검토 및 출시 준비

## 대상과 상태

- 원본: `C:/Users/W11/Desktop/Coding/Codex_Project/outing-auth-app`.
- 검토·커밋 위치: `C:/Users/W11/Documents/ChatGPT/면접반관리/work/release-review`.
- 브랜치: `codex/release-review-20261024`.
- 기준: GitHub `KaneMa05/outing-auth-app`의 `main`, `d7407502c40598f334b2990ff379b35dc0f3eca7`.
- 원본의 미커밋 변경을 별도 복제본에서 검토했다. 원본 파일·브랜치·실행 프로세스를 변경하지 않았다. 복사 이후 원본 동시 변경은 발견되지 않았다.
- 푸시, 배포, 운영 DB 변경은 사용자 최종 확인 대기 중이다.

## 통합 범위

면접반 로그인·신청·관리자 메뉴, 인생그래프·답변 작성·기출/핵심인성·첨삭, 핵심 25제 과제·원본 요약 이미지·진단 지침/결과 저장, AI worker·실시간 모의면접·네이티브 연동 소스, 교사 메뉴 지연 조회, 스터디카페 집계 조회 개선을 포함한다. 새 기능의 인증·소유권·동시 저장·실패 복구·기존 화면 분리와 DB 접근 제한을 검토했다.

이미 main에 반영된 개인정보/계정 삭제 안내와 합격 예측 바로가기를 보존했다. 설치 패키지, 운영 화면 증빙, 작업 PDF/ZIP 등 생성물 120개와 비밀 환경 설정은 소스 커밋에서 제외하고 원본 위치에 보존했다. 네이티브 소스는 포함하지만 웹 배포가 앱스토어 배포를 수행하지 않는다.

## 검토 중 수정

1. 뒤처진 작업 기준과 최신 main을 통합하고 HTML·서비스워커의 앱/스타일 버전을 일치시켰다.
2. 중복 precache URL을 제거하고 설치 테스트가 중복을 거부하도록 보강했다. Cache.addAll 실패로 업데이트가 설치되지 않는 상황을 방지한다.
3. 기존 회귀 테스트의 Windows CRLF 처리, 최소 DOM 모의 객체, 과거 정적 버전에 고정된 조건을 수정했다. 실제 기능 검증 조건은 유지했다.
4. OX 지역 설정 검사는 OX와 일반 함수의 지역을 계속 검증하면서 면접 전용 함수 설정을 허용하도록 수정했다.
5. 운영 Live 변수·CRON_SECRET이 없는 상태에서 매분 실패 요청이 발생하지 않도록 초기 vercel.json에서 정리 cron을 제외했다. Live 활성화 시 정리 예약을 함께 등록해야 한다는 절차를 관련 문서에 기록했다.
6. 환경 파일·생성물 제외 규칙을 보완하고, 전체 면접 마이그레이션 및 시드의 실제 적용 순서를 검증하는 `npm run test:release-db`를 추가했다.

## 검증 결과

- JavaScript 회귀 테스트: 기존 151개 파일을 개별 실행했다. 최초 실패 6개는 원인을 확인해 수정한 뒤 모두 통과했다. 추가 DB 출시 테스트를 포함하면 152개 파일 중 149개 통과, 아래 3개는 명시적으로 미실행이다.
- 미실행: 실제 AI 호출/사용량을 소비하는 CLI 테스트 1개, 별도 로컬 PostgreSQL 서버가 필요한 동시성 테스트 2개. 임베디드 DB의 동시 저장·권한·불변성 테스트는 통과했다.
- `npm test`: pretest/test/posttest 전체 통과.
- Python worker/CLI/시뮬레이터 선택 테스트 19개 통과.
- `node scripts/verify-interview-build.cjs`: 격리 빌드 및 관련 문법 검증 통과. 빌드 검증용 공개 placeholder를 사용했으며 운영 config를 변경하지 않았다.
- `node tests/interview-preassignments-browser.cjs`: PC/모바일 25개 요약서, 저장 실패 시 입력 보존, 제출·재제출·이력, 자동 저장 후 진단, 결과 재조회, 관리자 지침, 가로 넘침 및 스크립트 오류 검사 통과. 가상 학생·로컬 DB·모의 진단만 사용했다. 생성 스크린샷도 확인했다.
- `npm run test:release-db`: 신규 면접 마이그레이션 29개 및 시드 5개 순서 적용 통과. 5,128개 문항이 비공개 초안으로 유지되고, 51개 테이블의 RLS, 브라우저 RPC 차단, 비공개 음성 버킷, 기본 비활성 상태, 기존 학생 보존을 확인했다.
- 전체 877개 소스/문서 파일 대상 비밀값·충돌 검사: 문제 없음. JS 파일 381개 중 380개 문법 통과. 기존 변경 없는 `docs/criminal-law-ox-proposal/history-actions.js`는 독립 실행 파일이 아닌 `else if` 문서 조각으로 제외한다.
- Vercel CLI 59.23.2의 로컬 배포 패키징: Windows `spawn cmd.exe ENOENT`로 완료되지 않음. 앱 빌드 성공과 별개로 Vercel 원격 빌드 성공은 아직 확인하지 않았다. placeholder 설정으로 생성된 `.vercel` 산출물은 운영에 올리지 않는다.

## 운영 준비 확인

- Vercel 프로젝트: `outing-auth-app`, `prj_8UAb0IPc4gGmow5RZ4wEz8vcgVhi`, RONPARK 팀.
- Node 24.x, Fluid 활성, 현재 팀 Pro 요금제 active. 소켓의 800초 설정은 해당 구성의 허용 범위 안에 있다. GitHub main이 운영 브랜치이고 도메인 자동 할당이 켜져 있다. main 푸시가 자동 배포를 시작할 수 있으므로 CLI 배포를 중복 실행하지 않는다.
- 운영 주소: `https://app.ronparkpass.com`, `https://outing-auth-app.vercel.app`.
- 기존 운영 복구 대상: `dpl_AX1S8dszHWfGZ1VHdVfy9tddGznY` (`outing-auth-2iwivqjqc-ronpark.vercel.app`, READY).
- Supabase: RONPARK APP, `ehzrwkvuarertwvwoyus`. 읽기 전용 조회에서 운영 `ip_*` 테이블이 없음을 확인했다.
- 누락된 DB 변경: `20261014082858_cafe_period_read_models.sql` 1개와 `20261020`~`20261023`의 `interview_*` 29개, 합계 30개. 기존 DB 이력은 유지하고 이 30개만 정확히 대조·반영한다. 과거 마이그레이션 전체를 재실행하지 않는다.
- 시드 순서: interview-corpus → interview-personality-analysis → interview-core30 → interview-life-catalog → interview-rubric-drafts. 관리자 수정 보존 및 비공개 초안 조건을 유지한다.
- Vercel에 Supabase·기존 교사 인증·카카오·면접 포털 관련 변수 이름이 등록되어 있음을 확인했다. Live/25제 원격 진단용 변수는 등록되어 있지 않다.
- 실시간 AI 음성, 25제 원격 AI 진단, 별도 AI worker 운영 연결은 준비되지 않았다. 이번 코드 배포만으로 해당 기능이 활성화되지는 않는다. 유료 호출·worker 등록·자동 작업 활성화는 별도 운영 설정과 확인이 필요하다.
- 면접반/과제 DB 기능 플래그는 마이그레이션 기본값인 비활성을 유지한다. 실제 수강생 등록·문항 공개·과제 제출 열기는 관리자가 확인하여 수행한다.
- `supabase/rest-study-cafe-agents-20261024.sql`은 날짜가 지정된 운영 작업 기록이다. 통합 배포에서 자동 재실행하지 않는다.

## 최종 확인 후 진행할 순서

1. 원격 main과 기존 운영 상태를 다시 확인한다. 신규 변경이 생겼다면 통합·재검증한다.
2. 필요한 DB 마이그레이션 30개와 비공개 시드 5개를 정확한 순서로 적용·검증한다. 기존 데이터 삭제나 기존 기능 플래그 변경은 하지 않는다.
3. 검토 커밋을 main에 fast-forward 방식으로 푸시하고 자동 배포를 추적한다. 자동 배포가 진행되면 별도 배포 요청을 중복 생성하지 않는다.
4. Vercel 빌드 성공·도메인 연결·기존 학생 및 교사 진입·신규 면접 포털·정적 자산·인증 차단을 확인한다. 빌드 실패 시 기존 READY 배포를 유지하며 오류를 해결한다. 운영 회귀가 확인되면 기록한 기존 배포로 복구한다.
5. 배포 커밋·배포 ID·검증 결과를 보고한다. 실제 AI 호출과 네이티브 스토어 출시는 이 웹 배포에 포함하지 않는다.

Vercel WebSocket 지원은 최신 공식 변경 기록을 확인했다: https://vercel.com/changelog/websocket-support-is-now-generally-available . 지원 여부와 이 프로젝트의 실제 음성 세션 성공 여부는 별개다.
