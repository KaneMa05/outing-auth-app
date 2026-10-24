# THE ARENA — 론박스터디 로그인 시안

독립된 로컬 디자인 시안입니다. 실제 로그인, 데이터베이스, 기존 앱 스크립트와 연결되지 않습니다. 기존 앱 파일을 변경하지 않았으며, docs/는 현재 배포 제외 경로입니다.

실행: `node docs/login-arena/serve.cjs`

미리보기: http://127.0.0.1:4341

별도 서버 없이 index.html을 직접 열어볼 수도 있습니다. 반응형 화면, 배경 확대 모션, 불씨 효과, 모션 정지, 시스템 모션 감소 설정, 데모 로그인 안내, 안내 대화상자가 포함됩니다. 번호는 전송하거나 저장하지 않습니다.

배경: 내장 image_gen 도구로 생성한 assets/arena.png. 외부 리소스/CDN 없이 로컬 폰트와 함께 표시됩니다. 아래는 최종 생성 프롬프트입니다.

> Use case: stylized-concept. Asset type: cinematic background artwork for a Korean study academy login website, landscape 16:9. Create a breathtaking photoreal CGI scene: a gigantic brutalist sculptural uppercase R, carved from dark distressed gunmetal and thick industrial steel, standing in an immense dark circular arena. R is fully visible, placed in left center around 40% image width, spanning 75% image height, seen from a very low angle, with real bevels and powerful three-dimensional extrusion. A brilliant thin molten amber-orange circular light ring behind the monolith, dusty volumetric shafts of warm light from overhead, cinematic haze near the black basalt floor, very subtle embers. Vast intimidating scale, premium sports competition title sequence, hyperreal physically based materials. Rightmost 35% stays extremely dark and quiet for a login form overlay; upper left and bottom left have dark space for separate HTML headline. Palette charcoal black, brushed silver, burnt orange. Dramatic but preserve visible metal detail. No people, no logos besides the sculptural R, no UI, no text or slogans, no watermarks. Finish like an award-winning architectural cinematic render.

실제 앱 반영과 푸시·배포는 별도 최종 확인 후 진행합니다.

검증: JavaScript 구문 검사 통과, 로컬 HTTP 200, Chrome PC 및 390×844 모바일 표시 확인, 가로 넘침 없음, 데모 로그인 안내·신청 안내 대화상자·모션 정지 동작 확인, 브라우저 콘솔 오류 없음. 화면 기록은 desktop-preview.png 및 mobile-preview.png입니다. 실제 모바일 기기 성능 및 실제 인증 연동은 이 시안의 검증 범위에 포함되지 않습니다.
