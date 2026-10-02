# Vercel Observability 비용 절감 반영

작성일: 2026-09-28. 사용자 비용 검토 후 “반영해주세요” 승인에 따라 운영 설정 적용 완료.

## 적용한 설정

- RONPARK 팀 Billing → Observability Plus → Manage projects에서 `outing-auth-app`을 제외했다.
- 저장 완료 후 화면의 `1 project excluded` 및 Excluded Projects 아래 `outing-auth-app / Excluded` 표시를 확인했다.
- 팀의 Observability Plus 자체와 다른 프로젝트의 수집 설정은 유지했다.
- 이 프로젝트의 이후 Observability Plus 이벤트 사용료를 줄이는 설정이다. 이미 발생한 비용은 취소되지 않으며, 무료 관측 기능의 보관 기간·분석 제한이 적용된다.
- 앱 코드, 좌석·학습시간·보상 동작, 갱신 간격은 변경하지 않았다. 빌드·푸시·배포 없이 설정만 반영했다.

## 확인한 사용량

- 사용자가 제공한 최근 5일 캡처: 메모리 $1.12, CPU $0.37, Observability Events $1.81. 세 항목 합계 $3.30, 같은 추세의 30일 단순 환산 $19.80.
- 캡처의 전체 사용료 합계는 $3.54이며 30일 단순 환산 $21.24다. 이는 최종 추가 청구액이 아니다.
- 실제 대시보드의 현재 청구 기간은 2026-09-10~2026-10-10이다. 설정 작업 당시 사용 크레딧은 약 $17.91 / $20, 예상 청구액은 $20이었다. 이 기간 수치는 5일 캡처와 구분한다.
- Manage projects에 표시된 최근 30일 이벤트: outing-auth-app 10,379,444건, mariner-study 113,654건, pass-prediction-service 10,242건. 표시된 세 프로젝트 중 outing-auth-app 비중은 약 98.8%다.
- 5일 캡처의 Observability 비용 $1.81을 30일로 환산하면 $10.86이지만, 팀 전체 수치이며 이후 사용량도 달라질 수 있어 절감액 보장은 아니다.

## CPU·메모리 후속 판단

- 기존 커밋 `722271c`에는 정상 카페 heartbeat의 DB HTTP 요청 6회 → 1회, 보상 sync 3회 → 2회 개선이 있다. 상세 사항은 [기존 반영 검토서](20260928-supabase-log-reduction.md)를 따른다.
- `ensureStudyRoomLoaded`에는 이미 진행 중 조회를 막는 처리가 있다. 사설 방 조회 간격은 정상 실시간 연결 시 15초, 연결 불가 시 4초로 유지했다. 반복 호출 자체를 모두 중복으로 간주하지 않았다.
- 이미 구현된 DB 왕복 절감의 CPU·메모리 효과는 운영 배포 이후 24~48시간 추세와 유사한 학습 이용량을 비교해야 한다. 이번 작업에서 실제 절감률을 측정하거나 추가 코드 최적화를 배포하지 않았다.

## 복원

동일한 Manage projects 화면에서 Excluded Projects의 `outing-auth-app`을 다시 선택하면 Observability Plus 수집을 복원할 수 있다. 재활성화 이후 이벤트 사용료가 다시 발생한다.

참고: [Vercel Observability Plus](https://vercel.com/docs/observability/observability-plus), [Fluid 과금](https://vercel.com/docs/functions/usage-and-pricing), [Pro 사용 크레딧](https://vercel.com/docs/plans/pro-plan).
