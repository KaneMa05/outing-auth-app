# Android 모의면접 연습 테스트

2026-10-30. iOS `8b4f5a7`의 연습 기능을 Android Debug 전용 화면에 옮겼다.

- 면접관 무음 영상 3개 중 회차당 하나를 선택하고 내 카메라와 좌우 50:50으로 표시한다. 영상 생성·립싱크 호출은 하지 않는다.
- 영상은 기본 OFF다. 켜면 전면 카메라 영상과 마이크를 로컬 MP4로 저장하며, 답변별 WAV도 유지한다. 하나의 AudioRecord 입력을 AAC 영상·WAV·자막에 나눠 전달한다.
- 마이크 첫 PCM 입력 확인, 취소 가능한 3초 카운트다운, 질문 재생 뒤 답변 알림음, 로컬 음성 기준 4초 침묵 전환을 사용한다.
- 기존 206개 질문 음성과 음성 전용 JSON/WAV 기록을 유지한다. 새 선택 필드 `video=interview.mp4`는 기록 삭제 시 함께 지워진다.
- 질문·녹음·재생은 기기에서 실행된다. AI는 별도 테스트 서버와 사용자의 전송 동의가 필요하다.
- 새 Activity·캡처·영상·브리지·아바타는 `src/debug`에만 있다. 기존 정식 인증/Live Activity와 웹/서버·DB 설정은 변경하지 않았다.

## 로컬 빌드

기존 TWA Android 프로젝트와 SDK/JDK가 준비된 환경에서 실행한다.

```powershell
node scripts/play-store/prepare-native-interview.cjs --base=C:/path/to/play-android --target=C:/path/to/ascii-build --sdk=C:/path/to/android-sdk --debug-key=C:/path/to/existing/debug.keystore
```

`--target`은 Windows의 한글 경로 검사 문제를 피할 수 있도록 ASCII 경로를 지원한다. 기존 테스트 앱을 업데이트할 때는 같은 개발용 `debug.keystore`를 지정한다. 스토어 배포 키는 사용하지 않는다.

생성 폴더에서 `gradlew.bat --offline :interview:testDebugUnitTest :interview:assembleRelease :app:assembleDebug`로 검사와 Debug APK를 만든다. 설치 후 앱 목록의 **모의면접 네이티브 테스트**를 연다.

## 같은 Wi-Fi의 AI 테스트 서버

```powershell
node scripts/play-store/prepare-device-bridge.cjs
$env:INTERVIEW_DEVICE_BRIDGE = '1'
node scripts/interview-free-api-server.cjs
```

서버는 기존 `.env.local` 또는 환경 변수의 `GEMINI_API_KEY`를 사용한다. 키를 APK에 넣지 않는다. 준비 스크립트는 PC에 실제 할당된 사설 IPv4 주소만 선택하며, 필요하면 명령 마지막에 주소를 지정할 수 있다. Windows에서는 Git에 포함된 OpenSSL을 찾고 `OPENSSL_PATH`로 경로를 지정할 수도 있다.

준비 후 빌드 명령에 `--device-bridge`를 추가하면 APK에 해당 PC 주소·인증서 핀·로컬 연결표를 넣는다. 서버와 APK는 같은 작업 폴더에서 만든 설정을 사용해야 한다. 인증서는 2일 유효하며, PC IP 변경·인증서 갱신 후에는 APK도 다시 만들어야 한다. 휴대폰은 같은 Wi-Fi에 연결한다. 서버 실행과 AI 호출은 빌드 작업에서 자동으로 수행하지 않는다.

`--device-bridge` 없이 만들면 기존 USB 전달용 loopback 설정을 유지한다. HTTPS/WSS는 사설 IPv4의 8788만 허용하고 번들 인증서와 호스트를 확인한다. 일반 HTTP는 USB용 127.0.0.1:8787에만 허용한다.

## 기기에서 확인할 항목

1. 권한 거절·카운트다운 중 종료 시 늦은 질문/녹음이 시작되지 않는지.
2. 첫 마디, 무응답 4초·마감 직전 재발화, 자막 지연 중 전환이 맞는지.
3. 카메라 준비→면접 이동, 50:50 배치, 동일 인물 유지, 영상 반복 경계가 자연스러운지.
4. 녹화 ON/OFF, MP4의 실제 음성·영상, 저장 완료 후 재생, 기존 음성 기록과 삭제가 맞는지.
5. 앱 전환·화면 잠금·이어폰·전화·저장 공간 부족에서 음성이 보존되고 자원이 해제되는지.

빌드와 단위 검사 통과를 실기기 카메라·코덱·음성 동기화 검증으로 간주하지 않는다. 푸시·스토어 업로드·운영 배포는 별도 최종 확인 후 수행한다.

구현 참고: [Android MediaCodec](https://developer.android.com/reference/android/media/MediaCodec), [MediaMuxer](https://developer.android.com/reference/android/media/MediaMuxer).
