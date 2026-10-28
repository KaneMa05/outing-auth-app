// Stored in the existing private operator inbox. This records consent, not deletion completion.
const TITLE = "계정 및 데이터 영구 삭제 요청";
const CATEGORY = "계정·기기";
const BODY = "앱에서 본인 인증 후 계정 전체와 연결된 개인정보·학습 기록·게시물·첨부 파일의 영구 삭제를 요청했습니다. 접수일부터 10일 이내 처리 결과를 등록된 연락처로 안내해 주세요. 법정 보존 대상만 별도로 확인하며, 계정 비활성화만으로 완료 처리하지 마세요.";
const isDeletionRequest = row => row?.category === CATEGORY && row?.title === TITLE;
module.exports = { TITLE, CATEGORY, BODY, isDeletionRequest };
