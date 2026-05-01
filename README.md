# 론박스터디 외출 인증

학생 외출 신청, 사진 인증, 복귀 반납, 교사용 승인을 처리하는 정적 웹앱입니다.

## 로컬 실행

`index.html`을 브라우저에서 열면 바로 동작합니다. `config.js`의 Supabase 값이 비어 있으면 `localStorage`에 저장됩니다.

## Supabase 연결

1. Supabase 프로젝트를 만듭니다.
2. `supabase/schema.sql` 내용을 SQL Editor에서 실행합니다.
3. Project Settings > API에서 Project URL과 anon key를 복사합니다.
4. `config.js`를 아래처럼 수정합니다.

```js
window.OUTING_APP_CONFIG = {
  supabaseUrl: "https://YOUR_PROJECT_ID.supabase.co",
  supabaseAnonKey: "YOUR_SUPABASE_ANON_KEY",
};
```

이후 학생/교사용 화면이 같은 Supabase 데이터를 공유합니다.

## 포함 기능

- 학생 고유번호 기반 외출 신청
- 사진 또는 영수증 없음 사유 인증
- 복귀 반납 처리
- 관리자 현황판, 승인/반려, 메모
- 학생 등록/삭제
- 외출 신청 및 복귀 반납 링크 복사
- Supabase용 DB 스키마 초안

## 화면 주소

- 학생용 외출 체크리스트: `index.html#student`
- 교사용 관리: `teacher.html#teacher`
- 현장 복귀 QR: `index.html#return-qr`

Vercel 배포 후에는 아래처럼 사용합니다.

- 학생용: `https://YOUR_DOMAIN.vercel.app/#student`
- 교사용: `https://YOUR_DOMAIN.vercel.app/teacher#teacher`
- 현장 복귀 QR: `https://YOUR_DOMAIN.vercel.app/#return-qr`

## Vercel 배포

### CLI 배포

```powershell
cd C:\Users\W11\Desktop\Coding\Codex_Project\outing-auth-app
npm install -g vercel
vercel
vercel --prod
```

### GitHub 배포

1. 이 폴더를 GitHub 저장소에 올립니다.
2. Vercel에서 New Project > Import를 누릅니다.
3. Framework Preset은 Other로 둡니다.
4. Build Command와 Output Directory는 비워둡니다.
5. Deploy를 누릅니다.

## 다음 단계

1. Supabase 프로젝트 생성
2. `supabase/schema.sql` 실행
3. 사진 업로드를 Supabase Storage로 연결
4. 관리자 비밀번호를 서버 환경변수로 이동
5. Vercel 배포 후 학생용/현장 복귀 QR 주소로 QR 코드 제작
