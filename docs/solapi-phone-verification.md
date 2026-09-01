# SOLAPI 카카오 알림톡 휴대전화 인증 개발 메모

수강생 등록 신청의 휴대전화 확인은 SOLAPI 카카오 알림톡 발송과 앱 서버의 자체 인증번호 검증을 조합한다. SOLAPI는 메시지 발송만 담당하며, 인증번호 생성·3분 만료·오입력 횟수 제한·성공 여부는 `phone_verification_challenges` 테이블과 서버 API가 관리한다.

## 현재 개발 상태

- 관리자 설정의 `로그인 시 인증번호 사용 허용`이 켜졌을 때만 인증 UI와 서버 API가 활성화된다.
- 로컬 서버에서는 SOLAPI나 카카오 채널 없이 실제 화면과 인증 흐름을 시험할 수 있다. 화면에 표시되는 로컬 미리보기 번호를 입력하면 된다.
- 운영 발송은 카카오 비즈니스 채널, 알림톡 템플릿, SOLAPI 환경변수와 DB SQL 적용이 모두 끝난 후에만 가능하다.
- 이 변경 자체는 원격 DB 적용, 푸시 또는 배포를 수행하지 않는다.

## 카카오 알림톡 템플릿

SOLAPI에 아래 내용과 변수명으로 알림톡 템플릿을 등록하고 심사를 받는다.

```text
[론박스터디]
인증번호는 #{인증번호}입니다.
#{유효시간}분 안에 입력해 주세요.
본인이 요청하지 않았다면 이 메시지를 무시해 주세요.
```

서버는 `#{인증번호}`와 `#{유효시간}`을 치환해서 보낸다. 템플릿 문구나 변수명을 바꾸려면 서버의 `sendSolapiVerificationMessage`도 함께 수정해야 한다.

## 운영 전 설정

1. Supabase SQL 편집기에서 `supabase/add-phone-verification-challenges.sql`을 적용한다.
2. SOLAPI에 카카오 비즈니스 채널과 위 알림톡 템플릿을 등록한다.
3. SOLAPI 콘솔에 발신번호를 등록한다.
4. 서버 환경변수를 등록한다.

```dotenv
SOLAPI_API_KEY=...
SOLAPI_API_SECRET=...
SOLAPI_API_BASE_URL=https://api.solapi.com
SOLAPI_KAKAO_PF_ID=...
SOLAPI_KAKAO_TEMPLATE_ID=...
SOLAPI_SENDER_NUMBER=숫자만 입력한 등록 발신번호
PHONE_VERIFICATION_TOKEN_SECRET=32자 이상의 무작위 비밀값
```

- API 키, API Secret, 서비스 역할 키, 인증 비밀값은 브라우저 코드에 넣지 않는다.
- `PHONE_VERIFICATION_TOKEN_SECRET`는 기존 교사 세션 비밀값과 별도로 생성한다.
- 알림톡 발송에 실패하면 SMS/LMS로 대체 발송되도록 `disableSms: false`를 적용했다. 이 경우 `SOLAPI_SENDER_NUMBER`에는 SOLAPI에 사전 등록된 발신번호가 반드시 필요하며, 대체 발송된 문자 유형의 요금이 적용된다.
- 운영 환경변수 등록과 배포는 사용자의 최종 확인 후 진행한다.

## 서버 흐름

1. `request-phone-verification`: 서버가 6자리 번호를 생성하고 해시만 DB에 저장한 뒤 SOLAPI 알림톡을 발송한다.
2. `verify-phone`: 서버가 번호, 만료시간, 최대 5회 오입력을 검증한다.
3. 성공하면 휴대전화 번호에 묶인 10분짜리 서명 토큰을 발급한다.
4. 등록 신청 시 관리자 설정이 켜져 있으면 유효한 서명 토큰을 요구한다.

같은 휴대전화 번호의 인증번호 발급은 10분 동안 최대 5회로 제한한다. 인증 테이블에는 원문 휴대전화 번호와 원문 인증번호를 저장하지 않으며, `anon`과 `authenticated` 역할의 접근 권한도 제거한다.

## 로컬 확인

```powershell
npm run dev:local
```

관리자 로컬 미리보기에서 인증번호 사용을 켠 뒤 로그아웃 수강생 미리보기로 이동한다. 휴대전화 번호를 입력하고 인증번호 받기를 누르면 로컬 전용 인증번호가 표시된다. 이 경로는 SOLAPI 호출이나 과금을 발생시키지 않는다.
