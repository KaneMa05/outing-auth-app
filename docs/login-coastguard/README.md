# 론박스터디 · 해양경찰 면접 로그인 시안 02

기존 경기장 시안은 ../login-arena/에 보존했습니다. 이 시안은 별도 HTML/CSS/JS이며 운영 앱과 인증 서버에 연결하지 않습니다. 푸시·배포는 진행하지 않았습니다.

실행: `node docs/login-coastguard/serve.cjs`

미리보기: http://127.0.0.1:4342

핵심 문구: 바다를 지킬 당신의 답변.

해양경찰 면접과 론박스터디의 정체성을 반영해 경비함·바다·새벽빛과 네이비 색상을 사용했습니다. 기관 공식 사이트가 아닌 학원의 면접 준비 화면으로 구성했습니다. 생성된 선박은 분위기 연출을 위한 가상 이미지입니다.

기존 interview-portal.js의 카카오 로그인 및 기존 수강생 등록번호/비밀번호 진입 방식에 맞춘 시각적 데모입니다. 계정 조회, 카카오 연결, 입력값 저장 및 전송은 하지 않습니다. 모션 끄기와 시스템 모션 감소 설정을 지원합니다.

검증: JavaScript 구문 검사, 로컬 HTTP 200, Chrome PC/390px 모바일 화면 확인(가로 넘침 없음), 카카오 데모 안내 및 기존 계정 폼 제출 확인. 브라우저 콘솔 오류 없음. 실제 인증 연동과 실제 모바일 기기의 성능은 검증 대상이 아닙니다.

이미지 생성: 내장 image_gen 도구. 저장: assets/coast.png. 최종 프롬프트:

> Use case: stylized-concept. Asset type: cinematic website login background for RONPARK STUDY, a private Korean coast guard interview preparation academy. Primary request: breathtaking premium cinematic maritime imagery, awe-inspiring but purposeful and professional. Landscape 16:9 composition. A large modern white coast guard search-and-rescue patrol cutter, realistic generic vessel with streamlined bow, blue and orange diagonal hull stripes, bridge windows and radar mast, no weapons, no official badge, no legible writing or numbers, pushing powerfully through dark cobalt ocean swell toward the viewer from a three-quarter low angle. Ship fills left and center 60 percent of image and is fully visible with mast. Churning waves and highly detailed silver sea spray in foreground, monumental dark sea cliffs in distance, a distant lighthouse sweeping a very subtle beam toward horizon, steel-blue storm clouds parting to a thin warm dawn at horizon. Atmosphere: duty, courage, calm resolve, protecting lives at sea. Photoreal high-end architectural CGI and film key art, sophisticated deep navy, glacial cyan highlights, controlled orange accents, strong dimensionality, volumetric haze. Rightmost 35% of image dark quiet midnight navy negative space for readable login form. Lower left dark ocean for separate white HTML headline. No UI, typography, watermark, emblems, extra letters, people, military battle, explosions, fire or fantasy monoliths. Stunning cinematic scale and rich photographic detail, not cartoon, not generic corporate stock.
