# 2026-10-14 Vercel·Supabase 운영 성능 점검

점검 시각: 2026-10-14 11:19~11:26 KST. 대상은 outing-auth-app / Supabase RONPARK APP (`ehzrwkvuarertwvwoyus`)이다. 다른 앱은 개별 성능 점검 대상에 포함하지 않았고, 비용·할당량 화면은 조직 전체 값임을 구분했다.

운영 조회, 로그 집계, Metrics API, 대시보드 및 로컬 소스를 점검했다. 운영 데이터·설정·앱 코드는 변경하지 않았고 푸시·배포·재시작·증설·마이그레이션·부하 테스트를 수행하지 않았다. 기존 미커밋 문서를 보존했다.

## 판정

현재 전면 장애나 Vercel 자원 포화의 증거는 없다. 다만 Supabase Nano의 실제 paging/IO 대기가 계속되며, 반복 조회와 Vercel↔DB 지역 불일치가 개선 우선순위다. 요금제의 월간 할당량 여유와 DB 인스턴스의 메모리 여유는 별개다.

## 현재 정상으로 관측된 항목

- DB 11:19:26: 크기 105 MB, 연결 32/60, 다른 활성 세션 1, lock waiter 0, idle in transaction 0.
- DB 시작 시각은 10월 13일 20:07:16 KST. 대시보드는 여전히 `NANO`, `t4g.nano`다. 예정됐던 Micro 전환이 완료됐다고 볼 수 없다. 예약 실행 자체의 실패 원인은 이번에 조사하지 않았다.
- 11:20:24 학생·출석·공지 API의 ID 1건 조회는 각각 HTTP 200, 260/240/177ms. 전체 화면 로딩이나 쓰기 기능 검증은 아니다.
- 09:15~11:20 수집된 게이트웨이 로그는 약 3.9만 건, 조회 시점 집계에서 HTTP 4xx/5xx 없음. HTTP 200 평균 origin_time 285.7ms, p95 약 636ms. 수집 지연으로 동일 범위도 총수가 달라질 수 있다.
- 최근 15시간 cron 7 실행 900회 성공, 실패 행 없음. 현재 deadlock 0, replication slot 2개 active, 각 WAL 보류량 약 5.5KB.
- PostgREST 풀 대기 0, 풀 timeout 누계 0, 사용 가능 10/10으로 관측됐다. DB 전체 연결 수와 이 풀의 한도는 서로 다른 값이다.
- Vercel 운영 배포는 `06a83a7`, `dpl_5oQgghn8q6o6UF2xjBc8EQFTMS4g`, Ready. 어제 OX 정렬 최적화 마이그레이션 `20261013112204`도 운영에 존재한다.

## 우려 1: Nano 메모리·시스템 디스크 압박 — 높음

11:20:24~11:21:30 Metrics 응답 간격 66.9초에서 확인한 값:

| 지표 | 관측 |
|---|---:|
| OS가 보고한 RAM | 406.5 MiB |
| 가용 RAM | 96.7 → 71.0 MiB |
| swap 사용량 | 507.2 → 502.0 MiB |
| swap-in 증가 | 33,631페이지 |
| swap-out 증가 | 14,396페이지 |
| major page fault 증가 | 50,457회 |
| CPU 카운터 증분 중 IOwait | 10.32% |
| CPU 계산 모드 비중 | 5.17% |
| 시스템 디스크 읽기 | 451.7 MiB |
| 데이터 디스크 읽기 | 20.7 MiB |
| OOM kill 증가 | 0 |

swap 잔량만으로 과부하를 판단한 것이 아니라 실제 페이지 교체를 확인했다. 그렇다고 이 짧은 구간으로 장기 포화나 어제 장애의 유일 원인을 확정할 수는 없다. 공급자 지표 수집 주기와 응답 시각은 다를 수 있다. 디스크 용량은 대시보드 기준 21% 사용으로 저장 공간 고갈의 증거는 없다.

원본: `.tmp/db-metrics-1791944424042.json`, `.tmp/db-metrics-1791944490941.json`. 비교 도구: `.tmp/compare-db-metrics.cjs`.

권장: 요청 감소와 함께 Micro 전환 검토를 이어가되, 현재 비용 검토 및 작업 시간 승인을 별도로 확인하고 전후 paging·IOwait·API 지연을 비교한다. 이번 점검에서는 사양을 변경하지 않았다.

참고: [메모리와 swap의 해석](https://supabase.com/docs/guides/troubleshooting/memory-and-swap-usage-explained-aPNgm0).

## 우려 2: Vercel 함수와 DB 지역 불일치 — 높음

운영 설정의 기본 함수 지역은 미국 `iad1`. 운영 `vercel.json` 재정의에는 `api/criminal-law-ox.js`만 `syd1`이 지정돼 있다. DB는 시드니 `ap-southeast-2`다. 따라서 OX 외 DB 의존 함수가 장거리 DB 왕복의 영향을 받을 구조다. 지역별 실제 개별 요청 추적과 변경 전후 비교는 아직 하지 않았다.

최근 12시간 Vercel 함수 관측:

| 항목 | 값 |
|---|---:|
| 전체 호출 | 약 21K |
| 오류율 / timeout | <0.1% / 0% |
| Active CPU P75 | 29ms |
| 평균 메모리 | 225MB / 2.05GB |
| CPU throttle P75 | 0.4% |
| TTFB P75 | 1.29초 |
| cold start | 0.5% |
| study-cafe | 약 15K회, P75 1.37초, 오류율 0% |
| student-rewards | 약 4.5K회, P75 682ms, 오류율 0% |
| criminal-law-ox | 865회, P75 275ms, 오류율 0.1% |

이 수치는 Vercel CPU·메모리 증설보다 DB 왕복 및 호출 구조를 먼저 개선할 근거다. 함수 간 역할이 달라 OX와의 시간 차이를 전부 지역 차이로 설명해서는 안 된다.

권장: DB 의존 API의 시드니 실행을 우선 검토하고, 외부 서비스 호출·지연·회귀를 확인한 후 승인된 배포로 적용한다. [Vercel 지역 설정 지침](https://vercel.com/docs/functions/configuring-functions/region).

## 우려 3: 스터디카페 갱신의 다중 DB 요청 — 높음

`api/study-cafe.js`의 일반 load 경로는 기기 검증 → 학생 조회 후 snapshot RPC, 포인트 정산, 장비 조회, 봇 외형 조회와 사전 상태 확인을 수행한다. heartbeat는 별도 단일 RPC 최적화가 이미 있다. 읽기 화면의 전체 갱신에 정산·장비 등 변경 빈도가 다른 데이터를 함께 묶는 부분이 남아 있다.

09:15~11:20의 주요 Supabase 요청: heartbeat 3,427, validate_student_device 3,109, students 3,072, award_study_cafe_time_points 2,422, equipment 2,421, snapshot RPC 2,393, bot appearance 2,384회.

`app.js`에는 숨김 화면 제외, 2분 안전 갱신, 30초 heartbeat, 중복 진행 방지 및 Realtime 이벤트 병합이 이미 구현돼 있다. 다만 Realtime에 따른 전체 갱신의 최소 간격은 1초여서 이벤트와 접속자가 늘면 다수 사용자가 함께 재조회할 수 있다. 현재 수치만으로 이 상한에 도달했다고 단정하지 않는다.

권장: 공통 방 상태와 개인 학습 상태를 분리하고, 장비·봇 외형은 변경 시 갱신하도록 검토한다. 정산 호출 감소는 지급 시점·좌석 유효성·학습시간 계산을 보존하는 테스트가 필요하다. 재시도 시 보상 중복 지급을 막는 기존 보호를 유지한다.

## 우려 4: 전체 범위 데이터 재조회·인덱스 — 중간

- `shared.js:2021`은 `exam_answers`를 시험 조건 없이 1,000건씩 끝까지 조회한다. 초기/전체 새로고침에서 필요 이상의 과거 시험 정답을 가져오는 구조다. 누적 SQL 통계에서 이 경로는 3,517회, 평균 약 38.75ms였다. 현재 한 쿼리의 극심한 지연보다 데이터 증가에 따른 반복 비용이 문제다.
- `shared.js:2079`의 성적 갱신은 동기생 성적·체력과 전체 `final_exam_scores`를 조회한다. 성적 화면 갱신 간격은 30초다. 최근 범위에서 fitness_scores 2,759회가 관측됐다. 비교/순위 범위를 보존하면서 기수·직렬·회차·평가월 단위로 줄여야 한다.
- Advisor: FK 선두 인덱스 부재 INFO 15개, 중복 permissive policy WARN 2개, 미사용 인덱스 INFO 33개, Auth 연결 절대값 INFO 1개.
- 실제 `fitness_scores`에는 `(assessment_month, student_id)` 인덱스만 있고 `student_id`가 선두인 인덱스는 없다. 동일 두 컬럼의 UNIQUE 및 일반 인덱스가 함께 있다. 학생 단위 조회 계획을 확인한 후 적합한 인덱스와 중복 인덱스 정리를 검토한다. 모든 FK 인덱스를 일괄 추가하거나 모든 미사용 인덱스를 삭제하지 않는다. 재시작 이후 짧은 관측 구간의 미사용 통계는 삭제 근거로 부족하다.

참고: [FK 인덱스 진단](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys), [중복 정책 진단](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies).

## 잔존 오류·공급자 이슈

- 10월 14일 **10:22:37 KST**, `ox_service`의 교재·챕터·문항 상태 집계 반환에서 statement timeout 1건이 확인됐다. 기기 gateway가 아니라 교사/관리 경로의 서비스 호출이다. 어제 학생 문항 정렬 최적화로 모든 OX 경로가 해결된 것은 아니다. 전체 DB 장애 재발로 확대 해석하지 않는다.
- 10월 13일 20:30~10월 14일 11:20 조회에서 Realtime ERROR 7건(01:00 전후와 07:57 KST), PostgreSQL ERROR 1건. Realtime은 서비스 프로세스 연결/시작 관련 오류였다.
- Supabase 공식 Realtime latency 사건은 확인 시점에도 identified 상태다. 10월 14일 08:27 KST 업데이트는 다수 고객 회복, 일부 지역 문제 잔존을 알렸다. 이 프로젝트 메모리 압박이나 어제 PostgreSQL 장애와의 직접 인과는 미확정이다. [공식 사건](https://status.supabase.com/incidents/01M4S5FT4GCZ8BWV2W1RB5WXNE).

## 비용·용량·보안·정적 자산

- Vercel 조직 전체 현재 주기: 포함 크레딧 $20 중 $2.94 사용, On-Demand Charges $0, 27일 남음. 이 앱만의 비용이 아니며 향후 월간 비용 예측도 아니다.
- Supabase 조직 전체, 10/11~11/11 주기: Egress 5.224/250GB, 저장소 평균 0.364/100GB, Realtime 최대 동시 연결 33/500, 메시지 34,555/5,000,000. 현재 할당량 초과 없음. 로그 수집 2.353/20GB, 조회 124.029/2,000GB도 초과 없음. Auth MAU는 자체 학생 인증의 전체 실사용자 수가 아니므로 수강생 수로 해석하지 않는다.
- 보안 Advisor는 `rls_enabled_no_policy` INFO 57개만 반환했다. 서버 전용/RPC 전용 테이블은 의도된 차단일 수 있으므로 일괄 정책 추가 대상이 아니다. Advisor 통과를 전체 인증·권한 감사 완료로 보지는 않는다.
- 정적 파일은 app.js 약 507KB, styles.css 약 482KB, shared.js 약 247KB(압축 전). build는 설정 파일 생성만 수행하며 번들 분할·minify 단계가 없다. 서비스 워커는 교사·학생 자산과 같은 파일의 여러 버전 URL을 함께 precache한다. 최초 설치/업데이트 다운로드 개선 후보이나, 이번에는 실제 전송 압축량·LCP를 측정하지 않았다. 기존 cache-first 자산 및 갱신 안전성을 보존해야 한다.

## 적용 순서 제안

1. 비용과 야간 작업 범위를 재확인한 Micro 안정화 검토, DB 지표 관찰.
2. DB 의존 Vercel 함수 지역 정렬. 앱 전체 회귀 후 배포 승인.
3. 스터디카페 전체 재조회·정산·공통 데이터 호출 감소.
4. 성적·시험 조회 범위 축소와 실제 실행 계획 기반 인덱스 개선, OX 관리 집계 timeout 추적.
5. 정적 파일 분리 및 서비스 워커 precache 정리.

모든 변경은 실제 사용자의 화면·순위·학습 기록·정산·기기 정책이 유지되는지 확인한 뒤 진행한다. 이번 요청은 점검이므로 구현·배포는 수행하지 않았다.

대시보드: [Vercel 함수 지표](https://vercel.com/ronpark/outing-auth-app/observability/vercel-functions), [Vercel 지역](https://vercel.com/ronpark/outing-auth-app/settings/functions), [Supabase DB](https://supabase.com/dashboard/project/ehzrwkvuarertwvwoyus/observability/database), [Supabase 사용량](https://supabase.com/dashboard/org/cwvsponcaagygetmbenx/usage).
