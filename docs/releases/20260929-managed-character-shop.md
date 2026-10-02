# 온라인 관리반 캐릭터·상점·불꽃 공통 제공

상태: 사용자 최종 승인(“반영”) 후 운영 DB 적용, main 푸시, Vercel 운영 배포와 공개 서비스 검증 완료.

## 문제와 변경

온라인 관리반은 스터디카페 좌석에 캐릭터가 표시되지만 마이의 캐릭터 메뉴와 캐릭터·상점 경로가 막혀 있었다. 상점 클라이언트/API, 불꽃 렌더링도 `lecture`만 허용했다. 운영 DB 읽기 확인 결과 순공시간 포인트 적립과 아이템 착용 해제 함수에도 같은 제한이 있었다.

- 온라인 관리반과 인터넷 수강생 모두 마이 → 캐릭터, 캐릭터 → 상점, 스터디카페 포인트 버튼 → 상점 이용 가능.
- 두 유형 모두 색상·닉네임·상태메시지, 구매한 머리·의상·모자·책상 소품·의자와 불꽃 효과를 기존 방식으로 이용한다.
- 관리반 스터디카페를 끈 설정에서는 기존 경로 제한과 메뉴 숨김을 유지한다. 오프라인 수강생, 교사·관리자 화면, OX 공개 설정, 플래너, 성적 기능은 확장하지 않는다.
- DB는 `award_study_cafe_time_points`와 최신 머리 지원 버전의 `unequip_study_cafe_item`만 교체한다. 기존 계산/행 잠금/권한/보유 검사 구조를 유지하며 활성 `online_managed`를 허용한다. 기존 구매·착용 함수는 바꾸지 않는다.
- 기존 잔액·구매·착용·프로필·학습 기록과 상품 가격을 초기화하거나 갱신하지 않는다. 순공시간은 기존과 같이 학습일 오전 4시 기준, 30분당 5P이며 현재 학습일만 계산한다. 과거 학습일에 대한 소급 지급은 하지 않는다.
- 신규 타이머·폴링·cron은 없다. 관리반에도 기존 상점 요약 조회가 활성화되어 스터디카페 스냅샷마다 포인트 정산과 장비 조회 요청 2개가 추가되는 것은 예상된 차이이다. 불꽃은 기존 공부시간을 사용한다.
- app/shop 자산 버전과 서비스워커 캐시를 갱신했다. 기존 작업의 `teacher-grades.js`/`final-scope-data.js` 변경은 수정하지 않았고 teacher.html/sw.js의 기존 변경도 보존했다.

## 검증

- `npm run test:managed-shop`: 마이 링크/경로, 스터디카페 비활성 설정, 실제 상점 클라이언트 로딩, 두 유형의 구매·착용·해제 API, 기기 인증 실패/비활성/오프라인 차단 통과.
- 격리 PGlite에서 기존 DB의 관리반 적립/해제 실패를 재현하고 새 SQL 적용 후 통과. 같은 SQL 재적용, 기존 데이터 보존, 중복 적립/구매 방지, 잔액 부족, 미보유 착용/무료 머리 변경 차단, 모자와 머리 병행, 기본 머리 복귀, 재착용, service_role 전용 함수 권한 확인.
- `node tests/study-character-hair.test.js`: 두 유형의 프로필 필드 보존과 머리 구매 경로 검증 통과.
- `npm test`: `.tmp/shared-character-validation`의 LF 검증 복사본에서 전체 통과. 원본에서는 기존 grade-ranking-groups 정규식이 CRLF를 처리하지 못해 중단되므로 작업 파일을 변경하지 않고 별도 복사본을 사용했다.
- 위 검증 폴더에서 `npm run build` 통과. 환경변수 없는 로컬 설정 생성 경로이며 운영 설정 파일은 변경하지 않았다.
- `node scripts/study-cafe-managed-ui-qa.cjs`: HTTPS/운영 API를 차단한 실제 앱, 로컬 예시 계정으로 두 유형 모두 마이 → 캐릭터 → 상점 → 돌아가기와 320/390/768px 가로 넘침 검사 통과. 관리반 390px 캡처를 확인했다.
- `node scripts/study-character-fire-qa.cjs`: 320/390/768px 실제 캐릭터 렌더링, 단계·장비·휴식·범위·동작 줄이기 통과. 불꽃 단위 테스트는 두 유형 모두 오전 4시 초기화·시간 보정·중복 DOM 갱신 방지를 확인한다.
- JS 구문 검사 및 diff 공백 검사 통과.
- 운영 Supabase 보안 점검: ERROR/WARN 없이 기존 RLS/no-policy INFO만 확인. 운영 스키마와 함수 정의는 읽기만 수행했다. 실제 수강생으로 구매하거나 운영 포인트를 변경하지 않았다.

## 최종 확인 후 적용

1. 운영 DB 함수 정의가 검토한 버전과 같은지 재확인한다.
2. `20260929063345_study_cafe_managed_shop_access.sql`을 먼저 적용한다. CLI로 생성한 이 파일은 `supabase/expand-study-cafe-managed-shop.sql`과 동일하며 둘을 중복 적용할 필요는 없다. 3초 잠금 대기/30초 실행 제한을 두며 사용자 데이터 갱신은 없다.
3. 이번 변경만 기존 작업과 구분해 푸시·배포하고 두 수강생 유형의 진입과 자산 버전을 확인한다. 기존 사용자의 화면을 강제로 새로고침하지 않는다.
4. UI 문제 시 앱을 이전 버전으로 복구할 수 있다. 확장된 DB 함수는 구버전 인터넷 수강생 흐름과 호환되므로 지급·구매 기록을 삭제하지 않는다.

실제 모바일 OS 및 운영 계정 구매 검증은 미실시했다. 운영 반영이 완료되어 두 수강생 유형의 공통 기능으로 안내할 수 있다.

## 승인 후 운영 반영 기록

- 복구 기준 배포: `dpl_5wA1RGkRCPKZ8BNo9kab5UJsb5fu` / `https://outing-auth-5os1ojh5x-ronpark.vercel.app` (READY).
- 원격 main 기준: `c115627f9c713b86bf8c2619611b6ac7fd67e6e5`.
- `.tmp/managed-character-release`에서 이번 변경만 분리해 전체 npm test, DB 계약 테스트, 로컬 빌드를 통과했다. 기존 미완료 성적 삭제·회독 데이터 변경은 제외했다.
- 운영 마이그레이션 `20260929063345 / study_cafe_managed_shop_access` 적용 성공. CLI 생성 파일명을 실제 적용 이력에 맞췄으며 SQL 내용은 동일하다.
- 두 함수의 공통 유형 허용, SECURITY INVOKER, anon/authenticated 실행 차단, service_role 실행 허용 확인. NULL 학생 입력은 기존처럼 거절된다. 운영 학생의 구매·적립 함수는 시험 호출하지 않았다.

- 반영 커밋: `6b8fb50` — `Enable character shop and study flames for managed students`.
- main 푸시에 연결된 운영 배포 한 번으로 반영했다. 별도 수동 배포 없음.
- 운영 배포: `dpl_JDVbTvez8U6Jm1ZcbXkCfTtahsru` / `https://outing-auth-ajhsiinz4-ronpark.vercel.app`, READY.
- 서비스 도메인: https://app.ronparkpass.com (새 배포 연결 확인).
- 서비스 주소의 index/app/shop/sw/teacher와 기존 teacher-grades/final-scope-data가 배포 커밋과 일치한다. 캐시 자산 53개 모두 HTTP 200, 홈·교사 진입 정상, 내부 문서·SQL·테스트 파일 HTTP 404 확인.
- 존재하지 않는 학생·유효하지 않은 기기의 상점 API 요청 HTTP 403 확인. 실제 수강생 포인트·구매 기록을 변경하는 테스트는 하지 않았다.
- 배포 후 DB 보안 점검 ERROR/WARN 없음. 기존 RLS/no-policy INFO 56건만 유지.
- 로컬 main을 배포 커밋으로 맞추고 기존 미완료 성적·회독 파일의 보존을 해시 비교로 확인했다.
