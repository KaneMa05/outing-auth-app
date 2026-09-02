# Supabase SQL 파일 안내

이 폴더의 SQL은 불필요한 임시 파일이 아니라 데이터베이스 구성, 기능 추가,
운영 데이터 보정, 검증 및 긴급 복구에 사용하는 이력입니다. 파일명과 경로는
테스트 및 운영 문서에서 참조하므로 임의로 이동하거나 이름을 바꾸지 않습니다.

## 먼저 확인할 실행 원칙

1. 새 프로젝트를 구성할 때는 우선 `schema.sql`을 사용합니다.
2. 운영 중인 프로젝트에는 필요한 변경 SQL만 적용합니다. `schema.sql`과 모든
   `add-*.sql`을 순서 없이 한꺼번에 실행하지 않습니다.
3. SQL 파일이 저장소에 있다는 사실은 해당 SQL이 운영 DB에 적용되었다는 뜻이
   아닙니다. 실행 전 실제 스키마와 기존 적용 이력을 확인합니다.
4. `데이터 변경`, `운영 보정`, `긴급 롤백` 파일은 대상 행 미리보기와 백업을
   확인한 뒤 수동으로 실행합니다.
5. `생성 파일`은 직접 수정하지 않고 대응하는 생성 스크립트를 수정한 뒤 다시
   생성합니다.
6. SQL 실행은 웹 앱 빌드·배포와 별개의 작업입니다. 운영 DB 실행에는 별도의
   최종 확인이 필요합니다.

## 표시 기준

| 표시 | 의미 |
| --- | --- |
| 기준 스키마 | 새 Supabase 프로젝트의 초기 구성을 위한 전체 스키마 |
| 기능 추가 | 테이블, 함수, 정책 또는 인덱스를 추가·변경하는 SQL |
| 데이터 변경 | 기존 운영 행을 갱신하거나 재구성할 수 있는 SQL |
| 생성 파일 | 스크립트가 생성한 시드 SQL이며 직접 편집하지 않음 |
| 운영 보정 | 특정 운영 상황에서만 수동 실행하는 보정·핫픽스 |
| 읽기 전용 | DB 상태만 조회하며 데이터를 변경하지 않는 검증 SQL |
| 긴급 롤백 | 데이터 또는 객체를 제거할 수 있어 평상시 실행 금지 |

## 1. 기준 스키마

| 파일 | 용도 | 주의 |
| --- | --- | --- |
| `schema.sql` | 새 프로젝트에 필요한 전체 테이블, 함수, 정책, 스토리지 구성을 생성 | **기준 스키마**. 기존 운영 DB에는 통째로 재실행하지 말고 차이를 먼저 검토 |

## 2. 공통 학생·출석·성적 기능

| 파일 | 용도 | 구분 |
| --- | --- | --- |
| `add-deleted-at.sql` | 외출 기록에 소프트 삭제 시각 추가 | 기능 추가 |
| `add-device-token.sql` | 학생 테이블에 기기 토큰 필드 추가 | 기능 추가 |
| `add-early-leave-reason.sql` | 외출 기록에 조퇴 사유 추가 | 기능 추가 |
| `add-multiple-exam-answers.sql` | 시험 문제의 복수 정답 지원 및 관련 함수·정책 갱신 | 기능 추가 + 데이터 변경 |
| `add-notice-target-audience.sql` | 공지 대상을 학원/인터넷 수강생으로 구분 | 기능 추가 + 데이터 변경 |
| `add-outing-sync-indexes.sql` | 외출 및 사진 동기화 조회용 인덱스 추가 | 기능 추가 |
| `add-student-categories.sql` | 오프라인·온라인 관리반·인터넷 수강생 유형과 기수 추가 | 기능 추가 + 데이터 변경 |
| `add-student-exam-numbers.sql` | 학생별 수험번호 저장 테이블 추가 | 기능 추가 |
| `add-student-profile.sql` | 직렬, 성별, 비밀번호 해시, 앱 등록 시각 추가 | 기능 추가 |
| `add-teacher-app-accounts.sql` | 학생 계정과 교사 앱 계정을 구분하는 필드·제약 추가 | 기능 추가 |

## 3. 수강 신청·문의·알림 기능

| 파일 | 용도 | 구분 |
| --- | --- | --- |
| `add-inquiry-board.sql` | 인터넷 수강생의 비공개 문의 게시판 추가 | 기능 추가 |
| `add-lecture-applications.sql` | 인터넷 수강 신청, 승인 및 취소 흐름 추가 | 기능 추가 |
| `add-lecture-application-course-type.sql` | 신청 과정 유형과 기수, 등록번호 배정 규칙 추가 | 기능 추가 + 데이터 변경 |
| `add-lecture-application-push-subscriptions.sql` | 가입 전 신청자의 웹 푸시 구독 저장 | 기능 추가 |
| `add-lecture-application-status-token.sql` | 신청 상태 비공개 조회용 토큰 해시 추가 | 기능 추가 |
| `add-lecture-application-terms-consent.sql` | 신청자의 약관 동의 시각 추가 | 기능 추가 |
| `add-phone-verification-challenges.sql` | 휴대전화 인증번호 검증 상태 저장 | 기능 추가 |
| `add-question-board.sql` | 인터넷 수강생 질문 게시판 추가 | 기능 추가 |
| `add-student-push-notifications.sql` | 등록 학생의 웹 푸시 구독 및 알림 설정 추가 | 기능 추가 |
| `add-student-push-preferences.sql` | 기존 푸시 구독에 활성화 여부와 종류별 설정 추가 | 기능 추가 |
| `release-application-identifiers-on-student-delete.sql` | 학생 비활성화 시 신청 전화번호·등록번호를 다시 사용할 수 있게 처리 | 기능 추가 + 데이터 변경 |
| `update-lecture-student-label.sql` | 인터넷 수강생 명칭과 승인 함수의 표시값 갱신 | 기능 추가 + 데이터 변경 |

## 4. 학생 기기 등록

| 파일 | 용도 | 구분 |
| --- | --- | --- |
| `add-student-devices.sql` | 학생 기기 등록, 검증, 초기화 테이블과 서버 함수 추가 | 기능 추가 |
| `hotfix-student-device-pgcrypto.sql` | `pgcrypto`가 `extensions` 스키마에 있는 운영 환경의 함수 검색 경로 보정 | **운영 보정** |
| `verify-student-devices.sql` | 기기 함수 권한, 보안 설정 및 테이블 상태 확인 | **읽기 전용** |

## 5. 스터디카페

권장 적용 관계는 기본 기능 → 운영 준비 → 좌석/접근 범위 확장 → 방/상점 순입니다.
각 파일 적용 여부는 실제 운영 DB 상태를 기준으로 판단합니다.

| 파일 | 용도 | 구분 |
| --- | --- | --- |
| `add-study-cafe.sql` | 프로필, 과목, 할 일, 학습 세션, 좌석 현황 등 기본 기능 추가 | 기능 추가 |
| `prepare-study-cafe-production.sql` | 운영 공개 전 상태 메시지, 제약 및 관련 구성을 보완 | 기능 추가 |
| `add-study-cafe-status-message.sql` | 기존 프로필에 상태 메시지만 별도로 추가 | 기능 추가 |
| `add-study-subject-goals.sql` | 날짜별 과목 목표와 달성 상태 추가 | 기능 추가 |
| `expand-study-cafe-to-192-seats.sql` | 좌석 번호 허용 범위를 192석까지 확대 | 기능 추가 |
| `expand-study-cafe-category-access.sql` | 스터디카페 접근을 학생 유형 기준으로 확장 | 기능 추가 + 데이터 변경 |
| `add-study-cafe-rooms.sql` | 비공개/공개 스터디룸, 구성원 및 채팅 기능 추가 | 기능 추가 |
| `add-study-cafe-shop.sql` | 포인트 지갑, 상점, 보유 아이템 및 장착 기능 추가 | 기능 추가 + 데이터 변경 |
| `remove-study-cafe.sql` | 스터디카페 함수와 테이블을 제거하는 긴급 되돌리기 | **긴급 롤백 — 관련 데이터 폐기 승인 없이는 실행 금지** |

## 6. 커리큘럼

| 파일 | 용도 | 구분 |
| --- | --- | --- |
| `add-curriculum-management.sql` | 과목, 단계, 강의 및 진도 관리 테이블 추가 | 기능 추가 |
| `seed-curriculum-public-recruitment.sql` | 공개채용 과정 커리큘럼 초기 데이터 입력 | **생성 파일** — `scripts/generate-curriculum-seed.js` 사용 |
| `seed-curriculum-vessel-crew-patrol.sql` | 함정요원 순경 과정 커리큘럼 데이터 입력 | **생성 파일** — `scripts/generate-curriculum-vessel-crew-seed.js` 사용 |
| `update-curriculum-stage-titles.sql` | 강의 제목을 기준으로 단계 제목을 재구성 | 데이터 변경 |
| `resequence-curriculum-by-workbook-days.sql` | 교재 일차 기준으로 단계를 재배치하고 단계 진도를 초기화 | **운영 보정 — 데이터 변경 범위 사전 확인 필수** |

## 7. 수동 운영 보정

| 파일 | 용도 | 구분 |
| --- | --- | --- |
| `reset-duplicate-name-registrations.sql` | 이름이 중복된 학생의 앱 등록 상태를 선별 초기화 | **운영 보정 — 파일 내 미리보기 쿼리 결과 확인 후 실행** |

## 빠른 찾기

- 새 프로젝트 생성: `schema.sql`
- 학생 기기 등록 문제 점검: `verify-student-devices.sql`
- 학생 기기 `pgcrypto` 오류 보정: `hotfix-student-device-pgcrypto.sql`
- 커리큘럼 원본 데이터 갱신: 생성 스크립트 실행 후 `seed-curriculum-*.sql` 검토
- 중복 이름 등록 초기화: `reset-duplicate-name-registrations.sql`
- 스터디카페 긴급 철회: `remove-study-cafe.sql` — 데이터 폐기 승인 필수

## 파일 정리 정책

- 기능이 현재 스키마에 합쳐졌더라도 개별 SQL은 변경 이력과 운영 복구 자료로 유지합니다.
- 새로운 변경은 기존 파일을 덮어쓰기보다 목적이 드러나는 별도 변경 SQL로 관리합니다.
- 생성된 시드 파일은 생성 스크립트와 함께 유지합니다.
- 읽기 전용 검증과 파괴적 롤백은 이름과 문서에서 명확히 구분합니다.
