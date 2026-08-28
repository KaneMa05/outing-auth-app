const routeTitles = {
  home: "홈",
  student: "외출 신청",
  "student-verify": "사진 인증",
  "student-return": "학원 복귀 인증",
  "student-done": "복귀 완료",
  outing: "외출 관리",
  "weekly-exams": "주간평가",
  "weekly-absences": "주간평가 미응시자",
  grades: "성적 관리",
  fitness: "체력평가",
  penalties: "상/벌점 관리",
  seats: "좌석 관리",
  attendance: "출석 관리",
  "study-cafe-admin": "온라인 스터디카페",
  "question-board": "게시판",
  "question-board-admin": "게시판 관리",
  "inquiry-board": "문의하기",
  "inquiry-board-admin": "문의 관리",
  "curriculum-admin": "커리큘럼 관리",
  mypage: "마이페이지",
  faq: "자주 묻는 질문",
  "push-settings": "푸시 알림 설정",
  "study-todo": "오늘 플래너",
  "study-cafe": "온라인 스터디카페",
  "study-timer": "과목 타이머",
  "study-ranking": "순공시간 랭킹",
  "study-character": "캐릭터",
  "study-shop": "스터디 상점",
  curriculum: "커리큘럼 퀘스트",
  teacher: "외출 관리",
  "teacher-accounts": "선생님 계정",
  managers: "담당자 등록",
  students: "학생 등록",
  "student-push": "학생 푸시 알림",
  notifications: "알림",
  "device-history": "기기 등록 이력",
  "student-preview": "학생 미리보기",
  "track-options": "직렬 항목 관리",
  "track-subjects": "직렬별 응시과목 관리",
  duplicates: "중복 사진",
  trash: "삭제 내역",
  notices: "공지 관리",
};
const STUDENT_CATEGORY_ROUTES = {
  offline: new Set(["home", "student", "student-verify", "student-return", "student-done", "attendance", "grades", "mypage", "push-settings", "notices"]),
  online_managed: new Set(["home", "study-cafe", "grades", "mypage", "push-settings", "notifications", "notices"]),
  lecture: new Set(["home", "curriculum", "study-todo", "study-cafe", "question-board", "inquiry-board", "study-ranking", "study-timer", "study-character", "study-shop", "mypage", "faq", "push-settings", "notifications", "notices"]),
};

const INTERNET_STUDENT_FAQS = [
  {
    category: "플래너",
    question: "오늘의 할 일과 커리큘럼은 어떻게 다른가요?",
    answer: "오늘의 할 일은 오늘 실제로 공부할 내용을 과목별로 적고 목표 시간을 정하는 공간입니다. 커리큘럼은 전체 학습 순서와 회차별 진도를 관리하는 공간이며, 두 화면의 완료 상태는 각각 따로 기록됩니다.",
  },
  {
    category: "스터디카페",
    question: "좌석을 선택하려면 먼저 무엇을 해야 하나요?",
    answer: "오늘 플래너에 공부할 과목의 할 일을 하나 이상 작성한 뒤 스터디카페에서 빈 좌석을 선택하세요. 이어서 공부할 과목을 고르면 좌석이 확정되고 타이머를 시작할 수 있습니다.",
  },
  {
    category: "스터디카페",
    question: "이미 앉아 있는데 과목이나 좌석을 바꾸고 싶어요.",
    answer: "과목은 내 좌석 카드의 과목 선택·변경 메뉴에서 바꿀 수 있습니다. 좌석은 다른 빈 좌석의 ‘좌석 변경’을 누르면 이동할 수 있으며, 공부 중이라면 현재 타이머를 유지한 채 이동할 수 있습니다.",
  },
  {
    category: "타이머",
    question: "과목 종료와 자리 비우기는 무엇이 다른가요?",
    answer: "과목 종료는 현재 과목의 측정만 끝내고 좌석은 그대로 유지합니다. 자리 비우기는 스터디카페 좌석까지 반납합니다. 전체화면은 표시 방식만 바꾸므로 타이머 기록에는 영향을 주지 않습니다.",
  },
  {
    category: "타이머",
    question: "타이머를 오래 일시정지하면 어떻게 되나요?",
    answer: "일시정지 상태가 15분 동안 이어지면 좌석 유지 여부를 확인하는 안내가 표시됩니다. 응답하지 않으면 다른 수강생이 이용할 수 있도록 좌석이 자동으로 비워질 수 있습니다.",
  },
  {
    category: "커리큘럼",
    question: "완료한 회차가 많아 진행 중 회차를 찾기 어려워요.",
    answer: "과목 카드 오른쪽의 ‘진행 회차’ 버튼을 누르면 현재 회차로 바로 이동합니다. 회차 상세에서는 상단의 ‘커리큘럼 목록’ 버튼을 누르거나 화면을 왼쪽에서 오른쪽으로 밀어 목록으로 돌아갈 수 있습니다.",
  },
  {
    category: "게시판",
    question: "게시판에서 원하는 과목 글과 선생님 답변은 어떻게 찾나요?",
    answer: "상단 과목 필터를 선택하면 해당 과목 글만 볼 수 있습니다. 글 상세의 댓글에서 선생님 답변 배지를 확인할 수 있고, 새 글은 게시판 하단의 글쓰기 버튼으로 등록할 수 있습니다.",
  },
  {
    category: "알림",
    question: "앱 알림이 오지 않아요.",
    answer: "마이 탭의 ‘앱 알림 설정’에서 전체 앱 알림과 항목별 알림이 켜져 있는지 확인하세요. 휴대폰의 알림 권한도 허용되어 있어야 하며, 아이폰은 홈 화면에 설치한 앱에서 알림을 사용하는 것이 가장 안정적입니다.",
  },
  {
    category: "계정·기기",
    question: "기기를 바꾸거나 내 정보가 잘못된 경우에는 어떻게 하나요?",
    answer: "계정은 최대 2대의 활성 기기에서 사용할 수 있습니다. 기기 등록 초기화나 이름·반·직렬 등 학생 정보 수정이 필요하면 개인정보를 본문에 적지 말고 문의하기를 이용해주세요.",
  },
];
let studentFaqCategory = "전체";

const CURRICULUM_QUEST_SUBJECTS = [
  {
    id: "criminal-law",
    name: "형사법",
    shortName: "형사",
    totalStages: 27,
    completedStages: 0,
    targetTracks: ["경찰직 - 공채(순경)"],
    partLabel: "형법 1~8회차 · 형사소송법 9~12회차",
    tone: "indigo",
    stageTitles: [
      "형법의 기본개념", "죄형법정주의", "범죄론의 기초", "구성요건론", "인과관계와 객관적 귀속",
      "고의와 과실", "결과적 가중범", "위법성의 기초", "위법성 조각사유", "책임론",
      "미수론", "공범론", "죄수론", "형벌론", "개인적 법익에 관한 죄", "사회적 법익에 관한 죄",
      "국가적 법익에 관한 죄", "형법 종합정리", "수사의 기본원칙", "수사의 조건", "임의수사",
      "체포와 구속", "압수와 수색", "수사의 종결", "증거법의 기초", "전문증거", "형사소송법 종합정리",
    ],
  },
  {
    id: "coast-guard-intro",
    name: "해양경찰학개론",
    shortName: "개론",
    totalStages: 19,
    completedStages: 0,
    targetTracks: ["경찰직 - 공채(순경)", "경찰직 - 함정요원 항해(순경)", "경찰직 - 함정요원 기관(순경)"],
    partLabel: "해양경찰학개론 26상반기 과정",
    tone: "teal",
    stageTitles: [
      "해양경찰의 개념", "해양경찰의 역사", "해양경찰 조직", "해양경찰 작용", "해양경찰 관리",
      "해양경찰 통제", "해양경찰의 직무", "해상안전 관리", "해양범죄 수사", "해양오염 방제",
      "해양경비", "해양수색과 구조", "해양정보", "외사 활동", "정보통신", "장비 관리",
      "주요 법령 정리", "기출 쟁점 정리", "개론 종합정리",
    ],
  },
  {
    id: "maritime-law",
    name: "해사법규",
    shortName: "법규",
    totalStages: 14,
    completedStages: 0,
    targetTracks: ["경찰직 - 공채(순경)", "경찰직 - 함정요원 항해(순경)", "경찰직 - 함정요원 기관(순경)"],
    partLabel: "해사법규 26상반기 과정",
    tone: "violet",
    stageTitles: [
      "법규 기초", "해양경찰 관련 법령", "선박법", "선박안전법", "해양경찰 경비",
      "해사안전법", "선원법", "수상레저안전법", "유선 및 도선사업법", "해양환경관리법",
      "수난구호법", "국제해상충돌예방규칙", "기출 쟁점 정리", "법규 종합정리",
    ],
  },
];
let curriculumQuestSelectedSubjectId = CURRICULUM_QUEST_SUBJECTS[0].id;
let curriculumQuestSelectedStage = CURRICULUM_QUEST_SUBJECTS[0].completedStages + 1;
let curriculumQuestView = "map";
let studyPlannerHubView = "planner";
let studyTodoCalendarOpen = false;
let studyTodoCalendarMonthKey = "";
const curriculumQuestProgress = {
  loaded: false,
  persistent: false,
  lectureIds: new Set(),
  stages: new Map(),
};
const curriculumQuestTaskState = Object.fromEntries(
  CURRICULUM_QUEST_SUBJECTS.map((subject) => [
    subject.id,
    createCurriculumQuestTaskState(subject, subject.completedStages + 1),
  ])
);
let curriculumQuestCatalogLoading = false;
let curriculumQuestCatalogLoaded = false;
const LECTURE_APPLICATION_RECEIPT_STORAGE_KEY = "ronpark_lecture_application_receipt_v1";
const STUDENT_PUSH_PROMPT_STORAGE_KEY = "ronpark_student_push_prompt_v1";
const STUDENT_DDAY_STORAGE_KEY = "ronpark_student_dday_v1";
const STUDENT_NOTIFICATION_READ_STORAGE_KEY = "ronpark_student_notification_read_v1";
const STUDENT_PUSH_PROMPT_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
const STUDENT_PUSH_PROMPT_MAX_DISMISSALS = 3;
const STUDENT_PUSH_PREFERENCE_OPTIONS = [
  { key: "admin", title: "관리자 안내", description: "개인·그룹 안내 및 중요 전달사항", categories: ["offline", "online_managed", "lecture"] },
  { key: "study", title: "학습 알림", description: "주간평가, 성적 및 학습 일정", categories: ["offline", "online_managed", "lecture"] },
  { key: "study_cafe", title: "스터디카페", description: "스터디방, 좌석 및 이용 안내", categories: ["online_managed", "lecture"] },
  { key: "question_board", title: "게시판", description: "질문 답변과 댓글 안내", categories: ["lecture"] },
];

function isOnlineManagedStudyCafeEnabled() {
  return state.settings.onlineManagedStudyCafeEnabled === true;
}

function isCurriculumQuestEnabled() {
  return curriculumQuestReleaseVerified === true && state.settings.curriculumQuestEnabled === true;
}

function getAllowedStudentRoutes(category) {
  if (category === "online_managed" && !isOnlineManagedStudyCafeEnabled()) {
    return STUDENT_CATEGORY_ROUTES.offline;
  }
  const routes = STUDENT_CATEGORY_ROUTES[category] || STUDENT_CATEGORY_ROUTES.offline;
  if (category === "lecture" && !isCurriculumQuestEnabled()) {
    return new Set([...routes].filter((route) => route !== "curriculum"));
  }
  return routes;
}
const COAST_GUARD_EXAM_DATE = "2026-10-24";
const COAST_GUARD_EXAM_LABEL = "해양경찰 필기시험";
const COAST_GUARD_TRACK_OPTIONS = [
  "경찰직 - 공채(순경)",
  "경찰직 - 해경학과 항해(경장)",
  "경찰직 - 해경학과 기관(경장)",
  "경찰직 - 함정요원 항해(순경)",
  "경찰직 - 함정요원 기관(순경)",
  "경찰직 - 함정요원 항해(경장)",
  "경찰직 - 함정요원 기관(경장)",
  "경찰직 - 해상교통관제(VTS)(순경)",
  "일반직 - 선박교통관제(VTS)",
  "경찰직 - 구조(순경)",
  "경찰직 - 구급(순경)",
  "경찰직 - 정보통신 전산(순경)",
  "경찰직 - 특공 전술(순경)",
  "경찰직 - 정보통신 통신(순경)",
  "일반직 - 해양오염방제 환경",
  "일반직 - 해양오염방제 화공",
  "일반직 - 해양오염방제 항해",
  "일반직 - 해양오염방제 기관",
  "경찰직 - 경위 공채(해양-기관)",
  "경찰직 - 경위 공채(해양-항해)",
  "기타",
];
const STUDY_CAFE_ROOM_SIZE = 48;
const STUDY_CAFE_SEAT_COUNT = 96;
const STUDY_CAFE_RANKING_ROOM_INDEX = 0;
const STUDY_CAFE_RANKING_REFRESH_INTERVAL_MS = 15 * 1000;
const STUDY_CAFE_SAFETY_REFRESH_INTERVAL_MS = 2 * 60 * 1000;
const STUDY_CAFE_ACTION_REFRESH_DELAY_MS = 120;
const STUDY_CAFE_USED_STORAGE_KEY = "ronpark-study-cafe-used";
const STUDY_CAFE_RANKING_USED_STORAGE_KEY = "ronpark-study-cafe-ranking-used";
const STUDY_CAFE_ROOM_THEMES = [
  { theme: "oak", label: "랭킹룸", mood: "오늘 순공 랭킹" },
  { theme: "dawn", label: "자유석", mood: "편안하게 집중하는 공간" },
];
const STUDY_CAFE_ROOMS = STUDY_CAFE_ROOM_THEMES.map((roomTheme, index) => ({
  id: `room-${index + 1}`,
  ...roomTheme,
  startSeat: index * STUDY_CAFE_ROOM_SIZE + 1,
  endSeat: (index + 1) * STUDY_CAFE_ROOM_SIZE,
}));
const STUDY_CAFE_PREVIEW_OCCUPANTS = {
  1: { name: "김○○", track: "공채(순경)", tone: "blue", todaySeconds: 11538 },
  3: { name: "이○○", track: "해경학과", tone: "mint", todaySeconds: 8426 },
  4: { name: "박○○", track: "함정요원", tone: "purple", todaySeconds: 14972 },
  6: { name: "최○○", track: "구조", tone: "orange", todaySeconds: 6274 },
  7: { name: "정○○", track: "정보통신", tone: "rose", todaySeconds: 10165 },
  13: { name: "한○○", track: "VTS", tone: "mint", todaySeconds: 7315 },
  24: { name: "오○○", track: "구급", tone: "orange", todaySeconds: 5268 },
  35: { name: "윤○○", track: "특공", tone: "rose", todaySeconds: 9184 },
  46: { name: "서○○", track: "방제·환경", tone: "blue", todaySeconds: 12740 },
  52: { name: "강○○", track: "공채(순경)", tone: "purple", todaySeconds: 6842 },
  57: { name: "조○○", track: "함정요원", tone: "mint", todaySeconds: 11028 },
  63: { name: "임○○", track: "해경학과", tone: "blue", todaySeconds: 7935 },
  71: { name: "송○○", track: "VTS", tone: "orange", todaySeconds: 13418 },
  85: { name: "권○○", track: "구조", tone: "rose", todaySeconds: 9564 },
  94: { name: "남○○", track: "정보통신", tone: "mint", todaySeconds: 4822 },
};
const STUDY_CAFE_PREVIEW_SEATS = Array.from({ length: STUDY_CAFE_SEAT_COUNT }, (_, index) => {
  const seatNumber = index + 1;
  return {
    id: `seat-${seatNumber}`,
    ...(STUDY_CAFE_PREVIEW_OCCUPANTS[seatNumber]
      ? { occupant: STUDY_CAFE_PREVIEW_OCCUPANTS[seatNumber] }
      : {}),
  };
});
const STUDY_CAFE_TEMP_NICKNAME_MOODS = [
  "웃고있는",
  "집중하는",
  "차분한",
  "신나는",
  "졸고있는",
  "용감한",
  "부지런한",
  "생각하는",
  "즐거운",
  "느긋한",
];
const STUDY_CAFE_TEMP_NICKNAME_ANIMALS = [
  "기린",
  "하마",
  "수달",
  "판다",
  "여우",
  "펭귄",
  "토끼",
  "다람쥐",
  "카피바라",
];
const STUDY_CAFE_PREVIEW_EPOCH = Date.now();
const STUDY_CAFE_IDLE_WARNING_MS = 15 * 60 * 1000;
const STUDY_CAFE_IDLE_COUNTDOWN_SECONDS = 10;
const studyCafePreviewState = {
  selectedSeatId: "",
  subject: "",
  lastSubject: "",
  pendingSubject: "",
  running: false,
  paused: false,
  elapsedMs: 0,
  startedAt: 0,
  subjectElapsedMs: {},
  subjectStartedAt: 0,
  idleSince: 0,
  customSubjects: null,
  timerFullscreen: false,
  timerFullscreenReturnRoute: "",
  avatarTone: "navy",
  nickname: "",
  statusMessage: "",
  temporaryNickname: "",
  temporaryNicknameAwaitingEntry: false,
  activeRoomIndex: 0,
};
const studyCafeRemoteState = {
  studentId: "",
  available: null,
  loaded: false,
  loading: false,
  room: null,
  ranking: null,
  todos: [],
  todosByDate: {},
  subjectGoalsByDate: {},
  todoMonthSummaries: {},
  todoMonthSummaryLoading: new Set(),
  plannerDateKey: "",
  plannerLoading: false,
  summary: null,
  rankingPeriods: {},
  rankingLoadingPeriod: "",
  rankingError: "",
  refreshTimer: null,
  requestedRefreshTimer: null,
  heartbeatTimer: null,
  lifecycleRefreshBound: false,
  lastLoadedAt: 0,
  lastAttemptAt: 0,
  error: "",
  studyDateKey: "",
};
const studyRoomState = {
  room: null,
  rooms: [],
  membership: null,
  loaded: false,
  loading: false,
  actionPending: false,
  chatCollapsed: false,
  chatExpanded: false,
  browsingPublicCafe: false,
  lastLoadedAt: 0,
  refreshTimer: null,
  error: "",
};
const studyRoomPreviewData = {
  rooms: [
    {
      id: "preview-room-open",
      name: "해경 필기 집중반",
      description: "오늘 목표를 정하고 함께 집중해요.",
      capacity: 8,
      theme: "forest",
      locked: false,
      members: [
        { name: "김○○", track: "공채(순경)", tone: "blue", role: "host", seatNumber: 1, status: "studying", todaySeconds: 5420, statusMessage: "오늘도 목표까지 집중!" },
        { name: "이○○", track: "해경학과", tone: "mint", role: "member", seatNumber: 3, status: "seated", todaySeconds: 3180 },
      ],
      messages: [],
    },
    {
      id: "preview-room-locked",
      name: "형법 저녁 스터디",
      description: "매일 저녁 8시부터 집중합니다.",
      capacity: 4,
      theme: "night",
      locked: true,
      previewPassword: "1234",
      members: [
        { name: "박○○", track: "함정요원", tone: "purple", role: "host", seatNumber: 2, status: "paused", todaySeconds: 7240 },
      ],
      messages: [],
    },
  ],
  currentRoomId: "",
};
const STUDY_ROOM_REFRESH_INTERVAL_MS = 4000;
const STUDY_CAFE_FOCUS_PAUSE_DELAY_MS = 1500;
let studyCafeTimerActionPending = false;
const STUDY_RANKING_PREVIEW_MEMBERS = [
  { name: "서○○", tone: "rose", dailySeconds: 38538 },
  { name: "김○○", tone: "blue", dailySeconds: 35921 },
  { name: "박○○", tone: "orange", dailySeconds: 33144 },
  { name: "이○○", tone: "mint", dailySeconds: 30608 },
  { name: "정○○", tone: "purple", dailySeconds: 27956 },
  { name: "나", tone: "navy", dailySeconds: 24738, isMine: true },
  { name: "최○○", tone: "blue", dailySeconds: 22691 },
  { name: "한○○", tone: "mint", dailySeconds: 20174 },
  { name: "오○○", tone: "orange", dailySeconds: 18422 },
  { name: "윤○○", tone: "rose", dailySeconds: 15865 },
];
const studyRankingPreviewState = {
  period: "daily",
  dateOffset: 0,
};
const studyTimerStatsState = {
  mode: "timer",
  period: "weekly",
  anchorDate: parseStudyTimerDateKey(formatStudyBusinessDateKey(new Date())),
  cache: {},
  loadingKey: "",
  error: "",
};
let studyCafePreviewClock = null;
let studyCafeLocalFallback = false;
let studyCafeCountdownInterval = null;
let studyCafeCountdownCleanupTimer = null;
let studyCafeRealtimeChannel = null;
let studyCafeRealtimeRefreshTimer = null;
let studyCafeRankingRoomRefreshTimer = null;
let studyCafeCountdownId = 0;
let studentFooterTapGuardTimer = null;
let studentStudyRouteTransitionDirection = 0;
let studyCafeIdleWarningRemaining = 0;
let studyCafeIdleReleasePending = false;
let studyCafeSessionRevision = 0;
let studyCafeAutoPauseTimer = null;
let studyTodoMutationRevision = 0;
let studyTodoDeleteQueue = Promise.resolve();
const studyTodoEditorState = {
  dateKey: "",
  subject: "",
  draft: "",
  focused: false,
};
const studyCafePlannerEntryState = {
  seatId: "",
  seatNumber: 0,
  subject: "",
  seatAlreadyClaimed: false,
  resumeRequested: false,
};
const studyTodoTogglePendingIds = new Set();
const studyTodoDeletePendingKeys = new Set();
const studyCafeRankingPreviousRanks = new Map();
const lectureApplicationReceiptState = {
  applicationId: "",
  application: null,
  loading: false,
  loaded: false,
  error: "",
  pushConfigLoading: false,
  pushAvailable: null,
  pushPublicKey: "",
};
const studentPushNotificationState = {
  studentId: "",
  loading: false,
  loaded: false,
  available: null,
  publicKey: "",
  subscribed: false,
  preferences: Object.fromEntries(STUDENT_PUSH_PREFERENCE_OPTIONS.map((option) => [option.key, true])),
  error: "",
};
const studentNotificationInboxState = {
  studentId: "",
  loaded: false,
  loading: false,
  messages: [],
  error: "",
};
const studentPushReturnVisitStudentId = APP_MODE === "student" ? String(getAuthedStudent()?.id || "") : "";

document.querySelectorAll("[data-route]").forEach((button) => {
  button.addEventListener("click", (event) => {
    if (button.matches("a")) event.preventDefault();
    navigate(button.dataset.route);
  });
});

document.querySelectorAll("[data-online-student-dday]").forEach((button) => {
  button.addEventListener("click", openStudentDdayModal);
});

document.querySelectorAll(".student-footer-menu").forEach((footer) => {
  footer.addEventListener("pointerdown", (event) => {
    activateStudentFooterTapGuard();
    activateStudentFooterRoute(event);
  }, { passive: true });
  if (!window.PointerEvent) {
    footer.addEventListener("touchstart", (event) => {
      activateStudentFooterTapGuard();
      activateStudentFooterRoute(event);
    }, { passive: true });
  }
  footer.addEventListener("click", (event) => {
    event.stopPropagation();
  });
});

function activateStudentFooterRoute(event) {
  const routeButton = event.target.closest("[data-route]");
  const footer = routeButton?.closest(".student-footer-menu");
  if (!footer || routeButton.hidden) return;
  footer.querySelectorAll("[data-route]").forEach((button) => {
    button.classList.toggle("active", button === routeButton);
  });
  updateStudentFooterIndicator(footer, routeButton);
}

function updateStudentFooterIndicator(footer, preferredButton = null) {
  if (!footer) return;
  const buttons = Array.from(footer.querySelectorAll(":scope > button, :scope > a"))
    .filter((button) => !button.hidden);
  const activeButton =
    preferredButton && buttons.includes(preferredButton)
      ? preferredButton
      : buttons.find((button) => button.classList.contains("active"));
  footer.dataset.activeIndex = String(
    Math.max(0, activeButton ? buttons.indexOf(activeButton) : 0)
  );
}

function activateStudentFooterTapGuard() {
  document.body.classList.add("student-footer-tap-guard");
  window.clearTimeout(studentFooterTapGuardTimer);
  studentFooterTapGuardTimer = window.setTimeout(() => {
    document.body.classList.remove("student-footer-tap-guard");
    studentFooterTapGuardTimer = null;
  }, 450);
}

document.querySelectorAll("[data-unreleased]").forEach((button) => {
  button.addEventListener("click", () => openUnreleasedModal(button.dataset.unreleased));
});

if (seedButton) {
  seedButton.addEventListener("click", () => {
    seedDemo();
    render();
    notify("샘플 데이터가 추가되었습니다.");
  });
}

if (resetButton) {
  resetButton.addEventListener("click", () => {
    if (!confirm("저장된 모든 데이터를 초기화할까요?")) return;
    localStorage.removeItem(STORAGE_KEY);
    Object.assign(state, defaultState());
    render();
    notify("데이터가 초기화되었습니다.");
  });
}

function handleRouteHistoryChange() {
  const requestedRoute = location.hash.replace("#", "") || defaultRoute();
  const nextRoute = normalizeRoute(requestedRoute);
  if (nextRoute === currentRoute) {
    if (String(requestedRoute).split("?")[0] !== nextRoute) {
      history.replaceState(null, "", `${location.href.split("#")[0]}#${nextRoute}`);
    }
    return;
  }
  if (nextRoute === "study-cafe" && currentRoute !== "study-cafe") {
    studyCafePreviewState.temporaryNicknameAwaitingEntry = false;
  }
  currentRoute = nextRoute;
  render();
  if (currentRoute === "study-cafe" && studyCafePlannerEntryState.resumeRequested) {
    window.requestAnimationFrame(resumeStudyCafeSeatSelection);
  }
  scrollAppToTop();
  if (APP_MODE === "student") {
    scheduleStudentRouteRemoteRefresh();
    if (isStudyCafeRoute() || currentRoute === "home") {
      requestStudyCafeRemoteRefresh(180, {
        retryWhenLoading: false,
        maxAgeMs: 5000,
      });
    }
  }
}

window.addEventListener("hashchange", handleRouteHistoryChange);
window.addEventListener("popstate", handleRouteHistoryChange);

currentRoute = normalizeRoute(location.hash.replace("#", "") || defaultRoute());
window.__enforceCurriculumQuestVisibility = () => {
  if (APP_MODE === "teacher" || isCurriculumQuestEnabled()) return;
  if (String(location.hash || "").replace(/^#/, "").split("?")[0] !== "curriculum" && currentRoute !== "curriculum") return;
  currentRoute = "home";
  history.replaceState(null, "", `${location.pathname}${location.search}#home`);
  render();
};
render();
if (APP_MODE === "teacher") {
  initTeacherAuth();
} else {
  initRemoteStore();
}

function normalizeRoute(route) {
  const routeName = String(route || "").split("?")[0];
  const legacy = {
    dashboard: "home",
    teacher: "outing",
    out: "student",
    verify: "student-verify",
    return: "student-return",
    "student-out": "student",
    "grades-final": "grades",
    settings: "home",
  };
  const normalized = legacy[routeName] || routeName;
  if (APP_MODE === "teacher") {
    const teacherRoutes = ["home", "outing", "weekly-exams", "weekly-absences", "grades", "fitness", "penalties", "seats", "attendance", "study-cafe-admin", "question-board-admin", "inquiry-board-admin", "curriculum-admin", "notices", "teacher-accounts", "managers", "students", "student-push", "device-history", "student-preview", "track-options", "track-subjects", "duplicates", "trash"];
    if (!teacherRoutes.includes(normalized)) return "home";
    return teacherAuth.checked && teacherAuth.authenticated && !canUseRoute(normalized) ? firstAllowedTeacherRoute() : normalized;
  }
  if (normalized === "curriculum" && !isCurriculumQuestEnabled()) return "home";
  const studentRoutes = ["home", "student", "student-verify", "student-return", "student-done", "attendance", "grades", "mypage", "faq", "push-settings", "notifications", "curriculum", "study-todo", "study-cafe", "question-board", "inquiry-board", "study-timer", "study-ranking", "study-character", "study-shop", "notices"];
  const authedStudent = getAuthedStudent();
  if (authedStudent) {
    const category = getStudentCategory(authedStudent);
    const allowedRoutes = getAllowedStudentRoutes(category);
    if (normalized.startsWith("notice-")) return normalized;
    if (!allowedRoutes.has(normalized)) return "home";
  }
  if (studentRoutes.includes(normalized) || normalized.startsWith("notice-")) return normalized;
  return "home";
}

function defaultRoute() {
  return "home";
}

function navigate(route) {
  const nextRoute = normalizeRoute(route || defaultRoute());
  const studyRoutes = ["curriculum", "study-todo", "study-cafe", "question-board", "study-ranking", "study-timer", "study-character", "study-shop"];
  const currentStudyIndex = studyRoutes.indexOf(currentRoute);
  const nextStudyIndex = studyRoutes.indexOf(nextRoute);
  studentStudyRouteTransitionDirection =
    currentStudyIndex >= 0 && nextStudyIndex >= 0 && currentStudyIndex !== nextStudyIndex
      ? nextStudyIndex > currentStudyIndex ? 1 : -1
      : 0;
  if (nextRoute === "study-cafe" && currentRoute !== "study-cafe") {
    studyCafePreviewState.temporaryNicknameAwaitingEntry = false;
  }
  if (APP_MODE !== "teacher" && nextRoute === "grades" && typeof resetStudentGradesView === "function") resetStudentGradesView();
  const shouldScrollOnly = nextRoute === currentRoute && location.hash === `#${nextRoute}`;
  location.hash = nextRoute;
  if (shouldScrollOnly) scrollAppToTop();
}

function scrollAppToTop() {
  window.requestAnimationFrame(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  });
}

function render() {
  const requestedRoute = location.hash.replace("#", "") || defaultRoute();
  const normalizedRoute = normalizeRoute(requestedRoute);
  if (normalizedRoute !== currentRoute) currentRoute = normalizedRoute;
  if (String(requestedRoute).split("?")[0] !== currentRoute) {
    history.replaceState(null, "", `${location.href.split("#")[0]}#${currentRoute}`);
  }
  if (typeof syncQuestionWriteButton === "function") syncQuestionWriteButton();

  if (APP_MODE === "teacher") {
    document.body.classList.toggle("teacher-authenticated", Boolean(teacherAuth.authenticated));
    document.body.classList.toggle("teacher-guest", !teacherAuth.authenticated);
  }
  if (currentRoute !== "study-timer") studyCafePreviewState.timerFullscreen = false;
  const studyTimerFullscreenMode =
    currentRoute === "study-timer" && studyCafePreviewState.timerFullscreen;
  document.documentElement.classList.toggle("study-timer-fullscreen-mode", studyTimerFullscreenMode);
  document.body.classList.toggle("study-timer-fullscreen-mode", studyTimerFullscreenMode);
  document.body.classList.toggle("student-home-route", APP_MODE !== "teacher" && currentRoute === "home");
  const studentBrowserInstallOnly = APP_MODE !== "teacher" && !isStandaloneStudentApp();
  document.body.classList.toggle("student-browser-install-only", studentBrowserInstallOnly);

  document.querySelectorAll("[data-route]").forEach((button) => {
    const route = button.dataset.route;
    const allowed = APP_MODE !== "teacher" || !teacherAuth.authenticated || canUseRoute(route);
    const inStudentFooter = APP_MODE !== "teacher" && button.closest(".student-footer-menu");
    const activeRoute =
      inStudentFooter && ["study-character", "study-shop", "push-settings", "faq", "inquiry-board"].includes(currentRoute)
        ? "mypage"
        : inStudentFooter && ["study-timer", "study-ranking", "question-board", "notifications", "notices"].includes(currentRoute)
          ? "home"
          : currentRoute;
    button.hidden = !allowed;
    button.classList.toggle("active", route === activeRoute);
  });
  if (APP_MODE !== "teacher") {
    updateStudentNavigationVisibility();
    document.querySelectorAll(".student-footer-menu").forEach((footer) => {
      updateStudentFooterIndicator(footer);
    });
  }
  if (APP_MODE === "teacher") updateTeacherNavSections();

  title.textContent = getRouteTitle(currentRoute);
  if (topActions) {
    topActions.innerHTML = "";
    if (APP_MODE === "teacher" && teacherAuth.authenticated) {
      if (teacherAuth.user?.role === "student_manager") {
        topActions.appendChild(el("span", { className: "auth-chip" }, "장학생 관리자"));
      }
      if (currentRoute === "attendance" && isTeacherAdmin()) {
        topActions.appendChild(button("출석 시간 설정", "btn secondary", "button", openAttendanceDeadlineModal));
        topActions.appendChild(button("출석 휴일 설정", "btn secondary", "button", openAttendanceHolidayModal));
      }
      if (currentRoute === "penalties" && hasTeacherPermission("penalties.write")) {
        topActions.appendChild(button("상/벌점 부여", "btn", "button", openPenaltyModal));
      }
      if (currentRoute === "notices" && hasTeacherPermission("notices.write")) {
        topActions.appendChild(button("D-day 설정", "btn secondary", "button", openAdminStudentDdayModal));
      }
      if (currentRoute !== "weekly-exams") topActions.appendChild(button("로그아웃", "btn secondary", "button", logoutTeacher));
    }
    topActions.hidden = !topActions.children.length;
  }

  if (studentBrowserInstallOnly) {
    app.innerHTML = "";
    app.appendChild(renderStudentBrowserInstallOnly());
    app.removeAttribute("data-loading-shell");
    if (APP_MODE !== "teacher" && typeof window.__studentAppReady === "function") window.__studentAppReady();
    return;
  }

  const routes =
    APP_MODE === "teacher"
      ? {
          home: renderHome,
          outing: renderTeacher,
          "weekly-exams": renderWeeklyExamManagement,
          "weekly-absences": renderWeeklyExamAbsenceManagement,
          grades: renderGradesManagement,
          fitness: renderFitnessManagement,
          penalties: renderPenaltyManagement,
          seats: renderSeatManagement,
          attendance: renderAttendanceManagement,
          "study-cafe-admin": renderStudyCafeAdmin,
          "question-board-admin": renderQuestionBoardAdmin,
          "inquiry-board-admin": renderInquiryAdmin,
          "curriculum-admin": renderCurriculumAdmin,
          notices: renderNoticesAdmin,
          "teacher-accounts": renderTeacherAccountsAdmin,
          managers: renderManagersAdmin,
          students: renderStudentsAdmin,
          "student-push": renderStudentPushAdmin,
          "device-history": renderDeviceHistoryAdmin,
          "student-preview": renderStudentPreviewAdmin,
          "track-options": renderTrackOptionsAdmin,
          "track-subjects": renderTrackSubjectManagement,
          duplicates: renderDuplicates,
          trash: renderTrash,
        }
      : {
          home: () => requireStudentAuth(renderStudentHome),
          student: () => requireStudentAuth(renderStudentChecklist),
          "student-verify": () => requireStudentAuth(renderStudentChecklist),
          "student-return": () => requireStudentAuth(renderStudentChecklist),
          "student-done": () => requireStudentAuth(renderStudentChecklist),
          attendance: () => requireStudentAuth(renderStudentAttendance),
          grades: () => requireStudentAuth(renderStudentGrades),
          mypage: () => requireStudentAuth(renderStudentMypage),
          faq: () => requireStudentAuth(renderStudentFaq),
          "push-settings": () => requireStudentAuth(renderStudentPushSettings),
          notifications: () => requireStudentAuth(renderStudentNotifications),
          curriculum: () => isCurriculumQuestEnabled() ? requireStudentAuth(renderCurriculumQuest) : requireStudentAuth(renderStudentHome),
          "study-todo": () => requireStudentAuth(renderStudentPlannerHub),
          "study-cafe": () => requireStudentAuth(renderStudentStudyCafe),
          "question-board": () => requireStudentAuth(renderQuestionBoard),
          "inquiry-board": () => requireStudentAuth(renderStudentInquiryBoard),
          "study-timer": () => requireStudentAuth(renderStudentStudyTimer),
          "study-ranking": () => requireStudentAuth(renderStudentStudyRanking),
          "study-character": () => requireStudentAuth(renderStudentStudyCharacter),
          "study-shop": () => requireStudentAuth(renderStudentStudyShop),
          notices: () => requireStudentAuth(renderStudentNoticeList),
        };

  const renderRoute =
    routes[currentRoute] ||
    (APP_MODE !== "teacher" && currentRoute.startsWith("notice-") ? () => requireStudentAuth(renderStudentNoticeDetail) : routes[defaultRoute()]);
  const nextView =
    APP_MODE === "teacher"
      ? requireTeacherAuth(() => (canUseRoute(currentRoute) ? renderRoute() : renderForbidden()))
      : renderRoute();
  if (APP_MODE !== "teacher" && studentStudyRouteTransitionDirection && nextView instanceof HTMLElement) {
    nextView.classList.add("student-study-route-enter");
    nextView.style.setProperty(
      "--student-study-route-enter-x",
      `${studentStudyRouteTransitionDirection * 10}px`
    );
  }
  studentStudyRouteTransitionDirection = 0;
  app.replaceChildren(nextView);
  if (APP_MODE !== "teacher") {
    const pushPrompt = renderStudentPushOptInPrompt(getAuthedStudent());
    if (pushPrompt) app.appendChild(pushPrompt);
  }
  app.removeAttribute("data-loading-shell");
  if (APP_MODE !== "teacher" && typeof window.__studentAppReady === "function") window.__studentAppReady();
}

function renderStudyCafeStateUpdate() {
  render();
  app
    .querySelector(
      ".student-curriculum-page, .student-study-todo-page, .student-study-cafe-page, .student-study-timer-page, .student-study-ranking-page, .student-study-character-page, .student-study-shop-page"
    )
    ?.classList.add("study-view-static");
}

function getRouteTitle(route) {
  if (APP_MODE !== "teacher") {
    if (route === "attendance") return "출석 체크";
    if (route === "grades") return "성적";
    if (route === "study-todo") return "오늘 플래너";
    if (route === "study-cafe") return "온라인 스터디카페";
    if (route === "question-board") return "게시판";
    if (route === "study-timer") return "과목 타이머";
    if (route === "study-ranking") return "순공시간 랭킹";
    if (route === "study-character") return "캐릭터";
    if (route === "study-shop") return "스터디 상점";
    if (route === "curriculum") return "커리큘럼 퀘스트";
    if (route === "notices" || route.startsWith("notice-")) return "중요 공지";
  }
  return routeTitles[route] || routeTitles.student;
}

async function initTeacherAuth() {
  teacherAuth.checked = false;
  teacherAuth.authenticated = false;
  render();

  try {
    const response = await fetch("/api/teacher-session", { credentials: "same-origin" });
    const data = response.ok ? await response.json() : { ok: false };
    teacherAuth.authenticated = Boolean(data.ok);
    teacherAuth.user = data.user || null;
  } catch (error) {
    console.error(error);
    teacherAuth.authenticated = false;
    teacherAuth.user = null;
  } finally {
    teacherAuth.checked = true;
    if (teacherAuth.authenticated && !canUseRoute(currentRoute)) currentRoute = firstAllowedTeacherRoute();
    render();
  }

  if (teacherAuth.authenticated) initRemoteStore();
}

function requireTeacherAuth(renderFn) {
  if (!teacherAuth.checked) return renderTeacherAuthLoading();
  return teacherAuth.authenticated ? renderFn() : renderTeacherAuth();
}

function updateTeacherNavSections() {
  document.querySelectorAll(".nav-section").forEach((section) => {
    let node = section.nextElementSibling;
    let hasVisibleButton = false;
    while (node && !node.classList?.contains("nav-section")) {
      if (node.matches?.("[data-route]") && !node.hidden) hasVisibleButton = true;
      node = node.nextElementSibling;
    }
    section.hidden = !hasVisibleButton;
  });
}

function renderForbidden() {
  return el("div", { className: "grid" }, [
    panel("접근 권한 없음", [el("div", { className: "empty" }, "이 계정으로는 해당 관리 메뉴를 사용할 수 없습니다.")]),
  ]);
}

function requireStudentAuth(renderFn) {
  return getAuthedStudent() ? renderFn() : renderStudentAuth();
}

function getAuthedStudent() {
  const student = findStudent(state.settings.studentAuthId);
  const profile = getStudentProfile(state.settings.studentAuthId);
  if (student && profile?.passwordHash && profile?.deviceToken) return student;
  if (!isStudyCafeLocalPreview()) return null;
  return (
    student ||
    findStudent(state.settings.lastStudentId) ||
    state.students[0] || {
      id: "20000",
      name: "온라인 미리보기",
      track: "온라인 수강",
      className: "온라인반",
      gender: "",
    }
  );
}

function ensureStudentProfiles() {
  if (!state.settings.studentProfiles) state.settings.studentProfiles = {};
  return state.settings.studentProfiles;
}

function getStudentProfile(studentId) {
  return ensureStudentProfiles()[String(studentId || "").trim()];
}

function isTeacherAppAccount(student) {
  const registrationNumber = Number(String(student?.id || "").trim());
  return student?.accountType === "teacher"
    || student?.account_type === "teacher"
    || (Number.isInteger(registrationNumber) && registrationNumber >= 1 && registrationNumber <= 10);
}

function renderStudentAuth() {
  const idInput = input("studentId", "text", "예: 18004", state.settings.studentAuthId || "");
  const lookupResult = el("div", { className: "student-auth-result", ariaLive: "polite" });
  const resetRequestArea = el("div", { className: "student-auth-reset-request", hidden: true });
  const profileArea = el("div", { className: "student-auth-profile", hidden: true });
  const studentNameNode = el("strong", { className: "student-auth-name" }, "-");
  const authTitle = el("h2", {}, "로그인");
  const authDescription = el("p", {}, "고유번호를 입력해 본인 정보를 확인해주세요.");
  let selectedStudent = null;

  const showResetRequestButton = (student) => {
    resetRequestArea.innerHTML = "";
    resetRequestArea.hidden = false;
    resetRequestArea.appendChild(
      button("등록기기 초기화", "btn secondary", "button", () =>
        openStudentRegistrationResetModal(student, () => {
          student.passwordHash = "";
          student.deviceToken = "";
          student.appRegisteredAt = "";
          if (state.settings.studentProfiles?.[student.id]) delete state.settings.studentProfiles[student.id];
          saveState({ skipRemote: true });
          hideResetRequestButton();
          profileArea.hidden = true;
          lookupResult.className = "student-auth-result success";
          lookupResult.textContent = "등록기기가 초기화되었습니다. 다시 조회한 뒤 새 기기로 등록해주세요.";
        })
      )
    );
  };

  const hideResetRequestButton = () => {
    resetRequestArea.innerHTML = "";
    resetRequestArea.hidden = true;
  };

  const lookupButton = button("로그인", "btn secondary", "button", async () => {
    selectedStudent = findStudent(idInput.value);
    if (!selectedStudent && localDevStoreUrl) {
      await initLocalDevStore();
      selectedStudent = findStudent(idInput.value);
    }
    lookupResult.innerHTML = "";
    hideResetRequestButton();
    profileArea.hidden = true;

    if (!selectedStudent) {
      lookupResult.className = "student-auth-result error";
      lookupResult.textContent = "등록된 번호를 찾을 수 없습니다.";
      return;
    }

    const profile = getStudentProfile(selectedStudent.id) || {};
    if (isTeacherAppAccount(selectedStudent)) {
      trackField.hidden = true;
      customTrackField.hidden = true;
      genderField.hidden = true;
      studentNameNode.textContent = `${selectedStudent.name} 선생님`;
      authTitle.textContent = "선생님 로그인";
      authDescription.textContent = "등록번호와 비밀번호로 수강생 앱을 이용합니다.";
      submitButton.textContent = "로그인";
      lookupResult.className = "student-auth-result success";
      lookupResult.textContent = `${selectedStudent.name} 선생님 계정이 확인되었습니다.`;
      profileArea.hidden = false;
      return;
    }

    authTitle.textContent = "로그인";
    authDescription.textContent = "고유번호를 입력해 본인 정보를 확인해주세요.";
    submitButton.textContent = "시작하기";
    trackField.hidden = false;
    genderField.hidden = false;
    const registeredTrack = normalizeCoastGuardTrack(selectedStudent.track || profile.initialTrack || profile.track);
    const registeredGender = selectedStudent.gender || profile.gender || "";
    const approvedLectureStudent = getStudentCategory(selectedStudent) === "lecture";
    const applicationReceipt = getLectureApplicationReceipt();
    const approvedApplicationStudent = applicationReceipt?.approvedStudentId === selectedStudent.id;
    const hasRegisteredTrack = Boolean((selectedStudent.appRegisteredAt || approvedLectureStudent || approvedApplicationStudent) && registeredTrack);
    const hasRegisteredGender = Boolean((selectedStudent.appRegisteredAt || approvedLectureStudent || approvedApplicationStudent) && registeredGender);

    trackSelect.disabled = hasRegisteredTrack;
    customTrackInput.disabled = hasRegisteredTrack;
    genderSelect.disabled = hasRegisteredGender;
    trackSelect.value = "";
    customTrackInput.value = "";
    customTrackField.hidden = true;
    if (registeredTrack) {
      const registeredOption = [...trackSelect.options].find((option) => option.value === registeredTrack);
      if (registeredOption) trackSelect.value = registeredTrack;
      else {
        trackSelect.value = "기타";
        customTrackInput.value = registeredTrack;
        customTrackField.hidden = false;
      }
    }
    if (registeredGender) genderSelect.value = registeredGender;
    studentNameNode.textContent = selectedStudent.name;
    lookupResult.className = "student-auth-result success";
    lookupResult.textContent = selectedStudent.appRegisteredAt
      ? `${selectedStudent.name} 학생이 확인되었습니다. 기존 비밀번호로 이 기기를 추가 등록할 수 있습니다.`
      : approvedLectureStudent || approvedApplicationStudent
        ? "신청 정보가 확인되었습니다. 사용할 비밀번호만 설정해주세요."
        : `${selectedStudent.name} 학생이 확인되었습니다.`;
    profileArea.hidden = false;
  });

  const trackSelect = select("track", ["", ...getCoastGuardTrackOptions()]);
  const trackPlaceholder = trackSelect.querySelector("option[value='']");
  trackPlaceholder.textContent = "직렬을 선택하세요";
  trackPlaceholder.disabled = true;
  trackSelect.value = "";
  const customTrackInput = input("customTrack", "text", "직렬을 입력하세요");
  const customTrackField = field("기타 직렬", customTrackInput);
  customTrackField.hidden = true;
  trackSelect.addEventListener("change", () => {
    customTrackField.hidden = trackSelect.value !== "기타";
    if (customTrackField.hidden) customTrackInput.value = "";
  });
  const genderSelect = select("gender", ["남", "여"]);
  const passwordInput = input("password", "password", "비밀번호");

  const trackField = field("직렬", trackSelect);
  const genderField = field("성별", genderSelect);
  profileArea.append(
    field("이름", studentNameNode),
    trackField,
    customTrackField,
    genderField,
    field("본인 비밀번호", passwordInput, "", "다음 접속 때 본인 확인에 사용합니다.")
  );

  const submitButton = button("시작하기", "btn");
  const form = el("form", { className: "student-auth-card" }, [
    el("div", {}, [
      authTitle,
      authDescription,
    ]),
    field("등록번호", el("div", { className: "student-auth-lookup" }, [idInput, lookupButton]), "", "발급받은 수강생 등록번호를 입력해주세요."),
    lookupResult,
    resetRequestArea,
    profileArea,
    submitButton,
  ]);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = formData(form);
    const studentId = String(data.studentId || "").trim();
    selectedStudent = selectedStudent?.id === studentId ? selectedStudent : findStudent(studentId);

    if (!selectedStudent) {
      return notify("먼저 관리자가 등록한 고유번호를 조회해주세요.");
    }
    if (!isStandaloneStudentApp()) {
      openInstallGuideModal();
      return notify("홈화면에 추가한 뒤 홈화면 아이콘으로 다시 열어 등록해주세요.");
    }
    const profiles = ensureStudentProfiles();
    const existingProfile = profiles[studentId];
    const registeredTrack = normalizeCoastGuardTrack(selectedStudent.track || existingProfile?.initialTrack || existingProfile?.track);
    const finalTrack = registeredTrack || resolveStudentTrack(data.track, data.customTrack);
    const finalGender = selectedStudent.gender || existingProfile?.gender || data.gender;
    if (!data.password) return notify("비밀번호를 입력해주세요.");
    if (!finalTrack || !finalGender) {
      return notify("직렬, 성별, 비밀번호를 모두 입력해주세요.");
    }

    const passwordHash = await hashStudentPassword(data.password);
    const deviceToken = existingProfile?.deviceToken || createDeviceToken();
    const authedAt = new Date().toISOString();
    let registration;

    setButtonLoading(submitButton, "기기 확인 중");
    submitButton.disabled = true;
    try {
      registration = await registerStudentDeviceWithServer({
        studentId,
        passwordHash,
        deviceToken,
        track: finalTrack,
        gender: finalGender,
      });
    } catch (error) {
      console.error(error);
      notify("기기 등록 서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.");
      return;
    } finally {
      submitButton.innerHTML = "";
      submitButton.textContent = "시작하기";
      submitButton.disabled = false;
    }

    if (!registration.ok) {
      if (registration.error === "device_limit_reached") {
        lookupResult.className = "student-auth-result error";
        lookupResult.textContent = "등록 가능한 기기 2대를 모두 사용 중입니다. 기존 기기를 초기화하거나 사무실에 문의해주세요.";
        showResetRequestButton(selectedStudent);
        return notify("등록 가능한 기기 2대를 모두 사용 중입니다.");
      }
      if (registration.error === "invalid_credentials") return notify("비밀번호가 일치하지 않습니다.");
      if (registration.error === "student_device_store_unavailable" || registration.httpStatus >= 500) {
        return notify("기기 등록 서버에 오류가 발생했습니다. 잠시 후 다시 시도하거나 사무실에 문의해주세요.");
      }
      return notify("기기를 등록하지 못했습니다. 잠시 후 다시 시도해주세요.");
    }

    profiles[studentId] = {
      initialTrack: existingProfile?.deviceToken ? existingProfile?.initialTrack || finalTrack : finalTrack,
      track: finalTrack,
      gender: finalGender,
      passwordHash,
      deviceToken,
      deviceId: registration.deviceId || existingProfile?.deviceId || "",
      deviceActiveCount: registration.activeCount || 1,
      authedAt,
    };
    selectedStudent.track = finalTrack;
    selectedStudent.gender = finalGender;
    selectedStudent.passwordHash = passwordHash;
    selectedStudent.deviceToken = deviceToken;
    selectedStudent.appRegisteredAt = authedAt;
    if (getLectureApplicationReceipt()?.approvedStudentId === studentId) clearLectureApplicationReceipt();
    state.settings.studentAuthId = studentId;
    state.settings.lastStudentId = studentId;
    saveState({ skipRemote: true });
    currentRoute = "home";
    if (location.hash !== "#home") location.hash = "home";
    render();
    notify(isTeacherAppAccount(selectedStudent)
      ? `${selectedStudent.name} 선생님으로 로그인했습니다.`
      : `${selectedStudent.name}님 인증되었습니다.`);
  });

  return el("div", { className: "grid student-view" }, [form, renderLectureApplicationEntryCard(), renderStudentAuthInstallCard()].filter(Boolean));
}

function renderLectureApplicationEntryCard() {
  const receipt = getLectureApplicationReceipt();
  if (receipt) {
    ensureLectureApplicationStatusLoaded(receipt);
    return renderLectureApplicationStatusCard(
      lectureApplicationReceiptState.applicationId === receipt.applicationId && lectureApplicationReceiptState.application
        ? { ...receipt, ...lectureApplicationReceiptState.application }
        : receipt
    );
  }
  return el("section", { className: "lecture-application-entry-card" }, [
    el("div", {}, [
      el("strong", {}, "신규 수강생인가요?"),
      el("p", {}, "등록 신청 후 관리자가 수강 정보를 확인하면 수강생 등록번호를 발급해드립니다."),
    ]),
    button("수강생 등록 신청", "btn secondary", "button", openLectureApplicationModal),
  ]);
}

function getLectureApplicationReceipt() {
  try {
    const receipt = JSON.parse(localStorage.getItem(LECTURE_APPLICATION_RECEIPT_STORAGE_KEY) || "null");
    if (!receipt?.applicationId || !receipt?.lookupToken) return null;
    return receipt;
  } catch {
    return null;
  }
}

function saveLectureApplicationReceipt(receipt) {
  localStorage.setItem(LECTURE_APPLICATION_RECEIPT_STORAGE_KEY, JSON.stringify(receipt));
  lectureApplicationReceiptState.applicationId = receipt.applicationId;
  lectureApplicationReceiptState.application = receipt;
  lectureApplicationReceiptState.loaded = true;
  lectureApplicationReceiptState.loading = false;
  lectureApplicationReceiptState.error = "";
}

function clearLectureApplicationReceipt() {
  localStorage.removeItem(LECTURE_APPLICATION_RECEIPT_STORAGE_KEY);
  lectureApplicationReceiptState.applicationId = "";
  lectureApplicationReceiptState.application = null;
  lectureApplicationReceiptState.loaded = false;
  lectureApplicationReceiptState.loading = false;
  lectureApplicationReceiptState.error = "";
}

async function ensureLectureApplicationPushConfigLoaded() {
  if (lectureApplicationReceiptState.pushAvailable !== null || lectureApplicationReceiptState.pushConfigLoading) return;
  lectureApplicationReceiptState.pushConfigLoading = true;
  try {
    const response = await fetch("/api/lecture-applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "push-config" }),
    });
    const data = await response.json().catch(() => ({}));
    lectureApplicationReceiptState.pushAvailable = Boolean(response.ok && data.ok && data.available && data.publicKey);
    lectureApplicationReceiptState.pushPublicKey = lectureApplicationReceiptState.pushAvailable ? data.publicKey : "";
  } catch (error) {
    console.error(error);
    lectureApplicationReceiptState.pushAvailable = false;
  } finally {
    lectureApplicationReceiptState.pushConfigLoading = false;
    render();
  }
}

function renderLectureApplicationPushAction(application, status) {
  if (status !== "pending") return null;
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return el("p", { className: "lecture-application-push-note" }, "이 브라우저에서는 검수 결과 푸시 알림을 지원하지 않습니다.");
  }
  ensureLectureApplicationPushConfigLoaded();
  if (lectureApplicationReceiptState.pushConfigLoading || lectureApplicationReceiptState.pushAvailable === null) {
    return el("p", { className: "lecture-application-push-note" }, "푸시 알림 사용 가능 여부를 확인하고 있습니다.");
  }
  if (!lectureApplicationReceiptState.pushAvailable) return null;
  if (application.pushEnabled) {
    return el("div", { className: "lecture-application-push-box enabled" }, [
      el("div", {}, [
        el("strong", {}, "검수 결과 알림이 켜져 있습니다"),
        el("p", {}, "승인 또는 반려 처리가 끝나면 이 기기로 알려드립니다."),
      ]),
      button("알림 끄기", "mini-btn", "button", () => disableLectureApplicationPush(application)),
    ]);
  }
  if (Notification.permission === "denied") {
    return el("p", { className: "lecture-application-push-note error" }, "브라우저 설정에서 이 사이트의 알림을 허용하면 검수 결과를 받을 수 있습니다.");
  }
  return el("div", { className: "lecture-application-push-box" }, [
    el("div", {}, [
      el("strong", {}, "검수 완료 알림 받기"),
      el("p", {}, isIosDevice() && !isStandaloneWebApp()
        ? "iPhone·iPad는 먼저 공유 버튼에서 ‘홈 화면에 추가’한 뒤 설치된 앱에서 켤 수 있습니다."
        : "승인 또는 반려 처리가 끝나면 이 기기로 알려드립니다."),
    ]),
    button("알림 켜기", "btn secondary", "button", () => enableLectureApplicationPush(application)),
  ]);
}

async function enableLectureApplicationPush(application) {
  if (isIosDevice() && !isStandaloneWebApp()) {
    notify("iPhone·iPad에서는 홈 화면에 앱을 추가한 뒤 설치된 앱에서 알림을 켜주세요.");
    return;
  }
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      render();
      notify("알림 권한이 허용되지 않았습니다.");
      return;
    }
    const registration = await navigator.serviceWorker.register("/sw.js");
    const existing = await registration.pushManager.getSubscription();
    const subscription = existing || await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(lectureApplicationReceiptState.pushPublicKey),
    });
    const response = await fetch("/api/lecture-applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "subscribe",
        applicationId: application.applicationId,
        lookupToken: application.lookupToken,
        subscription: subscription.toJSON(),
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || "push_subscription_failed");
    updateLectureApplicationPushReceipt(true);
    render();
    notify("검수 결과 알림을 켰습니다.");
  } catch (error) {
    console.error(error);
    notify("알림을 켜지 못했습니다. 잠시 후 다시 시도해주세요.");
  }
}

async function disableLectureApplicationPush(application) {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      const response = await fetch("/api/lecture-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "unsubscribe",
          applicationId: application.applicationId,
          lookupToken: application.lookupToken,
          subscription: subscription.toJSON(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || "push_unsubscribe_failed");
    }
    updateLectureApplicationPushReceipt(false);
    render();
    notify("검수 결과 알림을 껐습니다.");
  } catch (error) {
    console.error(error);
    notify("알림 설정을 변경하지 못했습니다. 잠시 후 다시 시도해주세요.");
  }
}

function updateLectureApplicationPushReceipt(enabled) {
  const receipt = getLectureApplicationReceipt();
  if (!receipt) return;
  const nextReceipt = { ...receipt, pushEnabled: enabled === true };
  localStorage.setItem(LECTURE_APPLICATION_RECEIPT_STORAGE_KEY, JSON.stringify(nextReceipt));
  lectureApplicationReceiptState.application = { ...(lectureApplicationReceiptState.application || nextReceipt), pushEnabled: enabled === true };
}

function isIosDevice() {
  return /iPad|iPhone|iPod/i.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandaloneWebApp() {
  return window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
}

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

async function ensureLectureApplicationStatusLoaded(receipt, options = {}) {
  if (!receipt?.applicationId || !receipt?.lookupToken) return;
  const sameApplication = lectureApplicationReceiptState.applicationId === receipt.applicationId;
  if (lectureApplicationReceiptState.loading) return;
  if (sameApplication && lectureApplicationReceiptState.loaded && options.force !== true) return;
  lectureApplicationReceiptState.applicationId = receipt.applicationId;
  lectureApplicationReceiptState.loading = true;
  lectureApplicationReceiptState.error = "";
  try {
    const response = await fetch("/api/lecture-applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "status",
        applicationId: receipt.applicationId,
        lookupToken: receipt.lookupToken,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || "application_status_failed");
    const nextReceipt = { ...receipt, ...(data.application || {}) };
    localStorage.setItem(LECTURE_APPLICATION_RECEIPT_STORAGE_KEY, JSON.stringify(nextReceipt));
    lectureApplicationReceiptState.application = nextReceipt;
    lectureApplicationReceiptState.loaded = true;
  } catch (error) {
    console.error(error);
    lectureApplicationReceiptState.application = receipt;
    lectureApplicationReceiptState.loaded = true;
    lectureApplicationReceiptState.error = error.message || "application_status_failed";
  } finally {
    lectureApplicationReceiptState.loading = false;
    render();
  }
}

function renderLectureApplicationStatusCard(application, options = {}) {
  const status = ["pending", "approved", "rejected", "cancelled"].includes(application.status)
    ? application.status
    : "pending";
  const statusLabels = {
    pending: "검수 중",
    approved: "승인 완료",
    rejected: "반려",
    cancelled: "취소됨",
  };
  const titles = {
    pending: "등록 신청 검수 중",
    approved: "등록 승인 완료",
    rejected: "등록 신청 반려",
    cancelled: "등록 신청 취소",
  };
  const descriptions = {
    pending: "관리자 확인 후 등록번호를 안내해드려요.",
    approved: "아래 등록번호로 학생 등록을 진행해주세요.",
    rejected: application.rejectionReason || "신청 정보를 확인하고 다시 신청해주세요.",
    cancelled: "필요하면 다시 신청해주세요.",
  };
  const actions = [];
  if (status === "approved" && application.approvedStudentId) {
    actions.push(button("등록번호 입력하기", "btn", "button", () => {
      closeInfoModal();
      const studentIdInput = document.querySelector('.student-auth-card [name="studentId"]');
      if (studentIdInput) {
        studentIdInput.value = application.approvedStudentId;
        studentIdInput.scrollIntoView({ behavior: "smooth", block: "center" });
        studentIdInput.focus();
      }
    }));
  }
  if (["rejected", "cancelled"].includes(status)) {
    actions.push(button("다시 신청하기", "btn", "button", () => {
      clearLectureApplicationReceipt();
      closeInfoModal();
      render();
      openLectureApplicationModal();
    }));
  }
  const content = el("div", { className: "lecture-application-status-content" }, [
    el("div", { className: "lecture-application-status-head" }, [
      el("span", { className: `badge lecture-application-${status}` }, statusLabels[status]),
      lectureApplicationReceiptState.loading ? el("span", { className: "subtle" }, "확인 중...") : null,
    ]),
    el("h3", {}, titles[status]),
    el("p", {}, descriptions[status]),
    application.approvedStudentId
      ? el("div", { className: "lecture-application-approved-number" }, [
          el("span", {}, "발급된 등록번호"),
          el("strong", {}, application.approvedStudentId),
        ])
      : null,
    el("dl", { className: "lecture-application-status-meta" }, [
      el("dt", {}, "신청자"),
      el("dd", {}, application.applicantName || "-"),
      el("dt", {}, "신청일"),
      el("dd", {}, application.submittedAt ? formatDateCompact(application.submittedAt) : "-")
    ]),
    lectureApplicationReceiptState.error
      ? el("p", { className: "lecture-application-status-error" }, "상태를 새로 확인하지 못했습니다. 마지막 확인 상태를 표시합니다.")
      : null,
    renderLectureApplicationPushAction(application, status),
    actions.length ? el("div", { className: "lecture-application-status-actions" }, actions) : null,
  ].filter(Boolean));

  if (options.modal) return content;
  return el("section", { className: `lecture-application-status-card status-${status}` }, [content]);
}

function openLectureApplicationModal() {
  const courseTypeSelect = el("select", { name: "courseType" }, [
    el("option", { value: "" }, "수강 구분을 선택하세요"),
    el("option", { value: "offline" }, "오프라인반"),
    el("option", { value: "online_managed" }, "온라인 관리반"),
    el("option", { value: "lecture" }, "인강생"),
  ]);
  const trackSelect = select("track", ["", ...getCoastGuardTrackOptions()]);
  trackSelect.querySelector("option[value='']").textContent = "직렬을 선택하세요";
  trackSelect.value = "";
  const customTrackInput = input("customTrack", "text", "직렬을 입력하세요");
  const customTrackField = field("기타 직렬", customTrackInput);
  customTrackField.hidden = true;
  trackSelect.addEventListener("change", () => {
    customTrackField.hidden = trackSelect.value !== "기타";
    if (customTrackField.hidden) customTrackInput.value = "";
  });

  const referralSelect = el("select", { name: "referralSource" }, [
    el("option", { value: "" }, "들어온 경로를 선택하세요"),
    el("option", { value: "naver_cafe" }, "네이버 카페"),
    el("option", { value: "referral" }, "지인 추천"),
    el("option", { value: "youtube" }, "유튜브"),
    el("option", { value: "search" }, "검색"),
    el("option", { value: "other" }, "기타"),
  ]);
  const referralDetailInput = input("referralSourceDetail", "text", "들어온 경로를 입력하세요");
  const referralDetailField = field("기타 경로", referralDetailInput);
  referralDetailField.hidden = true;
  referralSelect.addEventListener("change", () => {
    referralDetailField.hidden = referralSelect.value !== "other";
    if (referralDetailField.hidden) referralDetailInput.value = "";
  });

  const phoneInput = el("input", { name: "phone", type: "tel", inputMode: "numeric", autocomplete: "tel", placeholder: "010-1234-5678", maxLength: 13 });
  const birthDateInput = el("input", { name: "birthDate", type: "date", autocomplete: "bday", max: new Date().toISOString().slice(0, 10) });
  const lectureIdInput = input("lectureId", "text", "인강 수강에 사용하는 아이디");
  const lectureIdField = field("인강 아이디", lectureIdInput, "full", "관리자가 실제 수강 정보와 대조합니다.");
  lectureIdField.hidden = true;
  courseTypeSelect.addEventListener("change", () => {
    lectureIdField.hidden = courseTypeSelect.value !== "lecture";
    lectureIdInput.required = courseTypeSelect.value === "lecture";
    if (lectureIdField.hidden) lectureIdInput.value = "";
  });
  const privacyConsent = el("input", { name: "privacyConsent", type: "checkbox", value: "yes", required: true });
  const termsConsent = el("input", { name: "termsConsent", type: "checkbox", value: "yes", required: true });
  const agreementItem = (title, checkbox, content) => el("section", { className: "lecture-application-agreement" }, [
    el("label", { className: "lecture-application-consent" }, [
      checkbox,
      el("span", {}, [el("b", {}, "[필수] "), title]),
    ]),
    el("details", { className: "lecture-application-agreement-details" }, [
      el("summary", {}, "내용 보기"),
      el("div", { className: "lecture-application-agreement-content" }, content),
    ]),
  ]);
  const result = el("div", { className: "student-auth-result", ariaLive: "polite" });
  const submitButton = button("신청하기", "btn");
  const form = el("form", { className: "form-grid lecture-application-form" }, [
    el("p", { className: "subtle field full" }, "입력한 정보는 수강 정보 확인과 등록번호 발급에만 사용됩니다."),
    field("수강 구분", courseTypeSelect, "full"),
    field("이름", input("name", "text", "이름")),
    field("휴대전화 번호", phoneInput),
    field("생년월일", birthDateInput),
    field("성별", select("gender", ["남", "여"])),
    field("직렬", trackSelect),
    customTrackField,
    field("들어온 경로", referralSelect),
    referralDetailField,
    lectureIdField,
    el("div", { className: "lecture-application-agreements field full" }, [
      agreementItem("개인정보 수집·이용에 동의합니다.", privacyConsent, [
        el("h4", {}, "개인정보 수집·이용 동의"),
        el("dl", {}, [
          el("dt", {}, "수집·이용 목적"),
          el("dd", {}, "수강생 등록 신청의 본인 확인, 수강 정보 대조, 등록번호 발급, 신청 결과 안내 및 중복·부정 신청 방지"),
          el("dt", {}, "수집 항목"),
          el("dd", {}, "이름, 휴대전화 번호, 생년월일, 성별, 직렬, 수강 구분, 유입 경로 및 상세 내용(해당 시), 인강 아이디(인강생에 한함)"),
          el("dt", {}, "보유·이용 기간"),
          el("dd", {}, "등록 신청 검토 및 수강 관계가 종료될 때까지. 다만, 관계 법령에 따른 보관 의무 또는 분쟁 처리를 위해 필요한 경우에는 해당 기간까지 보관합니다."),
          el("dt", {}, "동의 거부 권리 및 불이익"),
          el("dd", {}, "개인정보 수집·이용에 동의하지 않을 수 있으나, 필수 정보이므로 동의하지 않으면 수강생 등록을 신청할 수 없습니다."),
        ]),
        el("p", {}, "수집한 개인정보는 위 목적 외 용도로 이용하지 않으며, 보유 기간이 끝나면 지체 없이 파기합니다."),
      ]),
      agreementItem("수강생 등록 및 앱 이용약관에 동의합니다.", termsConsent, [
        el("h4", {}, "수강생 등록 및 앱 이용약관"),
        el("ol", {}, [
          el("li", {}, [el("b", {}, "목적 및 적용: "), "본 약관은 수강생 등록 신청과 등록 후 제공되는 앱 기능의 이용 조건을 정합니다."]),
          el("li", {}, [el("b", {}, "신청 및 승인: "), "신청자는 정확한 정보를 입력해야 합니다. 관리자가 실제 수강 정보를 확인한 뒤 등록을 승인하며, 허위·누락 정보 또는 수강 사실을 확인할 수 없는 신청은 반려될 수 있습니다."]),
          el("li", {}, [el("b", {}, "계정 관리: "), "발급된 등록번호와 계정은 본인만 사용할 수 있습니다. 타인에게 양도·대여하거나 다른 사람의 정보를 이용해서는 안 되며, 계정 정보의 안전한 관리 책임은 이용자에게 있습니다."]),
          el("li", {}, [el("b", {}, "이용자 준수사항: "), "서비스를 부정한 방법으로 이용하거나, 운영을 방해하거나, 다른 이용자의 권리와 개인정보를 침해해서는 안 됩니다."]),
          el("li", {}, [el("b", {}, "서비스 제공: "), "점검, 장애, 운영상 필요 또는 불가항력 사유가 있을 때 서비스의 전부 또는 일부가 변경·중단될 수 있으며, 가능한 경우 사전에 안내합니다."]),
          el("li", {}, [el("b", {}, "이용 제한: "), "허위 신청, 계정 공유, 시스템 악용 등 약관 위반이 확인되면 신청 반려, 계정 이용 제한 또는 등록 해지가 이루어질 수 있습니다."]),
          el("li", {}, [el("b", {}, "신청 철회 및 문의: "), "신청자는 검토 중 신청을 취소할 수 있으며, 등록 정보 수정·계정 이용 관련 사항은 앱의 문의하기 또는 담당자를 통해 요청할 수 있습니다."]),
        ]),
        el("p", {}, "본 약관에서 정하지 않은 사항은 관계 법령과 운영 정책에 따릅니다."),
      ]),
    ]),
    result,
    el("div", { className: "lecture-application-actions field full" }, [
      button("취소", "btn secondary", "button", closeInfoModal),
      submitButton,
    ]),
  ]);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = formData(form);
    const track = resolveStudentTrack(data.track, data.customTrack);
    result.className = "student-auth-result";
    result.textContent = "";
    if (!data.courseType || !data.name || !data.phone || !data.birthDate || !data.gender || !track || !data.referralSource
      || (data.courseType === "lecture" && !data.lectureId)) {
      result.className = "student-auth-result error";
      result.textContent = "필수 항목을 모두 입력해주세요.";
      return;
    }
    if (data.referralSource === "other" && !String(data.referralSourceDetail || "").trim()) {
      result.className = "student-auth-result error";
      result.textContent = "기타로 들어온 경로를 입력해주세요.";
      return;
    }
    if (!privacyConsent.checked) {
      result.className = "student-auth-result error";
      result.textContent = "개인정보 수집·이용에 동의해주세요.";
      return;
    }
    if (!termsConsent.checked) {
      result.className = "student-auth-result error";
      result.textContent = "수강생 등록 및 앱 이용약관에 동의해주세요.";
      return;
    }

    submitButton.disabled = true;
    setButtonLoading(submitButton, "신청 중");
    try {
      const response = await fetch("/api/lecture-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          phone: data.phone,
          birthDate: data.birthDate,
          gender: data.gender,
          track,
          courseType: data.courseType,
          referralSource: data.referralSource,
          referralSourceDetail: data.referralSourceDetail,
          lectureId: data.lectureId,
          privacyConsent: true,
          termsConsent: true,
        }),
      });
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok || !responseData.ok) {
        result.className = "student-auth-result error";
        result.textContent = responseData.error === "duplicate_application"
          ? "이미 신청 또는 승인된 휴대전화 번호나 인강 아이디입니다. 관리자에게 문의해주세요."
          : responseData.error === "too_many_requests"
            ? "신청 요청이 너무 많습니다. 잠시 후 다시 시도해주세요."
            : "신청 정보를 확인하지 못했습니다. 입력 내용을 확인해주세요.";
        return;
      }
      const receipt = {
        applicationId: responseData.applicationId,
        lookupToken: responseData.lookupToken,
        status: responseData.status || "pending",
        submittedAt: responseData.submittedAt || new Date().toISOString(),
        applicantName: String(data.name || "").trim(),
      };
      if (!receipt.applicationId || !receipt.lookupToken) throw new Error("application_receipt_missing");
      saveLectureApplicationReceipt(receipt);
      render();
      openInfoModal({
        title: "수강생 등록 신청 완료",
        content: renderLectureApplicationStatusCard(receipt, { modal: true }),
      });
    } catch (error) {
      console.error(error);
      result.className = "student-auth-result error";
      result.textContent = "신청 서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.";
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "신청하기";
    }
  });

  openInfoModal({
    title: "수강생 등록 신청",
    content: form,
    className: "lecture-application-modal",
    showConfirm: false,
  });
}

function openStudentRegistrationResetModal(student, onSuccess) {
  const passwordInput = input("password", "password", "본인 비밀번호");
  const reasonInput = textarea("reason", "예: 앱으로만 사용했는데 등록된 기기라고 표시됩니다.");
  const forgotPasswordNotice = el(
    "p",
    { className: "student-forgot-password-notice", hidden: true },
    "비밀번호를 잊은 경우 본인 확인이 필요합니다. 사무실 또는 담당자에게 학생번호와 이름을 알려주세요."
  );
  const forgotPasswordButton = button("비밀번호를 잊었나요?", "mini-btn student-forgot-password-btn", "button", () => {
    forgotPasswordNotice.hidden = false;
  });
  const resetButton = button("초기화하기", "btn", "button", async () => {
    const passwordHash = await hashStudentPassword(passwordInput.value);
    const reason = String(reasonInput.value || "").trim();
    if (!passwordInput.value || !reason) {
      notify("본인 비밀번호와 초기화 사유를 입력해주세요.");
      return;
    }

    setButtonLoading(resetButton, "초기화 중");
    resetButton.disabled = true;
    try {
      const response = await fetch("/api/student-reset-registration", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: student.id,
          passwordHash,
          reason,
          client: {
            href: location.href,
            displayMode: isStandaloneStudentApp() ? "standalone" : "browser",
            userAgent: navigator.userAgent || "",
          },
        }),
      });
      const data = response.ok ? await response.json() : { ok: false };
      if (!data.ok) {
        if (data.error === "password_mismatch") notify("비밀번호가 일치하지 않습니다.");
        else if (data.error === "student_not_found") notify("학생 정보를 찾을 수 없습니다.");
        else notify("등록기기 초기화에 실패했습니다.");
        return;
      }
      closeInfoModal();
      onSuccess?.();
      notify("등록기기를 초기화했습니다.");
    } catch (error) {
      console.error(error);
      notify("등록기기 초기화 중 오류가 발생했습니다.");
    } finally {
      resetButton.disabled = false;
      resetButton.textContent = "초기화하기";
    }
  });

  openInfoModal({
    title: "등록기기 초기화",
    className: "student-reset-request-modal",
    content: el("div", { className: "student-reset-request-content" }, [
      el("p", {}, "본인 확인 후 기존 등록기기를 해제하고 이 기기에서 다시 등록할 수 있습니다."),
      field("본인 비밀번호", passwordInput),
      forgotPasswordButton,
      forgotPasswordNotice,
      field("초기화 사유", reasonInput),
      resetButton,
    ]),
  });
}

function isStandaloneStudentApp() {
  return Boolean(
    isLocalStudentPreview() ||
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      window.navigator.standalone ||
      document.referrer.startsWith("android-app://")
  );
}

function isLocalStudentPreview() {
  return ["localhost", "127.0.0.1", "::1"].includes(location.hostname);
}

function renderStudentBrowserInstallOnly() {
  return el("div", { className: "student-browser-install-only-view" }, [
    button("앱으로 이용하기", "btn student-browser-install-button", "button", installToHomeScreen),
  ]);
}

async function hashStudentPassword(password) {
  const value = String(password || "");
  if (window.crypto?.subtle) {
    const bytes = new TextEncoder().encode(value);
    const digest = await window.crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return btoa(unescape(encodeURIComponent(value)));
}

function createDeviceToken() {
  const bytes = new Uint8Array(32);
  if (window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(bytes);
    return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

async function registerStudentDeviceWithServer({ studentId, passwordHash, deviceToken, track, gender }) {
  const response = await fetch("/api/student-devices", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "register",
      studentId,
      passwordHash,
      deviceToken,
      deviceLabel: getStudentDeviceLabel(),
      track,
      gender,
      client: {
        displayMode: isStandaloneStudentApp() ? "standalone" : "browser",
        userAgent: navigator.userAgent || "",
      },
    }),
  });
  const data = await response.json().catch(() => ({}));
  return { ...data, ok: response.ok && data.ok === true, httpStatus: response.status };
}

async function requestStudyCafeAction(action, payload = {}, options = {}) {
  const student = getAuthedStudent();
  const profile = getStudentProfile(student?.id);
  if (!student || !isOnlineStudentExperience(student) || !profile?.deviceToken) {
    return { ok: false, error: "online_student_auth_required", httpStatus: 403 };
  }
  const response = await fetch("/api/study-cafe", {
    method: "POST",
    credentials: "same-origin",
    keepalive: options.keepalive === true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action,
      studentId: student.id,
      deviceToken: profile.deviceToken,
      ...payload,
      client: {
        displayMode: isStandaloneStudentApp() ? "standalone" : "browser",
        userAgent: navigator.userAgent || "",
      },
    }),
  });
  const data = await response.json().catch(() => ({}));
  return { ...data, ok: response.ok && data.ok === true, httpStatus: response.status };
}

async function requestStudyRoomAction(action, payload = {}) {
  if (isStudyCafeLocalPreview()) return requestStudyRoomPreviewAction(action, payload);
  const student = getAuthedStudent();
  const profile = getStudentProfile(student?.id);
  if (!student || !isOnlineStudentExperience(student) || !profile?.deviceToken) {
    return { ok: false, error: "online_student_auth_required", httpStatus: 403 };
  }
  const response = await fetch("/api/study-cafe-rooms", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action,
      studentId: student.id,
      deviceToken: profile.deviceToken,
      ...payload,
      client: {
        displayMode: isStandaloneStudentApp() ? "standalone" : "browser",
        userAgent: navigator.userAgent || "",
      },
    }),
  });
  const data = await response.json().catch(() => ({}));
  return { ...data, ok: response.ok && data.ok === true, httpStatus: response.status };
}

function requestStudyRoomPreviewAction(action, payload = {}) {
  const currentRoom = studyRoomPreviewData.rooms.find((room) => room.id === studyRoomPreviewData.currentRoomId) || null;
  const ownMember = currentRoom?.members.find((member) => member.isMine) || null;
  if (action === "list") {
    return Promise.resolve({
      ok: true,
      rooms: studyRoomPreviewData.rooms.map((room) => ({
        id: room.id,
        name: room.name,
        description: room.description,
        capacity: room.capacity,
        memberCount: room.members.length,
        locked: room.locked,
        isMine: room.id === studyRoomPreviewData.currentRoomId,
        full: room.members.length >= room.capacity,
      })),
      membership: currentRoom ? { roomId: currentRoom.id, role: ownMember?.role || "member", seatNumber: ownMember?.seatNumber || null } : null,
    });
  }
  if (action === "load") {
    return Promise.resolve({ ok: true, room: currentRoom ? serializeStudyRoomPreview(currentRoom) : null });
  }
  if (action === "create") {
    if (currentRoom) return Promise.resolve({ ok: false, error: "room_membership_exists" });
    const id = `preview-room-${Date.now()}`;
    const room = {
      id,
      name: String(payload.name || "새 스터디방").trim(),
      description: String(payload.description || "").trim(),
      capacity: Number(payload.capacity) || 8,
      theme: payload.theme || "oak",
      locked: payload.accessType === "password",
      previewPassword: String(payload.password || ""),
      members: [{ name: "나", track: "온라인 수강", tone: "blue", role: "host", seatNumber: null, status: "seated", isMine: true, studentId: "preview-me" }],
      messages: [{ id: `preview-message-${Date.now()}`, type: "system", text: "스터디방이 만들어졌습니다.", senderName: "알림", createdAt: new Date().toISOString() }],
    };
    studyRoomPreviewData.rooms.unshift(room);
    studyRoomPreviewData.currentRoomId = id;
    return Promise.resolve({ ok: true, roomId: id });
  }
  if (action === "join") {
    if (currentRoom) return Promise.resolve({ ok: false, error: "room_membership_exists" });
    const room = studyRoomPreviewData.rooms.find((item) => item.id === payload.roomId);
    if (!room) return Promise.resolve({ ok: false, error: "room_not_found" });
    if (room.members.length >= room.capacity) return Promise.resolve({ ok: false, error: "room_full" });
    if (room.locked && String(payload.password || "") !== room.previewPassword) {
      return Promise.resolve({ ok: false, error: "room_password_invalid" });
    }
    room.members.push({ name: "나", track: "온라인 수강", tone: "blue", role: "member", seatNumber: null, status: "seated", isMine: true, studentId: "preview-me" });
    room.messages.push({ id: `preview-message-${Date.now()}`, type: "system", text: "나님이 참여했습니다.", senderName: "알림", createdAt: new Date().toISOString() });
    studyRoomPreviewData.currentRoomId = room.id;
    return Promise.resolve({ ok: true, roomId: room.id });
  }
  if (!currentRoom || payload.roomId !== currentRoom.id) return Promise.resolve({ ok: false, error: "room_membership_required" });
  if (action === "claim_seat") {
    if (currentRoom.members.some((member) => Number(member.seatNumber) === Number(payload.seatNumber) && !member.isMine)) {
      return Promise.resolve({ ok: false, error: "room_seat_taken" });
    }
    ownMember.seatNumber = Number(payload.seatNumber);
    return Promise.resolve({ ok: true, seatNumber: ownMember.seatNumber });
  }
  if (action === "release_seat") {
    ownMember.seatNumber = null;
    return Promise.resolve({ ok: true });
  }
  if (action === "message_send") {
    const message = {
      id: `preview-message-${Date.now()}`,
      type: "chat",
      text: String(payload.message || "").trim(),
      senderName: "나",
      isMine: true,
      createdAt: new Date().toISOString(),
    };
    currentRoom.messages.push(message);
    return Promise.resolve({ ok: true, message });
  }
  if (action === "message_delete") {
    const message = currentRoom.messages.find((item) => item.id === payload.messageId);
    if (message) {
      message.text = "삭제된 메시지입니다.";
      message.deleted = true;
    }
    return Promise.resolve({ ok: true, messageId: payload.messageId });
  }
  if (action === "update") {
    currentRoom.name = String(payload.name || currentRoom.name).trim();
    currentRoom.description = String(payload.description || "").trim();
    currentRoom.capacity = Number(payload.capacity) || currentRoom.capacity;
    currentRoom.theme = payload.theme || currentRoom.theme || "dawn";
    currentRoom.locked = payload.accessType === "password";
    if (payload.password) currentRoom.previewPassword = String(payload.password);
    return Promise.resolve({ ok: true });
  }
  if (action === "kick") {
    currentRoom.members = currentRoom.members.filter((member) => member.studentId !== payload.targetStudentId);
    return Promise.resolve({ ok: true });
  }
  if (action === "leave" || action === "close") {
    if (action === "close") {
      studyRoomPreviewData.rooms = studyRoomPreviewData.rooms.filter((room) => room.id !== currentRoom.id);
    } else {
      currentRoom.members = currentRoom.members.filter((member) => !member.isMine);
      if (ownMember?.role === "host" && currentRoom.members.length) {
        currentRoom.members.forEach((member, index) => {
          member.role = index === 0 ? "host" : "member";
        });
        currentRoom.messages.push({
          id: `preview-message-${Date.now()}`,
          type: "system",
          text: `${currentRoom.members[0].name}님에게 방장이 자동 위임되었습니다.`,
          senderName: "알림",
          createdAt: new Date().toISOString(),
        });
      }
    }
    studyRoomPreviewData.currentRoomId = "";
    return Promise.resolve({ ok: true });
  }
  return Promise.resolve({ ok: true, serverNow: new Date().toISOString() });
}

function serializeStudyRoomPreview(room) {
  const own = room.members.find((member) => member.isMine);
  return {
    id: room.id,
    name: room.name,
    description: room.description,
    capacity: room.capacity,
    theme: room.theme || "dawn",
    locked: room.locked,
    role: own?.role || "member",
    mySeatNumber: own?.seatNumber || null,
    members: room.members.map((member) => ({ ...member })),
    messages: room.messages.map((message) => ({ ...message })),
    unreadCount: 0,
  };
}

async function ensureStudyRoomLoaded(options = {}) {
  if (studyRoomState.loading) return false;
  const force = options.force === true;
  if (!force && studyRoomState.loaded) return true;
  if (isStudyCafeLocalPreview()) {
    const result = await requestStudyRoomPreviewAction("load");
    studyRoomState.room = result.room || null;
    if (!studyRoomState.room) studyRoomState.browsingPublicCafe = false;
    studyRoomState.loaded = true;
    return true;
  }
  studyRoomState.loading = true;
  try {
    const result = await requestStudyRoomAction("load");
    if (!result.ok) {
      studyRoomState.error = result.error || "study_room_unavailable";
      return false;
    }
    const previousRoom = studyRoomState.room;
    studyRoomState.room = result.room || null;
    if (!studyRoomState.room) studyRoomState.browsingPublicCafe = false;
    if (previousRoom && !studyRoomState.room) resetStudyCafeLocalSeatForPrivateRoom();
    studyRoomState.loaded = true;
    studyRoomState.lastLoadedAt = Date.now();
    studyRoomState.error = "";
    ensureStudyRoomRefresh();
    if (options.render === true && currentRoute === "study-cafe") renderStudyCafeStateUpdate();
    return true;
  } catch (error) {
    console.error(error);
    studyRoomState.error = "network_error";
    return false;
  } finally {
    studyRoomState.loading = false;
  }
}

function ensureStudyRoomRefresh() {
  if (studyRoomState.refreshTimer) return;
  studyRoomState.refreshTimer = window.setInterval(async () => {
    if (document.visibilityState === "hidden" || currentRoute !== "study-cafe" || !studyRoomState.room) return;
    const previousRoomId = studyRoomState.room?.id || "";
    const previousSignature = JSON.stringify(studyRoomState.room || null);
    await ensureStudyRoomLoaded({ force: true });
    if (currentRoute !== "study-cafe") return;
    if (previousRoomId !== (studyRoomState.room?.id || "") || previousSignature !== JSON.stringify(studyRoomState.room || null)) {
      renderStudyCafeStateUpdate();
    }
  }, STUDY_ROOM_REFRESH_INTERVAL_MS);
}

async function mutateStudyRoom(action, payload = {}, options = {}) {
  if (studyRoomState.actionPending && options.allowConcurrent !== true) {
    return { ok: false, error: "action_pending" };
  }
  studyRoomState.actionPending = true;
  try {
    const result = await requestStudyRoomAction(action, payload);
    if (!result.ok) {
      if (options.notify !== false) notify(getStudyRoomErrorMessage(result.error));
      return result;
    }
    if (options.refresh !== false) await ensureStudyRoomLoaded({ force: true });
    return result;
  } catch (error) {
    console.error(error);
    if (options.notify !== false) notify("스터디방 서버에 연결하지 못했습니다.");
    return { ok: false, error: "network_error" };
  } finally {
    studyRoomState.actionPending = false;
  }
}

function getStudyRoomErrorMessage(error) {
  const messages = {
    room_password_invalid: "방 비밀번호가 일치하지 않습니다.",
    room_full: "방 정원이 모두 찼습니다.",
    room_membership_exists: "이미 참여 중인 스터디방이 있습니다.",
    room_seat_taken: "방금 다른 구성원이 이 좌석을 선택했습니다.",
    message_rate_limited: "메시지를 너무 빠르게 보내고 있습니다. 잠시 후 다시 시도해주세요.",
    room_capacity_has_members: "현재 구성원 수보다 정원을 작게 설정할 수 없습니다.",
    room_capacity_has_seats: "변경할 정원 밖에 사용 중인 좌석이 있습니다.",
    study_room_store_unavailable: "스터디방 데이터베이스가 아직 준비되지 않았습니다. 관리자에게 문의해주세요.",
    service_role_not_configured: "스터디방 서버 설정이 아직 완료되지 않았습니다. 관리자에게 문의해주세요.",
  };
  return messages[error] || "스터디방 요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.";
}

function isStudyCafeRoute() {
  return ["study-todo", "study-cafe", "study-timer", "study-ranking", "study-character", "study-shop"].includes(currentRoute);
}

async function ensureStudyCafeRemoteLoaded(options = {}) {
  const student = getAuthedStudent();
  if (!isOnlineStudentExperience(student)) return false;
  if (studyCafeRemoteState.studentId && studyCafeRemoteState.studentId !== String(student.id)) {
    studyCafeLocalFallback = false;
    studyCafeRemoteState.available = null;
    studyCafeRemoteState.loaded = false;
    studyCafeRemoteState.room = null;
    studyCafeRemoteState.ranking = null;
    studyCafeRemoteState.todos = [];
    studyCafeRemoteState.todosByDate = {};
    studyCafeRemoteState.subjectGoalsByDate = {};
    studyCafeRemoteState.todoMonthSummaries = {};
    studyCafeRemoteState.todoMonthSummaryLoading.clear();
    studyCafeRankingPreviousRanks.clear();
    clearStudyCafePlannerEntryState();
    studyTodoDeletePendingKeys.clear();
    studyCafeRemoteState.plannerDateKey = "";
    studyCafeRemoteState.plannerLoading = false;
    studyCafeRemoteState.summary = null;
    studyCafeRemoteState.error = "";
    studyCafeRemoteState.studyDateKey = "";
    resetStudyCafeShopState();
  }
  studyCafeRemoteState.studentId = String(student.id);
  ensureStudyCafeRemoteTimers();
  const force = options.force === true;
  if (studyCafeRemoteState.loading) {
    await waitForStudyCafeRemoteLoad();
    return studyCafeRemoteState.loaded && studyCafeRemoteState.available === true;
  }
  const retryDue = Date.now() - studyCafeRemoteState.lastAttemptAt >= 15000;
  if (!force && (studyCafeRemoteState.loaded || (studyCafeRemoteState.available === false && !retryDue))) {
    return studyCafeRemoteState.loaded;
  }
  studyCafeRemoteState.loading = true;
  studyCafeRemoteState.lastAttemptAt = Date.now();
  const sessionRevisionAtRequest = studyCafeSessionRevision;
  const todoRevisionAtRequest = studyTodoMutationRevision;
  try {
    const result = await requestStudyCafeAction("load");
    if (!result.ok) {
      studyCafeRemoteState.error = result.error || "load_failed";
      if ([404, 501, 503].includes(result.httpStatus) || result.error === "service_role_not_configured") {
        studyCafeRemoteState.available = false;
        return false;
      }
      if (result.error === "device_not_active") {
        if (isLocalStudentPreview()) {
          const localStudyDateKey = formatStudyBusinessDateKey(new Date());
          studyCafeLocalFallback = true;
          studyCafeRemoteState.available = false;
          studyCafeRemoteState.loaded = true;
          studyCafeRemoteState.error = "";
          studyCafeRemoteState.studyDateKey ||= localStudyDateKey;
          studyCafeRemoteState.plannerDateKey ||= localStudyDateKey;
          if (!Object.prototype.hasOwnProperty.call(studyCafeRemoteState.todosByDate, localStudyDateKey)) {
            setStudyTodosForDate(localStudyDateKey, []);
          }
          studyCafeRemoteState.subjectGoalsByDate[localStudyDateKey] ||= [];
          notify("로컬 미리보기 모드로 전환했습니다.");
          if (isStudyCafeRoute() && options.render !== false) renderStudyCafeStateUpdate();
          return true;
        }
        notify("현재 기기 인증이 만료되었습니다. 다시 등록해주세요.");
      }
      return false;
    }
    studyCafeLocalFallback = false;
    studyCafeRemoteState.available = true;
    studyCafeRemoteState.loaded = true;
    studyCafeRemoteState.error = "";
    studyCafeRemoteState.lastLoadedAt = Date.now();
    hydrateStudyCafeSnapshot(result, {
      preserveLocalSession:
        studyCafeTimerActionPending ||
        Boolean(studyCafeCountdownInterval) ||
        sessionRevisionAtRequest !== studyCafeSessionRevision,
      preserveLocalTodos:
        studyTodoDeletePendingKeys.size > 0 ||
        todoRevisionAtRequest !== studyTodoMutationRevision,
    });
    if (currentRoute === "home") {
      updateStudyCafeHomeLiveCount();
      updateLectureHomeSummary();
    }
    if (isStudyCafeRoute() && options.render !== false) renderStudyCafeStateUpdate();
    return true;
  } catch (error) {
    console.error(error);
    studyCafeRemoteState.available = false;
    studyCafeRemoteState.error = "network_error";
    return false;
  } finally {
    studyCafeRemoteState.loading = false;
  }
}

function waitForStudyCafeRemoteLoad() {
  if (!studyCafeRemoteState.loading) return Promise.resolve();
  return new Promise((resolve) => {
    let checks = 0;
    const checkLoaded = () => {
      checks += 1;
      if (!studyCafeRemoteState.loading || checks >= 100) {
        resolve();
        return;
      }
      window.setTimeout(checkLoaded, 50);
    };
    checkLoaded();
  });
}

function hydrateStudyCafeSnapshot(snapshot, options = {}) {
  const nextStudyDateKey =
    String(snapshot.studyDate || "").trim() ||
    formatStudyBusinessDateKey(new Date(snapshot.serverNow || Date.now()));
  const previousStudyDateKey = studyCafeRemoteState.studyDateKey;
  if (previousStudyDateKey && nextStudyDateKey && previousStudyDateKey !== nextStudyDateKey) {
    studyTimerStatsState.cache = {};
    studyCafeRemoteState.todos = [];
    studyCafeRemoteState.todosByDate = {};
    studyCafeRemoteState.subjectGoalsByDate = {};
    studyCafeRemoteState.todoMonthSummaries = {};
    studyCafeRemoteState.todoMonthSummaryLoading.clear();
    studyCafeRankingPreviousRanks.clear();
    studyCafeRemoteState.plannerDateKey = nextStudyDateKey;
    if (formatStudyTimerDateKey(studyTimerStatsState.anchorDate) === previousStudyDateKey) {
      studyTimerStatsState.anchorDate = parseStudyTimerDateKey(nextStudyDateKey);
    }
  }
  studyCafeRemoteState.studyDateKey = nextStudyDateKey;
  if (!studyCafeRemoteState.plannerDateKey) {
    studyCafeRemoteState.plannerDateKey = nextStudyDateKey;
  }
  const subjects = Array.isArray(snapshot.subjects) ? snapshot.subjects.filter(Boolean).slice(0, 8) : [];
  if (subjects.length) studyCafePreviewState.customSubjects = subjects;
  if (snapshot.profile?.avatarTone) studyCafePreviewState.avatarTone = snapshot.profile.avatarTone;
  studyCafePreviewState.nickname = String(snapshot.profile?.nickname || "").trim();
  studyCafePreviewState.statusMessage = String(snapshot.profile?.statusMessage || "").trim();
  studyCafeRemoteState.room = Array.isArray(snapshot.room) ? snapshot.room : [];
  studyCafeRemoteState.ranking = Array.isArray(snapshot.ranking) ? snapshot.ranking : [];
  studyCafeRemoteState.rankingPeriods.daily = {
    ranking: studyCafeRemoteState.ranking,
    summary: snapshot.summary || null,
  };
  if (!options.preserveLocalTodos) {
    studyCafeRemoteState.todos = Array.isArray(snapshot.todos) ? snapshot.todos : [];
    studyCafeRemoteState.todosByDate[nextStudyDateKey] = studyCafeRemoteState.todos;
    studyCafeRemoteState.subjectGoalsByDate[nextStudyDateKey] = Array.isArray(snapshot.subjectGoals)
      ? snapshot.subjectGoals
      : [];
  }
  studyCafeRemoteState.summary = snapshot.summary || null;
  if (Object.prototype.hasOwnProperty.call(snapshot, "shop")) {
    hydrateStudyCafeShopSummary(snapshot.shop);
  }

  const totals = {};
  Object.entries(snapshot.subjectTotals || {}).forEach(([subject, seconds]) => {
    totals[subject] = Math.max(0, Number(seconds) || 0) * 1000;
  });
  const active = snapshot.activeSession;
  const activeElapsedMs = Math.max(0, Number(active?.elapsedSeconds) || 0) * 1000;
  if (active?.subject && active?.status === "running") {
    totals[active.subject] = Math.max(0, (Number(totals[active.subject]) || 0) - activeElapsedMs);
  }
  if (!options.preserveLocalSession) {
    studyCafePreviewState.subjectElapsedMs = totals;
  }

  const presence = snapshot.presence;
  if (!studyCafePreviewState.nickname && presence?.displayName) {
    studyCafePreviewState.temporaryNickname = String(presence.displayName).trim();
  }
  if (!options.preserveLocalSession) {
    const previousSeatId = studyCafePreviewState.selectedSeatId;
    studyCafePreviewState.selectedSeatId = presence?.seatNumber
      ? STUDY_CAFE_PREVIEW_SEATS[Number(presence.seatNumber) - 1]?.id || ""
      : "";
    if (!previousSeatId && presence?.seatNumber) {
      studyCafePreviewState.activeRoomIndex = getStudyCafeRoomIndexForSeat(presence.seatNumber);
    }
    studyCafePreviewState.subject = active?.subject || "";
    studyCafePreviewState.lastSubject = active?.subject || studyCafePreviewState.lastSubject;
    studyCafePreviewState.running = active?.status === "running";
    studyCafePreviewState.paused = active?.status === "paused";
    studyCafePreviewState.elapsedMs = studyCafePreviewState.paused ? activeElapsedMs : 0;
    studyCafePreviewState.startedAt = studyCafePreviewState.running ? Date.now() - activeElapsedMs : 0;
    studyCafePreviewState.subjectStartedAt = studyCafePreviewState.running ? Date.now() - activeElapsedMs : 0;
    const remoteIdleSince = Date.parse(presence?.idleSince || "");
    studyCafePreviewState.idleSince =
      studyCafePreviewState.selectedSeatId && !studyCafePreviewState.running
        ? Math.max(
            previousSeatId === studyCafePreviewState.selectedSeatId
              ? Number(studyCafePreviewState.idleSince) || 0
              : 0,
            Number.isFinite(remoteIdleSince) ? remoteIdleSince : Date.now()
          )
        : 0;
  }
}

function beginStudyCafeLocalSessionMutation() {
  studyCafeSessionRevision += 1;
  window.clearTimeout(studyCafeRemoteState.requestedRefreshTimer);
  studyCafeRemoteState.requestedRefreshTimer = null;
}

function finishStudyCafeLocalSessionMutation() {
  studyCafeSessionRevision += 1;
}

async function mutateStudyCafeRemote(action, payload = {}, options = {}) {
  if (studyCafeRemoteState.available !== true) {
    await ensureStudyCafeRemoteLoaded({
      render: false,
      force: studyCafeRemoteState.available === false,
    });
  }
  if (studyCafeRemoteState.available !== true) {
    if (isStudyCafeLocalPreview()) return { ok: true, localOnly: true };
    if (options.notify !== false) {
      notify("스터디카페 서버 연결을 확인 중입니다. 잠시 후 다시 시도해주세요.");
    }
    return { ok: false, error: studyCafeRemoteState.error || "study_cafe_unavailable" };
  }
  try {
    const result = await requestStudyCafeAction(action, payload, {
      keepalive: options.keepalive === true,
    });
    if (!result.ok && options.notify !== false) {
      const message = result.error === "seat_taken"
        ? "방금 다른 학생이 이 좌석을 선택했습니다."
        : "스터디카페 정보를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.";
      notify(message);
    }
    if (
      ((result.ok && action !== "heartbeat" && options.refresh !== false) ||
        result.error === "seat_taken")
    ) {
      requestStudyCafeRemoteRefresh();
    }
    return result;
  } catch (error) {
    console.error(error);
    if (options.notify !== false) notify("스터디카페 서버에 연결하지 못했습니다.");
    return { ok: false, error: "network_error" };
  }
}

function requestStudyCafeRemoteRefresh(
  delay = STUDY_CAFE_ACTION_REFRESH_DELAY_MS,
  options = {}
) {
  if (APP_MODE !== "student" || isStudyCafeLocalPreview()) return;
  window.clearTimeout(studyCafeRemoteState.requestedRefreshTimer);
  studyCafeRemoteState.requestedRefreshTimer = window.setTimeout(async () => {
    studyCafeRemoteState.requestedRefreshTimer = null;
    const student = getAuthedStudent();
    const shouldRefresh =
      isStudyCafeRoute() ||
      (currentRoute === "home" && isOnlineStudentExperience(student));
    if (!shouldRefresh || document.visibilityState === "hidden") return;
    const maxAgeMs = Math.max(0, Number(options.maxAgeMs) || 0);
    if (
      maxAgeMs &&
      studyCafeRemoteState.lastLoadedAt &&
      Date.now() - studyCafeRemoteState.lastLoadedAt < maxAgeMs
    ) {
      return;
    }
    if (studyCafeRemoteState.loading) {
      if (options.retryWhenLoading !== false) {
        requestStudyCafeRemoteRefresh(500, options);
      }
      return;
    }
    await ensureStudyCafeRemoteLoaded({ force: true });
  }, Math.max(0, Number(delay) || 0));
}

function bindStudyCafeLifecycleRefresh() {
  if (studyCafeRemoteState.lifecycleRefreshBound) return;
  studyCafeRemoteState.lifecycleRefreshBound = true;
  const refreshWhenActive = () => {
    if (document.visibilityState === "hidden") return;
    window.clearTimeout(studyCafeAutoPauseTimer);
    studyCafeAutoPauseTimer = null;
    requestStudyCafeRemoteRefresh(180);
  };
  const pauseWhenHidden = () => {
    if (document.visibilityState === "hidden") {
      scheduleStudyCafeAutoPause(0);
      return;
    }
    refreshWhenActive();
  };
  document.addEventListener("visibilitychange", pauseWhenHidden);
  window.addEventListener("blur", () => scheduleStudyCafeAutoPause(STUDY_CAFE_FOCUS_PAUSE_DELAY_MS));
  window.addEventListener("focus", refreshWhenActive);
  window.addEventListener("pageshow", refreshWhenActive);
  window.addEventListener("pagehide", () => scheduleStudyCafeAutoPause(0));
}

function ensureStudyCafeRemoteTimers() {
  bindStudyCafeLifecycleRefresh();
  ensureStudyCafeRealtimeSubscription();
  ensureStudyCafePreviewClock();
  ensureStudyCafeRankingRoomRefresh();
  if (!studyCafeRemoteState.refreshTimer) {
    studyCafeRemoteState.refreshTimer = window.setInterval(() => {
      const student = getAuthedStudent();
      if (
        document.visibilityState !== "hidden" &&
        (isStudyCafeRoute() || (currentRoute === "home" && isOnlineStudentExperience(student)))
      ) {
        requestStudyCafeRemoteRefresh();
      }
    }, STUDY_CAFE_SAFETY_REFRESH_INTERVAL_MS);
  }
  if (!studyCafeRemoteState.heartbeatTimer) {
    studyCafeRemoteState.heartbeatTimer = window.setInterval(() => {
      if (
        document.visibilityState !== "hidden" &&
        document.hasFocus() &&
        studyCafePreviewState.selectedSeatId
      ) {
        mutateStudyCafeRemote("heartbeat", {}, { notify: false });
      }
    }, 30000);
  }
}

function ensureStudyCafeRankingRoomRefresh() {
  if (studyCafeRankingRoomRefreshTimer) return;
  studyCafeRankingRoomRefreshTimer = window.setInterval(() => {
    if (
      document.visibilityState === "hidden" ||
      currentRoute !== "study-cafe" ||
      studyCafePreviewState.activeRoomIndex !== STUDY_CAFE_RANKING_ROOM_INDEX
    ) {
      return;
    }
    refreshStudyCafeRankingRoomView();
  }, STUDY_CAFE_RANKING_REFRESH_INTERVAL_MS);
}

function refreshStudyCafeRankingRoomView() {
  const student = getAuthedStudent();
  if (!student) return;
  const seatGrid = document.querySelector("[data-study-cafe-seat-grid]");
  if (!seatGrid) return;
  seatGrid.replaceChildren(
    ...renderStudyCafeRoomSeatNodes(STUDY_CAFE_RANKING_ROOM_INDEX, student, {
      trackChanges: true,
    })
  );
  seatGrid.classList.remove("ranking-updated");
  void seatGrid.offsetWidth;
  seatGrid.classList.add("ranking-updated");
  const selectedSeatNumber = STUDY_CAFE_PREVIEW_SEATS.findIndex(
    (seat) => seat.id === studyCafePreviewState.selectedSeatId
  ) + 1;
  const context = document.querySelector("[data-study-cafe-room-context]");
  if (context) {
    context.textContent = getStudyCafeRoomContextText(
      STUDY_CAFE_RANKING_ROOM_INDEX,
      selectedSeatNumber
    );
  }
  const mySeatLabel = document.querySelector("[data-study-cafe-my-seat-label]");
  if (mySeatLabel && selectedSeatNumber) {
    mySeatLabel.textContent = formatStudyCafeSeatLabel(selectedSeatNumber, student);
  }
  const rankingTabBadge = document.querySelector(
    `[data-study-cafe-room-index="${STUDY_CAFE_RANKING_ROOM_INDEX}"] i`
  );
  const myRank = selectedSeatNumber
    ? getStudyCafeRankingRoomRank(selectedSeatNumber, student)
    : 0;
  if (rankingTabBadge && myRank) rankingTabBadge.textContent = String(myRank);
}

function ensureStudyCafeRealtimeSubscription() {
  if (
    APP_MODE !== "student" ||
    !remoteStore?.channel ||
    studyCafeRealtimeChannel
  ) {
    return;
  }
  studyCafeRealtimeChannel = remoteStore
    .channel("study-cafe-room-public", { config: { private: false } })
    .on(
      "broadcast",
      { event: "state-changed" },
      scheduleStudyCafeRealtimeRefresh
    )
    .on(
      "broadcast",
      { event: "room-changed" },
      scheduleStudyRoomRealtimeRefresh
    )
    .subscribe((status) => {
      if (["CHANNEL_ERROR", "TIMED_OUT"].includes(status)) {
        console.warn(
          "Study cafe realtime is unavailable; fallback refresh remains active."
        );
      }
    });
}

function scheduleStudyRoomRealtimeRefresh(message) {
  if (currentRoute !== "study-cafe" || document.visibilityState === "hidden") return;
  const changedRoomId = message?.payload?.roomId || message?.roomId || "";
  if (studyRoomState.room && changedRoomId && changedRoomId !== studyRoomState.room.id) return;
  window.setTimeout(async () => {
    const before = JSON.stringify(studyRoomState.room || null);
    await ensureStudyRoomLoaded({ force: true });
    if (currentRoute === "study-cafe" && before !== JSON.stringify(studyRoomState.room || null)) {
      renderStudyCafeStateUpdate();
    }
  }, 250);
}

function scheduleStudyCafeRealtimeRefresh() {
  const student = getAuthedStudent();
  const shouldRefresh =
    isStudyCafeRoute() ||
    (currentRoute === "home" && isOnlineStudentExperience(student));
  if (!shouldRefresh || document.visibilityState === "hidden") return;
  window.clearTimeout(studyCafeRealtimeRefreshTimer);
  studyCafeRealtimeRefreshTimer = window.setTimeout(() => {
    studyCafeRealtimeRefreshTimer = null;
    requestStudyCafeRemoteRefresh(0, { retryWhenLoading: true });
  }, 350);
}

function getStudentDeviceLabel() {
  const userAgent = String(navigator.userAgent || "").toLowerCase();
  if (/iphone|ipad|ipod/.test(userAgent)) return "iPhone/iPad";
  if (userAgent.includes("android")) return "Android";
  if (userAgent.includes("windows")) return "Windows";
  if (userAgent.includes("macintosh") || userAgent.includes("mac os")) return "Mac";
  return "등록 기기";
}

function renderStudentHome() {
  const student = getAuthedStudent();
  if (getStudentCategory(student) === "lecture") return renderLectureStudentHome(student);
  const onlineMode = isOnlineStudentExperience(student);
  const activeOuting = !onlineMode && student ? getActiveOuting(student.id) : null;
  const todayAttendance = !onlineMode && student ? getStudentAttendanceForDate(student.id) : null;
  const holiday = onlineMode ? null : getAttendanceHoliday();
  const needsArrivalVerification = todayAttendance?.status === "pre_arrival_reason";
  const needsAttendance = !todayAttendance && !holiday && isAttendanceCheckOpen();
  const homeAction = getStudentHomeAction(activeOuting);
  return el("div", { className: "grid student-view student-home" }, [
    onlineMode
      ? null
      : el("section", { className: "student-dday-card" }, [
          el("div", {}, [
            el("span", {}, COAST_GUARD_EXAM_LABEL),
            el("strong", {}, formatDday(COAST_GUARD_EXAM_DATE)),
          ]),
          el("p", {}, `${formatExamDate(COAST_GUARD_EXAM_DATE)} 시험 기준`),
        ]),
    onlineMode ? renderStudyCafeHomeCard(student) : null,
    onlineMode ? null : renderStudentImportantNoticeCard(),
    !onlineMode && holiday && !todayAttendance
      ? el("section", { className: "student-summary-card" }, [
          el("div", {}, [
            el("strong", {}, "출석 인증"),
            el("p", {}, attendanceHolidayMessage(holiday.dateKey)),
          ]),
        ])
      : null,
    !onlineMode && needsArrivalVerification
      ? el("section", { className: "student-summary-card" }, [
          el("div", {}, [
            el("strong", {}, "등원 인증 대기"),
            el("p", {}, "등원 전 사유신청이 접수되었습니다. 학원에 도착하면 등원 인증을 완료해주세요."),
          ]),
          button("등원 인증하기", "btn", "button", () => {
            state.settings.attendanceMode = "";
            saveState();
            navigate("attendance");
          }),
        ])
      : null,
    !onlineMode && needsAttendance
      ? el("section", { className: "student-summary-card" }, [
          el("div", {}, [
            el("strong", {}, "출석 인증"),
            el("p", {}, "오늘 출석 인증을 완료해주세요."),
          ]),
          button("출석 인증하기", "btn", "button", () => {
            state.settings.attendanceMode = "";
            saveState();
            navigate("attendance");
          }),
        ])
      : null,
    !onlineMode
      ? el("section", { className: "student-summary-card" }, [
          el("div", {}, [
            el("strong", {}, homeAction.title),
            homeAction.copy ? el("p", {}, homeAction.copy) : null,
          ]),
          button(homeAction.buttonText, "btn", "button", homeAction.action),
        ])
      : null,
  ]);
}

function renderLectureStudentHome(student) {
  ensureStudyCafeRemoteLoaded({ render: false });
  ensureStudyCafePreviewClock();
  const summary = getLectureHomeSummary();
  const notices = getStudentImportantNotices();
  return el("div", { className: "grid student-view student-home lecture-student-home" }, [
    renderStudyCafeHomeCard(student),
    renderQuestionBoardHomePreview(student),
    el("section", { className: "lecture-home-shortcuts-card" }, [
      el("div", { className: "lecture-home-section-head" }, [
        el("div", {}, [
          el("span", {}, "QUICK MENU"),
          el("h2", {}, "바로가기"),
        ]),
      ]),
      el("div", { className: "lecture-home-shortcut-grid compact-three" }, [
        renderLectureHomeShortcut("study-timer", "footer-icon-study-timer", "타이머", summary.timerDescription),
        renderLectureHomeShortcut("study-ranking", "footer-icon-study-ranking", "순공 랭킹", "일·주·월 순위를 확인해요"),
        renderLectureHomeShortcut("notices", "lecture-home-notice-icon", "공지사항", notices.length ? `공지 ${notices.length}개 확인` : "새로운 안내를 확인해요"),
      ]),
    ]),
  ]);
}

function getCurriculumQuestSubject(subjectId = curriculumQuestSelectedSubjectId) {
  return CURRICULUM_QUEST_SUBJECTS.find((subject) => subject.id === subjectId) || CURRICULUM_QUEST_SUBJECTS[0];
}

function getCurriculumStageLectures(subjectId, stageNumber) {
  const subject = getCurriculumQuestSubject(subjectId);
  const managedStage = subject?.stages?.find((stage) => Number(stage.stageNumber) === Number(stageNumber));
  if (managedStage && Array.isArray(managedStage.lectures)) return managedStage.lectures;
  const stages = window.CURRICULUM_QUEST_LECTURES?.[subjectId] || {};
  const lectures = Array.isArray(stages[String(stageNumber)]) ? stages[String(stageNumber)] : [];
  return lectures.map((lecture, index) => ({
    ...lecture,
    id: lecture.id || `${subjectId}-stage-${stageNumber}-lecture-${index + 1}`,
  }));
}

function getCurriculumStage(subject, stageNumber) {
  return subject?.stages?.find((stage) => Number(stage.stageNumber) === Number(stageNumber)) || null;
}

function getCurriculumStageId(subject, stageNumber) {
  return getCurriculumStage(subject, stageNumber)?.id || `${subject.id}-stage-${stageNumber}`;
}

async function loadCurriculumQuestCatalog() {
  if (curriculumQuestCatalogLoading || curriculumQuestCatalogLoaded) return;
  curriculumQuestCatalogLoading = true;
  try {
    const student = getAuthedStudent();
    const profile = getStudentProfile(student?.id) || {};
    const canLoadProgress = Boolean(student?.id && profile.deviceToken);
    const response = await fetch(canLoadProgress ? "/api/curriculum-progress" : "/api/curriculum", {
      method: canLoadProgress ? "POST" : "GET",
      credentials: "same-origin",
      headers: canLoadProgress ? { "Content-Type": "application/json" } : undefined,
      body: canLoadProgress ? JSON.stringify(curriculumProgressRequestBody("load")) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || "curriculum_load_failed");
    const shouldReplaceCatalog = Array.isArray(data.subjects)
      && (data.subjects.length > 0 || (canLoadProgress && normalizeCoastGuardTrack(student?.track) !== "경찰직 - 공채(순경)"));
    if (shouldReplaceCatalog) {
      const subjects = data.subjects.map((subject, subjectIndex) => {
        const stages = Array.isArray(subject.stages) ? subject.stages : [];
        return {
          ...subject,
          sortOrder: Number(subject.sortOrder) || subjectIndex + 1,
          totalStages: stages.length,
          completedStages: 0,
          partLabel: "",
          stageTitles: stages.map((stage) => stage.title),
          stages,
        };
      });
      CURRICULUM_QUEST_SUBJECTS.splice(0, CURRICULUM_QUEST_SUBJECTS.length, ...subjects);
      if (CURRICULUM_QUEST_SUBJECTS.length && !CURRICULUM_QUEST_SUBJECTS.some((subject) => subject.id === curriculumQuestSelectedSubjectId)) {
        curriculumQuestSelectedSubjectId = CURRICULUM_QUEST_SUBJECTS[0].id;
      }
    }
    if (canLoadProgress) applyCurriculumQuestProgress(data.progress || {});
  } catch (error) {
    console.warn("Managed curriculum is unavailable; using the bundled curriculum.", error);
    const student = getAuthedStudent();
    if (student && normalizeCoastGuardTrack(student.track) !== "경찰직 - 공채(순경)") {
      CURRICULUM_QUEST_SUBJECTS.splice(0, CURRICULUM_QUEST_SUBJECTS.length);
    }
  } finally {
    curriculumQuestCatalogLoading = false;
    curriculumQuestCatalogLoaded = true;
    if (currentRoute === "curriculum" || (currentRoute === "study-todo" && studyPlannerHubView === "curriculum")) render();
  }
}

function curriculumProgressRequestBody(action, payload = {}) {
  const student = getAuthedStudent();
  const profile = getStudentProfile(student?.id) || {};
  return {
    action,
    studentId: student?.id || "",
    deviceToken: profile.deviceToken || "",
    client: {
      displayMode: isStandaloneStudentApp() ? "standalone" : "browser",
      userAgent: navigator.userAgent || "",
    },
    ...payload,
  };
}

async function saveCurriculumQuestProgress(action, payload) {
  const response = await fetch("/api/curriculum-progress", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(curriculumProgressRequestBody(action, payload)),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.error || "curriculum_progress_save_failed");
  applyCurriculumQuestProgress(data.progress || {});
  return data;
}

function applyCurriculumQuestProgress(progress) {
  curriculumQuestProgress.loaded = true;
  curriculumQuestProgress.persistent = true;
  curriculumQuestProgress.lectureIds = new Set(Array.isArray(progress.lectureIds) ? progress.lectureIds : []);
  curriculumQuestProgress.stages = new Map(
    (Array.isArray(progress.stages) ? progress.stages : []).map((stage) => [stage.stageId, stage])
  );
  CURRICULUM_QUEST_SUBJECTS.forEach((subject) => {
    let completedStages = 0;
    for (let stageNumber = 1; stageNumber <= subject.totalStages; stageNumber += 1) {
      const stageProgress = curriculumQuestProgress.stages.get(getCurriculumStageId(subject, stageNumber));
      if (!stageProgress?.completed) break;
      completedStages = stageNumber;
    }
    subject.completedStages = completedStages;
    const activeStage = Math.min(completedStages + 1, subject.totalStages);
    curriculumQuestTaskState[subject.id] = createCurriculumQuestTaskState(subject, activeStage);
  });
}

function getCurriculumLectureKey(stageNumber, lecture, index) {
  return `${stageNumber}:${lecture.no}:${index}`;
}

function createCurriculumQuestTaskState(subject, stageNumber, preview = false) {
  const lectures = getCurriculumStageLectures(subject.id, stageNumber);
  const stageProgress = curriculumQuestProgress.stages.get(getCurriculumStageId(subject, stageNumber)) || {};
  return {
    stageNumber,
    lectures: Object.fromEntries(
      lectures.map((lecture, index) => [
        getCurriculumLectureKey(stageNumber, lecture, index),
        curriculumQuestProgress.lectureIds.has(lecture.id) || (!curriculumQuestProgress.loaded && preview && index < 2),
      ])
    ),
    consolidation: stageProgress.consolidation === true,
    mbt: stageProgress.mbt === true,
  };
}

function getCurriculumStageTitle(subject, stageNumber) {
  const managedTitle = String(getCurriculumStage(subject, stageNumber)?.title || "").trim();
  if (managedTitle) return managedTitle;
  const lectureTitle = getCurriculumStageLectures(subject.id, stageNumber)
    .map((lecture) => String(lecture?.title || "").trim())
    .filter(Boolean)
    .join(", ");
  if (lectureTitle) return lectureTitle;
  return subject.stageTitles[stageNumber - 1] || `${stageNumber}회차`;
}

function isCurriculumOrientationStage(subject, stageNumber) {
  const stage = getCurriculumStage(subject, stageNumber);
  return stage?.requiresWrapUp === false || getCurriculumStageTitle(subject, stageNumber) === "오리엔테이션";
}

function getCurriculumAnalysisTaskLabel(subject) {
  return subject?.id === "criminal-law"
    ? "기출 분석 및 OX 학습"
    : "기출 분석 및 단권화";
}

function getCurriculumAnalysisTaskDescription(subject) {
  if (subject?.id === "criminal-law") {
    return "선지별 옳은 이유와 옳지 않은 이유를 파악한 후, 선지별로 OX를 표시해 주세요.";
  }
  if (["navigation-technique", "marine-engineering", "maritime-english"].includes(subject?.id)) {
    return "선지별 옳은 이유와 옳지 않은 이유를 파악한 후, 이론서에 단권화해 주세요.";
  }
  return "기출을 분석하고 단권화 교재에 정리해 주세요.";
}

function renderCurriculumQuest() {
  if (!isCurriculumQuestEnabled()) return renderStudentHome();
  if (!curriculumQuestCatalogLoaded && !curriculumQuestCatalogLoading) loadCurriculumQuestCatalog();
  if (curriculumQuestCatalogLoaded && !CURRICULUM_QUEST_SUBJECTS.length) {
    return el("div", { className: "student-curriculum-page curriculum-map-page" }, [
      el("header", { className: "curriculum-page-head" }, [el("div", {}, [el("h2", {}, "커리큘럼")])]),
      el("div", { className: "curriculum-content-sheet" }, [
        el("div", { className: "curriculum-admin-empty" }, [el("strong", {}, "등록된 커리큘럼이 없습니다."), el("p", {}, "현재 직렬에 적용된 커리큘럼이 아직 없습니다.")]),
      ]),
    ]);
  }
  return curriculumQuestView === "detail"
    ? renderCurriculumQuestStageDetail()
    : renderCurriculumQuestMap();
}

function renderCurriculumQuestMap() {
  const subject = getCurriculumQuestSubject();
  const percent = Math.round((subject.completedStages / subject.totalStages) * 100);
  const curriculumCompleted = subject.completedStages >= subject.totalStages;
  const currentStageNumber = Math.min(subject.completedStages + 1, subject.totalStages);
  const currentStageButton = button(
    curriculumCompleted ? "전체 완료 ✓" : "진행 회차 ↓",
    `curriculum-current-stage-jump ${curriculumCompleted ? "completed" : ""}`,
    "button",
    () => scrollToCurriculumCurrentStage(subject)
  );
  currentStageButton.disabled = curriculumCompleted;
  currentStageButton.setAttribute(
    "aria-label",
    curriculumCompleted
      ? `${subject.name} 모든 회차 완료`
      : `${subject.name} ${currentStageNumber}회차 진행 중인 회차로 이동`
  );
  return el("div", { className: "student-curriculum-page curriculum-map-page" }, [
    el("header", { className: "curriculum-page-head" }, [
      el("div", {}, [
        el("h2", {}, "커리큘럼"),
      ]),
      el("span", { className: "curriculum-map-badge" }, getCurriculumTrackBadge()),
    ]),
    el("div", { className: "curriculum-content-sheet" }, [
      el("nav", { className: "curriculum-subject-tabs", ariaLabel: "커리큘럼 과목 선택" },
        CURRICULUM_QUEST_SUBJECTS.map((item) => button(
          item.name,
          `curriculum-subject-tab ${item.id === subject.id ? "active" : ""}`,
          "button",
          () => {
            curriculumQuestSelectedSubjectId = item.id;
            curriculumQuestSelectedStage = Math.min(item.completedStages + 1, item.totalStages);
            render();
          }
        ))
      ),
      el("section", { className: "curriculum-overview-card" }, [
        el("div", { className: "curriculum-overview-head" }, [
          el("div", { className: "curriculum-overview-copy" }, [
            el("span", { className: `curriculum-subject-mark ${subject.tone}`, ariaHidden: "true" }, subject.shortName),
            el("div", {}, [
              el("h3", {}, subject.name),
            ]),
          ]),
          currentStageButton,
        ]),
        el("div", { className: "curriculum-overview-progress" }, [
          el("span", {}, `진행률 ${percent}%`),
          el("strong", {}, `${subject.completedStages}/${subject.totalStages}`),
        ]),
        el("span", { className: "curriculum-progress-track", ariaLabel: `${subject.name} ${percent}% 완료` }, [
          el("i", { style: `width:${percent}%` }),
        ]),
      ]),
      el("section", { className: "curriculum-stage-list", ariaLabel: `${subject.name} 회차 목록` },
        subject.stageTitles.map((title, index) => renderCurriculumStageCard(subject, index + 1, title))
      ),
      el("p", { className: "curriculum-local-note" }, "로컬 UI 미리보기 · 완료 상태는 새로고침하면 초기화됩니다."),
    ]),
  ]);
}

function scrollToCurriculumCurrentStage(subject) {
  if (!subject || subject.completedStages >= subject.totalStages) return;
  const stageNumber = Math.min(subject.completedStages + 1, subject.totalStages);
  const entry = document.querySelector(`[data-curriculum-stage-number="${stageNumber}"]`);
  if (!entry) return;
  entry.scrollIntoView({ behavior: "smooth", block: "center" });
  const stageCard = entry.querySelector(".curriculum-stage-card");
  if (stageCard && !stageCard.disabled) stageCard.focus({ preventScroll: true });
}

function getCurriculumTrackBadge() {
  const track = normalizeCoastGuardTrack(getAuthedStudent()?.track || "");
  if (track === "경찰직 - 함정요원 항해(순경)") return "함정요원·항해";
  if (track === "경찰직 - 함정요원 기관(순경)") return "함정요원·기관";
  return "공채";
}

function renderCurriculumStageCard(subject, stageNumber, title) {
  const completed = stageNumber <= subject.completedStages;
  const current = stageNumber === subject.completedStages + 1;
  const locked = stageNumber > subject.completedStages + 1;
  const status = completed ? "완료" : current ? "진행 중" : "잠김";
  const lectureCount = getCurriculumStageLectures(subject.id, stageNumber).length;
  const orientationStage = isCurriculumOrientationStage(subject, stageNumber);
  const taskState = curriculumQuestTaskState[subject.id];
  const currentLectureCount = current && taskState?.stageNumber === stageNumber
    ? Object.values(taskState.lectures || {}).filter(Boolean).length
    : 0;
  const phaseLabel = subject.id === "criminal-law" && stageNumber === 1
    ? "PART 1 · 형법"
    : subject.id === "criminal-law" && stageNumber === 9
      ? "PART 2 · 형사소송법"
      : "";
  const card = button(
    "",
    `curriculum-stage-card ${completed ? "completed" : current ? "current" : "locked"}`,
    "button",
    () => {
      if (locked) return;
      curriculumQuestSelectedStage = stageNumber;
      curriculumQuestView = "detail";
      render();
      scrollAppToTop();
    },
    [
      el("span", { className: "curriculum-stage-node", ariaHidden: "true" }, completed ? "✓" : locked ? "" : "●"),
      el("span", { className: "curriculum-stage-body" }, [
        el("span", { className: "curriculum-stage-topline" }, [
          el("small", {}, `${stageNumber}회차`),
          el("span", { className: `curriculum-stage-status ${completed ? "completed" : current ? "current" : "locked"}` }, status),
        ]),
        el("strong", { className: "curriculum-stage-title" }, getCurriculumStageTitle(subject, stageNumber)),
        el("span", { className: "curriculum-stage-meta" }, [
          el("span", { className: completed ? "done" : current && currentLectureCount ? "active" : "" },
            completed ? `✓ ${lectureCount}/${lectureCount}강` : current ? `${currentLectureCount}/${lectureCount}강` : `강의 ${lectureCount}`),
          orientationStage ? null : el("span", { className: completed || (current && taskState?.consolidation) ? "done" : "" }, `${completed ? "✓ " : ""}${getCurriculumAnalysisTaskLabel(subject)}`),
          orientationStage ? null : el("span", { className: completed || (current && taskState?.mbt) ? "done" : "" }, completed ? "✓ MBT" : "MBT"),
        ].filter(Boolean)),
      ]),
      el("span", { className: "curriculum-stage-chevron", ariaHidden: "true" }, locked ? "" : "›"),
    ]
  );
  card.disabled = locked;
  const entry = el("div", { className: `curriculum-stage-entry ${phaseLabel ? "has-phase" : ""}` }, [
    phaseLabel ? el("div", { className: "curriculum-phase-label" }, [
      el("span", {}, phaseLabel),
      el("i", { ariaHidden: "true" }),
    ]) : null,
    card,
  ]);
  entry.dataset.curriculumStageNumber = String(stageNumber);
  return entry;
}

function renderCurriculumQuestStageDetail() {
  const subject = getCurriculumQuestSubject();
  const stageNumber = Math.min(Math.max(1, curriculumQuestSelectedStage), subject.totalStages);
  const stageId = getCurriculumStageId(subject, stageNumber);
  const isCompletedStage = stageNumber <= subject.completedStages;
  const lectures = getCurriculumStageLectures(subject.id, stageNumber);
  const orientationStage = isCurriculumOrientationStage(subject, stageNumber);
  let taskState = curriculumQuestTaskState[subject.id];
  if (!taskState || taskState.stageNumber !== stageNumber) {
    taskState = createCurriculumQuestTaskState(subject, stageNumber);
    curriculumQuestTaskState[subject.id] = taskState;
  }
  const completedLectureCount = isCompletedStage
    ? lectures.length
    : lectures.filter((lecture, index) => taskState.lectures[getCurriculumLectureKey(stageNumber, lecture, index)]).length;
  const lecturesCompleted = completedLectureCount === lectures.length;
  const totalItemCount = lectures.length + (orientationStage ? 0 : 2);
  const completedItemCount = isCompletedStage
    ? totalItemCount
    : completedLectureCount + (orientationStage ? 0 : Number(taskState.consolidation) + Number(taskState.mbt));
  const allCompleted = completedItemCount === totalItemCount;
  const finishButton = button(
    isCompletedStage ? "커리큘럼으로 돌아가기" : "회차 완료하기",
    "btn curriculum-stage-finish",
    "button",
    async () => {
      if (isCompletedStage) {
        curriculumQuestView = "map";
        render();
        return;
      }
      if (!allCompleted) return;
      finishButton.disabled = true;
      try {
        await saveCurriculumQuestProgress("complete_stage", { stageId });
      } catch (error) {
        console.error(error);
        finishButton.disabled = false;
        notify("회차 완료 기록을 저장하지 못했습니다. 다시 시도해주세요.");
        return;
      }
      curriculumQuestSelectedStage = Math.min(stageNumber + 1, subject.totalStages);
      curriculumQuestView = "map";
      render();
      notify(`${subject.name} ${stageNumber}회차를 완료했습니다.`);
      scrollAppToTop();
    }
  );
  finishButton.disabled = !isCompletedStage && !allCompleted;

  const detailPage = el("div", { className: "student-curriculum-page curriculum-detail-page" }, [
    el("div", { className: "curriculum-detail-navy" }, [
      button("← 커리큘럼 목록", "curriculum-back-button", "button", returnToCurriculumMap),
      el("section", { className: `curriculum-detail-hero ${subject.tone}` }, [
        el("span", { className: "curriculum-detail-kicker" }, `${subject.name} · ${stageNumber}회차`),
        el("h2", {}, getCurriculumStageTitle(subject, stageNumber)),
        el("p", {}, `${completedItemCount}/${totalItemCount}개 항목 완료 · 이론강의 ${lectures.length}강`),
        el("span", { className: "curriculum-progress-track light", ariaLabel: `${completedItemCount}/${totalItemCount} 완료` }, [
          el("i", { style: `width:${Math.round((completedItemCount / totalItemCount) * 100)}%` }),
        ]),
      ]),
    ]),
    el("div", { className: "curriculum-content-sheet curriculum-detail-sheet" }, [
      el("section", { className: "curriculum-lecture-section" }, [
      el("div", { className: "curriculum-detail-section-head" }, [
        el("div", {}, [
          el("span", { className: "curriculum-section-number" }, "01"),
          el("div", {}, [
            el("strong", {}, "이론강의"),
            el("small", {}, `${lectures.length}강을 모두 들어주세요`),
          ]),
        ]),
        el("span", { className: `curriculum-section-count ${lecturesCompleted ? "completed" : ""}` }, `${completedLectureCount}/${lectures.length}강`),
      ]),
      el("div", { className: "curriculum-lecture-list" }, lectures.map((lecture, index) => {
        const lectureKey = getCurriculumLectureKey(stageNumber, lecture, index);
        const checked = isCompletedStage || Boolean(taskState.lectures[lectureKey]);
        const checkbox = el("input", {
          type: "checkbox",
          checked,
          disabled: isCompletedStage,
          ariaLabel: `${lecture.no} ${lecture.title} 수강 완료`,
        });
        checkbox.addEventListener("change", () => {
          const previous = Boolean(taskState.lectures[lectureKey]);
          taskState.lectures[lectureKey] = checkbox.checked;
          if (checkbox.checked) curriculumQuestProgress.lectureIds.add(lecture.id);
          else curriculumQuestProgress.lectureIds.delete(lecture.id);
          render();
          saveCurriculumQuestProgress("set_lecture", { lectureId: lecture.id, completed: checkbox.checked })
            .then(() => { if (currentRoute === "curriculum") render(); })
            .catch((error) => {
              console.error(error);
              taskState.lectures[lectureKey] = previous;
              if (previous) curriculumQuestProgress.lectureIds.add(lecture.id);
              else curriculumQuestProgress.lectureIds.delete(lecture.id);
              notify("강의 완료 기록을 저장하지 못했습니다.");
              if (currentRoute === "curriculum") render();
            });
        });
        return el("label", { className: `curriculum-lecture-row ${checked ? "completed" : ""}` }, [
          checkbox,
          el("span", { className: "curriculum-lecture-check", ariaHidden: "true" }, checked ? "✓" : ""),
          el("span", { className: "curriculum-lecture-copy" }, [
            el("strong", {}, lecture.no),
            el("span", {}, lecture.title),
          ]),
        ]);
      })),
      ]),
      orientationStage ? null : el("section", { className: "curriculum-after-lecture-section", ariaLabel: `${stageNumber}회차 마무리 퀘스트` }, [
      el("div", { className: "curriculum-detail-section-head compact" }, [
        el("div", {}, [
          el("span", { className: "curriculum-section-number" }, "02"),
          el("div", {}, [
            el("strong", {}, "기출 분석/학습"),
            el("small", {}, `${getCurriculumAnalysisTaskLabel(subject)}와 MBT를 완료해주세요`),
          ]),
        ]),
      ]),
      [
        {
          id: "consolidation",
          label: getCurriculumAnalysisTaskLabel(subject),
          copy: getCurriculumAnalysisTaskDescription(subject),
        },
        { id: "mbt", label: "MBT 풀이", copy: "학습 범위 MBT 풀이 후 75~80점을 달성해야 합니다." },
      ].map((task) => {
        const checked = isCompletedStage || Boolean(taskState[task.id]);
        const checkbox = el("input", { type: "checkbox", checked, disabled: isCompletedStage, ariaLabel: `${task.label} 완료` });
        checkbox.addEventListener("change", () => {
          const previous = Boolean(taskState[task.id]);
          taskState[task.id] = checkbox.checked;
          render();
          saveCurriculumQuestProgress("set_stage_task", { stageId, task: task.id, completed: checkbox.checked })
            .then(() => { if (currentRoute === "curriculum") render(); })
            .catch((error) => {
              console.error(error);
              taskState[task.id] = previous;
              notify(`${task.label} 기록을 저장하지 못했습니다.`);
              if (currentRoute === "curriculum") render();
            });
        });
        return el("label", { className: `curriculum-finish-task ${checked ? "completed" : ""}` }, [
          checkbox,
          el("span", { className: "curriculum-finish-icon", ariaHidden: "true" }, checked ? "✓" : ""),
          el("span", { className: "curriculum-finish-copy" }, [
            el("strong", {}, task.label),
            el("span", {}, task.copy),
          ]),
        ]);
      }),
      ]),
      el("p", { className: "curriculum-stage-helper" }, isCompletedStage
        ? "이미 완료한 회차입니다."
        : orientationStage
          ? "오리엔테이션 강의를 체크하면 다음 회차가 열립니다."
          : `강의와 ${getCurriculumAnalysisTaskLabel(subject)}, MBT를 체크하면 다음 회차가 열립니다.`),
      finishButton,
    ]),
  ]);
  enableCurriculumBackSwipe(detailPage);
  return detailPage;
}

function returnToCurriculumMap() {
  if (curriculumQuestView !== "detail") return;
  curriculumQuestView = "map";
  render();
  scrollAppToTop();
}

function enableCurriculumBackSwipe(page) {
  const minimumSwipeDistance = 72;
  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let tracking = false;

  page.addEventListener("touchstart", (event) => {
    if (event.touches.length !== 1) {
      tracking = false;
      return;
    }
    const touch = event.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    startTime = Date.now();
    tracking = true;
  }, { passive: true });

  page.addEventListener("touchmove", (event) => {
    if (!tracking || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    if (deltaX > 16 && deltaX > Math.abs(deltaY) * 1.2) event.preventDefault();
  }, { passive: false });

  page.addEventListener("touchend", (event) => {
    if (!tracking || !event.changedTouches.length) return;
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    const elapsed = Date.now() - startTime;
    tracking = false;
    if (deltaX >= minimumSwipeDistance && deltaX > Math.abs(deltaY) * 1.35 && elapsed <= 1000) {
      event.preventDefault();
      returnToCurriculumMap();
    }
  }, { passive: false });

  page.addEventListener("touchcancel", () => {
    tracking = false;
  }, { passive: true });
}

function getLectureHomeSummary() {
  const studyDateKey = studyCafeRemoteState.studyDateKey || formatStudyBusinessDateKey(new Date());
  const todos = getStudyTodosForDate(studyDateKey).filter((todo) => todo.pending !== true);
  const completedCount = todos.filter((todo) => todo.completed).length;
  const totalTimeLabel = formatStudyCafeElapsed(getStudySubjectTotalElapsedMs()).slice(0, 5);
  const activeSubject = String(studyCafePreviewState.subject || "").trim();
  return {
    plannerLabel: todos.length ? `${completedCount}/${todos.length} 완료` : "계획 없음",
    totalTimeLabel,
    timerDescription: activeSubject
      ? `${activeSubject} · ${formatStudyCafeElapsed(getStudySubjectElapsedMs(activeSubject))}`
      : "과목별 시간과 통계를 확인해요",
  };
}

function renderLectureHomeShortcut(route, iconClass, title, description) {
  const descriptionAttributes = route === "study-timer"
    ? { "data-lecture-home-timer-copy": "true" }
    : {};
  return button("", "lecture-home-shortcut", "button", () => navigate(route), [
    el("span", { className: "lecture-home-shortcut-icon", ariaHidden: "true" }, [
      el("span", { className: `footer-icon ${iconClass}` }),
    ]),
    el("span", { className: "lecture-home-shortcut-copy" }, [
      el("strong", {}, title),
      el("span", descriptionAttributes, description),
    ]),
    el("span", { className: "lecture-home-shortcut-chevron", ariaHidden: "true" }, "›"),
  ]);
}

function updateLectureHomeSummary() {
  const planner = document.querySelector("[data-lecture-home-planner]");
  const time = document.querySelector("[data-lecture-home-time]");
  const timerCopy = document.querySelector("[data-lecture-home-timer-copy]");
  if (!planner && !time && !timerCopy) return;
  const summary = getLectureHomeSummary();
  if (planner) planner.textContent = summary.plannerLabel;
  if (time) time.textContent = summary.totalTimeLabel;
  if (timerCopy) timerCopy.textContent = summary.timerDescription;
}

function renderStudentPushOptInPrompt(student) {
  if (!student?.id || studentPushReturnVisitStudentId !== String(student.id)) return null;
  const profile = getStudentProfile(student.id) || {};
  ensureStudentPushNotificationLoaded(student, profile);
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const preference = readStudentPushPromptPreference(student.id);
  const canPrompt = supported
    && studentPushNotificationState.loaded
    && studentPushNotificationState.available === true
    && !studentPushNotificationState.subscribed
    && !studentPushNotificationState.loading
    && Notification.permission !== "denied"
    && !(isIosDevice() && !isStandaloneWebApp())
    && preference.dismissals < STUDENT_PUSH_PROMPT_MAX_DISMISSALS
    && preference.nextPromptAt <= Date.now();
  if (!canPrompt) return null;

  const enableButton = button("알림 켜기", "btn", "button", () => enableStudentPushNotifications(student, profile));
  const laterButton = button("나중에", "btn secondary", "button", () => {
    localStorage.setItem(studentPushPromptKey(student.id), JSON.stringify({
      dismissals: preference.dismissals + 1,
      nextPromptAt: Date.now() + STUDENT_PUSH_PROMPT_SNOOZE_MS,
    }));
    render();
  });
  return el("section", { className: "student-push-optin-prompt", role: "region", ariaLabel: "앱 알림 안내" }, [
    el("strong", {}, "중요 공지 및 알림을 받아보세요"),
    el("div", { className: "student-push-optin-actions" }, [laterButton, enableButton]),
  ]);
}

function studentPushPromptKey(studentId) {
  return `${STUDENT_PUSH_PROMPT_STORAGE_KEY}:${String(studentId || "")}`;
}

function readStudentPushPromptPreference(studentId) {
  try {
    const value = JSON.parse(localStorage.getItem(studentPushPromptKey(studentId)) || "{}");
    return {
      dismissals: Math.max(0, Number(value.dismissals) || 0),
      nextPromptAt: Math.max(0, Number(value.nextPromptAt) || 0),
    };
  } catch {
    return { dismissals: 0, nextPromptAt: 0 };
  }
}

function renderHomeScreenInstallCard() {
  if (isRunningStandalone()) return null;
  return el("section", { className: "student-install-card" }, [
    el("div", {}, [
      el("strong", {}, "앱처럼 사용하기"),
      el("p", {}, "iPhone은 Safari와 Chrome의 공유 버튼 위치가 다릅니다."),
    ]),
    button("홈화면 추가", "btn secondary", "button", installToHomeScreen),
  ]);
}

function renderStudentAuthInstallCard() {
  if (isRunningStandalone()) return null;
  return el("section", { className: "student-install-card student-auth-install-card" }, [
    el("div", {}, [
      el("strong", {}, "앱처럼 이용하기"),
      el("p", {}, "iPhone은 Safari와 Chrome의 공유 버튼 위치가 다릅니다."),
    ]),
    button("앱으로 이용하기", "btn secondary", "button", installToHomeScreen),
  ]);
}

async function installToHomeScreen() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    render();
    return;
  }

  openInstallGuideModal();
}

function openInstallGuideModal() {
  const userAgent = navigator.userAgent.toLowerCase();
  const isKakao = userAgent.includes("kakaotalk");
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isChromeIos = isIos && userAgent.includes("crios");
  const isSafariIos = isIos && userAgent.includes("safari") && !userAgent.includes("crios") && !userAgent.includes("fxios") && !userAgent.includes("edgios");
  const isAndroid = userAgent.includes("android");
  const pageUrl = location.href;
  const title = isKakao ? "브라우저에서 열어주세요" : "홈 화면에 추가하기";
  const guideMessage = isKakao
    ? "카카오톡 안에서는 홈 화면 추가가 잘 안 될 수 있습니다. 먼저 기본 브라우저로 열어주세요."
    : isIos
      ? "iPhone에서는 브라우저마다 공유 버튼 위치가 다릅니다. 현재 브라우저에 맞춰 진행해주세요."
      : "현재 브라우저에서 아래 순서대로 홈 화면에 추가해주세요.";
  const steps = isKakao
    ? [
        "카카오톡 오른쪽 아래 점 세 개 또는 공유 버튼을 누릅니다.",
        isIos ? "Safari로 열기를 선택합니다." : "다른 브라우저로 열기를 선택합니다.",
        "브라우저에서 공유 또는 메뉴를 눌러 홈 화면에 추가합니다.",
      ]
    : isChromeIos
      ? ["주소창 오른쪽의 공유 버튼을 누릅니다. 보이지 않으면 오른쪽 아래 점 세 개 메뉴에서 공유를 선택합니다.", "홈 화면에 추가를 선택합니다."]
      : isSafariIos
        ? ["하단 도구막대 또는 주소창 옆의 공유 버튼을 누릅니다.", "홈 화면에 추가를 선택합니다."]
        : isIos
          ? ["브라우저의 공유 버튼 또는 메뉴를 누릅니다.", "홈 화면에 추가를 선택합니다."]
      : ["브라우저 오른쪽 위 메뉴를 누릅니다.", "앱 설치 또는 홈 화면에 추가를 선택합니다.", "설치 또는 추가를 누릅니다."];

  const actions = [
    button("주소 복사", "btn secondary", "button", async () => {
      await copyText(pageUrl);
      notify("주소를 복사했습니다. 브라우저에 붙여넣어 열어주세요.");
    }),
  ];

  if (isKakao && isAndroid) {
    actions.unshift(button("Chrome으로 열기", "btn", "button", openCurrentPageInChrome));
  }

  openInfoModal({
    title,
    content: el("div", { className: "install-guide" }, [
      el(
        "p",
        {},
        guideMessage
      ),
      el(
        "ol",
        {},
        steps.map((step) => el("li", {}, step))
      ),
      el("div", { className: "install-guide-actions" }, actions),
    ]),
  });
}

function openCurrentPageInChrome() {
  const url = new URL(location.href);
  const fallback = encodeURIComponent(location.href);
  location.href = `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=${url.protocol.replace(":", "")};package=com.android.chrome;S.browser_fallback_url=${fallback};end`;
}

function isRunningStandalone() {
  return window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function renderStudentImportantNoticeCard() {
  const notices = getStudentImportantNotices().slice(0, 2);
  if (!notices.length) return null;
  return el("section", { className: "student-notice-card" }, [
    el("div", { className: "student-notice-head" }, [
      el("h3", {}, "중요 공지"),
      button("더보기", "student-notice-more", "button", () => navigate("notices")),
    ]),
    el(
      "div",
      { className: "student-notice-list" },
      notices.map((notice) => renderStudentNoticeRow(notice))
    ),
  ]);
}

function renderStudentNoticeRow(notice, boardStyle = false) {
  if (boardStyle) {
    return button("", "student-notice-title student-notice-row", "button", () => navigate(`notice-${notice.id}`), [
      el("span", { className: "student-notice-row-main" }, [
        el("strong", { className: "student-notice-title-text" }, notice.title),
        el("small", { className: "student-notice-meta" }, [
          el("span", {}, "공지사항"),
          el("time", {}, formatNoticeDate(notice.createdAt)),
        ]),
      ]),
      el("span", { className: "student-notice-row-action", ariaHidden: "true" }, ">"),
    ]);
  }
  return button("", "student-notice-title", "button", () => navigate(`notice-${notice.id}`), [
    el("span", { className: "student-notice-title-text" }, notice.title),
    el("span", { className: "student-notice-arrow", ariaHidden: "true" }, ">"),
  ]);
}

function renderStudentNoticeList() {
  const notices = getStudentImportantNotices();
  return el("div", { className: "grid student-view student-notices" }, [
    el("section", { className: "student-notices-panel" }, [
      el("div", { className: "student-notices-head" }, [
        el("h2", {}, "중요 공지"),
        button("홈", "mini-btn", "button", () => navigate("home")),
      ]),
      el(
        "div",
        { className: "student-notice-list full" },
        notices.length ? notices.map((notice) => renderStudentNoticeRow(notice, true)) : el("div", { className: "empty" }, "등록된 중요 공지가 없습니다.")
      ),
    ]),
  ]);
}

function renderStudentNoticeDetail() {
  const noticeId = currentRoute.replace(/^notice-/, "");
  const notice = getStudentImportantNoticeById(noticeId);
  if (!notice) {
    return el("div", { className: "grid student-view student-notices" }, [
      el("section", { className: "student-notices-panel" }, [
        el("h2", {}, "공지글을 찾을 수 없습니다"),
        el("p", {}, "삭제되었거나 주소가 변경된 공지입니다."),
        button("목록으로", "btn secondary", "button", () => navigate("notices")),
      ]),
    ]);
  }
  return el("div", { className: "grid student-view student-notices" }, [
    el("article", { className: "student-notice-detail" }, [
      el("div", { className: "student-notice-detail-head" }, [
        el("span", {}, formatNoticeDate(notice.createdAt)),
        el("h2", {}, notice.title),
      ]),
      el(
        "div",
        { className: "student-notice-body" },
        splitNoticeBody(notice.body).map((paragraph) => el("p", {}, paragraph))
      ),
      el("div", { className: "student-notice-actions" }, [
        button("목록으로", "btn secondary", "button", () => navigate("notices")),
        button("홈으로", "btn", "button", () => navigate("home")),
      ]),
    ]),
  ]);
}

function getStudentImportantNotices() {
  const student = getAuthedStudent();
  return getImportantNotices({
    publishedOnly: true,
    studentCategory: getStudentCategory(student),
  });
}

function getStudentImportantNoticeById(id) {
  const student = getAuthedStudent();
  return getImportantNoticeById(id, {
    publishedOnly: true,
    studentCategory: getStudentCategory(student),
  });
}

function formatNoticeDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10).replaceAll("-", ".");
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function splitNoticeBody(value) {
  return String(value || "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function getStudentHomeStatus(outing) {
  if (!outing) {
    return {
      dot: "active",
      title: "해양경찰 시험 준비 중.",
      copy: "",
    };
  }
  if (outing.earlyLeaveReason) {
    if (outing.decision === "approved") {
      return {
        dot: "active",
        title: "조퇴 완료되었습니다.",
        copy: "",
      };
    }
    if (outing.decision === "rejected") {
      return {
        dot: "pending",
        title: "조퇴 신청이 반려되었습니다.",
        copy: "사무실에 문의해주세요.",
      };
    }
    return {
      dot: "pending",
      title: "조퇴 신청이 접수되었습니다.",
      copy: "승인 대기 중입니다.",
    };
  }
  if (outing.status === "requested") {
    return {
      dot: "pending",
      title: "외출 신청 후 사진 인증이 필요합니다",
      copy: `${outing.reason} 외출 신청이 접수되었습니다. 현장 인증 사진을 제출해주세요.`,
    };
  }
  return {
    dot: "pending",
    title: "외출 중입니다",
    copy: "학원에 도착했다면 복귀 인증을 완료해주세요.",
  };
}

function getStudentHomeAction(outing) {
  if (!outing) {
    return {
      title: "외출 신청",
      copy: "",
      buttonText: "외출 신청하기",
      action: () => navigate("student"),
    };
  }
  if (outing.earlyLeaveReason) {
    return {
      title: "조퇴 신청",
      copy: outing.decision === "approved" ? "조퇴 처리가 완료되었습니다." : "처리 상태를 확인할 수 있습니다.",
      buttonText: "상태 확인하기",
      action: () => navigate("student"),
    };
  }
  if (outing.status === "requested") {
    return {
      title: "다음 단계",
      copy: "현장 인증 사진이 필요합니다.",
      buttonText: "사진 인증하기",
      action: () => navigate("student-verify"),
    };
  }
  return {
    title: "다음 단계",
    copy: "복귀했다면 사무실에서 복귀 인증을 완료하세요.",
    buttonText: "복귀 인증하기",
    action: () => navigate("student-return"),
  };
}

function renderStudentMypage() {
  const student = getAuthedStudent();
  const profile = getStudentProfile(student.id) || {};
  const category = getStudentCategory(student);
  return el("div", { className: "grid student-view student-mypage" }, [
    el("section", { className: "student-profile-card" }, [
      el("div", { className: "student-profile-head" }, [
        el("div", { className: "student-avatar" }, student.name.slice(0, 1)),
        el("div", {}, [
          el("span", {}, "로그인 정보"),
          el("div", { className: "student-profile-name-row" }, [
            el("h2", {}, student.name),
            button("정보 수정", "mini-btn", "button", () => notify("정보 수정은 사무실에 문의해주세요.")),
          ]),
        ]),
      ]),
      el("div", { className: "student-profile-list" }, [
        profileItem("학생 고유번호", student.id),
        profileItem("학생 카테고리", getStudentCategoryLabel(student)),
        profileItem("반", student.className || state.settings.className || "오프라인반"),
        profileItem("직렬", normalizeCoastGuardTrack(profile.track) || "-"),
        profileItem("성별", profile.gender || "-"),
      ]),
    ]),
    category === "lecture"
      ? button("", "student-history-button-card student-settings-link student-character-card", "button", () => navigate("study-character"), [
          el("div", { className: "student-history-head" }, [
            el("h2", {}, "캐릭터"),
          ]),
          el("span", { className: "student-settings-chevron", ariaHidden: "true" }, "›"),
        ])
      : null,
    category === "lecture"
      ? button("", "student-history-button-card student-settings-link student-faq-link", "button", () => navigate("faq"), [
          el("div", { className: "student-history-head" }, [
            el("h2", {}, "자주 묻는 질문"),
            el("span", {}, "기능 이용 방법과 문제 해결"),
          ]),
          el("span", { className: "student-settings-chevron", ariaHidden: "true" }, "›"),
        ])
      : null,
    !isOnlineStudentExperience(student) ? renderStudentOutingHistoryButton(student.id) : null,
    category !== "lecture" ? renderStudentPenaltyHistoryButton(student.id) : null,
    renderStudentPushNotificationCard(student, profile),
    renderStudentDeviceManagementCard(student, profile),
    renderHomeScreenInstallCard(),
  ]);
}

function renderStudentFaqItem(item, index) {
  const answerId = `student-faq-answer-${index}`;
  const isOpen = index === 0;
  const answer = el("div", {
    className: "student-faq-answer",
    id: answerId,
    hidden: !isOpen,
  }, [
    el("span", {}, "답변"),
    el("p", {}, item.answer),
  ]);
  const question = el("button", {
    className: "student-faq-question",
    type: "button",
    "aria-expanded": String(isOpen),
    "aria-controls": answerId,
  }, [
    el("span", { className: "student-faq-category" }, item.category),
    el("strong", {}, item.question),
    el("span", { className: "student-faq-toggle", ariaHidden: "true" }, "+"),
  ]);
  const itemCard = el("article", {
    className: `student-faq-item${isOpen ? " open" : ""}`,
  }, [question, answer]);

  question.addEventListener("click", () => {
    const nextOpen = question.getAttribute("aria-expanded") !== "true";
    question.setAttribute("aria-expanded", String(nextOpen));
    answer.hidden = !nextOpen;
    itemCard.classList.toggle("open", nextOpen);
  });

  return itemCard;
}

function renderStudentFaqFilters() {
  const categories = ["전체", ...new Set(INTERNET_STUDENT_FAQS.map((item) => item.category))];
  return el("nav", { className: "student-faq-filters", ariaLabel: "FAQ 기능 카테고리" },
    categories.map((category) => {
      const isActive = studentFaqCategory === category;
      const categoryButton = button(
        category,
        `student-faq-filter${isActive ? " active" : ""}`,
        "button",
        () => {
          if (studentFaqCategory === category) return;
          studentFaqCategory = category;
          render();
        }
      );
      categoryButton.setAttribute("aria-pressed", String(isActive));
      return categoryButton;
    })
  );
}

function renderStudentFaq() {
  const visibleFaqs = studentFaqCategory === "전체"
    ? INTERNET_STUDENT_FAQS
    : INTERNET_STUDENT_FAQS.filter((item) => item.category === studentFaqCategory);
  return el("div", { className: "grid student-view student-faq-page" }, [
    button("← 마이", "student-faq-back", "button", () => navigate("mypage")),
    el("header", { className: "student-faq-head" }, [
      el("span", {}, "HELP CENTER"),
      el("h2", {}, "자주 묻는 질문"),
      el("p", {}, "인터넷 수강생 화면의 주요 기능과 이용 방법을 확인해보세요."),
    ]),
    renderStudentFaqFilters(),
    el("section", { className: "student-faq-list", ariaLabel: "자주 묻는 질문 목록" },
      visibleFaqs.map(renderStudentFaqItem)
    ),
    el("aside", { className: "student-faq-contact" }, [
      el("div", {}, [
        el("strong", {}, "도움이 더 필요한가요?"),
        el("p", {}, "FAQ로 해결되지 않는 문제는 비공개 문의로 남겨주세요."),
      ]),
      button("문의하기", "student-faq-contact-button", "button", openStudentInquiryComposer),
    ]),
  ]);
}

function renderStudentPushNotificationCard(student, profile) {
  ensureStudentPushNotificationLoaded(student, profile);
  return button("", "student-history-button-card student-settings-link student-push-settings-link", "button", () => navigate("push-settings"), [
    el("div", { className: "student-history-head" }, [
      el("h2", {}, "앱 알림 설정"),
      studentPushNotificationState.subscribed ? null : el("span", {}, "꺼짐"),
    ]),
    el("span", { className: "student-settings-chevron", ariaHidden: "true" }, "›"),
  ]);
}

function renderStudentPushSettings() {
  const student = getAuthedStudent();
  const profile = getStudentProfile(student.id) || {};
  const category = getStudentCategory(student);
  ensureStudentPushNotificationLoaded(student, profile);
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const canToggle = supported
    && studentPushNotificationState.available === true
    && Notification.permission !== "denied"
    && !(isIosDevice() && !isStandaloneWebApp());
  const masterToggle = renderStudentPushSettingsToggle({
    checked: studentPushNotificationState.subscribed,
    disabled: !canToggle || studentPushNotificationState.loading,
    ariaLabel: "전체 앱 알림",
    onChange: async (checked) => {
      if (checked) await enableStudentPushNotifications(student, profile);
      else await disableStudentPushNotifications(student, profile);
    },
  });
  const preferenceRows = getStudentPushPreferenceOptions(category).map((option) =>
    el("div", { className: "student-push-setting-row" }, [
      el("div", {}, [el("strong", {}, option.title), el("p", {}, option.description)]),
      renderStudentPushSettingsToggle({
        checked: studentPushNotificationState.preferences[option.key] !== false,
        disabled: !studentPushNotificationState.subscribed || studentPushNotificationState.loading,
        ariaLabel: option.title,
        onChange: (checked) => updateStudentPushPreference(option.key, checked, student, profile),
      }),
    ])
  );
  return el("div", { className: "grid student-view student-push-settings-page" }, [
    button("‹ 마이페이지", "student-push-settings-back", "button", () => navigate("mypage")),
    el("section", { className: "student-push-settings-card" }, [
      el("div", { className: "student-push-setting-row master" }, [
        el("div", {}, [el("strong", {}, "전체 앱 알림"), el("p", {}, "이 기기에서 앱 알림을 받습니다.")]),
        masterToggle,
      ]),
      el("div", { className: "student-push-setting-list" }, preferenceRows),
    ]),
  ]);
}

function getStudentNotificationReadStorageKey(studentId) {
  return `${STUDENT_NOTIFICATION_READ_STORAGE_KEY}:${String(studentId || "guest")}`;
}

function getReadStudentNotificationIds(studentId) {
  try {
    const value = JSON.parse(localStorage.getItem(getStudentNotificationReadStorageKey(studentId)) || "[]");
    return new Set(Array.isArray(value) ? value.map(String) : []);
  } catch {
    return new Set();
  }
}

function markStudentNotificationsRead(studentId, messages) {
  const ids = (messages || []).map((message) => String(message.id || "")).filter(Boolean).slice(0, 200);
  localStorage.setItem(getStudentNotificationReadStorageKey(studentId), JSON.stringify(ids));
}

function updateStudentNotificationBadge(student = getAuthedStudent()) {
  const readIds = getReadStudentNotificationIds(student?.id);
  const unreadCount = studentNotificationInboxState.studentId === String(student?.id || "")
    ? studentNotificationInboxState.messages.filter((message) => !readIds.has(String(message.id))).length
    : 0;
  document.querySelectorAll("[data-student-notification-badge]").forEach((badge) => {
    badge.hidden = unreadCount === 0;
    badge.textContent = unreadCount > 9 ? "9+" : String(unreadCount);
  });
}

function ensureStudentNotificationInboxLoaded(student = getAuthedStudent()) {
  if (!student?.id || !isOnlineStudentExperience(student)) return;
  const studentId = String(student.id);
  if (studentNotificationInboxState.studentId !== studentId) {
    studentNotificationInboxState.studentId = studentId;
    studentNotificationInboxState.loaded = false;
    studentNotificationInboxState.loading = false;
    studentNotificationInboxState.messages = [];
    studentNotificationInboxState.error = "";
  }
  if (studentNotificationInboxState.loaded || studentNotificationInboxState.loading) {
    updateStudentNotificationBadge(student);
    return;
  }
  const profile = getStudentProfile(student.id) || {};
  if (!profile.deviceToken) {
    studentNotificationInboxState.loaded = true;
    updateStudentNotificationBadge(student);
    return;
  }
  studentNotificationInboxState.loading = true;
  fetch("/api/student-push", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "inbox",
      studentId: student.id,
      deviceToken: profile.deviceToken,
    }),
  })
    .then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || "student_notification_inbox_failed");
      studentNotificationInboxState.messages = Array.isArray(data.messages) ? data.messages : [];
      studentNotificationInboxState.loaded = true;
      studentNotificationInboxState.error = "";
    })
    .catch((error) => {
      console.error(error);
      studentNotificationInboxState.error = error.message || "student_notification_inbox_failed";
    })
    .finally(() => {
      studentNotificationInboxState.loading = false;
      updateStudentNotificationBadge(student);
      if (currentRoute === "notifications") render();
    });
}

function renderStudentNotifications() {
  const student = getAuthedStudent();
  ensureStudentNotificationInboxLoaded(student);
  if (studentNotificationInboxState.loading && !studentNotificationInboxState.loaded) {
    return el("div", { className: "grid student-view student-notification-page" }, [
      renderStudentNotificationPageHead(),
      el("div", { className: "student-notification-empty" }, "알림을 불러오는 중입니다."),
    ]);
  }
  const messages = studentNotificationInboxState.messages || [];
  if (studentNotificationInboxState.loaded) {
    markStudentNotificationsRead(student.id, messages);
    window.requestAnimationFrame(() => updateStudentNotificationBadge(student));
  }
  return el("div", { className: "grid student-view student-notification-page" }, [
    renderStudentNotificationPageHead(),
    studentNotificationInboxState.error
      ? el("div", { className: "student-notification-empty error" }, "알림 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.")
      : messages.length
        ? el("section", { className: "student-notification-list" }, messages.map(renderStudentNotificationItem))
        : el("div", { className: "student-notification-empty" }, [
            el("strong", {}, "받은 알림이 없습니다"),
            el("p", {}, "새로운 알림이 도착하면 이곳에서 확인할 수 있습니다."),
          ]),
  ]);
}

function renderStudentNotificationPageHead() {
  return el("header", { className: "student-notification-page-head" }, [
    button("‹", "student-notification-back", "button", () => navigate("home")),
    el("h2", {}, "알림"),
    el("span", { ariaHidden: "true" }),
  ]);
}

function renderStudentNotificationItem(message) {
  const createdAt = message.createdAt ? new Date(message.createdAt) : null;
  const dateLabel = createdAt && !Number.isNaN(createdAt.getTime())
    ? new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(createdAt)
    : "";
  return el("article", { className: "student-notification-item" }, [
    el("div", { className: "student-notification-item-head" }, [
      el("strong", {}, message.title || "알림"),
      dateLabel ? el("time", {}, dateLabel) : null,
    ]),
    el("p", {}, message.body || ""),
  ].filter(Boolean));
}

function getStudentPushPreferenceOptions(category) {
  return STUDENT_PUSH_PREFERENCE_OPTIONS.filter((option) => option.categories.includes(category));
}

function renderStudentPushSettingsToggle({ checked, disabled, ariaLabel, onChange }) {
  const inputNode = el("input", { type: "checkbox", role: "switch", checked, disabled, ariaLabel });
  inputNode.addEventListener("change", async () => {
    inputNode.disabled = true;
    await onChange(inputNode.checked);
    render();
  });
  return el("label", { className: "student-push-toggle" }, [
    inputNode,
    el("span", { className: "student-push-toggle-track", "aria-hidden": "true" }),
  ]);
}

async function ensureStudentPushNotificationLoaded(student, profile, options = {}) {
  if (!student?.id || !profile?.deviceToken) return;
  if (studentPushNotificationState.studentId !== String(student.id)) {
    Object.assign(studentPushNotificationState, {
      studentId: String(student.id),
      loading: false,
      loaded: false,
      available: null,
      publicKey: "",
      subscribed: false,
      preferences: Object.fromEntries(STUDENT_PUSH_PREFERENCE_OPTIONS.map((option) => [option.key, true])),
      error: "",
    });
  }
  if (studentPushNotificationState.loading || (studentPushNotificationState.loaded && options.force !== true)) return;
  studentPushNotificationState.loading = true;
  studentPushNotificationState.error = "";
  try {
    const configResponse = await fetch("/api/student-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "config" }),
    });
    const config = await configResponse.json().catch(() => ({}));
    studentPushNotificationState.available = Boolean(configResponse.ok && config.ok && config.available && config.publicKey);
    studentPushNotificationState.publicKey = studentPushNotificationState.available ? config.publicKey : "";
    studentPushNotificationState.subscribed = false;
    if (studentPushNotificationState.available && Notification.permission === "granted") {
      const registration = await navigator.serviceWorker.register("/sw.js");
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const statusResponse = await fetch("/api/student-push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildStudentPushRequest("status", student, profile, subscription)),
        });
        const status = await statusResponse.json().catch(() => ({}));
        if (statusResponse.status === 403 && status.error === "device_not_active") throw new Error("device_not_active");
        if (!statusResponse.ok || !status.ok) throw new Error(status.error || "push_status_failed");
        studentPushNotificationState.subscribed = status.subscribed === true;
        studentPushNotificationState.preferences = normalizeStudentPushPreferences(status.preferences);
      }
    }
    studentPushNotificationState.loaded = true;
  } catch (error) {
    console.error(error);
    studentPushNotificationState.loaded = true;
    studentPushNotificationState.error = error.message || "push_status_failed";
  } finally {
    studentPushNotificationState.loading = false;
    if (APP_MODE !== "teacher") render();
  }
}

async function enableStudentPushNotifications(student, profile) {
  if (!profile?.deviceToken) return notify("현재 기기 등록 정보를 찾을 수 없습니다.");
  if (isIosDevice() && !isStandaloneWebApp()) {
    notify("iPhone·iPad에서는 홈 화면에 앱을 추가한 뒤 설치된 앱에서 알림을 켜주세요.");
    return;
  }
  studentPushNotificationState.loading = true;
  render();
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("notification_permission_denied");
    const registration = await navigator.serviceWorker.register("/sw.js");
    const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(studentPushNotificationState.publicKey),
    });
    const response = await fetch("/api/student-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...buildStudentPushRequest("subscribe", student, profile, subscription),
        preferences: studentPushNotificationState.preferences,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || "push_subscription_failed");
    studentPushNotificationState.subscribed = true;
    studentPushNotificationState.preferences = normalizeStudentPushPreferences(data.preferences || studentPushNotificationState.preferences);
    studentPushNotificationState.loaded = true;
    studentPushNotificationState.error = "";
  } catch (error) {
    console.error(error);
    studentPushNotificationState.error = error.message || "push_subscription_failed";
    notify(error.message === "notification_permission_denied"
      ? "알림 권한이 허용되지 않았습니다."
      : "알림을 켜지 못했습니다. 잠시 후 다시 시도해주세요.");
  } finally {
    studentPushNotificationState.loading = false;
    render();
  }
}

async function disableStudentPushNotifications(student, profile) {
  studentPushNotificationState.loading = true;
  render();
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      const response = await fetch("/api/student-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildStudentPushRequest("unsubscribe", student, profile, subscription)),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.error || "push_unsubscribe_failed");
    }
    studentPushNotificationState.subscribed = false;
    studentPushNotificationState.error = "";
  } catch (error) {
    console.error(error);
    studentPushNotificationState.error = error.message || "push_unsubscribe_failed";
    notify("알림 설정을 변경하지 못했습니다.");
  } finally {
    studentPushNotificationState.loading = false;
    render();
  }
}

async function updateStudentPushPreference(key, enabled, student, profile) {
  const previous = { ...studentPushNotificationState.preferences };
  studentPushNotificationState.preferences = { ...previous, [key]: enabled };
  studentPushNotificationState.loading = true;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) throw new Error("push_subscription_missing");
    const response = await fetch("/api/student-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...buildStudentPushRequest("preferences", student, profile, subscription),
        preferences: studentPushNotificationState.preferences,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || "push_preferences_failed");
    studentPushNotificationState.preferences = normalizeStudentPushPreferences(data.preferences);
    studentPushNotificationState.error = "";
  } catch (error) {
    console.error(error);
    studentPushNotificationState.preferences = previous;
    studentPushNotificationState.error = error.message || "push_preferences_failed";
    notify("알림 종류 설정을 변경하지 못했습니다.");
  } finally {
    studentPushNotificationState.loading = false;
  }
}

function normalizeStudentPushPreferences(value) {
  const source = value && typeof value === "object" ? value : {};
  return Object.fromEntries(STUDENT_PUSH_PREFERENCE_OPTIONS.map((option) => [option.key, source[option.key] !== false]));
}

function buildStudentPushRequest(action, student, profile, subscription) {
  return {
    action,
    studentId: String(student.id),
    deviceToken: profile.deviceToken,
    subscription: subscription.toJSON(),
  };
}

function isOnlineStudyStudent(student) {
  return getStudentCategory(student) === "lecture";
}

function isStudyCafeLocalPreview() {
  if (!isLocalStudentPreview()) return false;
  return studyCafeLocalFallback || new URLSearchParams(location.search).get("studentMode") === "online";
}

function isOnlineStudentExperience(student) {
  const category = getStudentCategory(student);
  return (
    category === "lecture" ||
    (category === "online_managed" && isOnlineManagedStudyCafeEnabled()) ||
    isStudyCafeLocalPreview()
  );
}

function getAdminStudentDday() {
  const configured = state.settings.studentDday;
  const date = String(configured?.date || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(new Date(`${date}T00:00:00`).getTime())) {
    return {
      mode: "admin",
      label: String(configured.label || COAST_GUARD_EXAM_LABEL).trim() || COAST_GUARD_EXAM_LABEL,
      date,
    };
  }
  return { mode: "admin", label: COAST_GUARD_EXAM_LABEL, date: COAST_GUARD_EXAM_DATE };
}

function getStudentDdayStorageKey(studentId) {
  return `${STUDENT_DDAY_STORAGE_KEY}:${String(studentId || "guest")}`;
}

function readStudentDdayPreference(student = getAuthedStudent()) {
  try {
    const saved = JSON.parse(localStorage.getItem(getStudentDdayStorageKey(student?.id)) || "{}");
    if (saved.mode === "custom" && /^\d{4}-\d{2}-\d{2}$/.test(String(saved.date || ""))) {
      return {
        mode: "custom",
        label: String(saved.label || "나의 D-day").trim() || "나의 D-day",
        date: String(saved.date),
      };
    }
  } catch {
    // 손상된 개인 설정은 등록된 D-day로 복구합니다.
  }
  return { mode: "admin" };
}

function getSelectedStudentDday(student = getAuthedStudent()) {
  const preference = readStudentDdayPreference(student);
  return preference.mode === "custom" ? preference : getAdminStudentDday();
}

function updateStudentDdayHeader() {
  const selected = getSelectedStudentDday();
  document.querySelectorAll("[data-online-student-dday]").forEach((item) => {
    item.textContent = formatDday(selected.date);
    item.title = `${selected.label} · ${formatExamDate(selected.date)} · 눌러서 변경`;
    item.setAttribute("aria-label", `${selected.label} ${formatDday(selected.date)}, D-day 설정 열기`);
  });
}

function openStudentDdayModal() {
  const student = getAuthedStudent();
  if (!student || !isOnlineStudentExperience(student)) return;
  const adminDday = getAdminStudentDday();
  const preference = readStudentDdayPreference(student);
  const customSelected = preference.mode === "custom";
  const adminRadio = el("input", { type: "radio", name: "studentDdayMode", value: "admin", checked: !customSelected });
  const customRadio = el("input", { type: "radio", name: "studentDdayMode", value: "custom", checked: customSelected });
  const labelInput = input("studentDdayLabel", "text", "예: 나의 시험일", customSelected ? preference.label : "나의 D-day");
  const dateInput = input("studentDdayDate", "date", "", customSelected ? preference.date : adminDday.date);
  labelInput.maxLength = 40;
  const customFields = el("div", { className: "student-dday-custom-fields" }, [
    field("D-day 이름", labelInput),
    field("날짜", dateInput),
  ]);
  const syncCustomFields = () => {
    const disabled = !customRadio.checked;
    labelInput.disabled = disabled;
    dateInput.disabled = disabled;
    customFields.classList.toggle("disabled", disabled);
  };
  adminRadio.addEventListener("change", syncCustomFields);
  customRadio.addEventListener("change", syncCustomFields);
  const content = el("div", { className: "student-dday-settings" }, [
    el("label", { className: "student-dday-choice" }, [
      adminRadio,
      el("span", {}, [
        el("strong", {}, "등록된 D-day"),
        el("small", {}, `${adminDday.label} · ${formatExamDate(adminDday.date)} · ${formatDday(adminDday.date)}`),
      ]),
    ]),
    el("label", { className: "student-dday-choice" }, [
      customRadio,
      el("span", {}, [
        el("strong", {}, "직접 설정"),
        el("small", {}, "이 기기에서 사용할 개인 D-day를 설정합니다."),
      ]),
    ]),
    customFields,
  ]);
  syncCustomFields();
  openInfoModal({
    title: "D-day 설정",
    className: "student-dday-modal",
    content,
    confirmLabel: "저장",
    onConfirm: () => {
      if (customRadio.checked) {
        const date = String(dateInput.value || "").trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          notify("D-day 날짜를 선택해주세요.");
          dateInput.focus();
          return;
        }
        localStorage.setItem(getStudentDdayStorageKey(student.id), JSON.stringify({
          mode: "custom",
          label: String(labelInput.value || "나의 D-day").trim().slice(0, 40) || "나의 D-day",
          date,
        }));
      } else {
        localStorage.setItem(getStudentDdayStorageKey(student.id), JSON.stringify({ mode: "admin" }));
      }
      closeInfoModal();
      updateStudentDdayHeader();
      notify("D-day를 변경했습니다.");
    },
  });
}

function openAdminStudentDdayModal() {
  if (APP_MODE !== "teacher" || !hasTeacherPermission("notices.write")) return;
  const current = getAdminStudentDday();
  const labelInput = input("adminStudentDdayLabel", "text", "예: 해양경찰 필기시험", current.label);
  const dateInput = input("adminStudentDdayDate", "date", "", current.date);
  labelInput.maxLength = 40;
  const content = el("div", { className: "admin-student-dday-settings" }, [
    el("p", {}, "여기에서 지정한 일정은 온라인 수강생이 D-day 설정에서 선택할 수 있습니다."),
    field("일정 이름", labelInput),
    field("날짜", dateInput),
  ]);
  let saving = false;
  const result = openInfoModal({
    title: "수강생 D-day 설정",
    className: "admin-student-dday-modal",
    content,
    confirmLabel: "저장",
    onConfirm: async () => {
      if (saving) return;
      const date = String(dateInput.value || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        notify("D-day 날짜를 선택해주세요.");
        dateInput.focus();
        return;
      }
      saving = true;
      result.confirmButton.disabled = true;
      try {
        const response = await fetch("/api/app-settings", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            settings: {
              studentDday: {
                label: String(labelInput.value || "등록된 일정").trim().slice(0, 40) || "등록된 일정",
                date,
              },
            },
          }),
        });
        const data = await response.json().catch(() => ({ ok: false }));
        if (!response.ok || !data.ok) throw new Error(data.error || "student_dday_save_failed");
        applyRemoteAppSettings(data.settings);
        closeInfoModal();
        notify("수강생 D-day를 저장했습니다.");
      } catch (error) {
        console.error(error);
        notify("D-day를 저장하지 못했습니다.");
        result.confirmButton.disabled = false;
        saving = false;
      }
    },
  });
}

function ensureStudyCafeTemporaryNickname() {
  if (studyCafePreviewState.nickname) return studyCafePreviewState.nickname;
  if (studyCafePreviewState.temporaryNicknameAwaitingEntry) return "";
  if (!studyCafePreviewState.temporaryNickname) {
    const mood =
      STUDY_CAFE_TEMP_NICKNAME_MOODS[
        Math.floor(Math.random() * STUDY_CAFE_TEMP_NICKNAME_MOODS.length)
      ];
    const animal =
      STUDY_CAFE_TEMP_NICKNAME_ANIMALS[
        Math.floor(Math.random() * STUDY_CAFE_TEMP_NICKNAME_ANIMALS.length)
      ];
    studyCafePreviewState.temporaryNickname = `${mood}${animal}`;
  }
  return studyCafePreviewState.temporaryNickname;
}

function getStudyCafeDisplayName(fallback = "나") {
  return (
    studyCafePreviewState.nickname ||
    studyCafePreviewState.temporaryNickname ||
    fallback
  );
}

function updateStudentNavigationVisibility() {
  const student = getAuthedStudent();
  const category = student ? getStudentCategory(student) : "offline";
  const lectureMode = category === "lecture";
  const onlineManagedMode = category === "online_managed" && isOnlineManagedStudyCafeEnabled();
  const onlineMode = lectureMode || onlineManagedMode;
  const studyMode = lectureMode;
  document.documentElement.classList.toggle("student-online-mode", onlineMode);
  document.body.classList.toggle("student-online-mode", onlineMode);
  document.body.classList.toggle("student-online-managed-mode", onlineManagedMode);
  document.body.classList.toggle("student-lecture-mode", lectureMode);
  document.body.classList.toggle("student-study-mode", studyMode);
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.setAttribute("content", onlineMode ? "#0b2746" : "#f3f7fb");
  updateStudentDdayHeader();
  if (onlineMode && student) ensureStudentNotificationInboxLoaded(student);
  else document.querySelectorAll("[data-student-notification-badge]").forEach((badge) => { badge.hidden = true; });
  document.querySelectorAll(".normal-student-footer [data-route]").forEach((item) => {
    const allowedRoutes = getAllowedStudentRoutes(category);
    item.hidden = lectureMode || !allowedRoutes.has(item.dataset.route);
  });
  document.querySelectorAll(".study-cafe-footer-menu [data-route]").forEach((item) => {
    const visibleLectureTabs = new Set(["home", "study-todo", "study-cafe", "mypage"]);
    item.hidden = !lectureMode || !visibleLectureTabs.has(item.dataset.route);
  });
  document.querySelectorAll("[data-study-cafe-back]").forEach((item) => { item.hidden = true; });
  const normalFooter = document.querySelector(".normal-student-footer");
  const studyFooter = document.querySelector(".study-cafe-footer-menu");
  if (normalFooter) normalFooter.setAttribute("aria-hidden", studyMode ? "true" : "false");
  if (studyFooter) studyFooter.setAttribute("aria-hidden", studyMode ? "false" : "true");
}

function renderStudyCafeHomeCard(student) {
  ensureStudyCafeRemoteLoaded({ render: false });
  const focusedCount = getStudyCafeFocusedCount();
  const titleNode = el(
    "strong",
    { className: "student-study-cafe-card-title branded", ariaLabel: "론박스터디 온라인 스터디카페" },
    [
      el("span", { className: "brand" }, "론박스터디"),
      el("span", { className: "online" }, "온라인"),
      el("span", { className: "study" }, "스터디"),
      el("span", { className: "cafe" }, "카페"),
    ]
  );
  return el("section", { className: "student-study-cafe-card" }, [
    el("div", { className: "student-study-cafe-card-copy" }, [
      el("span", { className: "student-study-cafe-card-kicker" }, "ONLINE STUDY CAFE"),
      titleNode,
      el("span", { className: "student-study-cafe-operating-hours" }, [
        el("span", {}, "운영 시간 :"),
        el("strong", {}, "24시간"),
      ]),
      el("div", { className: "student-study-cafe-live-row" }, [
        el("span", { className: "student-study-cafe-live-badge" }, "LIVE"),
        el(
          "span",
          { className: "student-study-cafe-live-count", "data-study-cafe-home-live-count": "true" },
          formatStudyCafeLiveCount(focusedCount)
        ),
      ]),
      renderStudyCafeHomeAvatarStack(focusedCount),
    ]),
    button("스터디카페 입장", "btn", "button", () => navigate("study-cafe")),
  ]);
}

function getStudyCafeFocusedCount() {
  const remoteCount = Number(studyCafeRemoteState.summary?.focusedCount);
  if (studyCafeRemoteState.summary && Number.isFinite(remoteCount)) {
    return Math.max(0, remoteCount);
  }
  if (!isStudyCafeLocalPreview()) return null;
  const active = Boolean(studyCafePreviewState.selectedSeatId && studyCafePreviewState.subject);
  return STUDY_CAFE_PREVIEW_SEATS.filter((seat) => seat.occupant).length + (active ? 1 : 0);
}

function formatStudyCafeLiveCount(count) {
  return Number.isFinite(count) ? `● 현재 ${count}명 함께 공부 중` : "● 실시간 인원 연결 중";
}

function renderStudyCafeHomeAvatarStack(count) {
  const normalizedCount = Number.isFinite(count) ? Math.max(0, Number(count)) : null;
  const tones = ["blue", "mint", "purple"];
  const visibleCount = normalizedCount === null ? 0 : Math.min(3, normalizedCount);
  const children = tones.slice(0, visibleCount).map(renderStudyCafeMiniAvatar);
  if (normalizedCount === null || normalizedCount === 0 || normalizedCount > visibleCount) {
    children.push(
      el(
        "span",
        { className: "student-study-cafe-avatar-more" },
        normalizedCount === null ? "…" : normalizedCount === 0 ? "0" : `+${normalizedCount - visibleCount}`
      )
    );
  }
  return el(
    "div",
    {
      className: "student-study-cafe-avatar-stack",
      "data-study-cafe-home-avatar-stack": "true",
      ariaLabel: normalizedCount === null ? "실시간 공부 인원 연결 중" : `현재 ${normalizedCount}명 함께 공부 중`,
    },
    children
  );
}

function updateStudyCafeHomeLiveCount() {
  const count = getStudyCafeFocusedCount();
  document.querySelectorAll("[data-study-cafe-home-live-count]").forEach((node) => {
    node.textContent = formatStudyCafeLiveCount(count);
  });
  document.querySelectorAll("[data-study-cafe-home-avatar-stack]").forEach((node) => {
    node.replaceWith(renderStudyCafeHomeAvatarStack(count));
  });
}

function renderStudyCafeMiniAvatar(tone) {
  return el("span", { className: `study-cafe-mini-avatar ${tone}` }, [
    el("i", { className: "study-cafe-mini-avatar-hair" }),
    el("i", { className: "study-cafe-mini-avatar-face" }),
  ]);
}

function renderStudentPlannerHub() {
  const curriculumAvailable = isCurriculumQuestEnabled();
  if (!curriculumAvailable) studyPlannerHubView = "planner";
  const activeView = curriculumAvailable ? studyPlannerHubView : "planner";
  if (activeView === "planner" && studyTodoCalendarOpen) {
    return el("div", { className: "student-planner-hub planner calendar-page" }, [
      renderStudentStudyTodo(),
    ]);
  }
  return el("div", { className: `student-planner-hub ${activeView}` }, [
    curriculumAvailable ? renderStudentPlannerViewSwitch(activeView) : renderStudentPlannerSoloHeader(),
    curriculumAvailable && activeView === "planner" ? renderStudentPlannerMonthAction() : null,
    activeView === "curriculum" ? renderCurriculumQuest() : renderStudentStudyTodo(),
  ].filter(Boolean));
}

function renderStudentPlannerSoloHeader() {
  const selectedDateKey = getSelectedStudyTodoDateKey();
  return el("header", { className: "student-planner-solo-header" }, [
    el("h2", { className: "student-planner-solo-title" }, "오늘의 할 일"),
    renderStudentPlannerMonthButton(selectedDateKey),
  ]);
}

function renderStudentPlannerMonthAction() {
  return el("div", { className: "student-planner-month-action" }, [
    renderStudentPlannerMonthButton(getSelectedStudyTodoDateKey()),
  ]);
}

function renderStudentPlannerMonthButton(selectedDateKey) {
  return el("button", {
    className: "study-todo-calendar-button student-planner-month-button",
    type: "button",
    title: "월간 플래너 열기",
    ariaLabel: "월간 플래너 열기",
    onclick: () => openStudyTodoCalendar(selectedDateKey),
  }, [
    el("span", { className: "study-todo-calendar-icon", ariaHidden: "true" }),
    el("span", { className: "student-planner-month-label" }, "월간 플래너"),
  ]);
}

function renderStudentPlannerViewSwitch(activeView) {
  const options = [
    { id: "planner", label: "오늘의 할 일" },
    { id: "curriculum", label: "커리큘럼" },
  ];
  return el("div", { className: "student-planner-view-switch", role: "tablist", ariaLabel: "학습 화면 선택" },
    options.map((option) => {
      const control = button(
        option.label,
        `student-planner-view-option ${activeView === option.id ? "active" : ""}`,
        "button",
        () => {
          if (studyPlannerHubView === option.id) return;
          studyPlannerHubView = option.id;
          if (option.id === "curriculum") curriculumQuestView = "map";
          render();
          scrollAppToTop();
        }
      );
      control.setAttribute("role", "tab");
      control.setAttribute("aria-selected", String(activeView === option.id));
      return control;
    })
  );
}

function renderStudentStudyTodo() {
  const student = getAuthedStudent();
  if (!isOnlineStudentExperience(student)) {
    return el("div", { className: "grid student-view student-study-cafe-access" }, [
      el("section", { className: "student-study-cafe-access-card" }, [
        el("span", { className: "study-cafe-access-icon", ariaHidden: "true" }, "✓"),
        el("h2", {}, "온라인 수강생 전용 플래너입니다"),
        el("p", {}, "과목별 플래너는 등록번호가 2로 시작하는 인터넷 강의 수강생만 이용할 수 있습니다."),
        button("홈으로", "btn secondary", "button", () => navigate("home")),
      ]),
    ]);
  }

  ensureStudyCafeRemoteLoaded();
  const subjects = getStudyTimerSubjects(student);
  const subjectSet = new Set(subjects);
  const selectedDateKey = getSelectedStudyTodoDateKey();
  const selectedDateLabel = getStudyTodoRelativeDateLabel(selectedDateKey);
  const todos = getStudyTodosForDate(selectedDateKey)
    .filter((todo) => subjectSet.has(String(todo.subject || "").trim()));
  const completedCount = todos.filter((todo) => todo.completed).length;
  const progress = todos.length ? Math.round((completedCount / todos.length) * 100) : 0;
  const plannerContent = [
    renderStudyCafePlannerEntryGuide(todos, selectedDateKey),
    studyCafeRemoteState.plannerLoading
      ? el("p", { className: "study-todo-date-loading" }, "플래너를 불러오는 중입니다.")
      : null,
    el("section", { className: "study-todo-progress-card" }, [
      el("div", {}, [
        el("span", {}, `${selectedDateLabel} 달성률`),
        el("strong", {}, `${progress}%`),
      ]),
      el("span", { className: "study-todo-progress-track", ariaLabel: `${selectedDateLabel} 플래너 ${progress}% 완료` }, [
        el("i", { style: `width:${progress}%` }),
      ]),
      el("p", {}, todos.length
        ? `${todos.length - completedCount}개의 할 일이 남아 있어요.`
        : `${selectedDateLabel} 할 일을 과목별로 작성해보세요.`),
    ]),
    el(
      "div",
      { className: "study-todo-subject-list" },
      subjects.map((subject) => renderStudyTodoSubjectCard(subject, todos))
    ),
  ];

  if (studyTodoCalendarOpen) {
    return el("div", { className: "student-study-todo-page calendar-page" }, [
      el("header", { className: "study-todo-calendar-page-head" }, [
        el("button", {
          className: "study-todo-calendar-back",
          type: "button",
          textContent: "‹",
          ariaLabel: "오늘의 할 일로 돌아가기",
          onclick: () => {
            studyTodoCalendarOpen = false;
            renderStudyCafeStateUpdate();
            scrollAppToTop();
          },
        }),
        el("h2", {}, "월간 플래너"),
      ]),
      renderStudyTodoMonthlyCalendar(selectedDateKey),
      el("div", { className: "study-todo-calendar-selected-date" }, [
        el("span", {}, "선택한 날짜"),
        el("strong", {}, getStudyTodoDateLabel(selectedDateKey)),
      ]),
      ...plannerContent,
    ]);
  }

  return el("div", { className: "student-study-todo-page" }, [
    renderStudyTodoDateNavigation(selectedDateKey),
    ...plannerContent,
  ]);
}

function renderStudyCafePlannerEntryGuide(todos, selectedDateKey) {
  const studyDate =
    studyCafeRemoteState.studyDateKey ||
    formatStudyBusinessDateKey(new Date());
  if (!studyCafePlannerEntryState.seatId || selectedDateKey !== studyDate) return null;
  if (studyCafeRemoteState.loading && !studyCafeRemoteState.loaded) return null;
  const selectedSeatId = String(studyCafePreviewState.selectedSeatId || "");
  const continuingClaimedSeat = Boolean(
    selectedSeatId &&
    studyCafePlannerEntryState.seatAlreadyClaimed &&
    selectedSeatId === studyCafePlannerEntryState.seatId
  );
  if (selectedSeatId && !continuingClaimedSeat) {
    clearStudyCafePlannerEntryState();
    return null;
  }
  const requiredSubject = studyCafePlannerEntryState.subject;
  const ready = todos.some((todo) =>
    todo.pending !== true && (!requiredSubject || todo.subject === requiredSubject)
  );
  const seatNumber = studyCafePlannerEntryState.seatNumber;
  return el("section", {
    className: `study-cafe-planner-entry-guide ${ready ? "ready" : "waiting"}`,
    ariaLive: "polite",
  }, [
    el("div", { className: "study-cafe-planner-entry-copy" }, [
      el("span", {}, "스터디카페 입장 준비"),
      el("strong", {}, ready
        ? requiredSubject ? `${requiredSubject} 할 일을 정했어요` : "오늘 할 일을 정했어요"
        : requiredSubject ? `${requiredSubject} 할 일을 작성해주세요` : `${seatNumber}번 좌석 선택을 이어가는 중이에요`),
      el("p", {}, ready
        ? requiredSubject
          ? `${requiredSubject} 투두를 바탕으로 공부를 이어갈 수 있어요.`
          : "작성한 플래너를 바탕으로 좌석과 공부할 과목을 선택해보세요."
        : requiredSubject
          ? `${requiredSubject} 카드의 입력란에 오늘 할 일을 하나 이상 작성해주세요.`
          : "과목별 + 버튼을 눌러 오늘 할 일을 하나 이상 작성해주세요."),
    ]),
    el("div", { className: "study-cafe-planner-entry-actions" }, [
      button(continuingClaimedSeat ? "안내 닫기" : "입장 취소", "btn secondary", "button", () => {
        clearStudyCafePlannerEntryState();
        renderStudyCafeStateUpdate();
      }),
      ready
        ? button(
            requiredSubject
              ? `${requiredSubject} 공부 계속하기`
              : continuingClaimedSeat
                ? "공부할 과목 선택하기"
                : "좌석 선택 계속하기",
            "btn",
            "button",
            continueStudyCafeSeatSelection
          )
        : el("span", { className: "study-cafe-planner-entry-waiting" },
            requiredSubject ? `${requiredSubject} 투두 작성 후 계속할 수 있어요` : "투두 작성 후 계속할 수 있어요"),
    ]),
  ]);
}

function clearStudyCafePlannerEntryState() {
  studyCafePlannerEntryState.seatId = "";
  studyCafePlannerEntryState.seatNumber = 0;
  studyCafePlannerEntryState.subject = "";
  studyCafePlannerEntryState.seatAlreadyClaimed = false;
  studyCafePlannerEntryState.resumeRequested = false;
}

function continueStudyCafeSeatSelection() {
  if (!studyCafePlannerEntryState.seatId) return;
  studyCafePreviewState.activeRoomIndex = getStudyCafeRoomIndexForSeat(
    studyCafePlannerEntryState.seatNumber
  );
  studyCafePlannerEntryState.resumeRequested = true;
  navigate("study-cafe");
}

function resumeStudyCafeSeatSelection() {
  if (!studyCafePlannerEntryState.resumeRequested) return;
  const seatId = studyCafePlannerEntryState.seatId;
  const seatNumber = studyCafePlannerEntryState.seatNumber;
  const subject = studyCafePlannerEntryState.subject;
  const seatAlreadyClaimed = studyCafePlannerEntryState.seatAlreadyClaimed;
  if (
    seatAlreadyClaimed &&
    subject &&
    studyCafePreviewState.selectedSeatId === seatId
  ) {
    clearStudyCafePlannerEntryState();
    applyStudyCafeSubjectSelection(seatId, subject);
    renderStudyCafeStateUpdate();
    notify(`${subject} 공부를 준비합니다.`);
    return;
  }
  const seatButton = document.querySelector(
    `.study-cafe-seat[data-study-cafe-physical-seat-number="${seatNumber}"]`
  );
  clearStudyCafePlannerEntryState();
  studyCafePreviewState.pendingSubject = subject;
  if (!seatButton?.classList.contains("empty")) {
    notify("처음 선택한 좌석이 사용 중입니다. 다른 빈자리를 선택해주세요.");
    return;
  }
  seatButton.click();
}

function renderStudyTodoSubjectCard(subject, todos) {
  const subjectTodos = todos.filter((todo) => todo.subject === subject);
  const completedCount = subjectTodos.filter((todo) => todo.completed).length;
  const editorDateKey = getSelectedStudyTodoDateKey();
  const editorOpen =
    studyTodoEditorState.dateKey === editorDateKey &&
    studyTodoEditorState.subject === subject;
  const subjectGoal = getStudySubjectGoal(editorDateKey, subject);
  const goalSelect = el("select", {
    className: "study-todo-goal-select",
    ariaLabel: `${subject} 목표시간`,
    title: `${subject} 목표시간`,
  }, [
    el("option", { value: "" }, "목표시간"),
    ...Array.from({ length: 10 }, (_, index) => {
      const hours = index + 1;
      return el("option", {
        value: String(hours * 60),
        selected: Number(subjectGoal?.targetMinutes) === hours * 60,
      }, `${hours}시간`);
    }),
  ]);
  goalSelect.addEventListener("change", () => updateStudySubjectGoal(editorDateKey, subject, goalSelect));
  const goalResult = renderStudySubjectGoalResult(subjectGoal, subject, editorDateKey);
  const textInput = el("input", {
    className: "study-todo-input",
    type: "text",
    value: editorOpen ? studyTodoEditorState.draft : "",
    maxLength: 80,
    placeholder: `${subject} 학습 내용 추가`,
    ariaLabel: `${subject} 학습 내용`,
    autocomplete: "off",
  });
  const submitButton = el(
    "button",
    {
      className: "study-todo-submit-button",
      type: "submit",
      ariaLabel: `${subject} 학습 내용 등록`,
      title: "등록",
    },
    "✓"
  );
  const form = el("form", { className: "study-todo-add-form", hidden: !editorOpen }, [textInput, submitButton]);
  const addButton = el(
    "button",
    {
      className: "study-todo-add-button",
      type: "button",
      ariaLabel: `${subject} 학습 내용 ${editorOpen ? "입력 닫기" : "추가"}`,
      ariaExpanded: String(editorOpen),
      title: "학습 내용 추가",
    },
    editorOpen ? "×" : "+"
  );
  addButton.addEventListener("click", () => {
    const willOpen = form.hidden;
    if (willOpen) {
      studyTodoEditorState.dateKey = editorDateKey;
      studyTodoEditorState.subject = subject;
      studyTodoEditorState.draft = "";
      studyTodoEditorState.focused = true;
    } else {
      studyTodoEditorState.dateKey = "";
      studyTodoEditorState.subject = "";
      studyTodoEditorState.draft = "";
      studyTodoEditorState.focused = false;
    }
    form.hidden = !willOpen;
    addButton.setAttribute("aria-expanded", willOpen ? "true" : "false");
    addButton.setAttribute("aria-label", `${subject} 학습 내용 ${willOpen ? "입력 닫기" : "추가"}`);
    addButton.textContent = willOpen ? "×" : "+";
    if (willOpen) textInput.focus();
  });
  textInput.addEventListener("input", () => {
    if (
      studyTodoEditorState.dateKey === editorDateKey &&
      studyTodoEditorState.subject === subject
    ) {
      studyTodoEditorState.draft = textInput.value;
    }
  });
  textInput.addEventListener("focus", () => {
    studyTodoEditorState.focused = true;
  });
  textInput.addEventListener("blur", () => {
    window.setTimeout(() => {
      if (document.contains(textInput) && document.activeElement !== textInput) {
        studyTodoEditorState.focused = false;
      }
    }, 0);
  });
  if (editorOpen && studyTodoEditorState.focused) {
    window.requestAnimationFrame(() => {
      if (
        document.contains(textInput) &&
        studyTodoEditorState.dateKey === editorDateKey &&
        studyTodoEditorState.subject === subject &&
        studyTodoEditorState.focused
      ) {
        textInput.focus({ preventScroll: true });
      }
    });
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const content = String(textInput.value || "").trim();
    if (!content) return notify("학습 내용을 입력해주세요.");
    submitButton.disabled = true;
    studyTodoEditorState.dateKey = "";
    studyTodoEditorState.subject = "";
    studyTodoEditorState.draft = "";
    studyTodoEditorState.focused = false;
    const studyDate = getSelectedStudyTodoDateKey();
    const optimisticTodo = {
      id: `pending-todo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      subject,
      content,
      completed: false,
      studyDate,
      pending: true,
    };
    setStudyTodosForDate(studyDate, [...getStudyTodosForDate(studyDate), optimisticTodo]);
    renderStudyCafeStateUpdate();
    const result = await mutateStudyCafeRemote(
      "todo_create",
      { subject, content, studyDate },
      { refresh: false }
    );
    if (!result.ok) {
      setStudyTodosForDate(
        studyDate,
        getStudyTodosForDate(studyDate).filter((todo) => todo.id !== optimisticTodo.id)
      );
      renderStudyCafeStateUpdate();
      return;
    }
    const todo = result.todo || {
      ...optimisticTodo,
      id: `local-todo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      subject,
      content,
      completed: false,
      studyDate,
      pending: false,
    };
    const pendingTodoId = optimisticTodo.id;
    Object.assign(optimisticTodo, todo, { pending: false });
    const currentTodoItem = Array.from(document.querySelectorAll("[data-study-todo-id]"))
      .find((item) => item.dataset.studyTodoId === String(pendingTodoId));
    if (currentTodoItem) {
      currentTodoItem.dataset.studyTodoId = String(optimisticTodo.id);
      currentTodoItem.classList.remove("pending");
      currentTodoItem.querySelectorAll("input, button").forEach((control) => {
        control.disabled = false;
      });
    }
    if (studyCafePlannerEntryState.seatId) renderStudyCafeStateUpdate();
  });

  return el("section", { className: "study-todo-subject-card" }, [
    el("div", { className: "study-todo-subject-head" }, [
      el("div", { className: "study-todo-subject-copy" }, [
        el("div", { className: "study-todo-subject-title" }, [
          el("strong", {}, subject),
          subject === studyCafePreviewState.subject
            ? el("span", { className: "study-todo-current-subject" }, "현재 공부 중")
            : null,
        ]),
        el("span", {}, `${completedCount}/${subjectTodos.length} 완료`),
      ]),
      el("div", { className: "study-todo-subject-actions" }, [
        goalResult,
        goalSelect,
        addButton,
      ]),
    ]),
    subjectTodos.length
      ? el(
          "div",
          { className: "study-todo-items" },
          subjectTodos.map((todo) => renderStudyTodoItem(todo))
        )
      : null,
    form,
  ]);
}

function renderStudyTodoItem(todo) {
  const checkbox = el("input", {
    type: "checkbox",
    checked: Boolean(todo.completed),
    disabled: todo.pending === true || studyTodoTogglePendingIds.has(todo.id),
    ariaLabel: `${todo.content} 완료`,
  });
  checkbox.addEventListener("change", () => updateStudyTodoCompletion(todo, checkbox));
  const deleteButton = button("삭제", "study-todo-delete-button", "button", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (todo.pending) return;
    if (!confirm(`"${todo.content}" 항목을 삭제할까요?`)) return;
    const studyDate = todo.studyDate || getSelectedStudyTodoDateKey();
    const deleteKey = `${studyDate}:${todo.id}`;
    if (studyTodoDeletePendingKeys.has(deleteKey)) return;
    studyTodoDeletePendingKeys.add(deleteKey);
    studyTodoMutationRevision += 1;
    const previousTodos = getStudyTodosForDate(studyDate);
    const previousIndex = previousTodos.findIndex((item) => item.id === todo.id);
    setStudyTodosForDate(
      studyDate,
      previousTodos.filter((item) => item.id !== todo.id)
    );
    renderStudyCafeStateUpdate();
    const result = await queueStudyTodoDelete(todo.id, studyDate);
    studyTodoDeletePendingKeys.delete(deleteKey);
    studyTodoMutationRevision += 1;
    if (!result.ok) {
      const currentTodos = getStudyTodosForDate(studyDate);
      if (!currentTodos.some((item) => item.id === todo.id)) {
        const restoredTodos = [...currentTodos];
        restoredTodos.splice(
          Math.min(Math.max(0, previousIndex), restoredTodos.length),
          0,
          todo
        );
        setStudyTodosForDate(studyDate, restoredTodos);
      }
      renderStudyCafeStateUpdate();
      return;
    }
  });
  deleteButton.disabled = todo.pending === true;

  return el("label", {
    className: `study-todo-item ${todo.completed ? "completed" : ""} ${todo.pending ? "pending" : ""}`,
    "data-study-todo-id": todo.id,
  }, [
    checkbox,
    el("span", {}, todo.content),
    deleteButton,
  ]);
}

function queueStudyTodoDelete(todoId, studyDate) {
  const runDelete = () =>
    mutateStudyCafeRemote(
      "todo_delete",
      { todoId, studyDate },
      { refresh: false }
    );
  const request = studyTodoDeleteQueue.then(runDelete, runDelete);
  studyTodoDeleteQueue = request.then(
    () => undefined,
    () => undefined
  );
  return request;
}

async function updateStudyTodoCompletion(todo, checkbox) {
  if (studyTodoTogglePendingIds.has(todo.id)) return;
  const previousCompleted = Boolean(todo.completed);
  const completed = checkbox.checked;
  const studyDate = todo.studyDate || getSelectedStudyTodoDateKey();
  studyTodoTogglePendingIds.add(todo.id);
  checkbox.disabled = true;
  setStudyTodosForDate(
    studyDate,
    getStudyTodosForDate(studyDate).map((item) =>
      item.id === todo.id ? { ...item, completed } : item
    )
  );
  renderStudyCafeStateUpdate();
  const result = await mutateStudyCafeRemote(
    "todo_toggle",
    {
      todoId: todo.id,
      completed,
      studyDate,
    },
    { refresh: false }
  );
  studyTodoTogglePendingIds.delete(todo.id);
  if (!result.ok) {
    setStudyTodosForDate(
      studyDate,
      getStudyTodosForDate(studyDate).map((item) =>
        item.id === todo.id ? { ...item, completed: previousCompleted } : item
      )
    );
    renderStudyCafeStateUpdate();
    return;
  }
  const currentTodoItem = Array.from(document.querySelectorAll("[data-study-todo-id]"))
    .find((item) => item.dataset.studyTodoId === String(todo.id));
  const currentCheckbox = currentTodoItem?.querySelector('input[type="checkbox"]');
  if (currentCheckbox) currentCheckbox.disabled = false;
}

function getStudyTodoDateLabel(key = getSelectedStudyTodoDateKey()) {
  const date = parseStudyTimerDateKey(key);
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

function getStudyTodoRelativeDateLabel(studyDate) {
  if (studyDate === getStudyTodoDateKeyByOffset(0)) return "오늘";
  if (studyDate === getStudyTodoDateKeyByOffset(-1)) return "어제";
  if (studyDate === getStudyTodoDateKeyByOffset(1)) return "내일";
  const date = parseStudyTimerDateKey(studyDate);
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function getSelectedStudyTodoDateKey() {
  return (
    studyCafeRemoteState.plannerDateKey ||
    studyCafeRemoteState.studyDateKey ||
    formatStudyBusinessDateKey(new Date())
  );
}

function getStudyTodosForDate(studyDate) {
  return Array.isArray(studyCafeRemoteState.todosByDate?.[studyDate])
    ? studyCafeRemoteState.todosByDate[studyDate]
    : [];
}

function setStudyTodosForDate(studyDate, todos) {
  studyCafeRemoteState.todosByDate[studyDate] = Array.isArray(todos) ? todos : [];
  const monthKey = studyDate.slice(0, 7);
  const monthSummary = studyCafeRemoteState.todoMonthSummaries[monthKey];
  if (monthSummary) {
    const dayTodos = studyCafeRemoteState.todosByDate[studyDate];
    if (dayTodos.length) {
      monthSummary[studyDate] = {
        total: dayTodos.length,
        completed: dayTodos.filter((todo) => todo.completed).length,
      };
    } else {
      delete monthSummary[studyDate];
    }
  }
  if (studyDate === studyCafeRemoteState.studyDateKey) {
    studyCafeRemoteState.todos = studyCafeRemoteState.todosByDate[studyDate];
  }
}

function getStudySubjectGoalsForDate(studyDate) {
  return Array.isArray(studyCafeRemoteState.subjectGoalsByDate?.[studyDate])
    ? studyCafeRemoteState.subjectGoalsByDate[studyDate]
    : [];
}

function getStudySubjectGoal(studyDate, subject) {
  return getStudySubjectGoalsForDate(studyDate).find((goal) => goal.subject === subject) || null;
}

function setStudySubjectGoalForDate(studyDate, nextGoal) {
  const goals = getStudySubjectGoalsForDate(studyDate).filter((goal) => goal.subject !== nextGoal.subject);
  if (Number(nextGoal.targetMinutes) > 0) goals.push(nextGoal);
  studyCafeRemoteState.subjectGoalsByDate[studyDate] = goals;
}

function renderStudySubjectGoalResult(goal, subject, studyDate) {
  if (!goal?.resultStatus) return null;
  const onTime = goal.resultStatus === "on_time";
  const symbol = onTime ? "○" : "△";
  const label = onTime ? "목표시간 내 완료" : "목표시간 초과 완료";
  const shortLabel = onTime ? "목표 내" : "시간 초과";
  return el("span", {
    className: `study-todo-goal-result ${onTime ? "on-time" : "overtime"}`,
    title: `${subject} ${label}`,
    ariaLabel: `${subject} ${label}`,
    "data-study-goal-date": studyDate,
  }, `${symbol} ${shortLabel}`);
}

async function updateStudySubjectGoal(studyDate, subject, select) {
  const previous = getStudySubjectGoal(studyDate, subject);
  const targetMinutes = Number(select.value) || 0;
  select.disabled = true;
  setStudySubjectGoalForDate(studyDate, {
    subject,
    targetMinutes,
    resultStatus: null,
    completedElapsedSeconds: 0,
  });
  renderStudyCafeStateUpdate();
  const result = await mutateStudyCafeRemote(
    "subject_goal_set",
    { studyDate, subject, targetMinutes },
    { refresh: false }
  );
  if (!result.ok) {
    if (previous) setStudySubjectGoalForDate(studyDate, previous);
    else setStudySubjectGoalForDate(studyDate, { subject, targetMinutes: 0 });
    renderStudyCafeStateUpdate();
    return;
  }
  if (result.goal) setStudySubjectGoalForDate(studyDate, result.goal);
  renderStudyCafeStateUpdate();
}

function getStudyTodoDateKeyByOffset(offset, fromDateKey = "") {
  const baseKey =
    fromDateKey ||
    studyCafeRemoteState.studyDateKey ||
    formatStudyBusinessDateKey(new Date());
  const date = parseStudyTimerDateKey(baseKey);
  date.setDate(date.getDate() + offset);
  return formatStudyTimerDateKey(date);
}

function renderStudyTodoDateNavigation(selectedDateKey) {
  const previousDateKey = getStudyTodoDateKeyByOffset(-1, selectedDateKey);
  const nextDateKey = getStudyTodoDateKeyByOffset(1, selectedDateKey);
  return el(
    "nav",
    { className: "study-todo-date-navigation", ariaLabel: "플래너 날짜 선택" },
    [
      el("button", {
        className: "study-todo-date-arrow",
        type: "button",
        textContent: "‹",
        ariaLabel: "이전 날짜",
        onclick: () => selectStudyTodoDate(previousDateKey),
      }),
      el("div", { className: "study-todo-date-current", ariaLive: "polite" }, [
        el("strong", {}, getStudyTodoDateLabel(selectedDateKey)),
      ]),
      el("button", {
        className: "study-todo-date-arrow",
        type: "button",
        textContent: "›",
        ariaLabel: "다음 날짜",
        onclick: () => selectStudyTodoDate(nextDateKey),
      }),
    ]
  );
}

function openStudyTodoCalendar(selectedDateKey = getSelectedStudyTodoDateKey()) {
  studyTodoCalendarOpen = true;
  studyTodoCalendarMonthKey = selectedDateKey.slice(0, 7);
  renderStudyCafeStateUpdate();
  scrollAppToTop();
}

function renderStudyTodoMonthlyCalendar(selectedDateKey) {
  const monthKey = /^\d{4}-\d{2}$/.test(studyTodoCalendarMonthKey)
    ? studyTodoCalendarMonthKey
    : selectedDateKey.slice(0, 7);
  const [year, month] = monthKey.split("-").map(Number);
  const leadingDays = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const todayKey = formatStudyBusinessDateKey(new Date());
  ensureStudyTodoMonthSummary(monthKey);
  const monthSummary = studyCafeRemoteState.todoMonthSummaries[monthKey] || {};
  const shiftMonth = (offset) => {
    const nextMonth = new Date(year, month - 1 + offset, 1);
    studyTodoCalendarMonthKey = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}`;
    renderStudyCafeStateUpdate();
  };

  return el("section", { className: "study-todo-month-calendar", ariaLabel: `${year}년 ${month}월 달력` }, [
    el("header", { className: "study-todo-month-calendar-head" }, [
      el("button", {
        type: "button",
        textContent: "‹",
        ariaLabel: "이전 달",
        onclick: () => shiftMonth(-1),
      }),
      el("strong", {}, `${year}년 ${month}월`),
      el("button", {
        type: "button",
        textContent: "›",
        ariaLabel: "다음 달",
        onclick: () => shiftMonth(1),
      }),
    ]),
    el("div", { className: "study-todo-month-weekdays" },
      ["일", "월", "화", "수", "목", "금", "토"].map((day) => el("span", {}, day))
    ),
    el("div", { className: "study-todo-month-days" }, [
      ...Array.from({ length: leadingDays }, () => el("span", { className: "study-todo-month-day blank" })),
      ...Array.from({ length: daysInMonth }, (_, index) => {
        const day = index + 1;
        const dateKey = `${monthKey}-${String(day).padStart(2, "0")}`;
        const selected = dateKey === selectedDateKey;
        const today = dateKey === todayKey;
        const plan = monthSummary[dateKey];
        const hasPlan = Number(plan?.total) > 0;
        const completionRate = hasPlan
          ? Math.round((Number(plan.completed) / Number(plan.total)) * 100)
          : 0;
        const planCompleted = hasPlan && completionRate === 100;
        const planProgressClass = !hasPlan
          ? ""
          : planCompleted
            ? "plan-completed"
            : completionRate === 0
              ? "plan-not-started"
              : completionRate > 50
                ? "plan-progress-mid"
                : "plan-progress-low";
        return el("button", {
          className: `study-todo-month-day ${selected ? "selected" : ""} ${today ? "today" : ""} ${hasPlan ? "has-plan" : ""} ${planProgressClass}`,
          type: "button",
          ariaLabel: `${month}월 ${day}일${hasPlan ? `, 플랜 ${plan.total}개, ${completionRate}% 달성` : ", 플랜 없음"}${selected ? ", 선택됨" : ""}`,
          ariaPressed: String(selected),
          onclick: () => selectStudyTodoDate(dateKey),
        }, [
          el("i", { className: hasPlan ? "has-plan" : "no-plan", ariaHidden: "true" }),
          el("span", {}, String(day)),
        ]);
      }),
    ]),
    el("div", { className: "study-todo-month-legend" }, [
      el("span", {}, [
        el("i", { className: "no-plan", ariaHidden: "true" }),
        el("b", {}, "플랜 없음"),
      ]),
      el("span", {}, [
        el("i", { className: "not-started", ariaHidden: "true" }),
        el("b", {}, "플랜 있음"),
      ]),
      el("span", {}, [
        el("i", { className: "progress-low", ariaHidden: "true" }),
        el("b", {}, "50% 이하"),
      ]),
      el("span", {}, [
        el("i", { className: "progress-mid", ariaHidden: "true" }),
        el("b", {}, "51~99%"),
      ]),
      el("span", {}, [
        el("i", { className: "completed", ariaHidden: "true" }),
        el("b", {}, "100% 달성"),
      ]),
    ]),
  ]);
}

async function ensureStudyTodoMonthSummary(monthKey) {
  if (Object.prototype.hasOwnProperty.call(studyCafeRemoteState.todoMonthSummaries, monthKey)) return;
  if (studyCafeRemoteState.todoMonthSummaryLoading.has(monthKey)) return;
  if (studyCafeRemoteState.available == null && !isStudyCafeLocalPreview()) return;
  if (isStudyCafeLocalPreview() || studyCafeRemoteState.available === false) {
    const localSummary = {};
    Object.entries(studyCafeRemoteState.todosByDate).forEach(([studyDate, todos]) => {
      if (!studyDate.startsWith(`${monthKey}-`) || !Array.isArray(todos) || !todos.length) return;
      localSummary[studyDate] = {
        total: todos.length,
        completed: todos.filter((todo) => todo.completed).length,
      };
    });
    studyCafeRemoteState.todoMonthSummaries[monthKey] = localSummary;
    return;
  }
  studyCafeRemoteState.todoMonthSummaryLoading.add(monthKey);
  const result = await requestStudyCafeAction("todo_month_summary", { monthKey });
  studyCafeRemoteState.todoMonthSummaryLoading.delete(monthKey);
  if (!result.ok) return;
  const summary = {};
  (Array.isArray(result.plans) ? result.plans : []).forEach((plan) => {
    const studyDate = String(plan?.studyDate || "");
    if (!studyDate.startsWith(`${monthKey}-`)) return;
    summary[studyDate] = {
      total: Math.max(0, Number(plan.total) || 0),
      completed: Math.max(0, Number(plan.completed) || 0),
    };
  });
  Object.entries(studyCafeRemoteState.todosByDate).forEach(([studyDate, todos]) => {
    if (!studyDate.startsWith(`${monthKey}-`) || !Array.isArray(todos)) return;
    if (!todos.length) {
      delete summary[studyDate];
      return;
    }
    summary[studyDate] = {
      total: todos.length,
      completed: todos.filter((todo) => todo.completed).length,
    };
  });
  studyCafeRemoteState.todoMonthSummaries[monthKey] = summary;
  if (currentRoute === "study-todo" && studyTodoCalendarOpen) renderStudyCafeStateUpdate();
}

async function selectStudyTodoDate(studyDate) {
  if (studyCafeRemoteState.plannerLoading) return;
  studyCafeRemoteState.plannerDateKey = studyDate;
  if (studyTodoCalendarOpen) studyTodoCalendarMonthKey = studyDate.slice(0, 7);
  if (Object.prototype.hasOwnProperty.call(studyCafeRemoteState.todosByDate, studyDate)) {
    renderStudyCafeStateUpdate();
    return;
  }
  if (isStudyCafeLocalPreview() || studyCafeRemoteState.available !== true) {
    setStudyTodosForDate(studyDate, []);
    studyCafeRemoteState.subjectGoalsByDate[studyDate] = [];
    renderStudyCafeStateUpdate();
    return;
  }
  studyCafeRemoteState.plannerLoading = true;
  renderStudyCafeStateUpdate();
  const result = await requestStudyCafeAction("todos_load", { studyDate });
  studyCafeRemoteState.plannerLoading = false;
  if (!result.ok) {
    notify("선택한 날짜의 플래너를 불러오지 못했습니다.");
    renderStudyCafeStateUpdate();
    return;
  }
  setStudyTodosForDate(studyDate, result.todos || []);
  studyCafeRemoteState.subjectGoalsByDate[studyDate] = result.subjectGoals || [];
  renderStudyCafeStateUpdate();
}

function renderStudentStudyCafe() {
  const student = getAuthedStudent();
  if (!isOnlineStudentExperience(student)) {
    return el("div", { className: "grid student-view student-study-cafe-access" }, [
      el("section", { className: "student-study-cafe-access-card" }, [
        el("span", { className: "study-cafe-access-icon", ariaHidden: "true" }, "☕"),
        el("h2", {}, "온라인 수강생 전용 공간입니다"),
        el("p", {}, "론박 온라인 스터디카페는 등록번호가 2로 시작하는 인터넷 강의 수강생만 이용할 수 있습니다."),
        button("홈으로", "btn secondary", "button", () => navigate("home")),
      ]),
    ]);
  }

  ensureStudyCafeTemporaryNickname();
  ensureStudyCafeRemoteLoaded();
  ensureStudyCafeShopLoaded();
  ensureStudyRoomLoaded({ render: true });
  ensureStudyCafePreviewClock();
  const ownStudyRoom = studyRoomState.room;
  const browsingPublicCafe = Boolean(ownStudyRoom && studyRoomState.browsingPublicCafe);
  if (ownStudyRoom && !browsingPublicCafe) return renderStudentPrivateStudyRoom(student);
  const seated = !browsingPublicCafe && Boolean(studyCafePreviewState.selectedSeatId);
  const active = Boolean(studyCafePreviewState.selectedSeatId && studyCafePreviewState.subject);
  const selectedSeatNumber = browsingPublicCafe
    ? 0
    : STUDY_CAFE_PREVIEW_SEATS.findIndex(
        (seat) => seat.id === studyCafePreviewState.selectedSeatId
      ) + 1;
  const activeRoomIndex = Math.min(
    STUDY_CAFE_ROOMS.length - 1,
    Math.max(0, Number(studyCafePreviewState.activeRoomIndex) || 0)
  );
  const activeRoom = STUDY_CAFE_ROOMS[activeRoomIndex];
  const focusedCount = getStudyCafeFocusedCount();
  const rankingRoomActive = activeRoomIndex === STUDY_CAFE_RANKING_ROOM_INDEX;
  const firstUseGuideVisible = rankingRoomActive
    ? !hasUsedStudyCafeRankingRoom(student)
    : !browsingPublicCafe && !seated && !hasUsedStudyCafe(student);
  const roomContextText = browsingPublicCafe
    ? "전체 카페 둘러보는 중"
    : seated || studyCafePreviewState.pendingSubject
      ? getStudyCafeRoomContextText(activeRoomIndex, selectedSeatNumber)
      : "";

  return el("div", { className: "student-study-cafe-page" }, [
    el("section", {
      className: `study-cafe-room theme-${activeRoom.theme} ${rankingRoomActive ? "ranking-room" : ""} ${seated ? "has-selected-seat" : ""}`,
      ariaLabel: `${activeRoom.label} ${activeRoom.mood} 좌석 배치`,
      "data-study-cafe-room": "true",
    }, [
      el("div", { className: "study-cafe-room-toolbar" }, [
        el("div", { className: "study-cafe-room-identity" }, [
          el("strong", {}, "RONPARK STUDYCAFE"),
          el("div", { className: "study-cafe-room-identity-meta" }, [
            el(
              "span",
              { className: "study-cafe-room-mood", "data-study-cafe-room-mood": "true" },
              `${activeRoom.label} · ${activeRoom.mood}`
            ),
            el("button", {
              className: "study-cafe-ranking-help-button",
              type: "button",
              hidden: !rankingRoomActive,
              "data-study-cafe-ranking-help": "true",
              ariaLabel: "랭킹룸 이용 안내 열기",
              textContent: "랭킹룸 안내",
              onclick: openStudyCafeRankingGuideModal,
            }),
          ]),
        ]),
        el("div", { className: "study-cafe-room-toolbar-actions" }, [
          renderStudyCafeShopChip(student),
          browsingPublicCafe
            ? button("내 스터디룸", "study-room-return-button", "button", returnToOwnStudyRoom)
            : null,
          el(
            "span",
            { className: "study-cafe-live-chip" },
            Number.isFinite(focusedCount) ? `● ${focusedCount}명 집중 중` : "● 실시간 인원 연결 중"
          ),
        ]),
      ]),
      seated ? renderStudyCafeMySeatCard(student, selectedSeatNumber) : null,
      el("div", { className: `study-cafe-room-label-row ${roomContextText ? "" : "actions-only"}`.trim() }, [
        roomContextText
          ? el("span", { "data-study-cafe-room-context": "true" }, roomContextText)
          : null,
        el(
          "button",
          {
            className: "study-room-open-button",
            type: "button",
            ariaLabel: "스터디방 목록 열기",
            onclick: openStudyRoomListModal,
          },
          [
            el("span", { className: "study-room-open-icon", ariaHidden: "true" }, "☰"),
            el("span", {}, "스터디방 목록"),
          ]
        ),
      ]),
      renderStudyCafeRoomTabs(student),
      el(
        "div",
        { "data-study-cafe-first-use-guide": "true" },
        firstUseGuideVisible ? renderStudyCafeFirstUseGuide(activeRoomIndex) : null
      ),
      el("div", { className: "study-cafe-seat-section-head", ariaLabel: "좌석 현황" }, [
        el("strong", {}, "좌석 현황"),
      ]),
      el(
        "div",
        { className: "study-cafe-seat-grid", "data-study-cafe-seat-grid": "true" },
        renderStudyCafeRoomSeatNodes(activeRoomIndex, student, {
          trackChanges: rankingRoomActive,
          readOnly: browsingPublicCafe,
        })
      ),
    ]),
    browsingPublicCafe
      ? el("section", { className: "study-cafe-start-guide study-room-browse-guide" }, [
          el("div", {}, [
            el("strong", {}, `${ownStudyRoom.name}에 참여 중입니다`),
            el("p", {}, "전체 현황은 자유롭게 둘러볼 수 있으며, 좌석과 공부 상태는 내 스터디룸에 그대로 유지됩니다."),
          ]),
          button("내 방으로", "study-room-return-guide-button", "button", returnToOwnStudyRoom),
        ])
      : null,
    active ? renderStudyCafeFloatingActions(student) : null,
  ]);
}

function renderStudentPrivateStudyRoom(student) {
  const room = studyRoomState.room;
  const roomTheme = room.theme || getPrivateStudyRoomTheme(room.id);
  const active = Boolean(studyCafePreviewState.subject);
  const myMember = room.members.find((member) => member.isMine) || null;
  const seated = Boolean(room.mySeatNumber);
  if (seated && !studyCafePreviewState.selectedSeatId) {
    studyCafePreviewState.selectedSeatId = `private-seat-${room.mySeatNumber}`;
  }
  return el("div", { className: "student-study-cafe-page study-private-room-page" }, [
    el("section", { className: `study-cafe-room theme-${roomTheme} study-private-room`, ariaLabel: `${room.name} 스터디방` }, [
      el("div", { className: "study-cafe-room-toolbar study-private-room-toolbar" }, [
        el("div", { className: "study-cafe-room-identity" }, [
          el("strong", {}, room.name),
          el("span", {}, `${room.locked ? "🔒 비밀번호방" : "공개방"}${room.description ? ` · ${room.description}` : ""}`),
        ]),
        el("div", { className: "study-cafe-room-toolbar-actions study-private-room-actions" }, [
          renderStudyCafeShopChip(student),
          button("전체 카페 보기", "study-room-cafe-button", "button", browsePublicStudyCafe),
          room.role === "host"
            ? button("방 관리", "study-room-manage-button", "button", openStudyRoomManageModal)
            : null,
          button("방 메뉴", "study-room-menu-button", "button", openStudyRoomOptionsModal),
        ]),
      ]),
      seated
        ? el("div", { className: "study-private-my-status" }, [
            el("div", {}, [
              el("span", {}, "내 좌석"),
              el("strong", {}, `${room.mySeatNumber}번 좌석`),
              el("p", {}, active ? `${studyCafePreviewState.subject} 공부 중` : "과목을 선택하면 공부가 시작됩니다."),
            ]),
            active
              ? el("time", { "data-study-cafe-clock": "true" }, formatStudyCafeElapsed(getStudySubjectElapsedMs(studyCafePreviewState.subject)))
              : el("div", { className: "study-private-my-actions" }, [
                  button("과목 선택", "study-room-subject-button", "button", () =>
                    openStudyCafeSubjectModal(`private-seat-${room.mySeatNumber}`, student)
                  ),
                  button("좌석 비우기", "study-room-leave-button study-private-release-button", "button", releaseStudyCafeSeat),
                ]),
          ])
        : null,
      el("div", { className: "study-private-room-overview" }, [
        el("strong", {}, "좌석 현황"),
        el("button", {
          className: "study-private-room-members-link",
          type: "button",
          ariaLabel: `멤버 목록 열기, 현재 ${room.members.length}명, 정원 ${room.capacity}명`,
          textContent: `멤버 ${room.members.length}/${room.capacity} 보기`,
          onclick: openStudyRoomMembersModal,
        }),
      ]),
      el(
        "div",
        { className: "study-cafe-seat-grid study-private-seat-grid", ariaLabel: "스터디방 좌석" },
        Array.from({ length: room.capacity }, (_, index) => renderPrivateStudyRoomSeat(index + 1, room, student))
      ),
      seated
        ? null
        : el("div", { className: "study-private-seat-guide" }, [
            el("strong", {}, "이용할 좌석을 선택해주세요"),
          ]),
      renderStudyRoomChat(room),
    ]),
    active ? renderStudyCafeFloatingActions(student) : null,
  ]);
}

function openStudyRoomMembersModal() {
  const room = studyRoomState.room;
  if (!room) return;
  const members = [...room.members].sort((left, right) => {
    if (left.role !== right.role) return left.role === "host" ? -1 : 1;
    if (left.isMine !== right.isMine) return left.isMine ? -1 : 1;
    return (Number(left.seatNumber) || Number.MAX_SAFE_INTEGER) -
      (Number(right.seatNumber) || Number.MAX_SAFE_INTEGER);
  });
  const statusLabels = {
    studying: "집중 중",
    paused: "일시정지",
    seated: "대기 중",
  };
  openInfoModal({
    title: `멤버 목록 · ${room.members.length}명`,
    className: "study-room-members-modal",
    content: el("div", { className: "study-room-members-list" },
      members.map((member) => {
        const canViewDetails = !member.isMine && Boolean(member.seatNumber);
        return el(canViewDetails ? "button" : "article", {
          className: `study-room-members-item ${member.isMine ? "mine" : ""} ${canViewDetails ? "is-clickable" : ""}`.trim(),
          ...(canViewDetails ? {
            type: "button",
            ariaLabel: `${member.name}님 상세 보기`,
            onclick: () => {
              closeInfoModal();
              openStudyCafeMemberModal({
                ...member,
                fullTrack: member.track || "온라인 수강",
                todaySeconds: Number(member.todaySeconds) || 0,
                remote: true,
                isMine: false,
              }, Number(member.seatNumber));
            },
          } : {}),
        }, [
          el("div", { className: "study-room-members-profile" }, [
            el("span", {
              className: `study-room-members-avatar tone-${member.tone || "blue"}`,
              ariaHidden: "true",
            }, String(member.name || "멤버").slice(0, 1)),
            el("div", {}, [
              el("strong", {}, [
                el("span", {}, member.name),
                member.role === "host"
                  ? el("span", { className: "study-room-host-label" }, "(방장)")
                  : null,
              ]),
              el("span", {}, member.track || "온라인 수강"),
            ]),
          ]),
          el("div", { className: "study-room-members-meta" }, [
            el("span", {}, member.seatNumber ? `${member.seatNumber}번 좌석` : "좌석 미선택"),
            el("span", { className: `status-${member.status || "seated"}` }, statusLabels[member.status] || "대기 중"),
          ]),
          canViewDetails
            ? el("span", { className: "study-room-members-item-arrow", ariaHidden: "true" }, "›")
            : null,
        ]);
      })
    ),
    confirmLabel: "닫기",
  });
}

function getPrivateStudyRoomTheme(roomId) {
  const themes = ["dawn", "forest", "night", "classic"];
  const hash = [...String(roomId || "")].reduce((total, character) => total + character.charCodeAt(0), 0);
  return themes[hash % themes.length];
}

function renderPrivateStudyRoomSeat(seatNumber, room, student) {
  const occupant = room.members.find((member) => Number(member.seatNumber) === seatNumber);
  const isMine = occupant?.isMine === true;
  const seat = el("button", {
    className: `study-cafe-seat study-room-seat ${occupant ? "occupied" : "empty"} ${isMine ? "mine" : ""} ${occupant?.status || ""}`,
    type: "button",
    ariaLabel: occupant
      ? `${seatNumber}번 좌석, ${occupant.name}, ${occupant.status === "studying" ? "집중 중" : occupant.status === "paused" ? "일시정지" : "착석 중"}`
      : `${seatNumber}번 빈 좌석`,
  }, [
    el("span", { className: "study-cafe-seat-number" }, String(seatNumber)),
    occupant
      ? el("span", { className: "study-cafe-seat-name", title: `${occupant.name} / ${occupant.track || "온라인 수강"}` }, [
          el("strong", {}, `${occupant.name}${occupant.role === "host" ? " (방장)" : ""}`),
          el("em", {}, occupant.track || "온라인 수강"),
        ])
      : null,
    occupant
      ? el(
          "time",
          {
            className: "study-cafe-member-time",
            "data-study-member-time": isMine
              ? "mine"
              : occupant.status === "studying"
                ? "remote"
                : "static",
            "data-study-base-seconds": String(Number(occupant.todaySeconds) || 0),
            ariaLabel: `${occupant.name} 오늘 누적 공부시간`,
          },
          formatStudyCafeMemberTime(
            isMine
              ? getStudyCafeMemberSeconds(null, true)
              : getStudyCafeMemberSeconds({ ...occupant, remote: true }, false)
          )
        )
      : null,
    occupant?.status === "paused"
      ? el("span", { className: "study-cafe-seat-pause-icon", ariaLabel: "일시정지", title: "일시정지" })
      : null,
    occupant
      ? renderStudyCafeSeatedVisual(occupant.tone || "blue", isMine, {
          studying: occupant.status === "studying",
          showWritingArms: true,
        })
      : el("span", { className: "study-cafe-empty-plus" }, "+ 입장"),
    occupant
      ? null
      : el("span", { className: "study-cafe-desk" }, [
          el("i", { className: "study-cafe-desk-book" }),
          el("i", { className: "study-cafe-desk-cup" }),
        ]),
  ]);
  seat.addEventListener("click", async () => {
    if (occupant && !isMine) {
      openStudyCafeMemberModal({
        ...occupant,
        fullTrack: occupant.track || "온라인 수강",
        todaySeconds: Number(occupant.todaySeconds) || 0,
        remote: true,
        isMine: false,
      }, seatNumber);
      return;
    }
    if (isMine) {
      openStudyCafeSubjectModal(`private-seat-${seatNumber}`, student, {
        preserveTimer: Boolean(studyCafePreviewState.subject),
      });
      return;
    }
    const currentSeatNumber = Number(room.mySeatNumber) || 0;
    if (currentSeatNumber && currentSeatNumber !== seatNumber) {
      openPrivateStudyRoomSeatMoveModal(currentSeatNumber, seatNumber, room);
      return;
    }
    if (studyRoomState.actionPending) return;
    seat.disabled = true;
    const result = await mutateStudyRoom("claim_seat", { roomId: room.id, seatNumber });
    if (!result.ok) {
      seat.disabled = false;
      return;
    }
    studyCafePreviewState.selectedSeatId = `private-seat-${seatNumber}`;
    renderStudyCafeStateUpdate();
    notify(`${seatNumber}번 좌석을 선택했습니다.`);
    openStudyCafeSubjectModal(`private-seat-${seatNumber}`, student);
  });
  return seat;
}

function openPrivateStudyRoomSeatMoveModal(currentSeatNumber, nextSeatNumber, room) {
  let moving = false;
  let controls = null;
  controls = openInfoModal({
    title: `${nextSeatNumber}번 좌석으로 이동할까요?`,
    className: "study-room-seat-move-modal",
    content: el("div", { className: "study-room-seat-move-guide" }, [
      el("p", {}, `${currentSeatNumber}번 좌석에서 ${nextSeatNumber}번 좌석으로 이동합니다.`),
      studyCafePreviewState.subject
        ? el("p", {}, "현재 과목과 공부시간은 그대로 유지됩니다.")
        : null,
    ]),
    confirmLabel: "이동하기",
    onConfirm: async () => {
      if (moving || studyRoomState.actionPending) return;
      moving = true;
      controls.confirmButton.disabled = true;
      controls.confirmButton.textContent = "이동 중…";
      const result = await mutateStudyRoom("claim_seat", {
        roomId: room.id,
        seatNumber: nextSeatNumber,
      });
      if (!result.ok) {
        moving = false;
        controls.confirmButton.disabled = false;
        controls.confirmButton.textContent = "이동하기";
        return;
      }
      studyCafePreviewState.selectedSeatId = `private-seat-${nextSeatNumber}`;
      closeInfoModal();
      renderStudyCafeStateUpdate();
      notify(`${nextSeatNumber}번 좌석으로 이동했습니다.`);
    },
  });
  controls.confirmButton.classList.remove("secondary");
}

function renderStudyRoomChat(room) {
  const collapsed = studyRoomState.chatCollapsed;
  const expanded = studyRoomState.chatExpanded;
  const messages = room.messages || [];
  const chat = el("section", { className: `study-room-chat ${collapsed ? "collapsed" : ""} ${expanded ? "expanded" : ""}` }, [
    el("div", { className: "study-room-chat-head" }, [
      el("div", {}, [
        el("strong", {}, "방 채팅"),
        room.unreadCount ? el("span", { className: "study-room-unread" }, String(room.unreadCount)) : null,
      ]),
      el("div", {}, [
        collapsed ? null : button(expanded ? "기본" : "확장", "study-room-chat-size", "button", () => {
          studyRoomState.chatExpanded = !expanded;
          renderStudyCafeStateUpdate();
        }),
        button(collapsed ? "펼치기" : "접기", "study-room-chat-toggle", "button", () => {
          studyRoomState.chatCollapsed = !collapsed;
          if (!studyRoomState.chatCollapsed) markStudyRoomMessagesRead(room.id);
          renderStudyCafeStateUpdate();
        }),
      ]),
    ]),
    collapsed
      ? el("button", { className: "study-room-chat-collapsed-button", type: "button", onclick: () => {
          studyRoomState.chatCollapsed = false;
          markStudyRoomMessagesRead(room.id);
          renderStudyCafeStateUpdate();
        } }, `💬 방 채팅${room.unreadCount ? ` · 새 메시지 ${room.unreadCount}개` : ""}`)
      : renderStudyRoomChatBody(room, messages),
  ]);
  if (!collapsed && room.unreadCount) window.setTimeout(() => markStudyRoomMessagesRead(room.id), 0);
  return chat;
}

function renderStudyRoomChatBody(room, messages) {
  const log = el("div", { className: "study-room-chat-log", role: "log", ariaLive: "polite" },
    messages.length
      ? messages.map((message) => el("div", { className: `study-room-message ${message.type} ${message.isMine ? "mine" : ""} ${message.deleted ? "deleted" : ""}` }, [
          el("div", { className: "study-room-message-meta" }, [
            el("strong", {}, message.senderName),
            el("time", {}, formatStudyRoomMessageTime(message.createdAt)),
          ]),
          el("p", {}, message.text),
          !message.deleted && message.type === "chat" && (message.isMine || room.role === "host")
            ? button("삭제", "study-room-message-delete", "button", () => deleteStudyRoomMessage(room.id, message.id))
            : null,
        ]))
      : [el("p", { className: "study-room-chat-empty" }, "첫 메시지를 남겨보세요.")]
  );
  window.setTimeout(() => { log.scrollTop = log.scrollHeight; }, 0);
  const messageInput = el("textarea", {
    name: "roomMessage",
    placeholder: "메시지를 입력하세요…",
    maxlength: "300",
    rows: "1",
    ariaLabel: "방 채팅 메시지",
  });
  const sendButton = button("전송", "study-room-chat-send", "submit");
  const form = el("form", { className: "study-room-chat-form" }, [messageInput, sendButton]);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = messageInput.value.trim();
    if (!message) return;
    sendButton.disabled = true;
    const result = await mutateStudyRoom("message_send", { roomId: room.id, message });
    sendButton.disabled = false;
    if (!result.ok) return;
    messageInput.value = "";
    renderStudyCafeStateUpdate();
  });
  messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  return el("div", { className: "study-room-chat-body" }, [log, form]);
}

function formatStudyRoomMessageTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

async function markStudyRoomMessagesRead(roomId) {
  if (!roomId || !studyRoomState.room) return;
  studyRoomState.room.unreadCount = 0;
  await requestStudyRoomAction("messages_read", { roomId }).catch(() => null);
}

async function deleteStudyRoomMessage(roomId, messageId) {
  if (!confirm("이 메시지를 삭제할까요?")) return;
  const result = await mutateStudyRoom("message_delete", { roomId, messageId });
  if (result.ok) renderStudyCafeStateUpdate();
}

async function openStudyRoomListModal() {
  openLoadingModal("스터디방 불러오는 중", "참여할 수 있는 방을 확인하고 있습니다.");
  let result;
  try {
    result = await requestStudyRoomAction("list");
  } catch (error) {
    console.error(error);
  } finally {
    closeLoadingModal();
  }
  if (!result?.ok) return notify(getStudyRoomErrorMessage(result?.error));
  studyRoomState.rooms = result.rooms || [];
  studyRoomState.membership = result.membership || null;
  const content = el("div", { className: "study-room-list-modal-content" }, [
    el("div", { className: "study-room-list-head" }, [
      el("p", {}, "함께 공부할 방을 선택하거나 새로운 방을 만들어보세요."),
      result.membership
        ? button("내 방으로", "study-room-create-button", "button", async () => {
            closeInfoModal();
            await ensureStudyRoomLoaded({ force: true });
            renderStudyCafeStateUpdate();
          })
        : button("+ 방 만들기", "study-room-create-button", "button", openStudyRoomCreateModal),
    ]),
    el("div", { className: "study-room-list" }, (result.rooms || []).length
      ? result.rooms.map(renderStudyRoomListItem)
      : [el("div", { className: "study-room-list-empty" }, [
          el("strong", {}, "아직 만들어진 방이 없습니다."),
          el("p", {}, "첫 번째 스터디방을 만들어보세요."),
        ])]),
  ]);
  openInfoModal({ title: "스터디방", className: "study-room-list-modal", content, confirmLabel: "닫기" });
}

function renderStudyRoomListItem(room) {
  return el("article", { className: `study-room-list-item ${room.full ? "full" : ""}` }, [
    el("div", {}, [
      el("div", { className: "study-room-list-title" }, [
        el("strong", {}, room.name),
        room.locked ? el("span", { title: "비밀번호방" }, "🔒") : null,
      ]),
      room.description ? el("p", {}, room.description) : null,
      el("span", {}, `${room.memberCount}/${room.capacity}명${room.isMine ? " · 참여 중" : ""}`),
    ]),
    button(
      room.isMine ? "내 방" : room.full ? "정원 마감" : "참여하기",
      "study-room-join-button",
      "button",
      () => room.isMine ? enterOwnStudyRoom() : openStudyRoomJoinModal(room)
    ),
  ]);
}

async function enterOwnStudyRoom() {
  closeInfoModal();
  studyRoomState.browsingPublicCafe = false;
  await ensureStudyRoomLoaded({ force: true });
  renderStudyCafeStateUpdate();
}

function openStudyRoomCreateModal() {
  const nameInput = input("roomName", "text", "예: 해경 필기 집중반");
  nameInput.maxLength = 20;
  const capacitySelect = select(
    "capacity",
    Array.from({ length: 19 }, (_, index) => String(index + 2))
  );
  Array.from(capacitySelect.options).forEach((option) => {
    option.textContent = `${option.value}좌석`;
  });
  capacitySelect.value = "8";
  const accessSelect = select("accessType", ["public", "password"]);
  accessSelect.querySelector('option[value="public"]').textContent = "공개방";
  accessSelect.querySelector('option[value="password"]').textContent = "비밀번호방";
  const passwordInput = input("roomPassword", "password", "숫자 4자리 또는 영문·숫자 4~12자");
  const passwordField = field("비밀번호", passwordInput, "study-room-password-field");
  passwordField.hidden = true;
  accessSelect.addEventListener("change", () => { passwordField.hidden = accessSelect.value !== "password"; });
  const descriptionInput = textarea("description", "방 설명을 입력하세요 (선택)");
  descriptionInput.maxLength = 50;
  const form = el("div", { className: "study-room-form" }, [
    field("방 이름", nameInput, "", "2~20자"),
    field("좌석 수", capacitySelect, "", "최대 20명"),
    field("공개 설정", accessSelect),
    passwordField,
    field("방 설명", descriptionInput, "", "최대 50자"),
  ]);
  const controls = openInfoModal({
    title: "스터디방 만들기",
    className: "study-room-create-modal",
    content: form,
    confirmLabel: "방 만들고 입장하기",
    onConfirm: async () => {
      const result = await mutateStudyRoom("create", {
        name: nameInput.value,
        capacity: Number(capacitySelect.value),
        theme: "oak",
        accessType: accessSelect.value,
        password: passwordInput.value,
        description: descriptionInput.value,
      });
      if (!result.ok) return;
      closeInfoModal();
      studyRoomState.browsingPublicCafe = false;
      resetStudyCafeLocalSeatForPrivateRoom();
      renderStudyCafeStateUpdate();
      notify("스터디방을 만들었습니다. 이용할 좌석을 선택해주세요.");
    },
  });
  controls.confirmButton.classList.remove("secondary");
  window.setTimeout(() => nameInput.focus(), 0);
}

function openStudyRoomJoinModal(room) {
  if (room.full) return;
  if (!room.locked) {
    joinStudyRoom(room, "");
    return;
  }
  const passwordInput = input("roomPassword", "password", "방 비밀번호");
  passwordInput.maxLength = 12;
  const controls = openInfoModal({
    title: `${room.name} 참여하기`,
    className: "study-room-join-modal",
    content: el("div", { className: "study-room-form" }, [
      el("p", {}, `${room.memberCount}/${room.capacity}명 · 비밀번호가 필요한 방입니다.`),
      field("비밀번호", passwordInput),
    ]),
    confirmLabel: "참여하기",
    onConfirm: () => joinStudyRoom(room, passwordInput.value),
  });
  controls.confirmButton.classList.remove("secondary");
  window.setTimeout(() => passwordInput.focus(), 0);
}

async function joinStudyRoom(room, password) {
  const result = await mutateStudyRoom("join", { roomId: room.id, password });
  if (!result.ok) return;
  closeInfoModal();
  studyRoomState.browsingPublicCafe = false;
  resetStudyCafeLocalSeatForPrivateRoom();
  renderStudyCafeStateUpdate();
  notify(`${room.name}에 참여했습니다. 이용할 좌석을 선택해주세요.`);
}

function resetStudyCafeLocalSeatForPrivateRoom() {
  studyCafePreviewState.selectedSeatId = "";
  studyCafePreviewState.subject = "";
  studyCafePreviewState.running = false;
  studyCafePreviewState.paused = false;
  studyCafePreviewState.elapsedMs = 0;
  studyCafePreviewState.startedAt = 0;
  studyCafePreviewState.subjectStartedAt = 0;
}

async function leaveCurrentStudyRoom() {
  const room = studyRoomState.room;
  if (!room) return;
  const nextHost = room.role === "host"
    ? room.members.find((member) => !member.isMine)
    : null;
  const hostNotice = room.role !== "host"
    ? ""
    : nextHost
      ? ` 방장은 ${nextHost.name}님에게 자동으로 위임됩니다.`
      : " 남은 구성원이 없어 방은 자동으로 종료됩니다.";
  if (!confirm(`'${room.name}'에서 탈퇴할까요?${hostNotice} 진행 중인 공부는 종료됩니다.`)) return;
  const result = await mutateStudyRoom("leave", { roomId: room.id }, { refresh: false });
  if (!result.ok) return;
  studyRoomState.room = null;
  studyRoomState.loaded = false;
  studyRoomState.browsingPublicCafe = false;
  resetStudyCafeLocalSeatForPrivateRoom();
  await ensureStudyCafeRemoteLoaded({ force: true, render: false });
  closeInfoModal();
  renderStudyCafeStateUpdate();
  notify("스터디룸에서 탈퇴했습니다.");
}

function browsePublicStudyCafe() {
  if (!studyRoomState.room) return;
  studyRoomState.browsingPublicCafe = true;
  renderStudyCafeStateUpdate();
}

function returnToOwnStudyRoom() {
  if (!studyRoomState.room) return;
  studyRoomState.browsingPublicCafe = false;
  renderStudyCafeStateUpdate();
}

function openStudyRoomOptionsModal() {
  const room = studyRoomState.room;
  if (!room) return;
  openInfoModal({
    title: "방 메뉴",
    className: "study-room-options-modal",
    content: el("div", { className: "study-room-options-content" }, [
      el("div", { className: "study-room-options-summary" }, [
        el("strong", {}, room.name),
        el("span", {}, `${room.locked ? "비밀번호방" : "공개방"} · ${room.members.length}/${room.capacity}명`),
        el("p", {}, "전체 카페를 둘러보는 동안에도 스터디룸 소속과 공부 상태는 유지됩니다."),
      ]),
      button("멤버 목록 보기", "btn secondary", "button", openStudyRoomMembersModal),
      button("스터디룸 탈퇴", "btn danger study-room-withdraw-button", "button", leaveCurrentStudyRoom),
    ]),
    confirmLabel: "닫기",
  });
}

function openStudyRoomManageModal() {
  const room = studyRoomState.room;
  if (!room || room.role !== "host") return;
  const members = room.members.filter((member) => !member.isMine);
  openInfoModal({
    title: "방 관리",
    className: "study-room-manage-modal",
    content: el("div", { className: "study-room-manage-content" }, [
      button("방 설정 변경", "btn secondary", "button", openStudyRoomSettingsModal),
      el("div", { className: "study-room-manage-members" }, [
        el("strong", {}, `구성원 ${room.members.length}명`),
        ...members.map((member) => el("div", { className: "study-room-manage-member" }, [
          el("span", {}, `${member.name}${member.seatNumber ? ` · ${member.seatNumber}번` : " · 좌석 미선택"}`),
          button("내보내기", "mini-btn danger", "button", () => kickStudyRoomMember(member)),
        ])),
      ]),
      button("방 삭제", "btn danger study-room-close-button", "button", closeCurrentStudyRoom),
    ]),
    confirmLabel: "닫기",
  });
}

function openStudyRoomSettingsModal() {
  const room = studyRoomState.room;
  if (!room || room.role !== "host") {
    notify("방장만 방 설정을 변경할 수 있습니다.");
    return;
  }
  const nameInput = input("roomName", "text", "방 이름", room.name);
  nameInput.maxLength = 20;
  const capacityInput = input("capacity", "number", "2~20", String(room.capacity));
  capacityInput.min = "2";
  capacityInput.max = "20";
  const accessSelect = select("accessType", ["public", "password"]);
  accessSelect.querySelector('option[value="public"]').textContent = "공개방";
  accessSelect.querySelector('option[value="password"]').textContent = "비밀번호방";
  accessSelect.value = room.locked ? "password" : "public";
  const themeSelect = select("theme", ["oak", "dawn", "forest", "night", "classic"]);
  const themeLabels = {
    oak: "오크 · 베이지",
    dawn: "새벽 · 라이트 그레이",
    forest: "포레스트 · 그린",
    night: "나이트 · 블루그레이",
    classic: "클래식 · 로즈",
  };
  Array.from(themeSelect.options).forEach((option) => {
    option.textContent = themeLabels[option.value];
  });
  themeSelect.value = room.theme || "dawn";
  const passwordInput = input("roomPassword", "password", room.locked ? "변경할 때만 입력" : "숫자 4자리 또는 영문·숫자");
  const descriptionInput = textarea("description", "방 설명");
  descriptionInput.value = room.description || "";
  descriptionInput.maxLength = 50;
  const controls = openInfoModal({
    title: "방 설정 변경",
    className: "study-room-create-modal",
    content: el("div", { className: "study-room-form" }, [
      field("방 이름", nameInput),
      field("좌석 수", capacityInput),
      field("공개 설정", accessSelect),
      field("방 색상 테마", themeSelect),
      field("새 비밀번호", passwordInput, "", "현재 비밀번호를 유지하려면 비워두세요."),
      field("방 설명", descriptionInput),
    ]),
    confirmLabel: "저장하기",
    onConfirm: async () => {
      const result = await mutateStudyRoom("update", {
        roomId: room.id,
        name: nameInput.value,
        capacity: Number(capacityInput.value),
        accessType: accessSelect.value,
        theme: themeSelect.value,
        password: passwordInput.value,
        description: descriptionInput.value,
      });
      if (!result.ok) return;
      closeInfoModal();
      renderStudyCafeStateUpdate();
      notify("방 설정을 변경했습니다.");
    },
  });
  controls.confirmButton.classList.remove("secondary");
}

async function kickStudyRoomMember(member) {
  if (!member.studentId || !confirm(`${member.name}님을 방에서 내보낼까요?`)) return;
  const result = await mutateStudyRoom("kick", {
    roomId: studyRoomState.room.id,
    targetStudentId: member.studentId,
  });
  if (!result.ok) return;
  closeInfoModal();
  renderStudyCafeStateUpdate();
  notify("구성원을 방에서 내보냈습니다.");
}

async function closeCurrentStudyRoom() {
  const room = studyRoomState.room;
  if (!room || !confirm(`'${room.name}'을 삭제할까요? 모든 구성원이 퇴장하며 방 목록에서도 사라집니다.`)) return;
  const result = await mutateStudyRoom("close", { roomId: room.id }, { refresh: false });
  if (!result.ok) return;
  closeInfoModal();
  studyRoomState.room = null;
  studyRoomState.loaded = false;
  resetStudyCafeLocalSeatForPrivateRoom();
  renderStudyCafeStateUpdate();
  notify("스터디방을 삭제했습니다.");
}

function renderStudyCafeMySeatCard(student, seatNumber) {
  const active = Boolean(studyCafePreviewState.subject);
  const seatLabel = formatStudyCafeSeatLabel(seatNumber, student);
  const statusLabel = studyCafePreviewState.paused
    ? "일시정지"
    : studyCafePreviewState.running
      ? "집중 중"
      : "착석 중";
  const detail = active
    ? `${studyCafePreviewState.subject} 공부 중`
    : "공부할 과목을 선택해주세요";

  return el("section", { className: "study-cafe-my-seat-card", ariaLabel: "내 좌석 정보" }, [
    el("button", {
      className: "study-cafe-my-seat-character",
      type: "button",
      ariaLabel: "내 자리 상세 보기",
      onclick: () => openMyStudyCafeSeatDetail(student, seatNumber),
    }, [
      renderStudyCafeSeatedVisual(studyCafePreviewState.avatarTone || "navy", true, {
        className: "study-cafe-my-seat-scene",
        studying: studyCafePreviewState.running,
      }),
    ]),
    el("div", { className: "study-cafe-my-seat-copy" }, [
      el("span", { className: "study-cafe-my-seat-eyebrow" }, "내 좌석"),
      el("div", { className: "study-cafe-my-seat-title" }, [
        el("strong", { "data-study-cafe-my-seat-label": "true" }, seatLabel),
        el("span", { className: `study-cafe-my-seat-status ${studyCafePreviewState.paused ? "paused" : studyCafePreviewState.running ? "running" : "seated"}` }, statusLabel),
      ]),
      el("p", {}, [
        el("strong", {}, getStudyCafeDisplayName("나")),
        el("span", {}, ` · ${summarizeStudyCafeTrack(student?.track)}`),
      ]),
      el("div", { className: "study-cafe-my-seat-detail" }, [
        el("span", {}, detail),
      ]),
      active
        ? null
        : el("div", { className: "study-cafe-my-seat-idle-buttons" }, [
            button(
              "과목 선택",
              "study-cafe-my-seat-subject-button",
              "button",
              () => openStudyCafeSubjectModal(studyCafePreviewState.selectedSeatId, student)
            ),
            button(
              "자리 비우기",
              "study-cafe-my-seat-release-button",
              "button",
              releaseStudyCafeSeat
            ),
          ]),
    ]),
    el("div", { className: "study-cafe-my-seat-actions" }, [
      active
        ? button(
            "⛶ 전체화면",
            "study-cafe-my-seat-fullscreen-button",
            "button",
            openStudyTimerFullscreen
          )
        : null,
      el(
        "time",
        {
          "data-study-member-time": "mine",
          ariaLabel: "오늘 총 순공시간",
        },
        formatStudyCafeMemberTime(getStudyCafeMemberSeconds(null, true))
      ),
    ]),
  ]);
}

function getMyStudyCafeSeatNumber() {
  const seatIndex = STUDY_CAFE_PREVIEW_SEATS.findIndex(
    (seat) => seat.id === studyCafePreviewState.selectedSeatId
  );
  return seatIndex >= 0 ? seatIndex + 1 : 0;
}

function openMyStudyCafeSeatDetail(student = getAuthedStudent(), seatNumber = getMyStudyCafeSeatNumber()) {
  const resolvedSeatNumber = Math.max(0, Number(seatNumber) || 0);
  openStudyCafeMemberModal({
    name: getStudyCafeDisplayName("나"),
    fullTrack: student?.track || "온라인 수강",
    track: summarizeStudyCafeTrack(student?.track),
    tone: studyCafePreviewState.avatarTone || "navy",
    status: !resolvedSeatNumber
      ? "unseated"
      : studyCafePreviewState.paused
        ? "paused"
        : studyCafePreviewState.running
          ? "studying"
          : "seated",
    statusMessage: studyCafePreviewState.statusMessage || "",
    currentSubject: studyCafePreviewState.subject || "",
    todaySeconds: getStudyCafeMemberSeconds(null, true),
    isMine: true,
  }, resolvedSeatNumber, {
    rank: getStudyCafeRankingRoomRank(resolvedSeatNumber, student),
    seatLabel: resolvedSeatNumber ? "" : "좌석 미선택",
  });
}

function getStudyCafeRoomIndexForSeat(seatNumber) {
  const normalizedSeat = Math.min(
    STUDY_CAFE_SEAT_COUNT,
    Math.max(1, Number(seatNumber) || 1)
  );
  return normalizedSeat <= STUDY_CAFE_ROOM_SIZE
    ? STUDY_CAFE_RANKING_ROOM_INDEX
    : 1;
}

function getStudyCafeSeatOccupant(seat, seatNumber, student) {
  const isMine = seat.id === studyCafePreviewState.selectedSeatId;
  const remoteOccupant = studyCafeRemoteState.available === true
    ? studyCafeRemoteState.room?.find((member) => Number(member.seatNumber) === seatNumber)
    : null;
  if (isMine) {
    return {
      name: getStudyCafeDisplayName("나"),
      track: summarizeStudyCafeTrack(student?.track),
      fullTrack: student?.track || "온라인 수강",
      tone: studyCafePreviewState.avatarTone || "navy",
      status: studyCafePreviewState.running ? "studying" : studyCafePreviewState.paused ? "paused" : "seated",
      currentSubject: studyCafePreviewState.subject || "",
      remote: studyCafeRemoteState.available === true,
      isMine: true,
    };
  }
  if (studyCafeRemoteState.available === true) {
    return remoteOccupant && !remoteOccupant.isMine
      ? { ...remoteOccupant, remote: true, isMine: false }
      : null;
  }
  return isStudyCafeLocalPreview() && seat.occupant
    ? {
        ...seat.occupant,
        status: seat.occupant.status || "studying",
        remote: false,
        isMine: false,
      }
    : null;
}

function getStudyCafeRankingRoomEntries(student, options = {}) {
  const room = STUDY_CAFE_ROOMS[STUDY_CAFE_RANKING_ROOM_INDEX];
  const physicalSeats = STUDY_CAFE_PREVIEW_SEATS.slice(room.startSeat - 1, room.endSeat);
  const occupied = [];
  const empty = [];
  physicalSeats.forEach((seat, index) => {
    const physicalSeatNumber = room.startSeat + index;
    const occupant = getStudyCafeSeatOccupant(seat, physicalSeatNumber, student);
    const entry = { seat, physicalSeatNumber, occupant };
    if (occupant) {
      entry.seconds = getStudyCafeMemberSeconds(occupant, occupant.isMine === true);
      occupied.push(entry);
    } else {
      empty.push(entry);
    }
  });
  occupied.sort((a, b) =>
    b.seconds - a.seconds || a.physicalSeatNumber - b.physicalSeatNumber
  );
  const ranked = occupied.map((entry, index) => {
    const rank = index + 1;
    const previousRank = studyCafeRankingPreviousRanks.get(entry.physicalSeatNumber) || rank;
    return {
      ...entry,
      rank,
      rankChange: previousRank - rank,
    };
  });
  if (options.trackChanges === true) {
    studyCafeRankingPreviousRanks.clear();
    ranked.forEach((entry) => {
      studyCafeRankingPreviousRanks.set(entry.physicalSeatNumber, entry.rank);
    });
  }
  return [...ranked, ...empty];
}

function getStudyCafeRankingRoomRank(seatNumber, student = getAuthedStudent()) {
  if (getStudyCafeRoomIndexForSeat(seatNumber) !== STUDY_CAFE_RANKING_ROOM_INDEX) return 0;
  return getStudyCafeRankingRoomEntries(student).find(
    (entry) => entry.occupant && entry.physicalSeatNumber === Number(seatNumber)
  )?.rank || 0;
}

function getStudyCafeProspectiveRankingRoomRank(seatNumber, student = getAuthedStudent()) {
  const mySeconds = Math.floor(getStudySubjectTotalElapsedMs() / 1000);
  const occupied = getStudyCafeRankingRoomEntries(student)
    .filter((entry) => entry.occupant && entry.occupant.isMine !== true);
  return occupied.filter((entry) =>
    entry.seconds > mySeconds ||
    (entry.seconds === mySeconds && entry.physicalSeatNumber < Number(seatNumber))
  ).length + 1;
}

function formatStudyCafeSeatLabel(seatNumber, student = getAuthedStudent()) {
  if (getStudyCafeRoomIndexForSeat(seatNumber) !== STUDY_CAFE_RANKING_ROOM_INDEX) {
    return `${seatNumber}번 좌석`;
  }
  const rank = getStudyCafeRankingRoomRank(seatNumber, student);
  return rank ? `랭킹룸 ${rank}` : "랭킹룸";
}

function renderStudyCafeRoomSeatNodes(roomIndex, student, options = {}) {
  const room = STUDY_CAFE_ROOMS[roomIndex];
  if (roomIndex === STUDY_CAFE_RANKING_ROOM_INDEX) {
    return getStudyCafeRankingRoomEntries(student, options).map((entry) =>
      renderStudyCafeSeat(
        entry.seat,
        entry.physicalSeatNumber - 1,
        student,
        {
          rankingRoom: true,
          rank: entry.rank || 0,
          rankChange: entry.rankChange || 0,
          occupant: entry.occupant,
          readOnly: options.readOnly === true,
        }
      )
    );
  }
  return STUDY_CAFE_PREVIEW_SEATS
    .slice(room.startSeat - 1, room.endSeat)
    .map((seat, index) => renderStudyCafeSeat(seat, room.startSeat - 1 + index, student, {
      readOnly: options.readOnly === true,
    }));
}

function renderStudyCafeFirstUseGuide(roomIndex) {
  const rankingRoom = roomIndex === STUDY_CAFE_RANKING_ROOM_INDEX;
  return el("p", { className: "study-cafe-first-use-guide" }, [
    el("span", { ariaHidden: "true" }, "i"),
    rankingRoom
      ? "오늘 순공시간 순으로 좌석과 순위가 자동으로 바뀌는 방이에요."
      : "빈 좌석을 누른 뒤 공부할 과목을 선택하세요.",
  ]);
}

function getStudyCafeUsageStorageKey(baseKey, student = getAuthedStudent()) {
  const studentId = String(student?.id || state.settings.studentAuthId || "preview").trim();
  return `${baseKey}:${studentId || "preview"}`;
}

function hasUsedStudyCafe(student = getAuthedStudent()) {
  if (String(studyCafePreviewState.selectedSeatId).startsWith("seat-")) return true;
  try {
    return localStorage.getItem(getStudyCafeUsageStorageKey(STUDY_CAFE_USED_STORAGE_KEY, student)) === "true";
  } catch (_error) {
    return false;
  }
}

function markStudyCafeAsUsed(student = getAuthedStudent()) {
  try {
    localStorage.setItem(getStudyCafeUsageStorageKey(STUDY_CAFE_USED_STORAGE_KEY, student), "true");
  } catch (_error) {
    // Storage may be unavailable; the active seat still hides the guide.
  }
}

function hasUsedStudyCafeRankingRoom(student = getAuthedStudent()) {
  const selectedSeatNumber = STUDY_CAFE_PREVIEW_SEATS.findIndex(
    (seat) => seat.id === studyCafePreviewState.selectedSeatId
  ) + 1;
  if (
    selectedSeatNumber > 0 &&
    getStudyCafeRoomIndexForSeat(selectedSeatNumber) === STUDY_CAFE_RANKING_ROOM_INDEX
  ) {
    return true;
  }
  try {
    return localStorage.getItem(
      getStudyCafeUsageStorageKey(STUDY_CAFE_RANKING_USED_STORAGE_KEY, student)
    ) === "true";
  } catch (_error) {
    return false;
  }
}

function markStudyCafeRankingRoomAsUsed(student = getAuthedStudent()) {
  try {
    localStorage.setItem(
      getStudyCafeUsageStorageKey(STUDY_CAFE_RANKING_USED_STORAGE_KEY, student),
      "true"
    );
  } catch (_error) {
    // The current ranking-room seat still hides the guide when storage is unavailable.
  }
}

function getStudyCafeRoomOccupancyCount(roomIndex) {
  const room = STUDY_CAFE_ROOMS[roomIndex];
  if (!room) return 0;
  const selectedSeatNumber = STUDY_CAFE_PREVIEW_SEATS.findIndex(
    (seat) => seat.id === studyCafePreviewState.selectedSeatId
  ) + 1;
  if (studyCafeRemoteState.available === true) {
    return (studyCafeRemoteState.room || []).filter((member) => {
      const seatNumber = Number(member.seatNumber);
      return seatNumber >= room.startSeat && seatNumber <= room.endSeat;
    }).length;
  }
  const previewCount = isStudyCafeLocalPreview()
    ? STUDY_CAFE_PREVIEW_SEATS
      .slice(room.startSeat - 1, room.endSeat)
      .filter((seat) => seat.occupant).length
    : 0;
  const selectedSeatIsAdditional =
    selectedSeatNumber >= room.startSeat &&
    selectedSeatNumber <= room.endSeat &&
    !STUDY_CAFE_PREVIEW_SEATS[selectedSeatNumber - 1]?.occupant;
  return previewCount + (selectedSeatIsAdditional ? 1 : 0);
}

function getStudyCafeRoomContextText(roomIndex, selectedSeatNumber) {
  const room = STUDY_CAFE_ROOMS[roomIndex] || STUDY_CAFE_ROOMS[0];
  const myRoomIndex = selectedSeatNumber ? getStudyCafeRoomIndexForSeat(selectedSeatNumber) : -1;
  if (selectedSeatNumber && myRoomIndex !== roomIndex) {
    return `${room.label} 둘러보는 중 · 내 좌석 ${formatStudyCafeSeatLabel(selectedSeatNumber)}`;
  }
  if (roomIndex === STUDY_CAFE_RANKING_ROOM_INDEX) {
    const myRank = selectedSeatNumber
      ? getStudyCafeRankingRoomRank(selectedSeatNumber)
      : 0;
    if (myRank && studyCafePreviewState.subject) return `랭킹룸 · 순위 ${myRank} · 집중 중`;
    if (myRank) return `랭킹룸 · 순위 ${myRank} · 다음 과목 선택 대기 중`;
    if (studyCafePreviewState.pendingSubject) {
      return `${studyCafePreviewState.pendingSubject} 공부할 랭킹룸 빈자리를 선택하세요`;
    }
    return "빈자리를 선택하면 랭킹룸에 입장합니다";
  }
  if (studyCafePreviewState.subject) return `${selectedSeatNumber}번 좌석에서 집중 중`;
  if (selectedSeatNumber) return `${selectedSeatNumber}번 좌석에서 다음 과목 선택 대기 중`;
  if (studyCafePreviewState.pendingSubject) {
    return `${studyCafePreviewState.pendingSubject} 공부할 빈자리를 선택하세요`;
  }
  return `${room.label}의 빈자리를 선택하세요`;
}

function renderStudyCafeRoomTabs(student) {
  const selectedSeatNumber = STUDY_CAFE_PREVIEW_SEATS.findIndex(
    (seat) => seat.id === studyCafePreviewState.selectedSeatId
  ) + 1;
  const myRoomIndex = selectedSeatNumber ? getStudyCafeRoomIndexForSeat(selectedSeatNumber) : -1;
  return el(
    "nav",
    { className: "study-cafe-room-tabs", ariaLabel: "스터디카페 룸 선택" },
    STUDY_CAFE_ROOMS.map((room, index) => {
      const isActive = index === studyCafePreviewState.activeRoomIndex;
      const tab = el(
        "button",
        {
          className: `study-cafe-room-tab ${index === STUDY_CAFE_RANKING_ROOM_INDEX ? "ranking" : ""} ${isActive ? "active" : ""} ${index === myRoomIndex ? "has-my-seat" : ""}`,
          type: "button",
          "data-study-cafe-room-index": String(index),
          "aria-selected": isActive ? "true" : "false",
          title: `${room.label} · ${room.mood}`,
          onclick: () => selectStudyCafeRoom(index, student),
        },
        [
          el("strong", {}, room.label),
          el("span", {}, `${getStudyCafeRoomOccupancyCount(index)}/${room.endSeat - room.startSeat + 1}`),
          index === myRoomIndex
            ? el("i", {}, index === STUDY_CAFE_RANKING_ROOM_INDEX
                ? String(getStudyCafeRankingRoomRank(selectedSeatNumber, student))
                : "내 좌석")
            : null,
        ]
      );
      return tab;
    })
  );
}

function openStudyCafeRankingGuideModal() {
  openInfoModal({
    title: "랭킹룸 이용 안내",
    className: "study-cafe-ranking-guide-modal",
    confirmLabel: "확인했어요",
    content: el("div", { className: "study-cafe-ranking-guide-content" }, [
      el("p", { className: "study-cafe-ranking-guide-summary" }, "오늘 공부한 순공시간을 기준으로 함께 집중하는 공간이에요."),
      el("div", { className: "study-cafe-ranking-guide-list" }, [
        el("article", {}, [
          el("span", { ariaHidden: "true" }, "1"),
          el("div", {}, [
            el("strong", {}, "오늘 순공시간으로 순위 결정"),
            el("p", {}, "오늘 누적된 순공시간이 긴 순서대로 좌석과 순위가 정해집니다."),
          ]),
        ]),
        el("article", {}, [
          el("span", { ariaHidden: "true" }, "↻"),
          el("div", {}, [
            el("strong", {}, "순위는 15초마다 갱신"),
            el("p", {}, "공부시간이 쌓이면 내 위치와 다른 수강생의 위치가 자동으로 바뀝니다."),
          ]),
        ]),
        el("article", {}, [
          el("span", { ariaHidden: "true" }, "✓"),
          el("div", {}, [
            el("strong", {}, "빈자리를 눌러 바로 입장"),
            el("p", {}, "현재 기록에 맞는 예상 순위를 확인한 뒤 입장하며, 공부 중 이동해도 타이머는 유지됩니다."),
          ]),
        ]),
      ]),
    ]),
  });
}

function selectStudyCafeRoom(roomIndex, student) {
  const nextIndex = Math.min(STUDY_CAFE_ROOMS.length - 1, Math.max(0, Number(roomIndex) || 0));
  if (nextIndex === studyCafePreviewState.activeRoomIndex) return;
  studyCafePreviewState.activeRoomIndex = nextIndex;

  document.querySelectorAll("[data-study-cafe-room-index]").forEach((tab) => {
    const isActive = Number(tab.dataset.studyCafeRoomIndex) === nextIndex;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  const room = STUDY_CAFE_ROOMS[nextIndex];
  const roomElement = document.querySelector("[data-study-cafe-room]");
  if (roomElement) {
    roomElement.classList.remove(...STUDY_CAFE_ROOM_THEMES.map(({ theme }) => `theme-${theme}`));
    roomElement.classList.add(`theme-${room.theme}`);
    roomElement.classList.toggle("ranking-room", nextIndex === STUDY_CAFE_RANKING_ROOM_INDEX);
    roomElement.setAttribute("aria-label", `${room.label} ${room.mood} 좌석 배치`);
  }
  const roomMood = document.querySelector("[data-study-cafe-room-mood]");
  if (roomMood) roomMood.textContent = `${room.label} · ${room.mood}`;
  const rankingHelp = document.querySelector("[data-study-cafe-ranking-help]");
  if (rankingHelp) rankingHelp.hidden = nextIndex !== STUDY_CAFE_RANKING_ROOM_INDEX;
  const seatGrid = document.querySelector("[data-study-cafe-seat-grid]");
  if (seatGrid) {
    seatGrid.replaceChildren(
      ...renderStudyCafeRoomSeatNodes(nextIndex, student, {
        trackChanges: nextIndex === STUDY_CAFE_RANKING_ROOM_INDEX,
      })
    );
    seatGrid.classList.remove("room-changed");
    void seatGrid.offsetWidth;
    seatGrid.classList.add("room-changed");
  }

  const selectedSeatNumber = STUDY_CAFE_PREVIEW_SEATS.findIndex(
    (seat) => seat.id === studyCafePreviewState.selectedSeatId
  ) + 1;
  const context = document.querySelector("[data-study-cafe-room-context]");
  if (context) context.textContent = getStudyCafeRoomContextText(nextIndex, selectedSeatNumber);
  const firstUseGuide = document.querySelector("[data-study-cafe-first-use-guide]");
  if (firstUseGuide) {
    const showRankingGuide =
      nextIndex === STUDY_CAFE_RANKING_ROOM_INDEX &&
      !hasUsedStudyCafeRankingRoom(student);
    const showStandardGuide =
      nextIndex !== STUDY_CAFE_RANKING_ROOM_INDEX &&
      !studyRoomState.browsingPublicCafe &&
      !hasUsedStudyCafe(student);
    firstUseGuide.replaceChildren(
      ...(showRankingGuide || showStandardGuide
        ? [renderStudyCafeFirstUseGuide(nextIndex)]
        : [])
    );
  }
}

function renderStudentStudyTimer() {
  const student = getAuthedStudent();
  if (!isOnlineStudentExperience(student)) {
    return el("div", { className: "grid student-view student-study-cafe-access" }, [
      el("section", { className: "student-study-cafe-access-card" }, [
        el("span", { className: "study-cafe-access-icon", ariaHidden: "true" }, "⏱"),
        el("h2", {}, "온라인 수강생 전용 타이머입니다"),
        el("p", {}, "과목별 순공시간 타이머는 등록번호가 2로 시작하는 인터넷 강의 수강생만 이용할 수 있습니다."),
        button("홈으로", "btn secondary", "button", () => navigate("home")),
      ]),
    ]);
  }

  ensureStudyCafeRemoteLoaded();
  ensureStudyCafePreviewClock();
  const subjects = getStudyTimerSubjects(student);
  const active = Boolean(studyCafePreviewState.selectedSeatId && studyCafePreviewState.subject);
  const timerContent = [
    el("section", { className: "study-timer-total-card" }, [
      button("전체화면", "study-timer-fullscreen-button", "button", openStudyTimerFullscreen),
      el("span", {}, "오늘 총 순공시간"),
      el(
        "time",
        { "data-study-total-time": "true" },
        formatStudyCafeElapsed(getStudySubjectTotalElapsedMs())
      ),
      el("p", {}, active ? `${studyCafePreviewState.subject} 과목을 측정하고 있어요.` : "공부할 과목의 시작 버튼을 눌러주세요."),
    ]),
    el("section", { className: "study-subject-timer-card" }, [
      el("div", { className: "study-subject-timer-card-head" }, [
        el("strong", {}, "과목별 타이머"),
        el("div", { className: "study-subject-timer-card-tools" }, [
          el("span", {}, `${subjects.length}개 직렬 과목`),
        ]),
      ]),
      el(
        "div",
        { className: "study-subject-timer-list" },
        subjects.map((subject, index) => renderStudySubjectTimerRow(subject, index, student))
      ),
    ]),
    el("p", { className: "study-timer-footnote" }, "과목을 바꿔도 현재 좌석과 오늘 총 순공시간은 그대로 유지됩니다."),
    studyCafePreviewState.timerFullscreen ? renderStudyTimerFullscreen(student) : null,
  ];
  return el("div", { className: "student-study-timer-page" }, [
    el("header", { className: "study-timer-page-head" }, [
      el("div", {}, [
        el("span", {}, "매일 오전 4시에 하루 기록이 새로 시작됩니다"),
        el("h2", {}, studyTimerStatsState.mode === "stats" ? "타이머 통계" : "과목 타이머"),
      ]),
      active ? el("span", { className: "study-timer-active-chip" }, studyCafePreviewState.paused ? "일시정지" : "측정 중") : null,
    ]),
    renderStudyTimerModeTabs(),
    ...(studyTimerStatsState.mode === "stats" ? [renderStudyTimerStats()] : timerContent),
  ]);
}

function renderStudyTimerModeTabs() {
  return el("nav", { className: "study-timer-mode-tabs", ariaLabel: "타이머 화면 선택" }, [
    button(
      "타이머",
      `study-timer-mode-button ${studyTimerStatsState.mode === "timer" ? "active" : ""}`,
      "button",
      () => {
        studyTimerStatsState.mode = "timer";
        render();
      }
    ),
    button(
      "통계",
      `study-timer-mode-button ${studyTimerStatsState.mode === "stats" ? "active" : ""}`,
      "button",
      () => {
        studyTimerStatsState.mode = "stats";
        studyCafePreviewState.timerFullscreen = false;
        render();
      }
    ),
  ]);
}

function renderStudyTimerStats() {
  const range = getStudyTimerStatsRange();
  const key = `${range.dateFrom}:${range.dateTo}`;
  const data = studyTimerStatsState.cache[key];
  requestStudyTimerStats(range, key);
  return el("div", { className: "study-timer-stats-view" }, [
    el("nav", { className: "study-timer-stats-periods", ariaLabel: "통계 기간 선택" }, [
      renderStudyTimerStatsPeriodButton("daily", "일간"),
      renderStudyTimerStatsPeriodButton("weekly", "주간"),
      renderStudyTimerStatsPeriodButton("monthly", "월간"),
    ]),
    el("section", { className: "study-timer-stats-calendar-card" }, [
      el("div", { className: "study-timer-stats-date-nav" }, [
        button("‹", "study-timer-stats-date-button", "button", () => shiftStudyTimerStatsDate(-1)),
        el("strong", {}, formatStudyTimerStatsRangeLabel(range)),
        el("button", {
          className: "study-timer-stats-date-button",
          type: "button",
          textContent: "›",
          disabled: !canMoveStudyTimerStatsForward(range),
          ariaLabel: "다음 기간",
          onclick: () => shiftStudyTimerStatsDate(1),
        }),
      ]),
      !data
        ? el("div", { className: "study-timer-stats-loading" }, [
            el("span", { className: "loading-spinner", ariaHidden: "true" }),
            el("p", {}, "공부 기록을 불러오는 중입니다."),
          ])
        : studyTimerStatsState.period === "monthly"
          ? renderStudyTimerMonthlyCalendar(data)
          : studyTimerStatsState.period === "weekly"
            ? renderStudyTimerWeeklyChart(data)
            : renderStudyTimerDailyOverview(data),
    ]),
    data ? renderStudyTimerStatsSummary(data) : null,
    data ? renderStudyTimerSubjectStats(data) : null,
    studyTimerStatsState.error
      ? el("p", { className: "study-timer-stats-note" }, studyTimerStatsState.error)
      : null,
  ]);
}

function renderStudyTimerStatsPeriodButton(period, label) {
  return button(
    label,
    `study-timer-stats-period-button ${studyTimerStatsState.period === period ? "active" : ""}`,
    "button",
    () => {
      studyTimerStatsState.period = period;
      studyTimerStatsState.anchorDate = parseStudyTimerDateKey(formatStudyBusinessDateKey(new Date()));
      studyTimerStatsState.error = "";
      renderStudyCafeStateUpdate();
    }
  );
}

function renderStudyTimerDailyOverview(data) {
  const day = data.days?.[0] || {};
  return el("div", { className: "study-timer-daily-overview" }, [
    el("div", { className: "study-timer-daily-total" }, [
      el("span", {}, formatStudyTimerStatsDayLabel(day.date)),
      el("strong", {}, formatStudyCafeElapsed((day.totalSeconds || 0) * 1000)),
      el("p", {}, day.totalSeconds ? `${day.sessionCount || 0}번 집중한 순공시간` : "아직 기록된 공부시간이 없습니다."),
    ]),
    el("div", { className: "study-timer-daily-details" }, [
      renderStudyTimerDailyMetric("최대 집중시간", formatStudyCafeElapsed((day.longestSeconds || 0) * 1000)),
      renderStudyTimerDailyMetric("시작시간", formatStudyTimerStatsClock(day.firstStartedAt)),
      renderStudyTimerDailyMetric("종료시간", formatStudyTimerStatsClock(day.lastEndedAt)),
    ]),
  ]);
}

function renderStudyTimerDailyMetric(label, value) {
  return el("div", {}, [
    el("span", {}, label),
    el("strong", {}, value || "-"),
  ]);
}

function renderStudyTimerWeeklyChart(data) {
  const days = Array.isArray(data.days) ? data.days : [];
  const maximum = Math.max(1, ...days.map((day) => Number(day.totalSeconds) || 0));
  return el("div", { className: "study-timer-weekly-chart" }, [
    el(
      "div",
      { className: "study-timer-weekly-bars" },
      days.map((day) => {
        const seconds = Number(day.totalSeconds) || 0;
        const height = seconds ? Math.max(10, Math.round((seconds / maximum) * 100)) : 4;
        return el("div", { className: `study-timer-weekly-day ${seconds ? "studied" : ""}` }, [
          el("time", {}, seconds ? formatStudyCafeCompactDuration(seconds) : "-"),
          el("span", { className: "study-timer-weekly-bar-track" }, [
            el("i", { style: `height:${height}%` }),
          ]),
          el("strong", {}, formatStudyTimerStatsWeekday(day.date)),
          el("small", {}, String(Number(day.date?.slice(-2)) || "")),
        ]);
      })
    ),
  ]);
}

function renderStudyTimerMonthlyCalendar(data) {
  const days = Array.isArray(data.days) ? data.days : [];
  const firstDate = parseStudyTimerDateKey(days[0]?.date);
  const leading = firstDate ? firstDate.getDay() : 0;
  const maximum = Math.max(1, ...days.map((day) => Number(day.totalSeconds) || 0));
  return el("div", { className: "study-timer-monthly-calendar" }, [
    el(
      "div",
      { className: "study-timer-monthly-weekdays" },
      ["일", "월", "화", "수", "목", "금", "토"].map((day) => el("span", {}, day))
    ),
    el("div", { className: "study-timer-monthly-days" }, [
      ...Array.from({ length: leading }, () => el("span", { className: "study-timer-monthly-day blank" })),
      ...days.map((day) => {
        const seconds = Number(day.totalSeconds) || 0;
        const level = seconds ? Math.max(1, Math.ceil((seconds / maximum) * 4)) : 0;
        const isToday = day.date === formatStudyBusinessDateKey(new Date());
        return el("article", {
          className: `study-timer-monthly-day level-${level} ${isToday ? "today" : ""}`,
          title: `${day.date} ${formatStudyCafeElapsed(seconds * 1000)}`,
        }, [
          el("strong", {}, String(Number(day.date?.slice(-2)) || "")),
          seconds ? el("time", {}, formatStudyCafeCompactDuration(seconds)) : null,
        ]);
      }),
    ]),
    el("div", { className: "study-timer-monthly-legend" }, [
      el("span", {}, "적게"),
      ...[0, 1, 2, 3, 4].map((level) => el("i", { className: `level-${level}` })),
      el("span", {}, "많이"),
    ]),
  ]);
}

function renderStudyTimerStatsSummary(data) {
  const summary = data.summary || {};
  const periodLabel = studyTimerStatsState.period === "daily"
    ? "선택일"
    : studyTimerStatsState.period === "weekly"
      ? "선택 주"
      : "선택 월";
  return el("section", { className: "study-timer-stats-summary" }, [
    el("div", { className: "study-timer-stats-summary-head" }, [
      el("span", {}, periodLabel),
      el("strong", {}, `${data.dateFrom} ~ ${data.dateTo}`),
    ]),
    el("div", { className: "study-timer-stats-summary-grid" }, [
      renderStudyTimerStatsMetric("총 순공시간", formatStudyCafeElapsed((summary.totalSeconds || 0) * 1000)),
      renderStudyTimerStatsMetric("공부한 날", `${summary.studiedDays || 0}일`),
      renderStudyTimerStatsMetric("하루 평균", formatStudyCafeElapsed((summary.dailyAverageSeconds || 0) * 1000)),
      renderStudyTimerStatsMetric("최고 기록", formatStudyCafeElapsed((summary.maxDailySeconds || 0) * 1000)),
    ]),
  ]);
}

function renderStudyTimerStatsMetric(label, value) {
  return el("div", {}, [
    el("span", {}, label),
    el("strong", {}, value),
  ]);
}

function renderStudyTimerSubjectStats(data) {
  const entries = Object.entries(data.subjectTotals || {})
    .map(([subject, seconds]) => ({ subject, seconds: Number(seconds) || 0 }))
    .filter((item) => item.seconds > 0)
    .sort((left, right) => right.seconds - left.seconds);
  const maximum = Math.max(1, ...entries.map((item) => item.seconds));
  return el("section", { className: "study-timer-subject-stats" }, [
    el("div", { className: "study-timer-subject-stats-head" }, [
      el("strong", {}, "과목별 순공시간"),
      el("span", {}, `${entries.length}개 과목`),
    ]),
    entries.length
      ? el("div", { className: "study-timer-subject-stats-list" }, entries.map((item, index) =>
          el("article", {}, [
            el("span", { className: `study-timer-subject-stat-dot tone-${index % 6}` }),
            el("strong", {}, item.subject),
            el("span", { className: "study-timer-subject-stat-bar" }, [
              el("i", { style: `width:${Math.max(5, Math.round((item.seconds / maximum) * 100))}%` }),
            ]),
            el("time", {}, formatStudyCafeElapsed(item.seconds * 1000)),
          ])
        ))
      : el("div", { className: "empty" }, "이 기간에는 과목별 공부 기록이 없습니다."),
  ]);
}

async function requestStudyTimerStats(range, key) {
  if (studyTimerStatsState.cache[key] || studyTimerStatsState.loadingKey === key) return;
  studyTimerStatsState.loadingKey = key;
  studyTimerStatsState.error = "";
  try {
    const result = await requestStudyCafeAction("stats", range);
    if (result.ok) {
      studyTimerStatsState.cache[key] = result;
    } else {
      studyTimerStatsState.cache[key] = buildLocalStudyTimerStats(range);
      if (studyCafeRemoteState.available === true) {
        studyTimerStatsState.error = "통계 서버에서 기록을 불러오지 못해 현재 기기의 오늘 기록만 표시합니다.";
      }
    }
  } catch (error) {
    console.error(error);
    studyTimerStatsState.cache[key] = buildLocalStudyTimerStats(range);
    studyTimerStatsState.error = "현재 기기의 오늘 기록만 표시합니다.";
  } finally {
    studyTimerStatsState.loadingKey = "";
    if (currentRoute === "study-timer" && studyTimerStatsState.mode === "stats") render();
  }
}

function buildLocalStudyTimerStats(range) {
  const dateKeys = enumerateStudyTimerDateKeys(range.dateFrom, range.dateTo);
  const todayKey = formatStudyBusinessDateKey(new Date());
  const todaySeconds = Math.floor(getStudySubjectTotalElapsedMs() / 1000);
  const subjectTotals = {};
  Object.keys(studyCafePreviewState.subjectElapsedMs || {}).forEach((subject) => {
    const seconds = Math.floor(getStudySubjectElapsedMs(subject) / 1000);
    if (seconds) subjectTotals[subject] = seconds;
  });
  const days = dateKeys.map((date) => ({
    date,
    totalSeconds: date === todayKey ? todaySeconds : 0,
    longestSeconds: 0,
    sessionCount: date === todayKey && todaySeconds ? 1 : 0,
    firstStartedAt: "",
    lastEndedAt: "",
    subjects: date === todayKey ? subjectTotals : {},
  }));
  const studiedDays = days.filter((day) => day.totalSeconds > 0).length;
  return {
    ok: true,
    localOnly: true,
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
    days,
    subjectTotals: dateKeys.includes(todayKey) ? subjectTotals : {},
    summary: {
      totalSeconds: dateKeys.includes(todayKey) ? todaySeconds : 0,
      studiedDays,
      dailyAverageSeconds: studiedDays ? todaySeconds : 0,
      maxDailySeconds: dateKeys.includes(todayKey) ? todaySeconds : 0,
      sessionCount: todaySeconds ? 1 : 0,
    },
  };
}

function getStudyTimerStatsRange() {
  const anchor = new Date(studyTimerStatsState.anchorDate);
  anchor.setHours(12, 0, 0, 0);
  let start = new Date(anchor);
  let end = new Date(anchor);
  if (studyTimerStatsState.period === "weekly") {
    const weekday = start.getDay() || 7;
    start.setDate(start.getDate() - weekday + 1);
    end = new Date(start);
    end.setDate(end.getDate() + 6);
  } else if (studyTimerStatsState.period === "monthly") {
    start = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12);
    end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 12);
  }
  return {
    dateFrom: formatStudyTimerDateKey(start),
    dateTo: formatStudyTimerDateKey(end),
  };
}

function shiftStudyTimerStatsDate(amount) {
  const next = new Date(studyTimerStatsState.anchorDate);
  if (studyTimerStatsState.period === "monthly") {
    next.setMonth(next.getMonth() + amount, 1);
  } else if (studyTimerStatsState.period === "weekly") {
    next.setDate(next.getDate() + amount * 7);
  } else {
    next.setDate(next.getDate() + amount);
  }
  studyTimerStatsState.anchorDate = next;
  studyTimerStatsState.error = "";
  render();
}

function canMoveStudyTimerStatsForward(range) {
  return range.dateTo < formatStudyBusinessDateKey(new Date());
}

function formatStudyTimerStatsRangeLabel(range) {
  const start = parseStudyTimerDateKey(range.dateFrom);
  const end = parseStudyTimerDateKey(range.dateTo);
  if (!start || !end) return "";
  if (studyTimerStatsState.period === "monthly") {
    return `${start.getFullYear()}년 ${start.getMonth() + 1}월`;
  }
  if (studyTimerStatsState.period === "weekly") {
    return `${start.getMonth() + 1}.${start.getDate()} – ${end.getMonth() + 1}.${end.getDate()}`;
  }
  return `${start.getFullYear()}년 ${start.getMonth() + 1}월 ${start.getDate()}일`;
}

function formatStudyTimerStatsDayLabel(dateKey) {
  const date = parseStudyTimerDateKey(dateKey);
  if (!date) return "선택한 날짜";
  return `${date.getMonth() + 1}월 ${date.getDate()}일 (${new Intl.DateTimeFormat("ko-KR", { weekday: "short" }).format(date)})`;
}

function formatStudyTimerStatsWeekday(dateKey) {
  const date = parseStudyTimerDateKey(dateKey);
  return date ? new Intl.DateTimeFormat("ko-KR", { weekday: "short" }).format(date).replace("요일", "") : "";
}

function formatStudyTimerStatsClock(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function formatStudyCafeCompactDuration(seconds) {
  const totalMinutes = Math.floor(Math.max(0, Number(seconds) || 0) / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes}분`;
  return minutes ? `${hours}시간 ${minutes}분` : `${hours}시간`;
}

function formatStudyTimerDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatStudyBusinessDateKey(value = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const shiftedKst = new Date(date.getTime() + 5 * 60 * 60 * 1000);
  return [
    shiftedKst.getUTCFullYear(),
    String(shiftedKst.getUTCMonth() + 1).padStart(2, "0"),
    String(shiftedKst.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function parseStudyTimerDateKey(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
}

function enumerateStudyTimerDateKeys(dateFrom, dateTo) {
  const start = parseStudyTimerDateKey(dateFrom);
  const end = parseStudyTimerDateKey(dateTo);
  if (!start || !end) return [];
  const keys = [];
  for (const cursor = new Date(start); cursor <= end && keys.length < 62; cursor.setDate(cursor.getDate() + 1)) {
    keys.push(formatStudyTimerDateKey(cursor));
  }
  return keys;
}

function invalidateStudyTimerStatsCache() {
  const today = formatStudyBusinessDateKey(new Date());
  Object.keys(studyTimerStatsState.cache).forEach((key) => {
    const [dateFrom, dateTo] = key.split(":");
    if (dateFrom <= today && dateTo >= today) delete studyTimerStatsState.cache[key];
  });
}

function openStudyTimerFullscreen() {
  if (!studyCafePreviewState.selectedSeatId || !studyCafePreviewState.subject) {
    return notify("과목 타이머를 먼저 시작해주세요.");
  }
  studyTimerStatsState.mode = "timer";
  studyCafePreviewState.timerFullscreenReturnRoute = currentRoute === "study-cafe" ? "study-cafe" : "";
  studyCafePreviewState.timerFullscreen = true;
  if (currentRoute !== "study-timer") {
    navigate("study-timer");
    return;
  }
  render();
}

function closeStudyTimerFullscreen() {
  const returnRoute = studyCafePreviewState.timerFullscreenReturnRoute;
  studyCafePreviewState.timerFullscreen = false;
  studyCafePreviewState.timerFullscreenReturnRoute = "";
  if (returnRoute === "study-cafe" && currentRoute !== returnRoute) {
    navigate(returnRoute);
    return;
  }
  render();
}

function renderStudyTimerFullscreen(student) {
  const seatNumber = STUDY_CAFE_PREVIEW_SEATS.findIndex(
    (seat) => seat.id === studyCafePreviewState.selectedSeatId
  ) + 1;
  const status = studyCafePreviewState.running
    ? "집중 중"
    : studyCafePreviewState.paused
      ? "일시정지"
      : "시작 준비";
  return el("section", { className: "study-timer-fullscreen", ariaLabel: "타이머 전체화면 모드" }, [
    el("header", { className: "study-timer-fullscreen-head" }, [
      el("div", {}, [
        el("span", {}, "RONPARK FOCUS TIMER"),
        el("strong", {}, "과목별 순공시간"),
      ]),
      button("전체화면 닫기", "study-timer-fullscreen-close", "button", closeStudyTimerFullscreen),
    ]),
    el("main", { className: "study-timer-fullscreen-main" }, [
      el("span", { className: `study-timer-fullscreen-status ${studyCafePreviewState.running ? "running" : ""}` }, `● ${status}`),
      el("h2", {}, studyCafePreviewState.subject),
      el(
        "time",
        { className: "study-timer-fullscreen-clock", "data-study-cafe-clock": "true" },
        formatStudyCafeElapsed(getStudySubjectElapsedMs(studyCafePreviewState.subject))
      ),
      el("p", {}, `${student?.name || "나"} · ${formatStudyCafeSeatLabel(seatNumber, student)}`),
      el("div", { className: "study-timer-fullscreen-actions" }, [
        button(
          studyCafePreviewState.paused ? "다시 시작" : "일시정지",
          "btn secondary",
          "button",
          toggleStudyCafePreviewTimer
        ),
        button("과목 변경", "btn secondary", "button", () => {
          openStudyCafeSubjectModal(studyCafePreviewState.selectedSeatId, student, { preserveTimer: true });
        }),
        button("과목 종료", "btn", "button", stopStudyCafePreviewTimer),
      ]),
      el("div", { className: "study-timer-fullscreen-total" }, [
        el("span", {}, "오늘 총 순공시간"),
        el("time", { "data-study-total-time": "true" }, formatStudyCafeElapsed(getStudySubjectTotalElapsedMs())),
      ]),
    ]),
  ]);
}

function renderStudySubjectTimerRow(subject, index, student) {
  const isCurrent = studyCafePreviewState.subject === subject && Boolean(studyCafePreviewState.selectedSeatId);
  const isRunning = isCurrent && studyCafePreviewState.running;
  const todos = getStudyTodosForDate(studyCafeRemoteState.studyDateKey)
    .filter((todo) => todo.subject === subject);
  const completedTodoCount = todos.filter((todo) => todo.completed).length;
  const tones = ["coral", "purple", "teal", "amber", "blue", "mint", "navy", "rose"];
  const tone = tones[index % tones.length];
  const actionLabel = isRunning ? `${subject} 일시정지` : isCurrent ? `${subject} 다시 시작` : `${subject} 공부 시작`;
  return el("article", { className: `study-subject-timer-row ${isCurrent ? "active" : ""}` }, [
    el(
      "button",
      {
        className: `study-subject-play-button ${tone} ${isRunning ? "pause" : ""}`,
        type: "button",
        ariaLabel: actionLabel,
        onclick: () => handleStudySubjectTimerAction(subject, student),
      },
      isRunning ? "Ⅱ" : "▶"
    ),
    el("strong", {}, subject),
    el(
      "time",
      {
        "data-study-subject-time": subject,
      },
      formatStudyCafeElapsed(getStudySubjectElapsedMs(subject))
    ),
    isCurrent
      ? el("div", { className: "study-subject-timer-actions" }, [
          el("span", { className: "study-subject-current-dot", ariaLabel: "현재 선택 과목" }, "●"),
          button("■ 종료", "study-subject-stop-button", "button", (event) => {
            event.stopPropagation();
            stopStudyCafePreviewTimer();
          }),
        ])
      : null,
    todos.length
      ? el("div", { className: "study-timer-subject-todos" }, [
          el("div", { className: "study-timer-subject-todos-head" }, [
            el("strong", {}, "오늘 할 일"),
            el("span", {}, `${completedTodoCount}/${todos.length} 완료`),
          ]),
          el(
            "div",
            { className: "study-timer-subject-todo-list" },
            todos.map((todo) => renderStudyTimerTodoItem(todo))
          ),
        ])
      : null,
  ]);
}

function renderStudyTimerTodoItem(todo) {
  const checkbox = el("input", {
    type: "checkbox",
    checked: Boolean(todo.completed),
    ariaLabel: `${todo.content} 완료`,
  });
  checkbox.addEventListener("change", () => updateStudyTodoCompletion(todo, checkbox));
  return el("label", {
    className: `study-timer-subject-todo ${todo.completed ? "completed" : ""}`,
  }, [
    checkbox,
    el("span", {}, todo.content),
  ]);
}

function handleStudySubjectTimerAction(subject, student) {
  const seated = Boolean(studyCafePreviewState.selectedSeatId);
  const active = Boolean(studyCafePreviewState.selectedSeatId && studyCafePreviewState.subject);
  if (active && studyCafePreviewState.subject === subject) {
    toggleStudyCafePreviewTimer();
    return;
  }
  if (active) {
    applyStudyCafeSubjectSelection(studyCafePreviewState.selectedSeatId, subject, { preserveTimer: true });
    render();
    notify(`${subject} 과목으로 변경을 준비합니다.`);
    return;
  }
  if (seated) {
    applyStudyCafeSubjectSelection(studyCafePreviewState.selectedSeatId, subject);
    render();
    notify(`${subject} 공부를 준비합니다.`);
    return;
  }
  studyCafePreviewState.pendingSubject = subject;
  navigate("study-cafe");
  notify(`${subject} 공부를 시작할 빈 좌석을 선택해주세요.`);
}

function renderStudentStudyCharacter() {
  const student = getAuthedStudent();
  if (!isOnlineStudentExperience(student)) {
    return el("div", { className: "grid student-view student-study-cafe-access" }, [
      el("section", { className: "student-study-cafe-access-card" }, [
        el("span", { className: "study-cafe-access-icon", ariaHidden: "true" }, "🙂"),
        el("h2", {}, "온라인 수강생 전용 캐릭터입니다"),
        el("p", {}, "스터디카페 캐릭터는 등록번호가 2로 시작하는 인터넷 강의 수강생만 설정할 수 있습니다."),
        button("홈으로", "btn secondary", "button", () => navigate("home")),
      ]),
    ]);
  }

  ensureStudyCafeRemoteLoaded();
  ensureStudyCafeShopLoaded();
  const options = [
    { tone: "navy", label: "론박 블루" },
    { tone: "blue", label: "스카이" },
    { tone: "mint", label: "민트" },
    { tone: "purple", label: "퍼플" },
    { tone: "orange", label: "오렌지" },
    { tone: "rose", label: "로즈" },
  ];
  const characterName = getStudyCafeDisplayName(student.name || "나");
  return el("div", { className: "student-study-character-page" }, [
    el("div", { className: "study-character-page-head" }, [
      button("← 마이", "study-character-back-button", "button", () => navigate("mypage")),
      renderStudyCafeShopChip(student),
    ]),
    studyCafeShopState.available === false
      ? null
      : el("section", { className: "study-character-shop-link" }, [
          el("div", {}, [
            el("strong", {}, "순공 포인트로 꾸미기"),
            el("span", {}, "의상과 모자, 책상 소품, 의자로 공부 공간을 꾸며보세요."),
          ]),
          button("상점 가기", "study-character-shop-button", "button", () => openStudyCafeShop("study-character")),
        ]),
    el("section", { className: "study-character-preview-card" }, [
      el("span", {}, "MY CHARACTER"),
      el("div", {
        className: `study-character-preview-avatar study-cafe-member-avatar-stage ${studyCafePreviewState.statusMessage ? "has-status-message" : ""}`.trim(),
      }, [
        studyCafePreviewState.statusMessage
          ? el("button", {
              className: "study-character-status-message has-message",
              type: "button",
              onclick: openStudyCafeStatusMessageEditor,
              ariaLabel: "상태메시지 수정",
            }, [
              el("span", { "data-study-character-status-message": "true" }, studyCafePreviewState.statusMessage),
              el("i", { ariaHidden: "true" }, "수정"),
            ])
          : null,
        el("button", {
          className: "study-character-seat-detail-button",
          type: "button",
          ariaLabel: "내 좌석 상세 보기",
          onclick: () => openMyStudyCafeSeatDetail(student),
        }, [
          renderStudyCafeSeatedVisual(studyCafePreviewState.avatarTone || "navy", true, {
            className: "study-cafe-member-seat-scene",
            studying: false,
            showWritingArms: true,
          }),
        ]),
      ]),
      el("div", { className: "study-character-name-row" }, [
        el("h2", { "data-study-character-name": "true" }, `${characterName}의 캐릭터`),
        el(
          "button",
          {
            className: "study-character-name-edit-button",
            type: "button",
            ariaLabel: "닉네임 수정",
            title: "닉네임 수정",
            onclick: openStudyCafeNicknameEditor,
          },
          el("span", { ariaHidden: "true" }, "✎")
        ),
      ]),
      !studyCafePreviewState.statusMessage
        ? button("+ 상태메시지 작성", "study-character-status-empty-button", "button", openStudyCafeStatusMessageEditor)
        : null,
    ]),
    el("section", { className: "study-character-options-card" }, [
      el("div", { className: "study-character-options-head" }, [
        el("strong", {}, "캐릭터 색상"),
        el("span", {}, "원하는 스타일을 선택하세요"),
      ]),
      el(
        "div",
        { className: "study-character-option-grid" },
        options.map((option) =>
          el(
            "button",
            {
              className: `study-character-option ${studyCafePreviewState.avatarTone === option.tone ? "active" : ""}`,
              type: "button",
              "data-study-character-tone": option.tone,
              "aria-pressed": studyCafePreviewState.avatarTone === option.tone ? "true" : "false",
              onclick: () => updateStudyCafeCharacterSelection(option.tone, option.label),
            },
            [
              el("span", { className: `study-character-color ${option.tone}`, ariaHidden: "true" }),
              el("strong", {}, option.label),
              studyCafePreviewState.avatarTone === option.tone
                ? el("span", { "data-study-character-selected": "true" }, "선택됨")
                : null,
            ]
          )
        )
      ),
    ]),
    el("p", { className: "study-character-footnote" }, "캐릭터 색상은 무료이며, 상점 아이템만 포인트를 사용합니다."),
  ]);
}

function openStudyCafeNicknameEditor() {
  const input = el("input", {
    className: "study-character-nickname-input",
    type: "text",
    value: getStudyCafeDisplayName(""),
    maxLength: 10,
    placeholder: "사용할 닉네임",
    ariaLabel: "스터디카페 닉네임",
    autocomplete: "off",
  });
  const saveButton = button("저장하기", "btn study-character-nickname-save", "submit");
  const feedback = el("p", {
    className: "study-character-nickname-feedback",
    role: "alert",
    ariaLive: "assertive",
    hidden: true,
  });
  const form = el("form", { className: "study-character-nickname-modal-content" }, [
    el("p", {}, "저장한 닉네임은 캐릭터와 스터디카페 좌석에 표시됩니다."),
    el("div", { className: "study-character-nickname-row" }, [input, saveButton]),
    feedback,
    el("small", {}, "한글·영문·숫자로 2~10자까지 입력할 수 있습니다."),
  ]);
  const showNicknameFeedback = (message) => {
    feedback.textContent = message;
    feedback.hidden = false;
    input.setAttribute("aria-invalid", "true");
    window.requestAnimationFrame(() => {
      feedback.scrollIntoView({ block: "nearest" });
    });
  };
  input.addEventListener("input", () => {
    feedback.hidden = true;
    feedback.textContent = "";
    input.removeAttribute("aria-invalid");
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const nickname = normalizeStudyCafeNickname(input.value);
    if (!nickname) {
      showNicknameFeedback("닉네임은 한글·영문·숫자로 2~10자까지 입력해주세요.");
      input.focus();
      return;
    }

    saveButton.disabled = true;
    const result = await mutateStudyCafeRemote("save_profile", {
      avatarTone: studyCafePreviewState.avatarTone,
      nickname,
    }, { notify: false });
    saveButton.disabled = false;
    if (!result.ok) {
      showNicknameFeedback("닉네임을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.");
      input.focus();
      return;
    }

    studyCafePreviewState.nickname = nickname;
    input.value = nickname;
    const previewName = document.querySelector("[data-study-character-name]");
    if (previewName) previewName.textContent = `${nickname}의 캐릭터`;
    closeInfoModal();
    notify(`${nickname}(으)로 닉네임을 저장했습니다.`);
  });
  openInfoModal({
    title: "닉네임 수정",
    className: "study-character-nickname-modal",
    content: form,
  });
  window.requestAnimationFrame(() => {
    input.focus();
    input.select();
  });
}

function normalizeStudyCafeNickname(value) {
  const nickname = String(value || "").trim().replace(/\s+/g, " ");
  if (nickname.length < 2 || nickname.length > 10) return "";
  return /^[가-힣A-Za-z0-9 ]+$/.test(nickname) ? nickname : "";
}

function openStudyCafeStatusMessageEditor() {
  const input = el("textarea", {
    className: "study-character-status-input",
    rows: 3,
    maxLength: 40,
    placeholder: "예: 오늘도 한 걸음씩!",
    ariaLabel: "캐릭터 상태메시지",
  });
  input.value = studyCafePreviewState.statusMessage || "";
  const counter = el("span", { className: "study-character-status-counter", ariaLive: "polite" },
    `${input.value.length}/40`
  );
  const saveButton = button("저장하기", "btn study-character-status-save", "submit");
  const clearButton = button("비우기", "btn secondary study-character-status-clear", "button");
  const feedback = el("p", {
    className: "study-character-status-feedback",
    role: "alert",
    ariaLive: "assertive",
    hidden: true,
  });
  const form = el("form", { className: "study-character-status-modal-content" }, [
    el("p", {}, "작성한 메시지는 다른 학생이 스터디카페에서 내 캐릭터를 눌렀을 때 표시됩니다."),
    input,
    el("div", { className: "study-character-status-meta" }, [
      el("small", {}, "최대 40자"),
      counter,
    ]),
    feedback,
    el("div", { className: "study-character-status-actions" }, [clearButton, saveButton]),
  ]);
  const saveStatusMessage = async (value) => {
    const statusMessage = normalizeStudyCafeStatusMessage(value);
    saveButton.disabled = true;
    clearButton.disabled = true;
    const result = await mutateStudyCafeRemote("save_profile", {
      avatarTone: studyCafePreviewState.avatarTone,
      statusMessage,
    }, { notify: false });
    saveButton.disabled = false;
    clearButton.disabled = false;
    if (!result.ok) {
      feedback.textContent = "상태메시지를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.";
      feedback.hidden = false;
      input.focus();
      return;
    }
    studyCafePreviewState.statusMessage = statusMessage;
    closeInfoModal();
    render();
    notify(statusMessage ? "상태메시지를 저장했습니다." : "상태메시지를 비웠습니다.");
  };
  input.addEventListener("input", () => {
    counter.textContent = `${input.value.length}/40`;
    feedback.hidden = true;
  });
  clearButton.addEventListener("click", () => saveStatusMessage(""));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    saveStatusMessage(input.value);
  });
  openInfoModal({
    title: "상태메시지",
    className: "study-character-status-modal",
    content: form,
    showConfirm: false,
  });
  window.requestAnimationFrame(() => {
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  });
}

function normalizeStudyCafeStatusMessage(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 40);
}

function updateStudyCafeCharacterSelection(tone, label) {
  const availableTones = ["navy", "blue", "mint", "purple", "orange", "rose"];
  if (!availableTones.includes(tone)) return;

  studyCafePreviewState.avatarTone = tone;

  const previewAvatar = document.querySelector(".study-character-preview-avatar .study-cafe-avatar");
  if (previewAvatar) {
    previewAvatar.classList.remove(...availableTones);
    previewAvatar.classList.add(tone);
  }

  document.querySelectorAll("[data-study-character-tone]").forEach((optionButton) => {
    const isSelected = optionButton.dataset.studyCharacterTone === tone;
    optionButton.classList.toggle("active", isSelected);
    optionButton.setAttribute("aria-pressed", isSelected ? "true" : "false");

    const selectedMarker = optionButton.querySelector("[data-study-character-selected]");
    if (isSelected && !selectedMarker) {
      optionButton.appendChild(el("span", { "data-study-character-selected": "true" }, "선택됨"));
    } else if (!isSelected && selectedMarker) {
      selectedMarker.remove();
    }
  });

  mutateStudyCafeRemote("save_profile", { avatarTone: tone });
  notify(`${label} 캐릭터를 선택했습니다.`);
}

function renderStudentStudyRanking() {
  const student = getAuthedStudent();
  if (!isOnlineStudentExperience(student)) {
    return el("div", { className: "grid student-view student-study-cafe-access" }, [
      el("section", { className: "student-study-cafe-access-card" }, [
        el("span", { className: "study-cafe-access-icon", ariaHidden: "true" }, "🏆"),
        el("h2", {}, "온라인 수강생 전용 랭킹입니다"),
        el("p", {}, "순공시간 랭킹은 등록번호가 2로 시작하는 인터넷 강의 수강생만 이용할 수 있습니다."),
        button("홈으로", "btn secondary", "button", () => navigate("home")),
      ]),
    ]);
  }

  ensureStudyCafeRemoteLoaded();
  requestStudyRankingPeriod(studyRankingPreviewState.period);
  const rows = getStudyRankingPreviewRows();
  const topThree = rows.slice(0, 3);
  const mine = rows.find((row) => row.isMine);
  const hasLiveRanking = studyCafeRemoteState.available === true;
  const isPreview = isStudyCafeLocalPreview();
  const periodData = studyCafeRemoteState.rankingPeriods[studyRankingPreviewState.period];
  const periodSummary = periodData?.summary || (
    studyRankingPreviewState.period === "daily" ? studyCafeRemoteState.summary : null
  );
  const rankingLoading =
    !isPreview &&
    studyCafeRemoteState.rankingLoadingPeriod === studyRankingPreviewState.period &&
    !periodData;
  return el("div", { className: "student-study-ranking-page" }, [
    el("header", { className: "study-ranking-page-head" }, [
      el("div", {}, [
        el("span", {}, "RONPARK ONLINE"),
        el("h2", {}, "순공시간 랭킹"),
      ]),
      el("span", { className: "study-ranking-my-chip" }, `내 순위 ${mine?.rank || "-"}위`),
    ]),
    el("nav", { className: "study-ranking-period-tabs", ariaLabel: "랭킹 기간 선택" }, [
      renderStudyRankingPeriodButton("daily", "일간"),
      renderStudyRankingPeriodButton("weekly", "주간"),
      renderStudyRankingPeriodButton("monthly", "월간"),
    ]),
    el("section", { className: "study-ranking-date-bar" }, [
      el("button", {
        className: "study-ranking-date-button",
        type: "button",
        textContent: "‹",
        disabled: !isPreview,
        ariaLabel: "이전 기간",
        onclick: () => changeStudyRankingDate(-1),
      }),
      el("strong", {}, formatStudyRankingDate()),
      el("button", {
        className: "study-ranking-date-button",
        type: "button",
        textContent: "›",
        disabled: !isPreview || studyRankingPreviewState.dateOffset >= 0,
        ariaLabel: "다음 기간",
        onclick: () => changeStudyRankingDate(1),
      }),
    ]),
    rows.length
      ? el("section", { className: "study-ranking-podium-section" }, [
          el("div", { className: "study-ranking-section-title" }, [
            el("strong", {}, `${getStudyRankingPeriodLabel()} Top 3`),
            el("span", {}, "순공시간 기준"),
          ]),
          el("div", { className: "study-ranking-podium" }, [
            renderStudyRankingPodiumCard(topThree[1], 2),
            renderStudyRankingPodiumCard(topThree[0], 1),
            renderStudyRankingPodiumCard(topThree[2], 3),
          ]),
        ])
      : el("section", { className: "study-ranking-podium-section empty" }, [
          el("strong", {}, rankingLoading
            ? `${getStudyRankingPeriodLabel()} 랭킹을 불러오는 중입니다.`
            : `아직 ${getStudyRankingPeriodLabel()} 순공 기록이 없습니다.`),
          el("p", {}, rankingLoading
            ? "잠시만 기다려주세요."
            : "타이머를 켜고 공부를 시작해 첫 기록을 남겨보세요."),
        ]),
    el("section", { className: "study-ranking-summary" }, [
      el("div", {}, [
        el("span", {}, `${getStudyRankingPeriodLabel()} 참여 학생`),
        el("strong", {}, `${periodSummary?.studiedCount ?? (isPreview ? 28 : 0)}명`),
      ]),
      el("div", {}, [
        el("span", {}, "현재 공부 중"),
        el("strong", {}, `${periodSummary?.focusedCount ?? (isPreview ? 5 : 0)}명`),
      ]),
      el("div", {}, [
        el("span", {}, "내 위치"),
        el("strong", {}, `상위 ${mine?.percentile || 0}%`),
      ]),
    ]),
    el("section", { className: "study-ranking-list-card" }, [
      el("div", { className: "study-ranking-section-title" }, [
        el("strong", {}, "전체 순위"),
        el("span", {}, `${getStudyRankingPeriodLabel()} 누적 순공시간`),
      ]),
      rows.length
        ? el("div", { className: "study-ranking-list" }, rows.map(renderStudyRankingRow))
        : el("div", { className: "empty" }, "표시할 실제 기록이 없습니다."),
    ]),
    el(
      "p",
      { className: "study-ranking-footnote" },
      hasLiveRanking && studyRankingPreviewState.period === "daily" && studyRankingPreviewState.dateOffset === 0
        ? "오늘 기록은 매일 오전 4시에 새로 시작되며, 다른 학생의 이름은 일부 가려서 표시합니다."
        : isPreview
          ? "로컬 미리보기 데이터입니다. 운영 화면에는 실제 서버 기록만 표시됩니다."
          : studyCafeRemoteState.rankingError
            ? studyCafeRemoteState.rankingError
            : "주간·월간은 현재 기간의 누적 순공시간이며, 다른 학생의 이름은 일부 가려서 표시합니다."
    ),
  ]);
}

function renderStudyRankingPeriodButton(period, label) {
  const periodButton = button(
    label,
    `study-ranking-period-button ${studyRankingPreviewState.period === period ? "active" : ""}`,
    "button",
    () => {
      studyRankingPreviewState.period = period;
      studyRankingPreviewState.dateOffset = 0;
      render();
    }
  );
  return periodButton;
}

async function requestStudyRankingPeriod(period) {
  if (
    isStudyCafeLocalPreview() ||
    period === "daily" ||
    studyCafeRemoteState.available !== true ||
    studyCafeRemoteState.rankingPeriods[period] ||
    studyCafeRemoteState.rankingLoadingPeriod === period
  ) {
    return;
  }
  studyCafeRemoteState.rankingLoadingPeriod = period;
  studyCafeRemoteState.rankingError = "";
  const result = await requestStudyCafeAction("ranking", { period });
  if (result.ok) {
    studyCafeRemoteState.rankingPeriods[period] = {
      ranking: Array.isArray(result.ranking) ? result.ranking : [],
      summary: result.summary || null,
      dateFrom: result.dateFrom || "",
      dateTo: result.dateTo || "",
    };
  } else {
    studyCafeRemoteState.rankingError = "랭킹을 불러오지 못했습니다. 잠시 후 다시 눌러주세요.";
  }
  if (studyCafeRemoteState.rankingLoadingPeriod === period) {
    studyCafeRemoteState.rankingLoadingPeriod = "";
  }
  if (currentRoute === "study-ranking") renderStudyCafeStateUpdate();
}

function changeStudyRankingDate(amount) {
  studyRankingPreviewState.dateOffset = Math.min(0, studyRankingPreviewState.dateOffset + Number(amount || 0));
  render();
}

function getStudyRankingPeriodLabel() {
  if (studyRankingPreviewState.period === "weekly") return "주간";
  if (studyRankingPreviewState.period === "monthly") return "월간";
  return "일간";
}

function formatStudyRankingDate() {
  const now = parseStudyTimerDateKey(formatStudyBusinessDateKey(new Date()));
  if (studyRankingPreviewState.period === "monthly") {
    const date = new Date(now.getFullYear(), now.getMonth() + studyRankingPreviewState.dateOffset, 1);
    return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
  }
  if (studyRankingPreviewState.period === "weekly") {
    const date = new Date(now);
    const day = date.getDay() || 7;
    date.setDate(date.getDate() - day + 1 + studyRankingPreviewState.dateOffset * 7);
    const end = new Date(date);
    end.setDate(end.getDate() + 6);
    return `${date.getMonth() + 1}.${date.getDate()} – ${end.getMonth() + 1}.${end.getDate()}`;
  }
  const date = new Date(now);
  date.setDate(date.getDate() + studyRankingPreviewState.dateOffset);
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function getStudyRankingPreviewRows() {
  if (
    studyCafeRemoteState.available === true &&
    studyRankingPreviewState.dateOffset === 0 &&
    Array.isArray(
      studyCafeRemoteState.rankingPeriods[studyRankingPreviewState.period]?.ranking
    )
  ) {
    return studyCafeRemoteState.rankingPeriods[studyRankingPreviewState.period].ranking.map((member, index, members) => ({
      ...member,
      name: member.isMine ? "나" : member.name,
      seconds: Math.max(0, Number(member.totalSeconds) || 0),
      rank: Number(member.rank) || index + 1,
      percentile: Number(member.percentile) || Math.max(1, Math.round(((index + 1) / Math.max(1, members.length)) * 100)),
    }));
  }
  if (!isStudyCafeLocalPreview()) return [];
  const multiplier = studyRankingPreviewState.period === "monthly"
    ? 22.4
    : studyRankingPreviewState.period === "weekly"
      ? 5.3
      : 1;
  const offsetFactor = 1 + Math.abs(studyRankingPreviewState.dateOffset) * 0.037;
  const currentSeconds = Math.floor(getStudySubjectTotalElapsedMs() / 1000);
  const rows = STUDY_RANKING_PREVIEW_MEMBERS.map((member, index) => ({
    ...member,
    seconds: Math.floor((member.dailySeconds + (member.isMine ? currentSeconds : index * 23)) * multiplier * offsetFactor),
  }))
    .sort((a, b) => b.seconds - a.seconds)
    .map((member, index, members) => ({
      ...member,
      rank: index + 1,
      percentile: Math.max(1, Math.round(((index + 1) / members.length) * 100)),
    }));
  return rows;
}

function renderStudyRankingPodiumCard(member, rank) {
  if (!member) return null;
  const rankClass = rank === 1 ? "gold" : rank === 2 ? "silver" : "bronze";
  return el("article", { className: `study-ranking-podium-card rank-${rank} ${rankClass}` }, [
    el("span", { className: "study-ranking-medal" }, [
      el("i", { ariaHidden: "true" }),
      el("strong", {}, rank),
    ]),
    el("span", { className: `study-ranking-avatar ${member.tone}`, ariaHidden: "true" }, [
      el("i", { className: "hair" }),
      el("i", { className: "face" }),
      el("i", { className: "body" }),
    ]),
    el("strong", { className: "study-ranking-podium-name" }, member.name),
    el("time", {}, formatStudyCafeMemberTime(member.seconds)),
  ]);
}

function renderStudyRankingRow(member) {
  const leaderSeconds = getStudyRankingPreviewRows()[0]?.seconds || 1;
  const progress = Math.max(8, Math.round((member.seconds / leaderSeconds) * 100));
  return el("article", { className: `study-ranking-row ${member.isMine ? "mine" : ""}` }, [
    el("span", { className: `study-ranking-number rank-${member.rank}` }, member.rank),
    el("span", { className: `study-ranking-list-avatar ${member.tone}`, ariaHidden: "true" }, member.name.slice(0, 1)),
    el("div", { className: "study-ranking-row-main" }, [
      el("div", {}, [
        el("strong", {}, member.isMine ? "나" : member.name),
        member.isMine ? el("span", {}, "내 순위") : null,
        el("time", {}, formatStudyCafeMemberTime(member.seconds)),
      ]),
      el("span", { className: "study-ranking-progress" }, [
        el("i", { style: `width:${progress}%` }),
      ]),
    ]),
  ]);
}

function renderStudyCafeSeat(seat, index, student, options = {}) {
  const seatNumber = index + 1;
  const rankingRoom = options.rankingRoom === true;
  const rank = Math.max(0, Number(options.rank) || 0);
  const rankChange = Number(options.rankChange) || 0;
  const readOnly = options.readOnly === true;
  const occupant = Object.prototype.hasOwnProperty.call(options, "occupant")
    ? options.occupant
    : getStudyCafeSeatOccupant(seat, seatNumber, student);
  const isMine = occupant?.isMine === true || seat.id === studyCafePreviewState.selectedSeatId;
  const hasSelectedSeat = Boolean(studyCafePreviewState.selectedSeatId);
  const emptySeatActionLabel = readOnly ? "빈자리" : hasSelectedSeat ? "좌석 변경" : "+ 입장";
  const occupantFullTrack = occupant?.fullTrack || occupant?.track || "직렬 미등록";
  const isPausedSeat = occupant?.status === "paused";
  const displaySeatLabel = rankingRoom
    ? occupant ? String(rank) : ""
    : String(seatNumber);
  const seatButton = el(
    "button",
    {
      className: `study-cafe-seat ${rankingRoom ? "ranking-seat" : ""} ${rank && rank <= 3 ? `rank-${rank}` : ""} ${occupant ? "occupied" : "empty"} ${isMine ? "mine" : ""} ${readOnly ? "browse-only" : ""}`,
      type: "button",
      "data-study-cafe-physical-seat-number": String(seatNumber),
      ariaLabel: occupant
        ? `${rankingRoom ? `랭킹룸 ${rank}위` : `${seatNumber}번 좌석`}, ${occupant.name}, ${occupantFullTrack}${isPausedSeat ? ", 일시정지" : ""}, 오늘 누적 공부시간 ${formatStudyCafeMemberTime(getStudyCafeMemberSeconds(occupant, isMine))}`
        : readOnly
          ? rankingRoom
            ? "랭킹룸 빈자리, 내 스터디룸에서 좌석을 선택할 수 있습니다"
            : `${seatNumber}번 빈 좌석, 내 스터디룸에서 좌석을 선택할 수 있습니다`
          : rankingRoom
            ? `랭킹룸 ${hasSelectedSeat ? "좌석 변경" : "빈자리 선택"}`
            : `${seatNumber}번 ${hasSelectedSeat ? "좌석 변경" : "좌석 선택"}`,
    },
    [
      displaySeatLabel ? el("span", { className: "study-cafe-seat-number" }, displaySeatLabel) : null,
      rankingRoom && occupant && rankChange
        ? el("span", {
            className: `study-cafe-rank-change ${rankChange > 0 ? "up" : "down"}`,
            ariaLabel: rankChange > 0 ? `${rankChange}계단 상승` : `${Math.abs(rankChange)}계단 하락`,
          }, rankChange > 0 ? `↑${rankChange}` : `↓${Math.abs(rankChange)}`)
        : null,
      occupant
        ? el(
            "span",
            {
              className: "study-cafe-seat-name",
              title: `${occupant.name} / ${occupantFullTrack}`,
            },
            [
              el("strong", {}, occupant.name),
              el("em", {}, occupant.track),
            ]
          )
        : null,
      occupant
        ? el(
            "time",
            {
              className: "study-cafe-member-time",
              "data-study-member-time": isMine
                ? "mine"
                : occupant.remote
                  ? occupant.status === "studying" ? "remote" : "static"
                  : "mock",
              "data-study-base-seconds": String(Number(occupant.todaySeconds) || 0),
              ariaLabel: `${occupant.name} 오늘 누적 공부시간`,
            },
            formatStudyCafeMemberTime(getStudyCafeMemberSeconds(occupant, isMine))
          )
        : null,
      isPausedSeat
        ? el("span", {
            className: "study-cafe-seat-pause-icon",
            ariaLabel: "일시정지",
            title: "일시정지",
          })
        : null,
      occupant
        ? renderStudyCafeSeatedVisual(occupant.tone, isMine, {
            studying: occupant.status === "studying",
          })
        : el(
            "span",
            { className: `study-cafe-empty-plus ${hasSelectedSeat || readOnly ? "compact" : ""}` },
            emptySeatActionLabel
          ),
      occupant
        ? null
        : el("span", { className: "study-cafe-desk" }, [
            el("i", { className: "study-cafe-desk-book" }),
            el("i", { className: "study-cafe-desk-cup" }),
          ]),
    ]
  );
  if (!occupant && readOnly) {
    seatButton.addEventListener("click", () => {
      notify("전체 카페에서는 좌석 현황만 볼 수 있어요. 좌석은 내 스터디룸에서 선택해주세요.");
    });
    return seatButton;
  }
  if (!occupant) {
    seatButton.addEventListener("click", async () => {
      if (studyCafePreviewState.selectedSeatId) {
        openStudyCafeSeatMoveModal(seat.id, seatNumber, {
          preserveStudy: Boolean(studyCafePreviewState.subject),
        });
        return;
      }
      if (studyCafePreviewState.pendingSubject) {
        const subject = studyCafePreviewState.pendingSubject;
        seatButton.disabled = true;
        seatButton.classList.add("loading");
        const todosReady = await ensureStudyCafeTodosReady();
        if (todosReady && !hasStudyCafeTodoForSubject(student, subject)) {
          seatButton.disabled = false;
          seatButton.classList.remove("loading");
          openStudyCafeTodoRedirectModal(seat.id, seatNumber, subject);
          return;
        }
        const claim = await claimStudyCafeSeat(seatNumber);
        seatButton.disabled = false;
        seatButton.classList.remove("loading");
        if (!claim.ok) return;
        studyCafePreviewState.selectedSeatId = seat.id;
        applyStudyCafeSubjectSelection(seat.id, subject);
        studyCafePreviewState.pendingSubject = "";
        renderStudyCafeStateUpdate();
        notify(`${formatStudyCafeSeatLabel(seatNumber, student)}에서 ${subject} 공부를 준비합니다.`);
        return;
      }
      seatButton.disabled = true;
      seatButton.classList.add("loading");
      const todosReady = await ensureStudyCafeTodosReady();
      seatButton.disabled = false;
      seatButton.classList.remove("loading");
      if (studyCafePreviewState.selectedSeatId) {
        renderStudyCafeStateUpdate();
        return;
      }
      if (todosReady && getStudyCafeTodayTodos(student).length === 0) {
        openStudyCafeTodoRedirectModal(seat.id, seatNumber);
        return;
      }
      openStudyCafeSubjectModal(seat.id, student, {
        beforeSelect: async () => {
          const claim = await claimStudyCafeSeat(seatNumber);
          if (!claim.ok) return false;
          studyCafePreviewState.selectedSeatId = seat.id;
          return true;
        },
      });
    });
  } else if (isMine) {
    seatButton.addEventListener("click", () =>
      openStudyCafeSubjectModal(seat.id, student, {
        preserveTimer: Boolean(studyCafePreviewState.subject),
      })
    );
  } else {
    seatButton.addEventListener("click", () => openStudyCafeMemberModal(occupant, seatNumber, {
      rank: rankingRoom ? rank : 0,
    }));
  }
  return seatButton;
}

function openStudyCafeMemberModal(occupant, seatNumber, options = {}) {
  const rank = Math.max(0, Number(options.rank) || 0);
  const isMine = occupant.isMine === true;
  const statusLabel = occupant.status === "paused"
    ? "일시정지"
    : occupant.status === "unseated"
      ? "좌석 미선택"
    : occupant.status === "seated"
      ? "착석 중"
      : "집중 중";
  const timeMode = isMine
    ? "mine"
    : occupant.remote
    ? occupant.status === "studying" ? "remote" : "static"
    : "mock";

  openInfoModal({
    title: `${occupant.name}님의 자리`,
    className: "study-cafe-member-modal",
    content: el("div", { className: "study-cafe-member-detail" }, [
      el("div", {
        className: `study-cafe-member-avatar-stage ${occupant.statusMessage ? "has-status-message" : ""}`.trim(),
      }, [
        occupant.statusMessage
          ? el("blockquote", { className: "study-cafe-member-status-message has-message" }, occupant.statusMessage)
          : null,
        renderStudyCafeSeatedVisual(occupant.tone || "navy", isMine, {
          className: "study-cafe-member-seat-scene",
          studying: occupant.status === "studying",
          showWritingArms: true,
        }),
      ]),
      el("div", { className: "study-cafe-member-profile" }, [
        el("strong", {}, occupant.name),
        el("span", {}, occupant.fullTrack || occupant.track || "직렬 미등록"),
      ]),
      el("div", { className: "study-cafe-member-chips" }, [
        el("span", {}, rank ? `랭킹룸 ${rank}` : options.seatLabel || `${seatNumber}번 좌석`),
        el("span", { className: `status ${occupant.status || "studying"}` }, statusLabel),
      ]),
      el("dl", { className: "study-cafe-member-info-list" }, [
        occupant.currentSubject
          ? el("div", {}, [
              el("dt", {}, "현재 과목"),
              el("dd", {}, occupant.currentSubject),
            ])
          : null,
        el("div", {}, [
          el("dt", {}, "오늘 순공시간"),
          el(
            "dd",
            {},
            el(
              "time",
              {
                "data-study-member-time": timeMode,
                "data-study-base-seconds": String(Number(occupant.todaySeconds) || 0),
              },
              formatStudyCafeMemberTime(getStudyCafeMemberSeconds(occupant, isMine))
            )
          ),
        ]),
      ]),
    ]),
  });
}

function summarizeStudyCafeTrack(value) {
  const track = String(value || "").trim();
  if (!track) return "온라인 수강";
  const rules = [
    [/해상교통관제\(VTS\)/, "VTS"],
    [/선박교통관제\(VTS\)/, "VTS"],
    [/해경학과\s*항해/, "학과·항해"],
    [/해경학과\s*기관/, "학과·기관"],
    [/함정요원\s*항해/, "함정·항해"],
    [/함정요원\s*기관/, "함정·기관"],
    [/해양오염방제\s*환경/, "방제·환경"],
    [/해양오염방제\s*화공/, "방제·화공"],
    [/해양오염방제\s*항해/, "방제·항해"],
    [/해양오염방제\s*기관/, "방제·기관"],
    [/경위\s*공채\(해양-항해\)/, "경위·항해"],
    [/경위\s*공채\(해양-기관\)/, "경위·기관"],
    [/정보통신\s*전산/, "전산"],
    [/정보통신\s*통신/, "통신"],
    [/특공\s*전술/, "특공"],
    [/공채\(순경\)/, "공채(순경)"],
    [/구조\(순경\)/, "구조"],
    [/구급\(순경\)/, "구급"],
  ];
  const matched = rules.find(([pattern]) => pattern.test(track));
  if (matched) {
    const suffix = track.match(/\((순경|경장)\)\s*$/)?.[0] || "";
    return matched[1] === "VTS" && suffix ? `${matched[1]}${suffix}` : matched[1];
  }
  const shortened = track
    .replace(/^(경찰직|일반직)\s*-\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  return shortened.length > 10 ? `${shortened.slice(0, 9)}…` : shortened;
}

function renderStudyCafeAvatar(tone, isMine = false, options = {}) {
  const includeArms = options.includeArms !== false;
  const outfitClass = isMine ? getStudyCafeEquippedOutfitClass() : "";
  const wearsCoastGuardDressUniform = outfitClass === "shop-outfit-coast-guard-uniform";
  return el("span", { className: `study-cafe-avatar ${tone} ${isMine ? "is-mine" : ""} ${outfitClass}`.trim(), ariaHidden: "true" }, [
    el("i", { className: "study-cafe-avatar-shadow" }),
    el("i", { className: "study-cafe-avatar-body" }, wearsCoastGuardDressUniform ? [
      el("b", { className: "study-cafe-uniform-lapels" }),
      el("b", { className: "study-cafe-uniform-insignia" }),
      el("b", { className: "study-cafe-uniform-nameplate" }),
      el("b", { className: "study-cafe-uniform-ribbons" }),
      el("b", { className: "study-cafe-uniform-pockets" }),
      el("b", { className: "study-cafe-uniform-buttons" }),
      el("b", { className: "study-cafe-uniform-medal" }),
    ] : null),
    el("i", { className: "study-cafe-avatar-face" }),
    el("i", { className: "study-cafe-avatar-hair" }),
    isMine ? renderStudyCafeShopCosmetic("head") : null,
    includeArms ? el("i", { className: "study-cafe-avatar-arm left" }) : null,
    includeArms ? el("i", { className: "study-cafe-avatar-arm right" }) : null,
  ]);
}

function renderStudyCafeSeatedVisual(tone, isMine = false, options = {}) {
  const studying = options.studying !== false;
  const showWritingArms = options.showWritingArms !== false;
  const className = [
    "study-cafe-seat-visual",
    studying ? "is-studying" : "is-idle",
    isMine ? getStudyCafeEquippedOutfitClass() : "",
    options.className,
  ].filter(Boolean).join(" ");
  return el("span", { className, ariaHidden: "true" }, [
    renderStudyCafeChairBack(isMine),
    renderStudyCafeAvatar(tone, isMine, { includeArms: false }),
    el("span", { className: "study-cafe-desk" }, [
      el("i", { className: "study-cafe-desk-book" }),
      el("i", { className: "study-cafe-desk-cup" }),
      isMine ? renderStudyCafeDeskCosmetics() : null,
    ]),
    showWritingArms ? renderStudyCafeWritingArms() : null,
  ]);
}

function renderStudyCafeWritingArms() {
  return el("span", { className: "study-cafe-writing-arms", ariaHidden: "true" }, [
    el("i", { className: "study-cafe-avatar-arm left" }),
    el("i", { className: "study-cafe-avatar-arm right" }),
  ]);
}

function renderStudyCafeChairBack(isMine = false) {
  const chairClass = isMine ? getStudyCafeEquippedChairClass() : "";
  return el("span", { className: `study-cafe-chair-back ${chairClass}`.trim(), ariaHidden: "true" });
}

async function claimStudyCafeSeat(seatNumber, options = {}) {
  const result = await mutateStudyCafeRemote(
    "claim_seat",
    {
      seatNumber,
      avatarTone: studyCafePreviewState.avatarTone,
      displayName: getStudyCafeDisplayName("나"),
      preserveStudy: options.preserveStudy === true,
    },
    options.notify === false
      ? { refresh: false, notify: false }
      : { refresh: false }
  );
  if (result.ok) {
    markStudyCafeAsUsed();
    if (getStudyCafeRoomIndexForSeat(seatNumber) === STUDY_CAFE_RANKING_ROOM_INDEX) {
      markStudyCafeRankingRoomAsUsed();
    }
  }
  return result;
}

async function ensureStudyCafeTodosReady() {
  if (isStudyCafeLocalPreview() || studyCafeRemoteState.loaded) return true;
  if (studyCafeRemoteState.loading) {
    await new Promise((resolve) => {
      let checks = 0;
      const checkLoaded = () => {
        checks += 1;
        if (!studyCafeRemoteState.loading || checks >= 100) {
          resolve();
          return;
        }
        window.setTimeout(checkLoaded, 50);
      };
      checkLoaded();
    });
  }
  if (!studyCafeRemoteState.loaded && !studyCafeRemoteState.loading) {
    await ensureStudyCafeRemoteLoaded({ render: false });
  }
  return studyCafeRemoteState.loaded;
}

function getStudyCafeTodayTodos(student) {
  const studyDate =
    studyCafeRemoteState.studyDateKey ||
    formatStudyBusinessDateKey(new Date());
  const subjectSet = new Set(getStudyTimerSubjects(student));
  return getStudyTodosForDate(studyDate).filter((todo) =>
    subjectSet.has(String(todo.subject || "").trim())
  );
}

function hasStudyCafeTodoForSubject(student, subject) {
  return getStudyCafeTodayTodos(student).some((todo) =>
    todo.pending !== true && todo.subject === subject
  );
}

function openStudyCafeTodoRedirectModal(seatId, seatNumber, subject = "", options = {}) {
  const subjectLabel = subject ? `${subject} 할 일` : "오늘 할 일";
  openInfoModal({
    title: `공부 전에 ${subjectLabel}을 정해주세요`,
    className: "study-cafe-todo-redirect-modal",
    confirmLabel: `${subjectLabel} 작성하기`,
    content: el("div", { className: "study-cafe-todo-redirect" }, [
      el("span", { className: "study-cafe-todo-redirect-seat" }, `${formatStudyCafeSeatLabel(seatNumber)} 선택 중`),
      el("p", {}, subject
        ? `오늘 플래너에 ${subject} 할 일을 하나 이상 작성하면 공부를 이어갈 수 있어요.`
        : "오늘 플래너에 할 일을 하나 이상 작성하면 좌석 선택을 이어갈 수 있어요."),
      el("p", { className: "subtle" }, options.seatAlreadyClaimed === true
        ? "현재 좌석은 유지되며, 작성 후 같은 자리에서 공부를 이어갑니다."
        : "할 일을 작성하는 동안 좌석은 미리 점유되지 않습니다."),
    ]),
    onConfirm: () => {
      studyCafePlannerEntryState.seatId = seatId;
      studyCafePlannerEntryState.seatNumber = seatNumber;
      studyCafePlannerEntryState.subject = subject;
      studyCafePlannerEntryState.seatAlreadyClaimed = options.seatAlreadyClaimed === true;
      studyCafePlannerEntryState.resumeRequested = false;
      studyCafeRemoteState.plannerDateKey =
        studyCafeRemoteState.studyDateKey ||
        formatStudyBusinessDateKey(new Date());
      if (subject) {
        studyTodoEditorState.dateKey = studyCafeRemoteState.plannerDateKey;
        studyTodoEditorState.subject = subject;
        studyTodoEditorState.draft = "";
        studyTodoEditorState.focused = true;
      }
      studyPlannerHubView = "planner";
      studyTodoCalendarOpen = false;
      closeInfoModal();
      navigate("study-todo");
    },
  });
}

function openStudyCafeSeatMoveModal(seatId, seatNumber, options = {}) {
  const preserveStudy = options.preserveStudy === true;
  const rankingRoomTarget =
    getStudyCafeRoomIndexForSeat(seatNumber) === STUDY_CAFE_RANKING_ROOM_INDEX;
  const prospectiveRank = rankingRoomTarget
    ? getStudyCafeProspectiveRankingRoomRank(seatNumber)
    : 0;
  closeInfoModal();
  let moving = false;
  const cancelButton = button("취소", "btn secondary", "button", closeInfoModal);
  const moveButton = button("좌석 이동", "btn", "button", async () => {
    if (moving) return;
    moving = true;
    moveButton.disabled = true;
    cancelButton.disabled = true;
    moveButton.textContent = "이동 중…";
    const claim = await claimStudyCafeSeat(seatNumber, { preserveStudy });
    if (!claim.ok) {
      moving = false;
      moveButton.disabled = false;
      cancelButton.disabled = false;
      moveButton.textContent = "좌석 이동";
      return;
    }
    studyCafePreviewState.selectedSeatId = seatId;
    closeInfoModal();
    renderStudyCafeStateUpdate();
    notify(
      preserveStudy
        ? `${formatStudyCafeSeatLabel(seatNumber)}으로 이동했습니다. 타이머는 계속 측정됩니다.`
        : `${formatStudyCafeSeatLabel(seatNumber)}으로 이동했습니다. 내 좌석 카드에서 공부할 과목을 선택해주세요.`
    );
  });
  const modal = el("div", { className: "info-modal", role: "dialog", ariaModal: "true" }, [
    el("button", { className: "info-modal-backdrop", type: "button", ariaLabel: "좌석 이동 취소" }),
    el("div", { className: "info-modal-panel study-cafe-seat-move-modal" }, [
      el("strong", {}, "좌석을 변경하시겠어요?"),
      el(
        "p",
        {},
        rankingRoomTarget
          ? `랭킹룸 입장 후 현재 기록 기준 ${prospectiveRank}위로 배치됩니다. ${preserveStudy ? "현재 과목과 타이머는 그대로 유지됩니다." : "입장 후 공부할 과목을 선택할 수 있습니다."}`
          : preserveStudy
            ? `${formatStudyCafeSeatLabel(seatNumber)}으로 이동합니다. 현재 과목과 타이머는 그대로 유지됩니다.`
            : `${formatStudyCafeSeatLabel(seatNumber)}으로 이동합니다. 이동 후 내 좌석 카드에서 공부할 과목을 선택할 수 있습니다.`
      ),
      el("div", { className: "study-cafe-seat-move-actions" }, [
        cancelButton,
        moveButton,
      ]),
    ]),
  ]);
  modal.querySelector(".info-modal-backdrop").addEventListener("click", closeInfoModal);
  document.body.appendChild(modal);
  document.addEventListener("keydown", closeInfoModalOnEscape);
}

function openStudyCafeSubjectModal(seatId, student, options = {}) {
  const preserveTimer = options.preserveTimer === true;
  const beforeSelect = typeof options.beforeSelect === "function" ? options.beforeSelect : null;
  const seatNumber = STUDY_CAFE_PREVIEW_SEATS.findIndex((seat) => seat.id === seatId) + 1;
  const rankingRoomSeat =
    seatNumber > 0 &&
    getStudyCafeRoomIndexForSeat(seatNumber) === STUDY_CAFE_RANKING_ROOM_INDEX;
  const prospectiveRank = rankingRoomSeat
    ? getStudyCafeProspectiveRankingRoomRank(seatNumber, student)
    : 0;
  const subjects = getStudyTimerSubjects(student);
  const recent = subjects.includes(studyCafePreviewState.lastSubject)
    ? studyCafePreviewState.lastSubject
    : "";
  const ordered = recent ? [recent, ...subjects.filter((subject) => subject !== recent)] : subjects;
  const subjectOptionButtons = [];
  let selectedSubject = "";
  let selectionPending = false;
  let confirmButton = null;
  ordered.forEach((subject) => {
    const optionButton = button(
      subject,
      `study-cafe-subject-option ${subject === recent ? "recent" : ""}`,
      "button",
      () => {
        if (selectionPending) return;
        selectedSubject = subject;
        subjectOptionButtons.forEach((node) => {
          const selected = node === optionButton;
          node.classList.toggle("selected", selected);
          node.setAttribute("aria-pressed", selected ? "true" : "false");
        });
        if (confirmButton) confirmButton.disabled = false;
      }
    );
    optionButton.setAttribute("aria-pressed", "false");
    subjectOptionButtons.push(optionButton);
  });
  const confirmSelection = async () => {
    if (!selectedSubject || selectionPending) return;
    if (!preserveTimer && !hasStudyCafeTodoForSubject(student, selectedSubject)) {
      openStudyCafeTodoRedirectModal(seatId, seatNumber, selectedSubject, {
        seatAlreadyClaimed: studyCafePreviewState.selectedSeatId === seatId,
      });
      return;
    }
    selectionPending = true;
    subjectOptionButtons.forEach((node) => {
      node.disabled = true;
    });
    confirmButton.disabled = true;
    confirmButton.textContent = beforeSelect ? "좌석 확인 중…" : "적용 중…";
    const canContinue = beforeSelect ? await beforeSelect(selectedSubject) : true;
    if (!canContinue) {
      selectionPending = false;
      subjectOptionButtons.forEach((node) => {
        node.disabled = false;
      });
      confirmButton.disabled = false;
      confirmButton.textContent = "확인";
      return;
    }
    applyStudyCafeSubjectSelection(seatId, selectedSubject, { preserveTimer });
    closeInfoModal();
    render();
    if (preserveTimer) notify(`${selectedSubject} 과목으로 변경을 준비합니다.`);
  };
  const modalControls = openInfoModal({
    title: preserveTimer
      ? "공부할 과목을 변경할까요?"
      : rankingRoomSeat ? "랭킹룸에서 어떤 과목을 공부할까요?" : "어떤 과목을 공부할까요?",
    className: "study-cafe-subject-modal",
    confirmDisabled: true,
    onConfirm: confirmSelection,
    content: el("div", { className: "study-cafe-subject-picker" }, [
      el(
        "p",
        {},
        preserveTimer
          ? "과목을 선택한 뒤 확인을 눌러주세요. 현재 자리와 전체 공부시간은 유지되고, 선택한 과목으로 이어집니다."
          : rankingRoomSeat
            ? `과목을 선택하면 현재 기록 기준 ${prospectiveRank}위로 입장합니다. 공부시간에 따라 자리가 자동으로 이동합니다.`
            : "과목을 선택하고 확인을 누르면 좌석이 확정되고 타이머 준비가 시작됩니다."
      ),
      el(
        "div",
        { className: "study-cafe-subject-options" },
        subjectOptionButtons
      ),
      preserveTimer
        ? button(
            "과목 공부 종료",
            "study-cafe-subject-stop-button",
            "button",
            () => stopStudyCafePreviewTimer({ closeModalOnSuccess: true })
          )
        : null,
    ]),
  });
  confirmButton = modalControls.confirmButton;
}

function applyStudyCafeSubjectSelection(seatId, subject, options = {}) {
  beginStudyCafeLocalSessionMutation();
  const preserveTimer = options.preserveTimer === true;
  try {
    const previousSubject = studyCafePreviewState.subject;
    if (studyCafePreviewState.running && previousSubject) commitCurrentStudySubjectElapsed();
    cancelStudyCafeCountdown();
    studyCafePreviewState.selectedSeatId = seatId;
    studyCafePreviewState.pendingSubject = "";
    studyCafePreviewState.subject = subject;
    studyCafePreviewState.lastSubject = subject;
    if (!preserveTimer) {
      studyCafePreviewState.elapsedMs = 0;
    }
    studyCafePreviewState.running = false;
    studyCafePreviewState.paused = false;
    studyCafePreviewState.startedAt = 0;
    studyCafePreviewState.subjectStartedAt = 0;
    startStudyCafeCountdown(seatId, subject);
  } finally {
    finishStudyCafeLocalSessionMutation();
  }
}

function cancelStudyCafeCountdown() {
  studyCafeCountdownId += 1;
  if (studyCafeCountdownInterval) window.clearInterval(studyCafeCountdownInterval);
  if (studyCafeCountdownCleanupTimer) window.clearTimeout(studyCafeCountdownCleanupTimer);
  studyCafeCountdownInterval = null;
  studyCafeCountdownCleanupTimer = null;
  document.querySelector(".study-cafe-countdown-overlay")?.remove();
}

function startStudyCafeCountdown(seatId, subject) {
  if (studyCafeTimerActionPending) return;
  const resumeExistingSession =
    studyCafePreviewState.paused &&
    studyCafePreviewState.selectedSeatId === seatId &&
    studyCafePreviewState.subject === subject;
  cancelStudyCafeCountdown();
  const countdownId = studyCafeCountdownId;
  let remaining = 3;
  const number = el("strong", { className: "study-cafe-countdown-number" }, String(remaining));
  const overlay = el(
    "div",
    {
      className: "study-cafe-countdown-overlay",
      role: "status",
      ariaLive: "assertive",
      ariaLabel: `${subject} 타이머 시작 카운트다운`,
    },
    [
      el("div", { className: "study-cafe-countdown-panel" }, [
        el("span", {}, subject),
        number,
        el("p", {}, "집중할 준비를 해주세요"),
      ]),
    ]
  );
  document.body.append(overlay);
  studyCafeCountdownInterval = window.setInterval(() => {
    if (countdownId !== studyCafeCountdownId) return;
    remaining -= 1;
    if (remaining > 0) {
      number.textContent = String(remaining);
      return;
    }
    window.clearInterval(studyCafeCountdownInterval);
    studyCafeCountdownInterval = null;
    if (
      studyCafePreviewState.selectedSeatId === seatId &&
      studyCafePreviewState.subject === subject
    ) {
      number.textContent = "시작!";
      overlay.classList.add("go");
      studyCafeCountdownCleanupTimer = window.setTimeout(() => {
        if (countdownId === studyCafeCountdownId) overlay.remove();
        studyCafeCountdownCleanupTimer = null;
      }, 280);
      beginStudyCafeTimer(seatId, subject, resumeExistingSession).then((started) => {
        if (countdownId !== studyCafeCountdownId) return;
        if (!started) notify("타이머를 시작하지 못했습니다. 다시 시도해주세요.");
      });
      return;
    }
    studyCafeCountdownCleanupTimer = window.setTimeout(() => {
      if (countdownId === studyCafeCountdownId) overlay.remove();
      studyCafeCountdownCleanupTimer = null;
    }, 280);
  }, 1000);
}

async function beginStudyCafeTimer(seatId, subject, resumeExistingSession) {
  if (studyCafeTimerActionPending) return false;
  studyCafeTimerActionPending = true;
  beginStudyCafeLocalSessionMutation();
  const previousTimerState = {
    elapsedMs: studyCafePreviewState.elapsedMs,
    startedAt: studyCafePreviewState.startedAt,
    subjectStartedAt: studyCafePreviewState.subjectStartedAt,
    running: studyCafePreviewState.running,
    paused: studyCafePreviewState.paused,
    idleSince: studyCafePreviewState.idleSince,
  };
  const optimisticStartedAt = Date.now();
  studyCafePreviewState.startedAt = optimisticStartedAt;
  studyCafePreviewState.subjectStartedAt = optimisticStartedAt;
  studyCafePreviewState.idleSince = 0;
  studyCafePreviewState.running = true;
  studyCafePreviewState.paused = false;
  clearStudyCafeIdleWarning();
  renderStudyCafeStateUpdate();
  try {
    const result = await mutateStudyCafeRemote(
      resumeExistingSession ? "timer_resume" : "timer_start",
      resumeExistingSession ? {} : { subject },
      { refresh: false }
    );
    if (!result.ok) {
      Object.assign(studyCafePreviewState, previousTimerState);
      renderStudyCafeStateUpdate();
      return false;
    }
    if (
      studyCafePreviewState.selectedSeatId !== seatId ||
      studyCafePreviewState.subject !== subject
    ) {
      return false;
    }
    invalidateStudyTimerStatsCache();
    return true;
  } finally {
    studyCafeTimerActionPending = false;
    finishStudyCafeLocalSessionMutation();
  }
}

function getStudyTimerSubjects(student) {
  const configured = typeof getConfiguredWeeklySubjectsForTrack === "function"
    ? getConfiguredWeeklySubjectsForTrack(student?.track)
    : [];
  const fallback = ["해양경찰학개론", "해사법규", "형사법"];
  return [...(configured.length ? configured : fallback)]
    .map((subject) => String(subject || "").trim())
    .filter(
      (subject, index, subjects) =>
        subject &&
        subject !== "기타" &&
        subjects.indexOf(subject) === index
    )
    .slice(0, 8);
}

function openStudySubjectEditor(student) {
  const activeSubject = studyCafePreviewState.subject;
  const draft = getStudyTimerSubjects(student).map((name) => ({
    originalName: name,
    name,
  }));
  const list = el("div", { className: "study-subject-edit-list" });

  const renderRows = () => {
    list.replaceChildren(
      ...draft.map((item, index) => {
        const isActive = Boolean(activeSubject && item.originalName === activeSubject);
        const input = el("input", {
          type: "text",
          value: item.name,
          maxLength: 20,
          ariaLabel: `${index + 1}번째 과목명`,
          disabled: isActive,
        });
        input.addEventListener("input", () => {
          item.name = input.value;
        });
        const deleteButton = button(
          isActive ? "측정 중" : "삭제",
          "study-subject-delete-button",
          "button",
          isActive
            ? null
            : () => {
                if (draft.length <= 1) return notify("과목은 1개 이상 필요합니다.");
                draft.splice(index, 1);
                renderRows();
              }
        );
        deleteButton.disabled = isActive;
        return el("div", { className: `study-subject-edit-row ${isActive ? "active" : ""}` }, [
          el("span", { className: "study-subject-edit-number" }, String(index + 1)),
          input,
          deleteButton,
        ]);
      })
    );
  };

  const addSubject = () => {
    if (draft.length >= 8) return notify("과목은 최대 8개까지 등록할 수 있습니다.");
    let number = 1;
    let name = "새 과목";
    const usedNames = new Set(draft.map((item) => item.name.trim()));
    while (usedNames.has(name)) {
      number += 1;
      name = `새 과목 ${number}`;
    }
    draft.push({ originalName: "", name });
    renderRows();
    list.querySelector(".study-subject-edit-row:last-child input")?.focus();
  };

  const saveSubjects = async () => {
    const names = draft.map((item) => item.name.trim());
    if (names.some((name) => !name)) return notify("과목명을 입력해주세요.");
    if (new Set(names).size !== names.length) return notify("같은 과목명은 한 번만 사용할 수 있습니다.");
    const elapsedBefore = { ...studyCafePreviewState.subjectElapsedMs };
    const renamed = draft
      .map((item, index) => ({
        previousName: item.originalName,
        nextName: names[index],
      }))
      .filter(({ previousName, nextName }) => previousName && previousName !== nextName);
    renamed.forEach(({ previousName }) => {
      delete studyCafePreviewState.subjectElapsedMs[previousName];
    });
    renamed.forEach(({ previousName, nextName }) => {
      const previousElapsed = Number(elapsedBefore[previousName]) || 0;
      if (previousElapsed) {
        studyCafePreviewState.subjectElapsedMs[nextName] =
          (Number(studyCafePreviewState.subjectElapsedMs[nextName]) || 0) + previousElapsed;
      }
    });
    draft.forEach((item, index) => {
      const previousName = item.originalName;
      const nextName = names[index];
      if (!previousName || previousName === nextName) return;
      if (studyCafePreviewState.lastSubject === previousName) {
        studyCafePreviewState.lastSubject = nextName;
      }
    });
    studyCafePreviewState.customSubjects = names;
    const result = await mutateStudyCafeRemote("save_subjects", { subjects: names });
    if (!result.ok) return;
    closeInfoModal();
    render();
    notify("과목 목록을 저장했습니다.");
  };

  renderRows();
  openInfoModal({
    title: "과목 편집",
    className: "study-subject-edit-modal",
    content: el("div", { className: "study-subject-editor" }, [
      activeSubject
        ? el("p", {}, "현재 측정 중인 과목은 종료 후 편집할 수 있습니다.")
        : el("p", {}, "과목명을 변경하거나 필요한 과목을 추가해보세요."),
      list,
      button("+ 과목 추가", "study-subject-add-button", "button", addSubject),
      button("저장하기", "btn", "button", saveSubjects),
    ]),
  });
}

function renderStudyCafeFloatingActions(student) {
  const actionMenu = el("div", {
    className: "study-cafe-floating-action-menu",
    role: "menu",
    ariaLabel: "공부 중 기능",
    hidden: true,
  });
  const controls = el("div", { className: "study-cafe-floating-controls" });
  const menuButton = el(
    "button",
    {
      className: "study-cafe-floating-menu-button",
      type: "button",
      ariaLabel: "공부 메뉴 열기",
      ariaExpanded: "false",
    },
    [
      el("span", { ariaHidden: "true" }, "⋮"),
      el("small", {}, "공부 메뉴"),
    ]
  );

  const closeMenu = ({ restoreFocus = false } = {}) => {
    controls.classList.remove("open");
    actionMenu.hidden = true;
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-label", "공부 메뉴 열기");
    if (restoreFocus) menuButton.focus();
  };
  const action = (label, icon, tone, handler) =>
    el(
      "button",
      {
        className: `study-cafe-floating-action ${tone}`,
        type: "button",
        role: "menuitem",
        onclick: () => {
          closeMenu();
          handler();
        },
      },
      [
        el("strong", {}, label),
        el("span", { ariaHidden: "true" }, icon),
      ]
    );

  actionMenu.append(
    action(
      studyCafePreviewState.paused ? "다시 시작" : "일시정지",
      studyCafePreviewState.paused ? "▶" : "Ⅱ",
      "pause",
      toggleStudyCafePreviewTimer
    ),
    action("과목 변경", "↻", "change", () => {
      openStudyCafeSubjectModal(studyCafePreviewState.selectedSeatId, student, { preserveTimer: true });
    }),
    action("과목 종료", "■", "stop", stopStudyCafePreviewTimer)
  );

  menuButton.addEventListener("click", (event) => {
    event.stopPropagation();
    const willOpen = !controls.classList.contains("open");
    if (!willOpen) {
      closeMenu();
      return;
    }
    actionMenu.hidden = false;
    controls.classList.add("open");
    menuButton.setAttribute("aria-expanded", "true");
    menuButton.setAttribute("aria-label", "공부 메뉴 닫기");
    actionMenu.querySelector("button")?.focus();
  });
  controls.addEventListener("click", (event) => {
    if (event.target === controls) closeMenu({ restoreFocus: true });
  });
  controls.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu({ restoreFocus: true });
  });
  controls.append(actionMenu, menuButton);
  return controls;
}

function getStudyCafeElapsedMs() {
  return studyCafePreviewState.elapsedMs +
    (studyCafePreviewState.running && studyCafePreviewState.startedAt ? Date.now() - studyCafePreviewState.startedAt : 0);
}

function getStudySubjectElapsedMs(subject) {
  const saved = Number(studyCafePreviewState.subjectElapsedMs?.[subject]) || 0;
  if (
    studyCafePreviewState.running &&
    studyCafePreviewState.subject === subject &&
    studyCafePreviewState.subjectStartedAt
  ) {
    return saved + (Date.now() - studyCafePreviewState.subjectStartedAt);
  }
  return saved;
}

function getStudySubjectTotalElapsedMs() {
  const subjects = Object.keys(studyCafePreviewState.subjectElapsedMs || {});
  const savedTotal = subjects.reduce(
    (total, subject) => total + (Number(studyCafePreviewState.subjectElapsedMs[subject]) || 0),
    0
  );
  return savedTotal +
    (studyCafePreviewState.running && studyCafePreviewState.subjectStartedAt
      ? Date.now() - studyCafePreviewState.subjectStartedAt
      : 0);
}

function commitCurrentStudySubjectElapsed() {
  const subject = studyCafePreviewState.subject;
  if (!subject || !studyCafePreviewState.running || !studyCafePreviewState.subjectStartedAt) return;
  if (!studyCafePreviewState.subjectElapsedMs) studyCafePreviewState.subjectElapsedMs = {};
  studyCafePreviewState.subjectElapsedMs[subject] =
    (Number(studyCafePreviewState.subjectElapsedMs[subject]) || 0) +
    (Date.now() - studyCafePreviewState.subjectStartedAt);
  studyCafePreviewState.subjectStartedAt = 0;
}

function formatStudyCafeElapsed(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(Number(milliseconds || 0) / 1000));
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function getStudyCafeMemberSeconds(occupant, isMine = false) {
  if (isMine) return Math.floor(getStudySubjectTotalElapsedMs() / 1000);
  const baseSeconds = Number(occupant?.todaySeconds) || 0;
  if (occupant?.remote) {
    return baseSeconds + (occupant.status === "studying"
      ? Math.floor((Date.now() - (studyCafeRemoteState.lastLoadedAt || Date.now())) / 1000)
      : 0);
  }
  return baseSeconds + Math.floor((Date.now() - STUDY_CAFE_PREVIEW_EPOCH) / 1000);
}

function formatStudyCafeMemberTime(seconds) {
  return formatStudyCafeElapsed(Math.max(0, Number(seconds) || 0) * 1000);
}

function ensureStudyCafePreviewClock() {
  if (studyCafePreviewClock) return;
  studyCafePreviewClock = window.setInterval(() => {
    checkStudyCafeIdleSeat();
    const clock = document.querySelector("[data-study-cafe-clock]");
    if (clock) {
      clock.textContent = formatStudyCafeElapsed(getStudySubjectElapsedMs(studyCafePreviewState.subject));
    }
    document.querySelectorAll("[data-study-member-time]").forEach((time) => {
      const seconds = time.dataset.studyMemberTime === "mine"
        ? Math.floor(getStudySubjectTotalElapsedMs() / 1000)
        : (Number(time.dataset.studyBaseSeconds) || 0) +
          (time.dataset.studyMemberTime === "static"
            ? 0
            : Math.floor(
                (Date.now() -
                  (time.dataset.studyMemberTime === "remote"
                    ? studyCafeRemoteState.lastLoadedAt || Date.now()
                    : STUDY_CAFE_PREVIEW_EPOCH)) /
                  1000
              ));
      time.textContent = formatStudyCafeMemberTime(seconds);
    });
    document.querySelectorAll("[data-study-total-time]").forEach((totalTime) => {
      totalTime.textContent = formatStudyCafeElapsed(getStudySubjectTotalElapsedMs());
    });
    document.querySelectorAll("[data-study-subject-time]").forEach((time) => {
      time.textContent = formatStudyCafeElapsed(getStudySubjectElapsedMs(time.dataset.studySubjectTime));
    });
    updateLectureHomeSummary();
  }, 1000);
}

function scheduleStudyCafeAutoPause(delay = 0) {
  window.clearTimeout(studyCafeAutoPauseTimer);
  if (delay <= 0) {
    studyCafeAutoPauseTimer = null;
    pauseStudyCafeTimer({ automatic: true });
    return;
  }
  studyCafeAutoPauseTimer = window.setTimeout(() => {
    studyCafeAutoPauseTimer = null;
    if (
      delay > 0 &&
      document.visibilityState !== "hidden" &&
      document.hasFocus()
    ) {
      return;
    }
    pauseStudyCafeTimer({ automatic: true });
  }, Math.max(0, Number(delay) || 0));
}

function showStudyCafeAutoPauseModal() {
  if (document.querySelector(".study-cafe-auto-pause-modal")) return;
  const close = closeStudyCafeAutoPauseModal;
  let actionPending = false;
  const resumeButton = button("계속 공부하기", "btn", "button", async () => {
    if (actionPending) return;
    actionPending = true;
    resumeButton.disabled = true;
    stopButton.disabled = true;
    keepPausedButton.disabled = true;
    const resumed = await beginStudyCafeTimer(
      studyCafePreviewState.selectedSeatId,
      studyCafePreviewState.subject,
      true
    );
    if (resumed) {
      close();
      return;
    }
    actionPending = false;
    resumeButton.disabled = false;
    stopButton.disabled = false;
    keepPausedButton.disabled = false;
  });
  const stopButton = button("공부 종료하기", "btn danger", "button", () => {
    if (actionPending) return;
    stopStudyCafePreviewTimer({
      closeModalOnSuccess: true,
      closeAutoPauseModalOnSuccess: true,
    });
  });
  const keepPausedButton = button("일시정지 유지", "btn secondary", "button", close);
  const modal = el("div", {
    className: "study-cafe-auto-pause-modal",
    role: "alertdialog",
    ariaModal: "true",
    ariaLabel: "타이머 자동 일시정지 안내",
  }, [
    el("div", {
      className: "info-modal-backdrop",
      ariaHidden: "true",
    }),
    el("div", { className: "info-modal-panel" }, [
      el("strong", {}, "타이머가 일시정지되었습니다"),
      el("p", {}, "다른 앱이나 창으로 이동하여 순공시간 측정을 자동으로 멈췄습니다."),
      el("p", {}, "계속 공부할지, 현재까지 기록하고 종료할지 선택해주세요."),
      resumeButton,
      stopButton,
      keepPausedButton,
    ]),
  ]);
  document.body.appendChild(modal);
  window.requestAnimationFrame(() => resumeButton.focus({ preventScroll: true }));
}

function closeStudyCafeAutoPauseModal() {
  document.querySelector(".study-cafe-auto-pause-modal")?.remove();
}

async function pauseStudyCafeTimer(options = {}) {
  if (studyCafeTimerActionPending || !studyCafePreviewState.running) return false;
  const automatic = options.automatic === true;
  if (!automatic && !confirm("공부 타이머를 일시정지할까요?")) return false;
  studyCafeTimerActionPending = true;
  beginStudyCafeLocalSessionMutation();
  const previousTimerState = {
    elapsedMs: studyCafePreviewState.elapsedMs,
    startedAt: studyCafePreviewState.startedAt,
    subjectStartedAt: studyCafePreviewState.subjectStartedAt,
    subjectElapsedMs: { ...(studyCafePreviewState.subjectElapsedMs || {}) },
    running: studyCafePreviewState.running,
    paused: studyCafePreviewState.paused,
    idleSince: studyCafePreviewState.idleSince,
  };
  const pausedElapsedMs = getStudyCafeElapsedMs();
  commitCurrentStudySubjectElapsed();
  studyCafePreviewState.elapsedMs = pausedElapsedMs;
  studyCafePreviewState.startedAt = 0;
  studyCafePreviewState.running = false;
  studyCafePreviewState.paused = true;
  studyCafePreviewState.idleSince = Date.now();
  renderStudyCafeStateUpdate();
  let result;
  try {
    result = await mutateStudyCafeRemote("timer_pause", {}, {
      refresh: false,
      notify: !automatic,
      keepalive: automatic,
    });
  } finally {
    studyCafeTimerActionPending = false;
    finishStudyCafeLocalSessionMutation();
  }
  if (!result?.ok) {
    Object.assign(studyCafePreviewState, previousTimerState);
    renderStudyCafeStateUpdate();
    return false;
  }
  if (automatic) showStudyCafeAutoPauseModal();
  invalidateStudyTimerStatsCache();
  return true;
}

async function toggleStudyCafePreviewTimer() {
  if (studyCafeTimerActionPending) return;
  if (studyCafePreviewState.running) {
    await pauseStudyCafeTimer();
  } else if (studyCafePreviewState.paused) {
    beginStudyCafeTimer(
      studyCafePreviewState.selectedSeatId,
      studyCafePreviewState.subject,
      true
    );
  } else {
    startStudyCafeCountdown(
      studyCafePreviewState.selectedSeatId,
      studyCafePreviewState.subject
    );
  }
}

async function stopStudyCafePreviewTimer(options = {}) {
  if (studyCafeTimerActionPending) return;
  const activeSubject = studyCafePreviewState.subject;
  const studyDate = studyCafeRemoteState.studyDateKey || formatStudyBusinessDateKey(new Date());
  const subjectGoal = getStudySubjectGoal(studyDate, activeSubject);
  if (options.confirmed !== true && subjectGoal?.targetMinutes) {
    openStudySubjectCompletionModal(activeSubject, studyDate, subjectGoal, options);
    return;
  }
  if (options.confirmed !== true && !confirm(`${activeSubject} 공부를 종료할까요?`)) return;
  studyCafeTimerActionPending = true;
  beginStudyCafeLocalSessionMutation();
  const completedElapsedSeconds = Math.floor(getStudySubjectElapsedMs(activeSubject) / 1000);
  const previousTimerState = {
    subject: studyCafePreviewState.subject,
    pendingSubject: studyCafePreviewState.pendingSubject,
    running: studyCafePreviewState.running,
    paused: studyCafePreviewState.paused,
    elapsedMs: studyCafePreviewState.elapsedMs,
    startedAt: studyCafePreviewState.startedAt,
    subjectStartedAt: studyCafePreviewState.subjectStartedAt,
    subjectElapsedMs: { ...(studyCafePreviewState.subjectElapsedMs || {}) },
    idleSince: studyCafePreviewState.idleSince,
    timerFullscreen: studyCafePreviewState.timerFullscreen,
  };
  cancelStudyCafeCountdown();
  commitCurrentStudySubjectElapsed();
  studyCafePreviewState.subject = "";
  studyCafePreviewState.pendingSubject = "";
  studyCafePreviewState.running = false;
  studyCafePreviewState.paused = false;
  studyCafePreviewState.elapsedMs = 0;
  studyCafePreviewState.startedAt = 0;
  studyCafePreviewState.subjectStartedAt = 0;
  studyCafePreviewState.idleSince = Date.now();
  studyCafePreviewState.timerFullscreen = false;
  renderStudyCafeStateUpdate();
  let result;
  try {
    result = await mutateStudyCafeRemote(
      "timer_stop",
      { subjectCompleted: options.subjectCompleted === true },
      { refresh: false }
    );
  } finally {
    studyCafeTimerActionPending = false;
    finishStudyCafeLocalSessionMutation();
  }
  if (!result?.ok) {
    Object.assign(studyCafePreviewState, previousTimerState);
    renderStudyCafeStateUpdate();
    return;
  }
  invalidateStudyTimerStatsCache();
  if (options.subjectCompleted === true && subjectGoal) {
    const completedGoal = result.goal || {
      ...subjectGoal,
      subject: activeSubject,
      completedElapsedSeconds,
      resultStatus: completedElapsedSeconds <= Number(subjectGoal.targetMinutes) * 60
        ? "on_time"
        : "overtime",
    };
    setStudySubjectGoalForDate(studyDate, completedGoal);
  }
  if (options.closeModalOnSuccess === true) closeInfoModal();
  if (options.closeAutoPauseModalOnSuccess === true) closeStudyCafeAutoPauseModal();
  renderStudyCafeStateUpdate();
  notify(options.subjectCompleted === true
    ? "과목 공부를 완료했습니다. 목표시간 결과를 플래너에서 확인할 수 있습니다."
    : "과목 공부를 종료했습니다. 현재 좌석은 그대로 유지됩니다.");
}

function openStudySubjectCompletionModal(subject, studyDate, goal, options = {}) {
  const elapsedSeconds = Math.floor(getStudySubjectElapsedMs(subject) / 1000);
  const content = el("div", { className: "study-subject-completion-modal" }, [
    el("p", { className: "study-subject-completion-subject" }, subject),
    el("div", { className: "study-subject-completion-summary" }, [
      el("div", {}, [
        el("span", {}, "목표시간"),
        el("strong", {}, formatStudyGoalMinutes(goal.targetMinutes)),
      ]),
      el("div", {}, [
        el("span", {}, "현재 공부시간"),
        el("strong", {}, formatStudyCafeElapsed(elapsedSeconds * 1000)),
      ]),
    ]),
    el("strong", { className: "study-subject-completion-question" }, "오늘 이 과목 공부를 완료했나요?"),
    el("p", { className: "subtle" }, "완료하고 종료하면 플래너에 ○ 또는 △ 결과가 기록됩니다."),
    el("div", { className: "study-subject-completion-actions" }, [
      button("중지만 하기", "btn secondary", "button", () => {
        closeInfoModal();
        stopStudyCafePreviewTimer({ ...options, confirmed: true, subjectCompleted: false });
      }),
      button("완료하고 종료", "btn", "button", () => {
        closeInfoModal();
        stopStudyCafePreviewTimer({ ...options, confirmed: true, subjectCompleted: true });
      }),
    ]),
  ]);
  openInfoModal({
    title: "과목 공부를 마칠까요?",
    className: "study-subject-completion-dialog",
    content,
    confirmLabel: "취소",
  });
}

function formatStudyGoalMinutes(minutes) {
  const normalized = Math.max(0, Number(minutes) || 0);
  return normalized % 60 === 0 ? `${normalized / 60}시간` : `${Math.floor(normalized / 60)}시간 ${normalized % 60}분`;
}

async function releaseStudyCafeSeat(options = {}) {
  if (studyCafeTimerActionPending) return false;
  if (String(studyCafePreviewState.selectedSeatId || "").startsWith("private-seat-")) {
    return releasePrivateStudyRoomSeat(options);
  }
  const seatNumber = STUDY_CAFE_PREVIEW_SEATS.findIndex(
    (seat) => seat.id === studyCafePreviewState.selectedSeatId
  ) + 1;
  if (!seatNumber || (options.skipConfirm !== true && !confirm(`${formatStudyCafeSeatLabel(seatNumber)}을 비울까요?`))) {
    return false;
  }
  studyCafeTimerActionPending = true;
  beginStudyCafeLocalSessionMutation();
  const previousSeatState = {
    selectedSeatId: studyCafePreviewState.selectedSeatId,
    subject: studyCafePreviewState.subject,
    pendingSubject: studyCafePreviewState.pendingSubject,
    running: studyCafePreviewState.running,
    paused: studyCafePreviewState.paused,
    elapsedMs: studyCafePreviewState.elapsedMs,
    startedAt: studyCafePreviewState.startedAt,
    subjectStartedAt: studyCafePreviewState.subjectStartedAt,
    subjectElapsedMs: { ...(studyCafePreviewState.subjectElapsedMs || {}) },
    idleSince: studyCafePreviewState.idleSince,
    timerFullscreen: studyCafePreviewState.timerFullscreen,
    temporaryNickname: studyCafePreviewState.temporaryNickname,
    temporaryNicknameAwaitingEntry: studyCafePreviewState.temporaryNicknameAwaitingEntry,
  };
  cancelStudyCafeCountdown();
  clearStudyCafeIdleWarning();
  studyCafePreviewState.selectedSeatId = "";
  studyCafePreviewState.subject = "";
  studyCafePreviewState.pendingSubject = "";
  studyCafePreviewState.running = false;
  studyCafePreviewState.paused = false;
  studyCafePreviewState.elapsedMs = 0;
  studyCafePreviewState.startedAt = 0;
  studyCafePreviewState.subjectStartedAt = 0;
  studyCafePreviewState.idleSince = 0;
  studyCafePreviewState.timerFullscreen = false;
  if (!studyCafePreviewState.nickname) {
    studyCafePreviewState.temporaryNickname = "";
    studyCafePreviewState.temporaryNicknameAwaitingEntry = true;
  }
  render();
  let result;
  try {
    result = await mutateStudyCafeRemote("release_seat", {}, { refresh: false });
  } finally {
    studyCafeTimerActionPending = false;
    finishStudyCafeLocalSessionMutation();
  }
  if (!result?.ok) {
    Object.assign(studyCafePreviewState, previousSeatState);
    renderStudyCafeStateUpdate();
    return false;
  }
  notify(
    options.autoRelease === true
      ? "15분 동안 타이머가 정지되어 좌석이 자동으로 비워졌습니다."
      : `${formatStudyCafeSeatLabel(seatNumber)}을 비웠습니다.`
  );
  return true;
}

async function releasePrivateStudyRoomSeat(options = {}) {
  const room = studyRoomState.room;
  const seatNumber = Number(room?.mySeatNumber) || 0;
  if (!room || !seatNumber) return false;
  if (options.skipConfirm !== true && !confirm(`${seatNumber}번 좌석을 비울까요?`)) return false;
  studyCafeTimerActionPending = true;
  const result = await mutateStudyRoom("release_seat", { roomId: room.id });
  studyCafeTimerActionPending = false;
  if (!result.ok) return false;
  resetStudyCafeLocalSeatForPrivateRoom();
  renderStudyCafeStateUpdate();
  notify(options.autoRelease === true
    ? "15분 동안 타이머가 정지되어 스터디방 좌석이 자동으로 비워졌습니다."
    : `${seatNumber}번 좌석을 비웠습니다.`);
  return true;
}

function checkStudyCafeIdleSeat() {
  if (!studyCafePreviewState.selectedSeatId || studyCafePreviewState.running) {
    studyCafePreviewState.idleSince = 0;
    clearStudyCafeIdleWarning();
    return;
  }
  if (!studyCafePreviewState.idleSince) {
    studyCafePreviewState.idleSince = Date.now();
    return;
  }
  if (Date.now() - studyCafePreviewState.idleSince < STUDY_CAFE_IDLE_WARNING_MS) return;
  if (document.visibilityState === "hidden") return;
  const warning = document.querySelector("[data-study-cafe-idle-warning]");
  if (!warning) {
    openStudyCafeIdleWarning();
    return;
  }
  if (studyCafeIdleReleasePending) return;
  studyCafeIdleWarningRemaining = Math.max(0, studyCafeIdleWarningRemaining - 1);
  const countdown = warning.querySelector("[data-study-cafe-idle-countdown]");
  if (countdown) countdown.textContent = String(studyCafeIdleWarningRemaining);
  if (studyCafeIdleWarningRemaining === 0) {
    studyCafeIdleReleasePending = true;
    releaseStudyCafeSeat({ skipConfirm: true, autoRelease: true })
      .then((released) => {
        if (released) return;
        studyCafeIdleWarningRemaining = STUDY_CAFE_IDLE_COUNTDOWN_SECONDS;
        const activeCountdown = document.querySelector("[data-study-cafe-idle-countdown]");
        if (activeCountdown) activeCountdown.textContent = String(studyCafeIdleWarningRemaining);
      })
      .finally(() => {
        studyCafeIdleReleasePending = false;
      });
  }
}

function openStudyCafeIdleWarning() {
  closeInfoModal();
  studyCafeIdleWarningRemaining = STUDY_CAFE_IDLE_COUNTDOWN_SECONDS;
  const countdown = el(
    "strong",
    {
      className: "study-cafe-idle-countdown",
      "data-study-cafe-idle-countdown": "true",
      ariaLive: "assertive",
    },
    String(studyCafeIdleWarningRemaining)
  );
  const keepButton = button("자리 유지", "btn study-cafe-idle-keep-button", "button", async () => {
    if (studyCafeIdleReleasePending) return;
    studyCafeIdleReleasePending = true;
    keepButton.disabled = true;
    const result = await mutateStudyCafeRemote("keep_seat");
    studyCafeIdleReleasePending = false;
    if (!result.ok) {
      keepButton.disabled = false;
      studyCafeIdleWarningRemaining = STUDY_CAFE_IDLE_COUNTDOWN_SECONDS;
      countdown.textContent = String(studyCafeIdleWarningRemaining);
      return;
    }
    studyCafePreviewState.idleSince = Date.now();
    clearStudyCafeIdleWarning();
    notify("좌석이 유지되었습니다. 15분 후 다시 확인합니다.");
  });
  const modal = el(
    "div",
    {
      className: "info-modal",
      role: "alertdialog",
      ariaModal: "true",
      "data-study-cafe-idle-warning": "true",
    },
    [
      el("div", { className: "info-modal-backdrop", ariaHidden: "true" }),
      el("div", { className: "info-modal-panel study-cafe-idle-warning-modal" }, [
        el("strong", {}, "좌석을 계속 이용하시겠어요?"),
        el("p", {}, "15분 동안 타이머가 정지되어 있습니다."),
        el("div", { className: "study-cafe-idle-countdown-wrap" }, [
          countdown,
          el("span", {}, "초 후 자동 퇴실"),
        ]),
        el("p", { className: "subtle" }, "계속 이용하려면 아래 버튼을 눌러주세요."),
        keepButton,
      ]),
    ]
  );
  document.body.appendChild(modal);
}

function clearStudyCafeIdleWarning() {
  document.querySelector("[data-study-cafe-idle-warning]")?.remove();
  studyCafeIdleWarningRemaining = 0;
}

function renderStudentDeviceManagementCard(student, profile) {
  const activeCount = Math.max(1, Number(profile.deviceActiveCount || 1));
  return el("section", { className: "student-history-button-card student-device-card" }, [
    el("div", { className: "student-history-head" }, [
      el("h2", {}, "등록 기기"),
      el("span", {}, `${activeCount}/2대`),
    ]),
  ]);
}

async function openStudentDeviceManager(studentId) {
  const profile = getStudentProfile(studentId);
  if (!profile?.deviceToken) return notify("현재 기기 등록 정보를 찾을 수 없습니다.");
  openLoadingModal("등록 기기 확인 중", "사용 중인 기기 목록을 불러오고 있습니다.");
  try {
    const result = await requestStudentDeviceAction("list", { studentId, deviceToken: profile.deviceToken });
    if (!result.ok) {
      if (result.error === "device_not_active") {
        clearStudentDeviceAuth(studentId);
        saveState({ skipRemote: true });
        render();
        return notify("현재 기기의 등록이 해제되었습니다. 다시 등록해주세요.");
      }
      return notify("등록 기기 목록을 불러오지 못했습니다.");
    }
    profile.deviceActiveCount = result.devices.length;
    saveState({ skipRemote: true });
    openInfoModal({
      title: "등록 기기 관리",
      className: "student-device-manager-modal",
      content: renderStudentDeviceList(studentId, result.devices),
    });
  } catch (error) {
    console.error(error);
    notify("등록 기기 서버에 연결하지 못했습니다.");
  } finally {
    closeLoadingModal();
  }
}

function renderStudentDeviceList(studentId, devices) {
  if (!devices.length) return el("div", { className: "empty" }, "등록된 기기가 없습니다.");
  return el("div", { className: "student-device-list" }, devices.map((device) =>
    el("article", { className: "student-device-item" }, [
      el("div", { className: "student-device-item-head" }, [
        el("strong", {}, device.label || "등록 기기"),
        device.isCurrent ? el("span", { className: "badge approved" }, "현재 기기") : null,
      ]),
      el("p", { className: "subtle" }, `등록 ${formatDateCompact(device.registeredAt)} · 최근 사용 ${formatDateCompact(device.lastUsedAt)}`),
      device.tokenPreview ? el("small", {}, `기기 코드 ···${device.tokenPreview}`) : null,
      button(device.isCurrent ? "현재 기기 해제" : "이 기기 해제", "mini-btn danger", "button", () =>
        revokeStudentDevice(studentId, device)
      ),
    ])
  ));
}

async function revokeStudentDevice(studentId, device) {
  const message = device.isCurrent
    ? "현재 기기를 해제하면 다시 등록해야 합니다. 계속할까요?"
    : `${device.label || "선택한 기기"}를 해제할까요?`;
  if (!confirm(message)) return;
  const profile = getStudentProfile(studentId);
  if (!profile?.deviceToken) return;
  try {
    const result = await requestStudentDeviceAction("revoke", {
      studentId,
      deviceToken: profile.deviceToken,
      targetDeviceId: device.id,
      reason: "학생 개별 기기 해제",
    });
    if (!result.ok) return notify("기기를 해제하지 못했습니다. 목록을 다시 확인해주세요.");
    if (result.selfRevoked) {
      closeInfoModal();
      clearStudentDeviceAuth(studentId);
      saveState({ skipRemote: true });
      render();
      return notify("현재 기기를 해제했습니다. 다시 등록해주세요.");
    }
    profile.deviceActiveCount = result.activeCount || 1;
    notify("선택한 기기를 해제했습니다.");
    await openStudentDeviceManager(studentId);
  } catch (error) {
    console.error(error);
    notify("기기 해제 중 오류가 발생했습니다.");
  }
}

function clearStudentDeviceAuth(studentId) {
  if (state.settings.studentProfiles?.[studentId]) delete state.settings.studentProfiles[studentId];
  if (state.settings.studentAuthId === studentId) state.settings.studentAuthId = "";
  if (state.settings.lastStudentId === studentId) state.settings.lastStudentId = "";
}

async function requestStudentDeviceAction(action, payload) {
  const response = await fetch("/api/student-devices", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await response.json().catch(() => ({}));
  return { ...data, ok: response.ok && data.ok === true, httpStatus: response.status };
}

function renderStudentOutingHistoryButton(studentId) {
  const outings = state.outings
    .filter((outing) => outing.studentId === String(studentId))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return el("section", { className: "student-history-button-card" }, [
    el("div", { className: "student-history-head" }, [
      el("h2", {}, "외출 내역"),
      el("span", {}, String(outings.length) + "건"),
    ]),
    button("외출 내역 보기", "btn secondary", "button", () => openStudentOutingHistoryModal(studentId)),
  ]);
}

function openStudentOutingHistoryModal(studentId) {
  const outings = state.outings
    .filter((outing) => outing.studentId === String(studentId))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  openInfoModal({
    title: "외출 내역",
    className: "history-modal-panel outing-history-modal",
    content: outings.length
      ? el(
          "div",
          { className: "student-history-list" },
          outings.map((outing) =>
            el("article", { className: "student-history-item" }, [
              historyRow("날짜", formatDateOnly(outing.createdAt)),
              historyRow("사유", outing.reason || "-"),
              historyRow("외출 시간", formatTimeOnly(outing.createdAt)),
              historyRow("복귀 시간", getOutingReturnedAt(outing) ? formatTimeOnly(getOutingReturnedAt(outing)) : "-"),
            ])
          )
        )
      : el("div", { className: "empty" }, "아직 외출 내역이 없습니다."),
  });
}

function renderStudentPenaltyHistoryButton(studentId) {
  const penalties = getPenaltiesForStudent(studentId);
  const total = getPenaltyTotal(studentId);

  return el("section", { className: "student-history-button-card student-penalty-card" }, [
    el("div", { className: "student-history-head" }, [
      el("h2", {}, "상/벌점 내역"),
      el("span", {}, `누적 ${formatPenaltyPoints(total)} · ${penalties.length}건`),
    ]),
    button("상/벌점 내역 보기", "btn secondary", "button", () => openStudentPenaltyHistoryModal(studentId)),
  ]);
}

function openStudentPenaltyHistoryModal(studentId) {
  const penalties = getPenaltiesForStudent(studentId);
  openInfoModal({
    title: "상/벌점 내역",
    className: "history-modal-panel penalty-detail-modal",
    content: penalties.length
      ? renderPenaltyDetailTable(penalties)
      : el("div", { className: "empty" }, "아직 상/벌점 내역이 없습니다."),
  });
}

function renderPenaltyDetailTable(penalties) {
  const showCancel = penalties.some((penalty) => typeof canCancelPenalty === "function" && canCancelPenalty(penalty));
  const headers = showCancel ? ["날짜", "상/벌점", "사유", "담당자", "관리"] : ["날짜", "상/벌점", "사유", "담당자"];
  const rows = penalties.map((penalty) =>
    el("tr", {}, [
      el("td", {}, formatDateOnly(penalty.createdAt)),
      el("td", {}, formatPenaltyPoints(penalty.points)),
      el("td", { className: "wide-cell" }, penalty.reason || "-"),
      el("td", {}, penalty.managerName || "-"),
      showCancel
        ? el(
            "td",
            { className: "student-admin-actions" },
            typeof canCancelPenalty === "function" && canCancelPenalty(penalty)
              ? button("취소", "mini-btn danger", "button", () => cancelPenalty(penalty.id))
              : "-"
          )
        : null,
    ].filter(Boolean))
  );
  labelTableRows(headers, rows);

  return el("div", { className: "excel-table-wrap penalty-detail-table-wrap" }, [
    el("table", { className: "excel-table penalty-detail-table" }, [
      el("thead", {}, [
        el("tr", {}, headers.map((header) => el("th", {}, header))),
      ]),
      el("tbody", {}, rows),
    ]),
  ]);
}

function historyRow(label, value) {
  return el("div", { className: "student-history-row" }, [
    el("span", {}, label),
    el("strong", {}, value),
  ]);
}

function formatDateOnly(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).format(new Date(value));
}

function formatTimeOnly(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function resolveStudentTrack(track, customTrack) {
  const selected = normalizeCoastGuardTrack(track);
  if (selected !== "기타") return selected;
  return String(customTrack || "").trim();
}

function profileItem(label, value) {
  return el("div", { className: "student-profile-item" }, [
    el("span", {}, label),
    el("strong", {}, value),
  ]);
}

function formatDday(dateString) {
  const target = new Date(`${dateString}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.ceil((target - today) / 86400000);
  if (diff === 0) return "D-Day";
  if (diff > 0) return `D-${diff}`;
  return `D+${Math.abs(diff)}`;
}

function formatExamDate(dateString) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).format(new Date(`${dateString}T00:00:00`));
}

function renderHome() {
  const activeOutings = state.outings.filter(isActiveOuting);
  const todayEarlyLeaves = state.outings.filter(isTodayEarlyLeave);
  const activeOutingCases = state.outings.filter(isActiveOuting);
  const returnedTodayCases = state.outings.filter((outing) => isToday(getOutingReturnedAt(outing)));

  return el("div", { className: "grid" }, [
    el("div", { className: "stat-groups" }, [
      studentCountStatGroup(),
      statGroup("외출 인원", [
        stat("외출 중 학생", countOutingStudents(activeOutings), "명"),
        stat("조퇴 인원", countOutingStudents(todayEarlyLeaves), "명"),
      ]),
      statGroup("외출 건수", [
        stat("진행 중", activeOutingCases.length, "건"),
        stat("외출 중", activeOutings.length, "건"),
        stat("오늘 복귀", returnedTodayCases.length, "건"),
      ]),
    ]),
    panel("관리 메뉴", [
      el("div", { className: "module-grid" }, [
        hasTeacherPermission("outing.read") ? moduleCard("외출 관리", "외출 신청, 사진 인증, 복귀 확인을 관리합니다.", "outing", "운영 중") : null,
        hasTeacherPermission("grades.read") ? moduleCard("주간평가", "주차별 시험, 과목, 정답과 답안지 파일을 관리합니다.", "weekly-exams", "운영 중") : null,
        hasTeacherPermission("grades.read") ? moduleCard("주간평가 미응시자", "주차별 미응시자와 일부 응시자를 확인합니다.", "weekly-absences", "운영 중") : null,
        hasTeacherPermission("grades.read") ? moduleCard("성적 관리", "주간평가와 파이널 모의고사 성적을 학생별로 조회합니다.", "grades", "운영 중") : null,
        hasTeacherPermission("fitness.read") ? moduleCard("체력평가", "윗몸일으키기, 팔굽혀펴기, 좌우악력 점수를 입력하고 환산 점수를 조회합니다.", "fitness", "운영 중") : null,
        hasTeacherPermission("penalties.read") ? moduleCard("상/벌점 관리", "상/벌점 부여, 누적 점수, 지도 기록을 관리합니다.", "penalties", "운영 중") : null,
        hasTeacherPermission("attendance.read") ? moduleCard("출석 관리", "현장 사진 출석과 일별 출석 현황을 관리합니다.", "attendance", "운영 중") : null,
        hasTeacherPermission("study_cafe.read") ? moduleCard("온라인 스터디카페", "현재 좌석, 순공시간과 온라인 학생 이용 상태를 관리합니다.", "study-cafe-admin", "운영 중") : null,
        hasTeacherPermission("question_board.read") ? moduleCard("게시판 관리", "수강생 과목 게시글과 댓글, 신고 내용을 관리합니다.", "question-board-admin", "운영 중") : null,
        hasTeacherPermission("inquiries.read") ? moduleCard("문의 관리", "수강생이 남긴 비공개 문의를 확인하고 답변합니다.", "inquiry-board-admin", "운영 중") : null,
        hasTeacherPermission("curriculum.read") ? moduleCard("커리큘럼 관리", "과목별 회차와 강의, 공개 상태를 구성합니다.", "curriculum-admin", "운영 중") : null,
        hasTeacherPermission("notices.read") ? moduleCard("공지 관리", "학생 홈에 표시되는 중요 공지를 등록하고 관리합니다.", "notices", "운영 중") : null,
        hasTeacherPermission("managers.read") ? moduleCard("담당자 등록", "상/벌점 처리 담당자 명단을 등록하고 관리합니다.", "managers", "운영 중") : null,
        hasTeacherPermission("students.read") ? moduleCard("기기 등록 이력", "학생 앱 기기 등록과 초기화 기록을 확인합니다.", "device-history", "운영 중") : null,
      ].filter(Boolean)),
    ]),
  ]);
}

function moduleCard(titleText, description, route, statusText) {
  return el("article", { className: "module-card" }, [
    el("div", { className: "module-card-head" }, [
      el("h3", {}, titleText),
      el("span", { className: statusText === "운영 중" ? "module-status active" : "module-status" }, statusText),
    ]),
    el("p", {}, description),
    button("열기", "btn secondary", "button", () => navigate(route)),
  ]);
}

function renderComingSoonManagement(heading, copy) {
  return el("div", { className: "grid" }, [
    panel(heading, [
      el("div", { className: "empty management-empty" }, [
        el("strong", {}, `${heading} 준비 중`),
        el("p", {}, copy),
      ]),
    ]),
  ]);
}
