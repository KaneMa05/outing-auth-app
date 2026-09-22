# 교재별 형사법 OX 권한 운영 반영

- 사용자 승인: ‘적용 배포 진행’.
- 운영 주소: https://app.ronparkpass.com
- 커밋: `fe96294185a54951ef2d3b27e419304eaf925402`.
- 배포: [8PaDuUy5eXoYWndgQmfbr5dymAEm](https://vercel.com/ronpark/outing-auth-app/8PaDuUy5eXoYWndgQmfbr5dymAEm), Production / Ready.
- 운영 배포 시각: 2026-09-21 20:42 KST. 공개 운영 자산 검증 완료: 20:43 KST.
- 이전 운영 배포: `HxUWvZ165pFzmkANNrbNBK6CKVpg`, 기준 커밋 `e477b84`.
- DB 마이그레이션: `20260921113944_ox_book_access`, 성공.
- GitHub main에 한 번 푸시하여 연결된 Vercel 자동 배포 실행. 별도 중복 배포 없음.

기존 OX 이용자 3명에게 형법·수사·증거·공판 세 영역을 각각 보존했다. 기존 이용자 권한은 구매 내역과 구분하는 `legacy` 출처로 기록하며 권한 9개·변경 이력 9개가 생성됐다. 서비스 운영 스위치는 켜진 상태를 유지했다.

적용 전후 풀이 195건, 진도 192건, 메모 6건, 학생 333명, 최종 성적 237건, 성적 식별 정보 114건이 유지됐다. 등록 상태 지문은 `efc7eafc70fb91032face55de45a82f4`, 최종 성적 지문은 `007f5ec02a8c74229da9c72635303f2d`로 동일하다. 기존 이용자 3명 모두 전체·점진 로딩 함수에서 공개 문항 2,543개, 단원 65개와 영역 3개를 정상 조회했다. 배포 후 관리자 명단 함수에서도 세 명의 교재별 권한을 확인했다. 실제 학생의 구매·풀이·메모를 검증용으로 추가하거나 변경하지 않았다.

운영 도메인 자산 12개가 배포 커밋과 일치하고 앱 필수 리소스 50개가 HTTP 200을 반환했다. 기존 공개 연결 설정은 동일했다. 미인증 status/bootstrap/admin_members/admin_book_set 요청은 모두 401로 차단됐다. 신규 권한·이력 테이블은 익명 접근을 차단하며 내부 문서·SQL·QA 스크립트는 404로 비공개 상태다.

Security Advisor에 WARN/ERROR는 없었다. 서버 전용 테이블의 RLS 정책 없음 INFO 51개는 기존 49개에 신규 두 테이블이 추가된 결과다. 신규 테이블의 RLS 활성화, 브라우저 직접 접근 차단, 함수의 security invoker와 실행 권한 제한을 확인했다. [Supabase 안내](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

실제 관리자 브라우저 화면을 새로고침하자 기존 인증 세션이 만료되어 로그인 화면이 표시됐다. 로그인 이후의 운영 관리자 UI는 재확인하지 못했으며, 동일한 UI·API·SQL은 배포 전 로컬 브라우저 QA에서 확인했다. 사용자는 관리자 화면에 다시 로그인하면 새 구매 관리 기능을 사용할 수 있다.

진도표의 별도 로컬 변경 `final-scope-data.js`는 배포 커밋에 포함하지 않았고 작업 폴더에 그대로 보존했다. 이 사후 기록은 로컬에 남겼으며 기록만을 위한 추가 푸시·배포는 실행하지 않았다.

앱 롤백이 필요해도 교재별 검사 이전의 DB 함수로 되돌리지 않는다. 신규 구매자의 접근 제한과 기존 학습 기록을 유지한다.
