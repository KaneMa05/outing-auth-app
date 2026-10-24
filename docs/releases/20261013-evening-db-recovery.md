# 2026-10-13 저녁 DB 접속 장애 복구

프로젝트: RONPARK APP (`ehzrwkvuarertwvwoyus`). 시각은 별도 표기 없으면 KST.

## 장애 확인

- 사용자가 접속 오류를 신고했다. 19:50~20:00 운영 로그에서 `students`, `attendance_checks` 등의 statement timeout, SQL PARSE/SET 단계 지연과 cron 7 startup timeout을 확인했다.
- 진단 SQL 연결에서도 `Connection terminated due to connection timeout`이 발생했다. Metrics API도 25초 제한 내 응답하지 않았다. 이번 장애 순간 호스트 메모리/IO 지표는 확보하지 못했으므로 근본 원인을 단정하지 않는다.
- Realtime 로그에서도 `SubscriptionManagerConnectionFailed`, `PoolingReplicationPreparationError`, 12초 DB connection queue timeout이 확인됐다.
- 관리 API의 최초 `ACTIVE_HEALTHY` 표시는 실제 SQL 연결 실패와 모순됐다. 상태 문자열만으로 서비스 정상 여부를 판단하지 않았다.

## 조치

- 사용자가 대화에서 **지금 DB 재시작 승인**을 명시한 후 Supabase의 RONPARK APP `Restart project` 확인 창에서 재시작을 실행했다(약 20:02).
- 화면과 관리 API에서 `RESTARTING`을 확인했다.
- 앱 코드, DB 스키마/데이터, 요금제/인스턴스 크기 변경은 하지 않았다. 기존 미배포 작업을 그대로 보존했다. 푸시와 배포도 하지 않았다.
- `.tmp/db-recovery-probe.cjs`는 앱의 공개 키로 학생·출석·공지의 ID 1건만 순서대로 조회하며 응답 내용과 키를 출력하지 않는다. 복구 확인 결과는 `.tmp/db-recovery-probe-*.json`에 저장한다.

## 검증

- `pg_postmaster_start_time()`: 20:07:16.852. 20:07:39 진단에서 연결 26개, lock waiter 0개.
- API 초기화 중 `PGRST002`가 있었으나 20:09:35에는 학생·출석·공지 공개 API 조회가 모두 200으로 복구됐다(261/199/161ms). 20:10:37 재확인도 200(272/197/160ms).
- 20:12:24 앱과 같은 `study-cafe-room-public` broadcast 구독을 메시지 발송 없이 열어 `SUBSCRIBED`를 확인하고 종료했다.
- 20:16:58 학생·출석·공지 조회 모두 200(254/188/170ms). 20:10~20:16:30 수집 로그에 Postgres ERROR/FATAL/PANIC 및 Postgres/Realtime timeout 없음. 로그 수집 지연과 이후 재발 가능성은 남는다.
- cron 7은 20:08 초기화 중 한 번 실패했고 20:09, 20:10 실행은 성공했다.
- 실제 교사 페이지 새로고침 후 관리자 로그인 화면이 표시됐다. 교사 인증 세션은 재로그인이 필요해 로그인 이후 UI/쓰기 기능은 검증하지 않았다. API 성공을 모든 사용자 여정 검증으로 확대하지 않는다.

## 반복 장애 원인 분석

판정: **서버 전체의 메모리/시스템 디스크 압박이 가장 유력한 가설**이다. 장애 순간 호스트 지표 공백 때문에 IO throttling, 커널 메모리 상태, 공급자 인프라 문제 중 최종 유발 원인은 확정하지 못했다. 재시작 이후 수치는 장애 직전의 직접 증거로 쓰지 않는다.

### 이번 장애의 시작

- 분석 범위 18:40~19:05에서 18:57까지 REST 응답은 정상 범위였다. 18:55 358건/평균 253ms, 18:56 310건/264ms, 18:57 320건/312ms. 같은 날 18:52에는 483건/335ms였다. 로그에 기록된 응답 집계이며 정확한 시작 시각·동시 요청 수를 뜻하지 않는다.
- 18:57:03.704 cron 성공. 18:57:10.023 checkpoint 완료(129 buffers, sync 0.009초). 18:58:12.263 cron startup timeout이 먼저 발생하고 18:58:24.815부터 서로 다른 테이블과 RPC의 statement timeout이 발생했다.
- Realtime 시스템 카탈로그 조회, PARSE/BIND, ABORT, 새 DB 연결까지 실패했다. 특정 화면 SQL이나 단일 학생 잠금만으로는 이 범위를 설명하기 어렵다.
- 장애 전 DB 연결 차트는 약 19개로 60개 한도보다 낮았다. DB 전체 연결 한도와 PostgREST 내부 10개 풀 고갈은 서로 다른 문제다. 무작정 풀을 키우는 조치는 하지 않았다.
- 18:40~20:07:16 PostgreSQL 로그에서 OOM, deadlock, too many clients, No space, signal termination 기록은 찾지 못했다. 커널 로그가 없으므로 해당 현상을 완전히 배제하지 않는다. 19:17 이후 WAL archive 실패 4회는 첫 장애보다 늦어서 최초 원인으로 볼 수 없다.

### 자원 증거와 한계

- 인스턴스 `t4g.nano`, OS 보고 RAM 406.51MiB. `shared_buffers` 설정은 224MiB, `work_mem`은 2,184KiB. 이들은 설정 값이며 전부 실제 사용 중이라고 합산하지 않는다. 서비스 프로세스별 RSS/PSS와 설정 변경 이력은 확보하지 못했다.
- DB 자체 크기는 약 103.9MiB, 디스크는 2GB 중 약 21% 사용. 데이터 저장 공간 부족의 증거는 없다.
- 기존 17:53~17:54 지표에서 약 82초 응답 간격 동안 swap-in 64,629페이지, swap-out 20,123페이지, major fault 83,349회 증가가 이미 관측돼 있었다. 단순히 swap 사용량이 남아 있는 상태가 아니라 실제 paging이 있었음을 보여준다.
- 이번 재시작 후 20:11:09~20:12:25 지표에서도 swap-in 70,665페이지, swap-out 47,806페이지, major fault 100,436회 증가. 시스템 디스크 읽기 약 1,328.6MiB, 데이터 디스크 읽기 25.6MiB. CPU 카운터 증분 중 IOwait 약 26.9%, 실제 CPU 연산 모드 약 10.9%. OOM kill 증가 없음. 이 구간은 복구 직후 초기화/밀린 요청의 영향이 포함되므로 평상시의 지속 부하로 단정하지 않는다.
- 이어 20:12:25~20:13:40에는 swap-in 12,199페이지, swap-out 3,939페이지, 시스템 디스크 읽기 175.4MiB, IOwait 3.0%로 줄었다. API 풀 대기도 0이었다. 안정화가 관측됐지만 RAM과 인스턴스 자체 조건은 재시작 전과 같다.
- 응답 간격과 공급자 지표 수집 간격은 다를 수 있어 위 카운터 증분을 정확한 초당 비율로 해석하지 않는다. 원본 `.tmp/db-metrics-1791889869471.json`, `1791889945691.json`, `1791890020290.json` 및 `.tmp/compare-db-metrics.cjs`로 재검산할 수 있다.
- 공식 문서에서 `nvme0n1`은 swap이 있는 시스템 디스크, `nvme1n1`은 Postgres 데이터 디스크다. 따라서 대시보드의 낮은 데이터 디스크 IOPS만 보고 디스크 병목을 배제할 수 없다. 시스템 디스크 전체 읽기가 전부 swap은 아니며 실행 파일/라이브러리 page-in도 포함될 수 있다.
- 18:40~19:10 대시보드 조회에서 메모리 차트는 18:59, CPU/데이터 디스크 차트는 18:58까지 표시됐다. 장애 지속 구간의 host 지표가 비어 있다. CPU IOwait 차트는 `.tmp/20261013-evening-db-cpu.png`에 저장했다.
- `pg_stat_statements`는 20:07:16 재시작 때 초기화됐다. 이후 느린 SQL 순위를 장애 이전 범인의 증거로 쓰지 않는다. 20:15 현재 deadlock 0, lock waiter 0, 30초 이상 client transaction 0, DB temp bytes/files 0이었다. OX 정렬 개선은 별도 유용한 최적화지만 이번 장애 전체의 유일 원인 또는 확정 해결책으로 주장하지 않는다.

### 왜 재시작 뒤 재발할 수 있는가

재시작은 막힌 세션과 메모리 상태를 초기화하지만 Nano RAM, 기본 서비스, 연결 풀, 앱 요청 패턴과 SQL을 바꾸지 않는다. 확인된 paging/IO 대기가 다시 커지면 연결 획득과 신규 프로세스 시작까지 늦어지고 API/Realtime에서 timeout으로 나타날 수 있다. 이는 관측에 부합하는 설명이며, 공급자 측 호스트 IO 제한 발동 기록을 확보해야 장애의 최종 유발 원인까지 확정할 수 있다.

## 비용 증가 없는 후보 조치 (미적용)

- 실제 Infrastructure 화면에서 Nano와 Micro 모두 시간당 $0.01344, Micro에 `Free Upgrade` 표시를 확인했다.
- `Review changes`에서 NANO → MICRO, BEFORE $9.68/MONTH → AFTER $9.68/MONTH, **+$0.00/month**를 확인했다(세금 제외). 변경은 Compute size 하나뿐이다. 최종 Confirm changes는 누르지 않았다.
- Micro는 RAM 1GB다. 최종 확인 시 자동 재시작되므로 별도 사용자 승인이 필요하다. 영구 해결 보장은 하지 않으며 변경 전후 paging/IOwait/API 지연을 비교해야 한다.
- 확인 화면: `.tmp/20261013-micro-cost-review.png`. 앱 배포, Small 증설, DB 마이그레이션은 이 제안에 포함하지 않는다.

### 야간 적용 요청 — 클라우드 예약 등록 완료, DB 변경 미적용

사용자는 2026-10-14 03:00~04:00 Asia/Seoul에 이용자가 없는 시간을 골라 적용하기를 요청하고 예약 등록을 지시했다. 처음에는 전용 도구 부재로 미등록이었으나, 2026-10-13 20:29 KST에 ChatGPT 웹 예약 화면에서 **일회성 클라우드 예약 등록을 완료했다**. UI의 다음 실행 시각은 `2026. 10. 14. 오전 3:00` / `GMT+9`다. DB 전환은 아직 실행하지 않았다.

- 예약 ID: `6ace1617a5c481909890f799a8a79fd7` (`automationSource=cloud`).
- 예약 링크: https://chatgpt.com/scheduled?automationId=6ace1617a5c481909890f799a8a79fd7&automationSource=cloud
- 등록 확인 화면: `.tmp/20261014-db-schedule-confirmed.png`.
- 실행 시 Supabase 접근 권한·브라우저·필요 도구가 없거나 승인 검토에 차단되면 우회하지 않고 보류 사유를 보고하도록 지침에 명시했다. 예약 등록은 실제 Compute 변경 성공을 보장하지 않는다.

- 일회성 시작: 2026-10-14 03:00 Asia/Seoul (2026-10-13 18:00 UTC).
- 대상: Supabase RONPARK APP, `ehzrwkvuarertwvwoyus`만.
- 작업: 실제 이용 현황을 확인한 뒤 Nano → Micro 전환. 사람의 최근 활동과 봇/기본 서비스 연결을 구분한다. 사람의 이용 여부를 확인할 수 없거나 이용 중이면 적용하지 않고 보고한다.
- 최종 검토 화면에서 비용 증가 $0.00, 변경 항목이 Compute size 하나인지 다시 확인한다. 비용이 증가하거나 다른 변경이 포함되면 중단한다.
- 자동 재시작은 이 전환에 포함된다. 기존 요청은 이 시간대에 한정된다. 복구 시간을 확보하도록 03:30 이후에는 새 전환을 시작하지 않고 보류한다. 이미 Micro 이상이면 변경하지 않고 상태만 보고한다.
- 앱 푸시·배포, SQL 마이그레이션, 요금제·기타 설정 변경은 하지 않는다. 기존 로컬 작업을 보존한다.
- 적용 후 DB SQL, 학생/출석/공지 API와 Realtime 구독을 검증하고 시각·결과를 기록한다. 실제 사용자 데이터를 테스트 목적으로 수정하지 않는다. 실패 시 승인 범위를 넘는 추가 변경은 하지 않고 보고한다.
- 이번 예약은 클라우드로 생성됐다. 현재 로컬 브라우저 인증 세션이나 로컬 도구가 예약 실행에 그대로 제공된다고 가정하지 않는다. 필요한 접근을 확보하지 못하면 변경을 보류한다.

## 공급자 원인 확인 요청 초안 (미전송)

기존 지원 건에 프로젝트 `ehzrwkvuarertwvwoyus`, 2026-10-13 09:55~10:10 UTC 및 10:58~11:09 UTC를 추가해 다음을 확인해야 한다.

1. 09:57~09:58 시작 시점의 시스템 디스크(nvme0n1) latency/queue, EBS/instance IO balance 및 throttling 발동 기록.
2. 같은 시각 process별 RSS/PSS, major fault, swap-in/out, kernel OOM/memory pressure, blocked tasks.
3. 09:58 이후 Metrics 수집 공백의 원인, Postgres뿐 아니라 exporter/agent가 정지했는지 여부.
4. Nano에서 shared_buffers 224MiB 설정의 산정 근거와 사양 대비 기본 서비스 메모리 요구량.
5. 동일 시간대 호스트 장애/유지보수/플랫폼 이벤트 및 전날 반복 장애와의 공통 원인.

이번 대화에서는 지원 메시지를 발송하지 않았다.

## 후속

이번 재시작은 접속 복구 조치이며 영구 해결을 의미하지 않는다. 전날과 당일 반복된 DB 전체 지연의 근본 원인 분석과 기존 부하 완화 변경의 운영 반영 여부는 별도로 다룬다.

참고: [Supabase 연결 timeout 안내](https://supabase.com/docs/guides/troubleshooting/failed-to-run-sql-query-connection-terminated-due-to-connection-timeout).

추가 참고: [메모리와 swap 및 시스템/데이터 디스크 구분](https://supabase.com/docs/guides/troubleshooting/memory-and-swap-usage-explained-aPNgm0), [기본 서비스 메모리](https://supabase.com/docs/guides/troubleshooting/exhaust-ram), [Compute 사양과 Pro Nano/Micro 동일 가격](https://supabase.com/docs/guides/platform/compute-and-disk).
