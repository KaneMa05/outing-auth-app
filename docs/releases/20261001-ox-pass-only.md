# OX 이용권 단일화 — 2026-10-01

상태: 사용자 최종 승인 후 운영 DB 적용 완료. 푸시·배포 진행.

## 변경 내용

- 교재 구매 여부와 구매일을 OX 이용 조건에서 제외한다. 개별 지급과 일괄 지급 이용권으로만 수강생의 영역별 권한을 판단한다.
- 기존 활성·검증된 구매 권한은 동일 영역의 개별 이용권으로 전환한다. 기존 중지 상태, 비활성 계정, 일괄 지급 이용권, 풀이 기록, 메모 및 교사 학습 권한은 유지한다.
- 관리자 화면은 개별 이용권 지급·회수, 이용 중·중지·이용 종료·미지급 표시를 사용한다. 일괄 지급받은 영역도 이용 중 필터에 포함한다.
- 개별 이용권은 회수 전까지 유효하다. 일괄 지급의 만료·재원 조건은 유지하며, 어느 한 이용권을 회수해도 다른 유효 이용권이 남으면 학습할 수 있다.
- 기존 구매 데이터는 이력으로 보존하며 이후 권한 판단에는 사용하지 않는다. 배포 전 API 인스턴스의 기존 등록 요청도 DB에서 이용권 지급으로 연결한다.

## DB

`supabase/migrations/20261001090401_ox_pass_only_access.sql`

- `ox_individual_passes`와 service_role 전용 RPC `ox_pass_admin`을 추가한다.
- 기존 활성 구매 권한을 이관하고 전환 이력을 기록한다. 사전 조회 당시 전환 대상은 15개 영역 권한이며, 적용 직전 다시 확인한다.
- 기존 학습·기기 검증 흐름은 유지하고 권한 판정 함수의 구매 권한 조회만 이용권 조회로 변경한다.
- 트랜잭션 내 적용, lock_timeout 3초 / statement_timeout 30초. 운영 반영 전 현재 권한·기록 수를 확인하고 반영 후 보존 여부 및 보안 advisor를 확인한다.

## 검증

- `npm.cmd run test:criminal-law-ox`: 통과. 최종 구 API 호환 처리 수정 후 `node tests/criminal-law-ox-passes.test.cjs` 재검증 통과.
- 배포 대상만 구성한 `.tmp/ox-pass-only-validation`에서 `npm.cmd test`: pretest/main/posttest 모두 통과.
- 운영 공개 설정으로 격리된 production 빌드 통과. 작업 공간의 config.js는 유지.
- `node scripts/ox-books-ui-qa.cjs`: 세 수강생 유형, 개별 지급·회수·이력, 온라인 관리반 일괄 지급·회수, 전체 중지/재개, 학습 중 회수, 기록 유지, 읽기 전용 권한, 390/1100px 화면 검증 통과.
- 전환 후 구매 데이터의 추가·변경이 권한에 영향을 주지 않음, 중복 지급·동시 수정 거절, 익명/학생 직접 DB 접근 차단을 검증했다.
- 전체 테스트 로그: `.tmp/ox-pass-release-tests.log`; OX 로그: `.tmp/ox-pass-tests.log`; 브라우저 로그: `.tmp/ox-pass-only-browser.log`.

## 배포 범위

OX JS 6개, API, app.js의 OX 안내·동적 로딩 버전, index.html/teacher.html/sw.js의 해당 자산 버전, package.json, OX 테스트/QA, 이 마이그레이션과 릴리스 문서.

작업 공간에 있던 성적 삭제·파이널 범위 스크롤 등 다른 변경은 격리된 배포 후보에서 제외했다. 최종 승인 후 DB 적용 → 해당 변경만 커밋·푸시 → 자동 배포 상태와 실제 운영 파일·API 확인을 진행한다.

## 운영 DB 적용 결과

- 2026-10-01: `20261001090401_ox_pass_only_access` 적용 성공. 기존 권한 15건 전환, 누락 0건, 전환 이력 15건.
- 기존 회원 69명, 지급 배치 5건, 대상 65건 유지. 회원·기존 구매 이력·배치·대상 데이터 해시가 적용 전후 동일.
- 풀이 718건, 진행 599건, 메모 29건 보존.
- 제보된 학생의 형법·수사·증거 이용권은 active, 미지급 공판은 none 확인.
- RLS 활성화, anon/authenticated의 신규 테이블 읽기 및 RPC 호출 차단 확인. 보안 advisor WARN/ERROR 없음. 서비스 전용 테이블의 [RLS 정책 없음 INFO](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)는 의도한 클라이언트 접근 차단이며 신규 테이블 포함 57건.

## 배포 완료

- 커밋: `1f6d53cd21e5f9c483683d53b632ea8abf172075` — main 푸시 완료.
- Vercel: `dpl_4LtJPExMK8Hn9wWSCsVoqEgMchX4`, READY.
- 운영: https://app.ronparkpass.com — 신규 배포 연결 확인.
- 운영 파일 13개가 검증한 배포 후보와 일치하며, 캐시 자산 54개 모두 HTTP 200 확인.
- 신규 이용권 API의 요청 검증·로그인 권한 확인. 내부 테스트·DB·지침 파일은 HTTP 404.
- 운영 DB의 관리자 조회에서도 제보 학생의 두 지급 영역 active 및 allowed=true 확인.
- 기존 미완료 작업 파일의 SHA-256이 배포 전후 동일함을 확인.
- 상세 검증 결과: `.tmp/pass-production-result.json`.
