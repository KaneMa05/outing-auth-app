# 수강 신청 슬랙 알림 연결

필기반(오프라인·온라인 관리반·인터넷 수강생) 신청은 `필기반-앱`, 면접반 신청은 `면접반-앱` 채널로 전송한다. 슬랙 앱 하나에 채널별 Incoming Webhook 두 개를 연결한다.

## 1. 슬랙 설정

1. 기존 `필기반-앱`, `면접반-앱` 채널을 사용한다. 설정하는 사람이 두 채널에 참여했는지 확인한다.
2. https://api.slack.com/apps 에서 **Create New App → From scratch 영역의 Pick features → Continue**를 선택한다. 이름은 `RONPARK Notifications`, 워크스페이스는 `RONPARK`를 선택한다. Bot scope에 `incoming-webhook`을 추가하고 이벤트는 비워 둔 뒤 앱을 생성·설치한다. 이전 화면 구성에서는 **From scratch**로 표시될 수 있다.
3. 앱의 **Incoming Webhooks → Activate Incoming Webhooks**를 켠다.
4. **Add New Webhook to Workspace**를 눌러 `필기반-앱` 채널을 선택하고 허용한다. 생성된 URL을 필기반용으로 보관한다.
5. 같은 버튼을 다시 눌러 `면접반-앱` 채널을 선택하고 두 번째 URL을 만든다. 비공개 채널은 설정하는 사람이 먼저 참여해야 한다.

채널마다 다른 URL이 필요하다. 슬랙 앱을 두 개 만들 필요는 없다.

## 2. 서버 환경변수

Vercel의 해당 프로젝트 → **Settings → Environment Variables**에서 다음 값을 등록한다. 이 단계는 직접 설정하거나 별도로 승인된 범위에서 진행한다.

| 환경변수 | 값 |
| --- | --- |
| `SLACK_WRITTEN_APPLICATION_WEBHOOK_URL` | `필기반-앱` 채널의 웹훅 URL |
| `SLACK_INTERVIEW_APPLICATION_WEBHOOK_URL` | `면접반-앱` 채널의 웹훅 URL |

실제 알림은 Production에 설정한다. Preview/Development에는 비워 두거나 별도의 테스트 채널 URL을 사용한다. 로컬 Vercel 개발 환경에서는 `.env.local`에 넣을 수 있다. 배포 전 전송 점검에는 Git에서 제외되는 `.env.slack.local`도 사용할 수 있다. 웹훅은 비밀값이므로 채팅, 공개 저장소, `config.js`에 넣지 않는다.

환경변수와 코드가 운영 배포에 반영되어야 작동한다. **푸시·배포는 사용자의 최종 확인 후에만 진행한다.**

## 3. 동작과 확인

- 필기반: `/api/lecture-applications`의 신규 신청 저장 성공 후 필기반 채널로 보낸다. 신청 조회·승인·반려·중복 신청 거절에는 보내지 않는다.
- 면접반: `/api/interview-auth`의 신청 저장 성공 후 면접반 채널로 보낸다. 신청 정보 수정·재신청도 알리고 메시지에 표시한다. 로그인·조회·신청 실패에는 보내지 않는다.
- 전송 항목: 이름, 직렬, 한국시간 기준 신청 시각. 필기반은 과정과 마스킹된 연락처, 기수가 있으면 기수도 포함한다. 면접반은 수험번호를 포함한다. 생년월일·인증값·전체 전화번호는 보내지 않는다.
- 신청 저장 후 Vercel `waitUntil`로 전송하여 학생의 접수 완료 응답을 기다리게 하지 않는다. 전송 제한 시간은 4초이고 실패해도 신청은 유지된다.
- 값이 없는 채널은 전송하지 않는다. 배포 전에는 아래 명령으로 웹훅 실전송을 확인한다. 운영 신청부터 자동 알림까지의 확인은 배포 승인 후 별도로 진행한다.
- 자동 재전송·영구 큐는 없다. 전송 실패 시 Vercel 로그에 `[application-slack] written delivery_failed` 또는 `[application-slack] interview delivery_failed`가 남는다. 신청 원본은 관리자 화면에서 확인한다.
- `dev:local`의 가상 필기반 접수 경로는 슬랙을 호출하지 않는다. API 연동은 `npm run dev`(Vercel 개발 환경) 또는 배포 후 확인한다.

슬랙 무료 플랜에서 Incoming Webhook을 사용할 수 있다. 서버 사용량은 기존 요금제의 사용량에 포함되므로 서버 과금까지 무조건 0원인 것은 아니다.

검증: `npm run test:application-slack`, `node tests/lecture-applications.test.js`, `node tests/interview-auth.test.cjs`.

## 4. 배포 전 실제 전송 점검

1. `.env.local` 또는 `.env.slack.local`에 위 두 환경변수를 저장한다.
2. `npm run check:application-slack`으로 URL 형식과 두 채널의 서로 다른 웹훅 설정을 확인한다. 기본 실행은 메시지를 보내지 않는다.
3. `npm run check:application-slack -- --send-test`로 신청 API와 같은 전송 함수를 실행한다. 두 설정의 검증이 모두 통과해야 전송하며, 각 채널에 `연동 테스트 · 실제 신청 아님`으로 표시한 가상 신청 알림을 한 개씩 보낸다. DB에 신청 데이터를 만들거나 푸시·배포를 수행하지 않는다.
4. 출력한 `slack-test-...` 표식이 `필기반-앱`, `면접반-앱`의 알림에 각각 나타나는지 확인한다. `Slack acknowledged (ok)`는 Slack의 전송 승인 응답이며, 목표 채널 확인은 별도로 해야 한다.

`.env.slack.local`은 점검 명령이 읽는 로컬 파일이다. 실제 앱 서버에는 `.env.local` 또는 Vercel Production 환경변수 설정이 필요하며, 배포 전까지 운영 자동 알림은 활성화되지 않는다.

## 5. 2026-11-05 연결 검증 기록

- 앱: `RONPARK Notifications`, 워크스페이스: `RONPARK`.
- 필기반 채널: `C0CF4Q2MLE6`, 면접반 채널: `C0CEZLSQCN9`.
- 19:42 한국시간에 `npm run check:application-slack -- --send-test`를 실행했다. 신청 API와 같은 `notifyApplicationSubmitted` 함수에서 두 실제 웹훅으로 전송했으며, 두 요청 모두 Slack의 `ok` 응답을 받았다.
- 두 채널의 기록을 다시 조회해 표식 `slack-test-1793875320644`가 각각 도착한 것을 확인했다: [필기반 테스트 알림](https://ronpark.slack.com/archives/C0CF4Q2MLE6/p1793875321062739), [면접반 테스트 알림](https://ronpark.slack.com/archives/C0CEZLSQCN9/p1793875321293869).
- 테스트는 실제 신청이 아님을 표시한 가상 데이터로 진행했으며 운영 DB에 신청을 생성하지 않았다.
- `.env.local`에 서버용 변수를 반영하고 Vercel `outing-auth-app` 프로젝트의 Production에 두 변수를 `sensitive` 형식으로 등록·재조회했다. 실제 값은 문서와 공개 빌드에 기록하지 않았다.
- 슬랙 연동 테스트 4개, 기존 필기반·면접반 신청 테스트, 배포 안전성 테스트 4개, 점검 명령의 설정 오류·중복 URL·전송 차단 검증, 로컬 빌드를 통과했다.
- 위 전송 검증 시점에는 푸시·배포를 진행하지 않았다. 이후 사용자의 최종 승인을 받아 운영 반영을 진행한다.

공식 문서: https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/
