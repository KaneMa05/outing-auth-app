# 공통 응시·녹음·기기 저장 기반

2026-10-29. 정식 화면 미연결, 서버 호출 없음. 기존 iOS 연습 구현과 테스트 서버를 수정하지 않고 별도 모듈로 추가했다.

## 제공 범위

- `client/interview-attempts/core.mjs`: 전공·인성·실전 공통 응시 생성, 질문 스냅샷, 녹음 조각 순서 보존, 종료·중단, 계정별 조회, 재생 Blob 생성, 삭제. 점수는 항상 미확정이다.
- `client/interview-attempts/indexeddb.mjs`: 응시와 음성 조각을 동일 IndexedDB 트랜잭션으로 저장. 저장 실패 시 메타데이터만 진행되지 않는다. 삭제 시 음성 조각도 삭제한다.
- `client/interview-attempts/recorder.mjs`: 전달받은 마이크 스트림을 MediaRecorder로 녹음. 1초 간격 저장, 마지막 조각 저장을 기다린 뒤 종료, 종료 시 마이크 해제. WebM/MP4 지원 여부 확인. 녹음은 최대 64 MiB까지 저장한다.

한 브라우저 탭에서 저장소별 서비스 인스턴스 하나만 사용한다. 동시 탭 편집 잠금은 아직 제공하지 않는다. IndexedDB는 기기 내 저장이며 서버 권한·암호화·관리자 공유 저장을 대체하지 않는다. 다른 스크립트의 로컬 접근을 막는 보안 경계가 아니다.

## 향후 연결 예시

```js
import {openAttemptStore} from '../client/interview-attempts/indexeddb.mjs';
import {createAttempts} from '../client/interview-attempts/core.mjs';
import {recordAttempt} from '../client/interview-attempts/recorder.mjs';
const store = await openAttemptStore();
const attempts = createAttempts({store});
const attempt = await attempts.start({accountId, mode: 'job', questions});
// 반드시 사용자 시작 동작에서 권한을 요청한다.
const stream = await navigator.mediaDevices.getUserMedia({audio: true});
const recorder = recordAttempt({attempts, accountId, id: attempt.id, stream, onError});
await recorder.stop();
const audio = await attempts.audio(accountId, attempt.id);
```

예시는 호출 순서 설명이다. 실제 화면 연결 시 마이크 권한 거절·녹음 초기화 실패를 catch하고 응시를 interrupted로 종료해야 한다. 페이지 이동 전 `await recorder.interrupt()`를 실행한다. 강제 종료는 마지막 저장 이후 조각이 유실될 수 있다. 다음 진입에서 `list`로 recording 상태를 찾아 사용자에게 중단 기록으로 안내하고 `finish(..., {interrupted:true})`로 닫는다. 다른 탭에서 사용 중인 응시를 임의로 종료하면 안 된다. Blob은 합쳐서 재생하며 개별 조각의 단독 재생은 보장하지 않는다.

## 검증

`node --test tests/interview-attempt-foundation.test.mjs`: 5개 통과. 세 모드·질문 스냅샷·계정 범위·동시 저장 순서·마지막 조각·저장 실패·중단·삭제 검사. 저장소와 MediaRecorder는 가짜 구현이다. IndexedDB 모듈 구문 검사 통과.

기존 `interview-live-ui.test.cjs`: 5개 통과.
기존 `interview-navigation-loading.test.cjs`: 8개 통과, 서버 region 설정 검사 1개 실패(설정 항목 undefined). 이번 추가 모듈을 import하지 않는 검사이며 기존 설정 파일은 변경하지 않았다.

## 남은 작업

- 실제 브라우저 IndexedDB의 재시작·용량 부족·트랜잭션 실패·삭제 검증과 iOS/Android 실기기 녹음·합친 Blob 재생 검증.
- 동시 탭 소유권, 명시적 중단 기록 복구 UI, 사용자 전환·기기 저장 삭제 정책.
- 질문별 답변 구간, 타이머·응시 제한과 정식 학생 화면 연결.
- 인증된 서버 업로드·공유 조회, 재시도·중복 방지, 보관 종료일·30일 삭제.
- WebM/MP4를 전공 채점용 PCM WAV로 변환. 영상 녹화는 별도 개발.

현재 화면·라우트·API·DB·package.json을 수정하지 않았다. 푸시·배포·유료 API 호출 없음.

## 2026-10-29 후속: 실제 브라우저 검증 및 서버 연결

추가 파일:

- `recovery.mjs`: Web Locks 기반 응시 소유권. 잠금이 살아 있는 응시는 복구에서 제외하고 페이지 종료 후 남은 recording 응시를 interrupted로 전환한다. 호출자는 녹음·업로드·삭제의 전체 수명 동안 `withAttemptLease`를 사용해야 한다. Web Locks 미지원 브라우저에서는 안전하게 실패한다.
- `sync.mjs`: 기기 녹음의 SHA-256 생성 → 서버 응시 등록 → 512 KiB 분할 전송 → 서버 확정. 재실행 시 동일한 조각을 재전송해 복구한다. 자동 반복 요청이나 로컬 원본 삭제는 없다.
- `lib/interview-attempt-storage.cjs`: 서버 디스크 영속 저장 어댑터. 사용자별 경로 분리, 원자적 파일 교체, 같은 ID의 다른 내용 거부, 길이·전체 해시 검증, 만료 접근 차단·물리 삭제 함수를 제공한다. 확정 grade/score는 null이다.
- `lib/interview-attempt-http.cjs`: POST와 정확한 origin 검사, 주입된 인증 신원으로만 조회·저장. 요청 본문의 accountId는 받지 않는다. 수강 여부·보관 종료일은 주입된 서버 authorize 정책이 결정한다.
- `scripts/interview-attempt-preview.cjs`: 기존 개발 서버와 분리된 localhost 전용 합성 QA 서버. 임시 테스트 세션과 24시간 만료 정책만 사용한다. 운영 로그인이나 실제 학생 자료를 위한 서버가 아니다.

### 실제 검증 결과

Codex 내장 브라우저에서 격리 화면을 열어 버튼으로 실제 브라우저 API를 실행했다. MediaRecorder와 IndexedDB는 가짜 구현을 사용하지 않았다. 시험 신호는 Web Audio 합성음이며 실제 사람 음성이나 물리 마이크는 사용하지 않았다.

1. 실제 MediaRecorder 녹음 → 조각 저장 → 종료 → 브라우저 오디오 디코딩 성공.
2. 잘못된 조각 순서에서 실제 IndexedDB 트랜잭션 롤백 확인.
3. 응시 잠금 중 복구 요청은 해당 응시를 건드리지 않음.
4. DB 연결 종료·재개 후 저장 메타데이터 유지.
5. 페이지를 실제 새로고침한 후 음성 조각 복구·재생, 미완료 응시 interrupted 전환 성공.
6. 브라우저 HTTP → localhost 서버 → 실제 디스크 저장·확정·재조회 성공.
7. 기기와 서버 파일의 전체 SHA-256 일치, 서버 파일 브라우저 디코딩 성공.
8. 동일 업로드 재실행 성공. 업로드 오류 시 기기 파일 보존 및 다음 재시도 성공.
9. 다른 로컬 계정 목록에 기록 미노출, 삭제 시 실제 IndexedDB 음성 조각 제거 확인.

자동 검사: 공통 기반·서버 저장 테스트 총 11개 통과. 기존 Live UI 5개, 네이티브 launcher 4개 통과. 서버 객체를 새로 만들어 부분 업로드를 이어 완료하는 재시작 검사, 위조된 계정·origin 거부, 해시 불일치·만료 파일 삭제도 포함한다. 운영 DB와 실제 외부 저장소는 호출하지 않았다.

### 실행 방법

```sh
node scripts/interview-attempt-preview.cjs
```

출력된 origin을 브라우저에서 연 뒤 녹음·저장 검증 → 새로고침 → 복구·서버 저장 검증을 실행한다. 자동 검증은 합성음만 쓴다. 마이크 버튼은 별도 수동 검증용이다. 저장 위치는 출력의 dataRoot이며 기본은 임시 폴더다. `ATTEMPT_QA_ROOT`에 절대 경로를 지정하면 테스트 서버 재시작 후 같은 디스크 자료를 사용한다. 동일 origin의 IndexedDB 복구에는 `ATTEMPT_QA_PORT`로 같은 포트를 지정한다. 테스트 세션은 서버 재시작마다 갱신된다.

### 운영 연결 전 경계

이번 단계는 **브라우저 → 로컬 HTTP 서버 → 디스크 저장까지 실제 연결된 공통 기반**이다. 기존 정식 화면·API 라우트·운영 설정과 연결하지 않았다.

서버 디스크 어댑터는 전용 영속 볼륨을 가진 단일 프로세스용이다. Vercel 임시 디스크에 연결하면 안 된다. 여러 프로세스·인스턴스에는 DB 트랜잭션·객체 저장소 기반 어댑터가 필요하다. fsync 기반 전원 장애 내구성과 분산 잠금은 제공하지 않는다. 조회 시 전체 파일(최대 64 MiB)을 메모리에 읽으며 스트리밍·Range 재생은 후속이다.

운영 서비스에는 기존 로그인/기기 인증·수강 등록·종료일 계산을 `authenticate`와 `authorize`에 연결하고, 응시 시작 시 서버 질문 스냅샷·공식 채점 기준을 별도로 확보해야 한다. 현재 질문은 연습용 클라이언트 스냅샷이며 공식 채점 입력으로 신뢰하면 안 된다. 서버는 조각 크기와 해시를 검사하지만 오디오 컨테이너의 실제 형식·발화 유효성은 아직 검증하지 않는다. 운영 전체 저장량·사용 횟수 한도와 만료 정리 스케줄도 연결해야 한다.

실제 마이크·iPhone Safari/Android 실기기, 브라우저 용량 부족과 강제 프로세스 종료는 추가 검증 대상이다. 실제 테스트는 새로고침으로 중단을 재현했다. 마지막 저장 이후 음성 유실 가능성을 안내해야 한다.

다른 작업의 iOS 코드·테스트 서버·package.json 및 기존 화면·API·DB·배포 설정은 변경하지 않았다. 푸시·배포 없음.

추가 회귀 검증: 기존 release-safety 3개 통과. 다른 작업의 고정 빌드 폴더를 피하고 고유 임시 폴더에서 build-config를 실행해 격리 빌드 통과, 기존 config.js 바이트 불변 확인. 신규/기존 검사 합계 23개 통과(공통 11 + Live UI 5 + launcher 4 + release-safety 3).
