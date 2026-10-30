# iOS 전용 작업 폴더

현재 저장소의 웹·서버 작업 폴더는 그대로 `main`을 사용한다. iOS 네이티브 작업은 다음 전용 worktree에서 진행한다.

- 브랜치: `codex/ios-app`
- 경로: `/Users/ronpark/Documents/ChatGPT/RONPARK 관리반 APP/.worktrees/ios-app`
- iOS 소스: 위 폴더의 `native/ios/`
- 빌드 안내: 위 폴더의 `native/BUILDING.txt`

같은 공유 작업 폴더에서 브랜치를 바꾸지 않는다. iOS 수정·Xcode 프로젝트 생성·기기 빌드는 전용 worktree 경로를 지정해 실행한다. 다른 채팅이 기존 폴더를 계속 사용하는 경우 iOS 전용 경로를 명시해야 하며, 채팅의 작업 경로는 자동으로 변경되지 않는다.

기존 iOS 소스·연습 화면·카메라·녹음/녹화·아바타·빌드 도구 변경은 iOS 브랜치에 보존했다. 공통 로컬 테스트 API 서버(`scripts/interview-free-api-server.cjs`)는 기존 웹·Android 개발과의 호환성을 위해 양쪽에 보존했다. 공통 API·DB 변경은 웹·서버 쪽에서 관리하고 필요한 변경만 iOS에 통합한다.

기존의 전공·인성·실전 웹 기능 변경, DB 마이그레이션, 로컬 음성 생성 도구와 생성된 5,128개 음성 파일은 원래 폴더에 보존한다. 새 iOS worktree에는 기존 Debug 패키지의 질문 음성과 면접관 영상을 포함하며, 새로 생성한 전체 음성을 자동으로 앱에 넣지는 않는다.

분리 전 미커밋 파일 209개의 원본·SHA-256 목록·작업/인덱스 패치는 `output/ios-separation-20261029T220250Z/`에 보관했다. 이 백업은 Git에서 제외한다. `.swiftpm` 사용자 설정·생성 프로젝트·빌드 산출물·로컬 브리지 연결 설정은 커밋하지 않는다. 새 worktree의 Debug 빌드를 위해 기존 연결 JSON만 로컬 복사했으며, 제공자 키나 서명 비밀을 커밋하지 않았다.

분리 시 시뮬레이터용 Debug/Release 빌드를 서명 없이 확인한다. 실기기 설치·재검증·푸시·배포·운영 DB 적용은 분리 작업에 포함하지 않는다.
