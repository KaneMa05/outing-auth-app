# 2026-10-12 Supabase 장애 조사 및 503 완화 변경

상태: 사용자 승인으로 운영 DB 재시작 및 응답 복구 확인. 최초 장애 유발 원인은 미확정. 사용자 승인 후 22:26~22:27 KST에 Supabase 지원 문의 접수 완료. 이후 명시적인 푸시·배포 승인을 받아 커밋 `3de3d44`를 운영 배포했고 22:32:42 KST Ready 확인. 배포 후 공개 자산 및 실제 요청의 200 응답을 확인했다. 아래 추가 조사 내용은 배포 이후 로컬 문서에 기록했다.

## 확인된 원인과 남은 범위

앱의 503은 Supabase DB/API 응답 불능에 따른 상위 의존성 오류다. Vercel OX 요청에서 Supabase RPC가 90.05초 후 522를 반환하고 앱이 503을 반환하는 요청 추적을 확인했다. DB 자체 진단 연결도 실패했고, 여러 독립적인 테이블 조회 및 DB 내부 cron 실행이 함께 지연됐다.

그러나 DB가 처음 느려진 이유를 메모리 부족, 디스크 제한, 특정 SQL, 플랫폼 장애 중 하나로 확정할 증거는 부족하다. 재시작 복구는 원인 확정이나 영구 해결을 의미하지 않는다.

## 시간순 증거

날짜는 2026-10-12, 표 시간은 KST(UTC+9).

| 시각 | 관측 |
| --- | --- |
| 21:25~21:41 | REST 로그의 분당 응답 기록 127~544건, 평균 origin_time 228~440ms, 5xx 0건. 완료 로그 집계로 동시 요청 수는 아님. |
| 21:42:04.279 | cron job 7 `run_study_cafe_agents` 정상 종료. |
| 21:42:33.300 | checkpoint 완료. sync=0.008초. write=36.674초만으로 디스크 장애를 단정하지 않음. |
| 21:42:40~49 | REST 완료 로그 10초 집계 평균 origin_time이 직전 구간 약 280ms에서 4,915ms로 증가. 다음 구간은 14,529ms. 최초 성능 악화 구간을 이 시점 전후로 좁힘. 요청 시작 시각이나 동시 요청 수를 뜻하지 않음. |
| 21:42:51.210 | `validate_student_device` 학생별 advisory lock 대기. 21:42:51.415에 획득, 총 대기 약 1.5초. |
| 21:42:57.555 | 조회한 19:00~22:05 로그 범위의 첫 statement timeout. `final_exam_scores` 조회. |
| 21:42:59~21:43:21 | `students`, `exam_answers`, `attendance_checks`, 카페 snapshot/heartbeat, 보상, OX 갱신에서도 timeout. |
| 21:43:27.655 | cron job 7 startup timeout. |
| 21:43:29.187 | 다른 학생별 advisory lock도 약 4초 후 획득. 영구 교착 증거가 아님. |
| 21:43~22:14 | Database 자원 차트의 인접 측정 구간이 21:43 → 22:14로 표시됨. 약 31분의 지표 공백이 있어 이 구간의 CPU·메모리 정상 여부를 판정할 수 없음. 크게 보이는 IOwait 피크는 22:14~22:15의 복구 직후 값임. |
| 21:44:30 이후 | Realtime 내부 DB 연결 풀에서도 10~12초 queue timeout. 21:45:35에는 `pg_publication_tables` 시스템 카탈로그 조회까지 statement timeout. 앱 코드에만 국한된 지연이 아님. |
| 21:47:04.568 | Realtime 복제 슬롯 확인/생성 쿼리 slow-plan 로그 10,064ms. |
| 21:50~22:00 | PostgREST `PGRST003` connection-pool acquisition timeout 기록. |
| 21:57:06.260 | Vercel OX 호출 시작. Supabase `ox_device_gateway` 522(90.05초), 앱 503. |
| 22:00:07.849 | WAL archive command exit code 1. 최초 지연 이후 발생했으며 원인인지 결과인지 불명. |
| 약 22:07 | 사용자 명시 승인 후 프로젝트 재시작 실행. |
| 22:09:52.762 | 관리 대시보드의 확장 기능 목록 조회(`pg_available_extensions` 등)도 slow-plan 로그 54,569ms. |
| 22:12:09.585 | `pg_postmaster_start_time()`으로 확인한 DB 시작 시각. |
| 22:12:50.178 | SQL 진단 성공. 연결 28개, lock waiter 0개, DB 약 102MB. |
| 22:13 이후 | Vercel 실사용 OX·보상·스터디카페·사설방 요청 200 확인. 복구 직후 일부 PGRST002 schema cache 초기화 오류 별도 존재. |
| 22:20:00.224 | cron job 7 정상 완료 확인. 이후 SQL 확인에서 lock waiter 0개. |

## 가설 검토

- **전체 DB 연결 한도 초과:** 장애 전후 보고서의 연결 수는 대략 19~23개로 한도 60개보다 낮았다. PostgREST 전용 풀 대기는 확인됐지만 이것을 전체 DB 연결 한도 초과와 혼동하면 안 된다.
- **트래픽 폭증:** 21:41 544건/분은 21:28 정상 구간 514건/분과 비슷하다. 집계만으로 순간적인 burst를 배제할 수 없지만 단순 접속자 폭증을 입증하지 않는다.
- **학생별 잠금/봇 cron:** 잠금은 짧은 대기 후 획득 기록이 있고, 봇은 최초 timeout 전에 정상 완료했다. 서로 무관한 SELECT와 새 연결도 실패했으므로 이 둘을 단일 근본 원인으로 지목할 수 없다.
- **메모리/디스크/CPU:** Nano 인스턴스이며 보고서에 swap 사용 및 IOwait가 보인다. 그러나 swap 사용량 자체는 장애 증거가 아니다. 특히 21:43~22:14 자원 지표 공백 때문에 낮게 보이는 전후 CPU나 데이터 디스크 IOPS를 근거로 장애 중 자원 포화를 배제하면 안 된다. 시스템 디스크의 swap I/O, 디스크 지연·버스트 제한, 호스트 상태는 공급자 원시 지표로 확인해야 한다. 메모리 압박/호스트 I/O 정지는 조사 가설이며 입증된 최초 원인은 아니다.
- **OOM/교착/디스크 가득 참:** 21:35~22:12 PostgreSQL 로그에서 OOM, signal termination, deadlock detected, No space, too many clients를 검색했으나 해당 기록이 없었다. OS 로그를 볼 수 없으므로 OOM 등을 완전히 배제한 것은 아니다.
- **느린 SQL 순위:** `pg_stat_statements`가 22:12:09에 초기화됐다. 재시작 후 순위로 장애 직전 SQL 원인을 소급 판정하지 않는다.

## 코드에서 확인한 장애 증폭 요인과 로컬 변경

1. 스터디카페 snapshot RPC의 연결 장애 후 개별 legacy 조회로 분산되는 경로를 차단했다. 522/503, PGRST003, statement timeout, 네트워크 timeout이면 원래 오류를 반환한다. 미설치 RPC 등의 기존 호환 경로는 유지한다.
2. 카페·사설방·커리큘럼/OX에서 공유하는 Supabase 요청에 본문 수신까지 15초 제한을 적용했다. 실시간 best-effort broadcast는 5초 제한이다. 쓰기 요청을 자동 재시도하지 않으며, fetch 중단이 DB 트랜잭션 취소를 보장하지는 않는다.
3. 학생 보상 동기화 실패 후 재요청 간격을 60·120·240·300초로 늘린다. 탭 활성화/강제 동기화도 대기를 준수하고 마지막 확인 잔액을 유지한다. 성공 또는 학생 변경 시 대기를 초기화한다.
4. 보상 JS 버전과 서비스 워커 캐시 버전을 함께 갱신한다. 화면 구성, 권한, 학습/보상 규칙, DB 스키마 변경 없음.

이 변경은 장애 전파와 중복 부하를 줄이며, DB 최초 장애 원인에 대한 해결이라고 주장하지 않는다.

## 검증

- 요청 timeout·본문 timeout·호출자 취소·쓰기 무재시도 테스트 통과.
- 카페 snapshot 장애 시 추가 조회 차단 및 RPC 복구 테스트 통과.
- 학생 보상 지수 대기·강제 동기화·성공 초기화·학생 변경 테스트 통과.
- 전체 `npm test` 통과: Windows checkout의 기존 CRLF 민감 정규식 두 곳 때문에 테스트에서만 문자열 줄바꿈을 LF로 정규화하는 임시 `.tmp/normalize-test-newlines.cjs`를 NODE_OPTIONS로 사용했다. 제품 소스/기존 테스트 단언은 변경하지 않았다. 그대로 실행한 테스트는 이 기존 줄바꿈 이슈로 실패하므로 무조건 통과한다고 표현하지 않는다.
- Vercel production 모드 build-config 검증 통과. 생성 config.js는 기존 상태로 복구.
- `npm run test:criminal-law-ox` 전체 통과(종료 코드 0). 학생/교사 기기 검증, 학습, 이용권·권한 경로 포함.
- `git diff --check` 통과.

## 다음 진단에 필요한 공급자 증거

Supabase 지원팀이 12:40~13:12 UTC의 호스트 지표/커널·서비스 로그를 확인해야 최초 유발 원인을 더 좁힐 수 있다. 사용자 승인 후 아래 내용과 요청량·잠금 대기 근거를 지원 양식으로 전송했다. `Support request sent` 및 RONPARK APP 티켓 접수 문구를 확인했다. 화면에 접수 번호는 표시되지 않았으며 계정 이메일로 회신 예정이다. 분류는 Database unresponsive, 심각도는 Normal(서비스 복구 후 원인 분석 요청)이다. 별도의 프로젝트 데이터 접근 허용 스위치는 꺼둔 상태로 제출했다. 인스턴스 사양 변경과 DB 버전 업그레이드는 하지 않았다. 앱 코드 푸시·배포는 이후 별도 사용자 승인으로 완료했다.

현재 연결된 도구에서 접근 가능한 로그는 gateway, Postgres, PostgREST, Realtime, PgBouncer, Storage, Auth이며 호스트 커널/블록 장치 로그는 노출되지 않는다. 지원 회신은 이메일 수신 방식으로, 이번 조사에서 회신 내용까지 확인한 것은 아니다. 추가 발견한 지표 공백·시스템 카탈로그 지연은 아직 지원팀에 추가 전송하지 않았다.

### Supabase 지원 요청 요지 (접수 완료)

Subject: RCA request: project-wide database/API stall on 2026-10-12 12:42 UTC

Project: ehzrwkvuarertwvwoyus (RONPARK APP), ap-southeast-2, Nano. PostgreSQL 17.6.1.111, PostgREST 14.5.

Independent REST reads began hitting statement timeouts at 12:42:57 UTC. Cron job 7 completed at 12:42:04 but could not start at 12:43:27. PostgREST subsequently logged PGRST003, while the gateway returned 522 after about 90 seconds. Direct diagnostic SQL connections also timed out. The dashboard showed Unhealthy. A user-authorized restart restored the database (postmaster start 13:12:09 UTC) and application traffic recovered.

The database connection chart stayed below the 60-connection limit; sampled traffic was comparable to earlier healthy intervals. Advisory-lock waits were observed but also acquired shortly afterwards. Query statistics reset during the restart, so historical query attribution is unavailable.

Please investigate 12:40–13:12 UTC host/system-disk I/O and latency, CPU/instance throttling, swap activity, kernel OOM events, Postgres/PostgREST process health, and platform maintenance/network events. Please also explain the WAL archive failure at 13:00:07 UTC and provide a root-cause determination and prevention recommendations. We have not changed compute size or database schema.

## 참고

- [Supabase DB 보고서](https://supabase.com/dashboard/project/ehzrwkvuarertwvwoyus/observability/database)
- [Vercel 함수 관측](https://vercel.com/ronpark/outing-auth-app/observability/vercel-functions)
- [Supabase 연결 timeout 진단](https://supabase.com/docs/guides/troubleshooting/failed-to-run-sql-query-connection-terminated-due-to-connection-timeout): 재시작은 과부하/부적절한 용량의 임시 복구일 수 있음.
- [Supabase memory/swap 설명](https://supabase.com/docs/guides/troubleshooting/memory-and-swap-usage-explained-aPNgm0): swap 사용만으로 원인을 단정하지 않고 RAM·swap·IOwait·시스템/데이터 디스크를 함께 확인.
