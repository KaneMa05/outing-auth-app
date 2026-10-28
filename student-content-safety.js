async function requestStudentContentSafety(action, payload = {}, admin = false) {
  const student = admin ? null : getAuthedStudent();
  const profile = student ? getStudentProfile(student.id) : null;
  if (!admin && !profile?.deviceToken) throw new Error("unauthorized");
  const response = await fetch("/api/student-content-safety", {
    method: "POST", credentials: "same-origin", signal: AbortSignal.timeout(20000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload, ...(admin ? {} : { studentId: student.id, deviceToken: profile.deviceToken }) }),
  });
  const data = await response.json();
  if (!response.ok || data.ok !== true) throw new Error(data.error || "unavailable");
  return data;
}

function studentContentSafetyError(error) {
  return ({ already_reported: "이미 신고한 내용입니다.", content_not_found: "내용이 삭제되었거나 접근할 수 없습니다.", content_changed: "해당 사용자의 자리가 변경되었습니다. 화면을 새로 확인해 주세요.", report_rate_limited: "오늘 신고 가능한 횟수를 초과했습니다.", unauthorized: "다시 로그인해 주세요.", block_limit: "차단 목록에서 기존 차단을 해제한 뒤 다시 시도해 주세요." })[error.message] || "처리하지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.";
}

function invalidateStudentContentViews(authorRef) {
  const scrub = value => {
    if (Array.isArray(value)) return value.filter(item=>!(authorRef && item?.safetyRef===authorRef && item.type==='chat')).map(scrub);
    if (!value || typeof value !== "object") return value;
    const result=Object.fromEntries(Object.entries(value).map(([key,item])=>[key,scrub(item)]));
    if(authorRef && value.safetyRef===authorRef){for(const key of ["name","senderName"])if(key in result)result[key]="차단한 사용자";if("statusMessage" in result)result.statusMessage="";}
    if(authorRef && value.hostSafetyRef===authorRef){result.name="차단한 사용자의 스터디룸";result.description="";}
    return result;
  };
  if (typeof questionBoardHomePreviewState !== "undefined") { questionBoardHomePreviewState.loaded = false; questionBoardHomePreviewState.posts = []; }
  if (typeof questionBoardState !== "undefined") { questionBoardState.loaded = false; questionBoardState.posts = []; questionBoardState.detail = null; }
  if (typeof studyRoomState !== "undefined") { studyRoomState.loaded = false; if(authorRef)studyRoomState.room=scrub(studyRoomState.room); }
  if (typeof studyCafeRemoteState !== "undefined") {
    studyCafeRemoteState.loaded = false;
    if(authorRef){studyCafeRemoteState.room=scrub(studyCafeRemoteState.room);studyCafeRemoteState.ranking=scrub(studyCafeRemoteState.ranking);studyCafeRemoteState.rankingPeriods=scrub(studyCafeRemoteState.rankingPeriods);}
  }
}

function renderStudentSafetyActions({ surface, targetId, authorRef, onChange = () => {} }) {
  const student = getAuthedStudent();
  if (!student || !getStudentProfile(student.id)?.deviceToken) return null;
  const target = { surface, targetId: String(targetId), ...(authorRef ? { authorRef } : {}) };
  const open = (action) => {
    const status = el("p", { role: "alert" });
    const reason = el("textarea", { rows: 3, maxLength: 300, ariaLabel: "신고 사유", placeholder: "신고 사유를 2자 이상 입력해 주세요." });
    let busy = false;
    const { confirmButton } = openInfoModal({
      title: action === "report" ? "부적절한 콘텐츠 신고" : "작성자 차단",
      className: "student-content-safety-modal",
      content: el("div", { className: "student-content-safety-content" }, [
        el("p", {}, action === "report" ? "내용과 신고 사유를 운영자에게 전달합니다. 운영자가 검토 후 조치합니다." : "이 사용자의 게시글·댓글·채팅을 숨기고 닉네임·상태 메시지를 표시하지 않습니다. 마이에서 차단을 해제할 수 있습니다."),
        ...(action === "report" ? [reason] : []), status,
        el("a", { href: "mailto:par0424@naver.com" }, "운영자 문의"),
        el("a", { href: "./community-guidelines.html" }, "커뮤니티 이용 규칙"),
      ]),
      confirmLabel: action === "report" ? "신고 접수" : "차단하기",
      onConfirm: async () => {
        if (busy || getAuthedStudent()?.id !== student.id) return;
        if (action === "report" && reason.value.trim().length < 2) { status.textContent = "신고 사유를 2자 이상 입력해 주세요."; return; }
        busy = true; confirmButton.disabled = true;
        try {
          const data = await requestStudentContentSafety(action, { ...target, ...(action === "report" ? { reason: reason.value.trim() } : {}) });
          closeInfoModal();
          notify(action === "report" ? "신고가 접수되었습니다." : "작성자를 차단했습니다.");
          if (action === "block") { invalidateStudentContentViews(data.authorRef); await onChange(); if (currentRoute === "feedback") render(); }
        } catch (error) { if (status.isConnected) status.textContent = studentContentSafetyError(error); }
        finally { busy = false; confirmButton.disabled = false; }
      },
    });
  };
  return el("span", { className: "student-content-safety-actions" }, [
    button("신고", "mini-btn", "button", () => open("report")),
    button("작성자 차단", "mini-btn", "button", () => open("block")),
  ]);
}

function openStudentContentBlockList() {
  const content = el("div", { className: "student-content-safety-content" });
  const studentId = getAuthedStudent()?.id;
  openInfoModal({ title: "차단한 사용자", className: "student-content-safety-modal", content, confirmLabel: "닫기" });
  const load = async () => {
    content.replaceChildren(el("p", { role: "status" }, "차단 목록을 확인하고 있습니다."));
    try {
      const data = await requestStudentContentSafety("list");
      if (!content.isConnected || getAuthedStudent()?.id !== studentId) return;
      content.replaceChildren(...(data.blocks.length ? data.blocks.map((row, index) => {
        const control = button("차단 해제", "mini-btn", "button", async () => {
          if (control.disabled || getAuthedStudent()?.id !== studentId) return;
          control.disabled = true;
          try { await requestStudentContentSafety("unblock", { authorRef: row.authorRef }); invalidateStudentContentViews(); await load(); }
          catch(error) { notify(studentContentSafetyError(error)); control.disabled = false; }
        });
        return el("div", {}, [el("p", {}, `차단한 사용자 ${index + 1} · ${new Date(row.createdAt).toLocaleString("ko-KR")}`), control]);
      }) : [el("p", {}, "차단한 사용자가 없습니다.")]));
    } catch(error) { if(content.isConnected) content.replaceChildren(el("p", { role: "alert" }, studentContentSafetyError(error)), button("다시 시도", "btn secondary", "button", load)); }
  };
  load();
}

function openStudentContentReportAdmin() {
  const content = el("div", { className: "student-content-safety-content" });
  openInfoModal({ title: "콘텐츠 신고 관리", className: "student-content-safety-modal", content, confirmLabel: "닫기" });
  const load = async () => {
    content.replaceChildren(el("p", { role: "status" }, "신고를 불러오는 중입니다."));
    try {
      const data = await requestStudentContentSafety("admin_list", {}, true);
      if (!content.isConnected) return;
      const labels = { post:"게시글", comment:"댓글", feedback:"의견", reply:"답글", message:"채팅", profile:"프로필", room:"스터디룸", member:"룸 멤버 프로필" };
      content.replaceChildren(...(data.reports.length ? data.reports.map(report => {
        const statusNode=el("p",{role:"alert"});
        const act = async (control,status) => {
          if(control.disabled)return;
          if(!confirm(status==='removed'?'신고된 콘텐츠를 숨기고 처리 완료할까요?':'이 신고를 기각할까요?'))return;
          control.disabled=true;
          try { await requestStudentContentSafety("admin_review",{reportId:report.id,status},true);await load(); }
          catch(error){statusNode.textContent=studentContentSafetyError(error);control.disabled=false;}
        };
        const remove=button("콘텐츠 숨김 처리", "mini-btn danger", "button",()=>act(remove,"removed"));
        const dismiss=button("신고 기각", "mini-btn", "button",()=>act(dismiss,"dismissed"));
        return el("article",{},[
          el("strong",{},labels[report.surface]||"콘텐츠"),el("p",{},report.reason),
          el("p",{className:"student-content-report-snapshot"},report.snapshot),
          ...(["post","comment"].includes(report.surface) && report.context_id && hasTeacherPermission("question_board.read") && typeof openQuestionAdminPost === "function" ? [button("게시글·첨부 원문 확인","mini-btn","button",()=>{closeInfoModal();navigate("question-board-admin");openQuestionAdminPost(report.context_id);})] : []),
          el("small",{},new Date(report.created_at).toLocaleString("ko-KR")),
          ...(hasTeacherPermission("inquiries.write")?[remove,dismiss]:[]),statusNode,
        ]);
      }) : [el("p",{},"검토 대기 신고가 없습니다.")]));
    }catch(error){if(content.isConnected)content.replaceChildren(el("p",{role:"alert"},studentContentSafetyError(error)),button("다시 시도","mini-btn","button",load));}
  };
  load();
}
