# Supabase 로그 절감 — 운영 반영 검토서

상태: 사용자 운영 반영·푸시·배포 승인(2026-09-28). 운영 DB migration 적용 및 권한 검증 완료, 서버 배포 진행.

## 변경 결과

스터디카페의 반복적인 Supabase HTTP 왕복을 통합했다. 앱 화면·실시간 갱신 간격·기기 인증 주기·학습/보상 규칙은 유지한다. 새로운 클라이언트 파일 버전이나 서비스 워커 갱신은 필요하지 않다.

| 경로 | 기존 | 변경 후 | 적용 조건 |
| --- | ---: | ---: | --- |
| 카페 heartbeat | DB HTTP 6회 | 1회 | 정상 공개 좌석 경로, 새 함수 설치됨 |
| 보상 sync | DB HTTP 3회 | 2회 | 새 함수 설치됨, 정상 인증 |
| 화면 snapshot RPC 일시 실패 후 | 해당 프로세스에서 계속 개별 조회 | 60초 후 제한적 재확인 | 반복 실패 시 대기 최대 5분 |

공개/사설 좌석을 모두 처리하지만 6회라는 기존 기준은 공개 좌석 정상 경로다. 전체 로그 GB의 절감률은 아직 측정하지 않았다. 정상 heartbeat 120회/시간이면 해당 DB HTTP 호출은 720회에서 120회로 감소한다. 브라우저→앱 API 호출 수는 그대로다.

## 주요 구현

### 접속 유지

`public.study_cafe_heartbeat(text,text,text,text)`는 기존 기기 검증 함수를 호출하고 학생 활성/유형, 좌석·세션 상태를 확인한 뒤 접속 시각만 갱신한다. 서버만 호출하는 SECURITY INVOKER 함수이며 PUBLIC/anon/authenticated 실행 권한을 제거했다.

본인 또는 다른 학생에게 만료 좌석 정리가 필요하거나, 본인 세션의 새벽 4시 날짜 전환이 필요하면 `legacy: true`와 인증된 최소 학생 정보만 반환한다. 이때 좌석·세션은 수정하지 않는다. API는 이 응답에 한해서 기존 정리·시간 정산·푸시 경로를 실행한다. 같은 요청에서 인증을 다시 반복하지 않는다.

기존 기기 검증은 학생 행 잠금을 사용한다. 좌석이나 사설 방 멤버 행이 이미 다른 트랜잭션에 잠겼다면 NOWAIT로 감지해 기존 경로로 넘긴다. 학생 잠금을 가진 채 좌석 잠금을 오래 기다려 잠금 순서가 뒤집히는 상황을 피한다. 해당 경합 경로와 퇴실·기기 해제를 실제 PostgreSQL의 별도 연결로 검증했다.

정상 heartbeat는 `last_heartbeat_at`만 바꾸고 공개 좌석의 `updated_at`, 상태, 과목, 학습 세션은 변경하지 않는다. 사설 좌석은 기존처럼 멤버 `updated_at`을 갱신하며 없는 좌석을 다시 만들지 않는다.

### 보상 동기화

`public.validate_student_reward_device(text,text,text,text)`에서 기기 검증과 보상 대상 학생 확인을 묶었다. 인증 트랜잭션이 끝난 뒤 기존 `sync_student_rewards`를 별도 호출한다.

보상까지 1회 호출로 합치는 안은 제외했다. 기존 검증 함수가 학생 행을 잠근 상태로 보상 등록/지갑 행 잠금을 획득하면, 다른 보상·구매 트랜잭션의 학생 외래키 확인과 잠금 순서가 엇갈릴 수 있다. 2회 구성은 기존 인증/보상 트랜잭션 경계를 보존한다.

보상 지급 조건, 금액, 첫 홈 방문 여부, 30분 적립, 연속 학습 보상, 조회 주기, 알림 UI, acknowledge/history 동작은 변경하지 않았다. 모든 수강생 유형의 기존 보상 접근 규칙을 검증했다.

### 오류와 복구

- 새 함수가 없어서 PostgREST가 실행 전에 반환하는 `404 / PGRST202`인 경우만 기존 경로로 전환한다. 미설치 상태를 잠시 기억하고 최대 5분 이내에 재확인한다.
- timeout, 연결 단절, 500, 권한 오류, 잘못된 응답은 저장 여부를 알 수 없으므로 기존 쓰기를 자동 재실행하지 않는다.
- 보상 인증이 끝난 뒤 실제 정산에서 오류가 나도 인증/정산을 반복 실행하지 않는다.
- snapshot은 기존 개별 조회 fallback을 유지한다. 60초·120초·240초·300초로 재확인 간격을 늘리며, 복구 확인은 인스턴스당 한 요청만 수행한다. 성공하면 정상 RPC 조회로 돌아간다.

## 검증 결과

- `npm.cmd run test:cost-logs`: 새 API 계약 9개 테스트 및 snapshot 복구/재시도 테스트 통과.
- `node tests/study-cafe-fast-rpc-db.test.js`: PGlite에서 실제 PostgreSQL SQL 실행 통과. 기존 기기 검증 함수·보상 함수와 스터디방 방장 제약 트리거를 포함했다. PGlite에는 pgcrypto 대신 내장 SHA-256 어댑터만 사용했다.
- 실제 PostgreSQL **17.11** + 실제 pgcrypto에서도 같은 DB 테스트 통과. 프로젝트의 임시 폴더에 공식 Windows 바이너리로 격리 DB를 생성했고, 127.0.0.1:55439에만 연결했다. 테스트 후 서버를 종료했다.
- 별도 DB 연결로 공개/사설 좌석 잠금 중 heartbeat, 퇴실 후 좌석 재생성 방지, 기기 해제, 반복 동시 heartbeat, 보상 잠금 순서, 중복 적립 방지를 검증했다.
- `node tests/student-rewards-db.test.js`: 기존 첫 방문·연속 학습·시간 경계·포인트 중복 방지 DB 테스트 통과.
- 전체 `npm.cmd test`: LF로 정규화한 검증 복사본에서 pretest/test/posttest 모두 통과. 원본 작업 폴더에서는 기존 `grade-ranking-groups.test.js`의 LF 전용 소스 추출 정규식이 Windows CRLF 파일에서 실패했다. 원본 기능 코드나 해당 테스트는 변경하지 않았고, 복사본의 줄바꿈만 정규화했다.
- 기존 스터디카페 API, 복귀/네트워크 단절/일시정지 등 lifecycle 25개 테스트도 직접 실행해 통과했다.
- 격리 복사본에서 테스트용 공개 설정을 사용한 production-mode `npm.cmd run build` 통과. 실제 운영 환경 변수와 운영 배포 빌드는 최종 반영 단계에서 확인한다.
- 변경한 서버 JS 구문 검사와 `git diff --check` 통과.

운영 DB는 기존 함수 정의·인덱스·트리거를 읽기 전용으로 확인했다. 학생 기록을 변경하거나 운영에서 테스트 보상을 지급하지 않았다. 로컬 PostgreSQL 17.11과 운영 PostgreSQL 17.6의 버전 차이는 있으며, 이 변경에서 쓰는 함수·잠금 문법은 기존 운영 버전에서도 제공된다. 운영 실트래픽에서의 호출 수·로그 GB 감소는 승인된 반영 후에 확인해야 한다.

## 반영 대상 파일

- `api/study-cafe.js`
- `api/study-cafe-rooms.js`
- `api/student-rewards.js`
- `supabase-rpc-retry.js`
- `supabase/migrations/20260928042109_study_cafe_heartbeat_fast_path.sql`
- `package.json`, 관련 API/DB 테스트와 기획·검토 문서

작업 시작 전에 수정되어 있던 `final-scope-data.js`는 이번 작업에서 변경하지 않았다. 커밋/배포 범위에 자동으로 포함하지 않는다.

## 승인 후 운영 반영 순서

2026-09-28 13:21 KST에 운영 프로젝트 RONPARK APP에 `20260928042109_study_cafe_heartbeat_fast_path`를 적용했다. 신규 함수 2개 모두 SECURITY INVOKER, 빈 search_path, PUBLIC/anon/authenticated 실행 차단, service_role 실행 허용을 확인했다. 보안 advisor는 적용 전후 같은 INFO 56건(RLS가 켜진 서버 전용 테이블의 정책 없음)이며 신규 경고·오류는 없었다.

푸시 전 운영 화면 주요 파일 8개가 기존 HEAD와 일치하는지 확인했고, 운영의 공개 Supabase 설정으로 격리 빌드를 통과했다. 로컬 migration 파일 이름은 실제 운영 migration 이력과 일치시켰다.

1. 작업 중 다른 변경과 구분해 위 파일만 리뷰하고 반영 범위를 확정한다.
2. 추가형 migration을 운영 DB에 적용한다. 기존 테이블·함수·학습 기록을 삭제하거나 교체하지 않고 새 함수 2개를 추가한다. migration에는 3초 lock timeout과 30초 statement timeout을 적용했다.
3. 새 함수의 존재, SECURITY INVOKER, PUBLIC/anon/authenticated 실행 차단, service_role 권한을 읽기 전용으로 확인한다.
4. 승인된 변경만 푸시·배포하고 기존 화면/기능을 확인한다. 함수 미설치 상태에서도 기존 처리로 동작하도록 구현했지만, 원칙적으로 DB 추가 → 서버 코드 순서로 진행한다.
5. 정상 heartbeat 1회, 보상 동기화 2회, 오류 응답·snapshot 복구를 확인한다. 운영 학생의 세션/보상을 임의로 생성하는 검증은 하지 않는다.
6. 24~48시간 초기 추세와 3~7일의 유사 이용량을 비교한다. 프로젝트별 로그 GB, 활성 학습 시간당 요청 수, DB 지연과 오류율을 함께 본다.

복구는 이전 서버 배포로 되돌리면 된다. 추가한 DB 함수는 기존 코드에 영향을 주지 않으므로 즉시 삭제할 필요가 없다. 개별 최적화 중지 설정도 제공한다: `STUDY_CAFE_HEARTBEAT_RPC_ENABLED=false`, `STUDENT_REWARDS_SYNC_RPC_ENABLED=false`. 환경 변수 반영에 재배포가 필요하다면 동일하게 최종 확인 범위에 포함한다.

이번 단계에서 정기 갱신 간격 확대, 만료 좌석 정리의 배치 전환, 보상 동기화 주기 조정, 공통 데이터 캐시는 적용하지 않았다. 사용자가 요구한 기존 기능·갱신 동작 보존을 우선해 서버 왕복 통합만 적용했다.

## 재검증

일반 API 테스트는 `npm.cmd run test:cost-logs`, DB 테스트는 `npm.cmd run test:cost-logs:db`로 실행한다. DB 테스트는 기존 `.tmp/reward-test`의 `@electric-sql/pglite@0.3.14`를 사용하거나 `PGLITE_MODULE`로 설치 경로를 지정할 수 있다.

실제 PostgreSQL 검증은 비어 있는 로컬 테스트 클러스터의 `log_reduction_test` DB(127.0.0.1:55439, 사용자 postgres)에서 `FAST_RPC_NATIVE_DB=1`로 DB 테스트를 실행한다. 테스트가 역할·테이블을 생성하므로 기존 개발 데이터가 있는 클러스터를 사용하지 않는다. Node 드라이버는 `.tmp/pg-rpc-test`의 `pg@8.16.3` 또는 `PG_TEST_MODULE`로 지정한다. 테스트는 임의 DATABASE_URL을 읽지 않는다.

참고: [공식 PostgreSQL Windows 다운로드](https://www.postgresql.org/download/windows/), [EDB 바이너리 배포](https://www.enterprisedb.com/download-postgresql-binaries), [기획서](../supabase-log-reduction-plan-20260928.md).
