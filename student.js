function renderStudentChecklist() {
  const step = getStudentStepFromRoute();
  state.settings.studentStep = step;
  if (step !== "request" && !getActiveOuting(state.settings.lastStudentId) && step !== "done") {
    setStudentStep("request");
    return studentStepView("외출 신청", createOutForm(), "request-step");
  }
  if (step === "verify") return studentStepView("사진 인증", createVerifyForm(), "photo-step");
  if (step === "return") return studentStepView("학원 복귀 인증", createReturnForm(), "return-step");
  if (step === "done") return el("div", { className: "grid student-view" }, [panel("복귀 완료", [renderDoneState()])]);
  return studentStepView("외출 신청", createOutForm(), "request-step");
}

function getStudentStepFromRoute() {
  if (currentRoute === "student") return "request";
  const routeSteps = {
    "student-verify": "verify",
    "student-return": "return",
    "student-done": "done",
  };
  return routeSteps[currentRoute] || state.settings.studentStep || "request";
}

function setStudentStep(step) {
  const routes = {
    request: "student",
    verify: "student-verify",
    return: "student-return",
    done: "student-done",
  };
  const nextRoute = routes[step] || "student";
  state.settings.studentStep = step;
  if (currentRoute === nextRoute && location.hash === `#${nextRoute}`) return;
  currentRoute = nextRoute;
  if (location.hash !== `#${nextRoute}`) {
    location.hash = nextRoute;
  }
}

function studentStepView(heading, content, id) {
  return el("div", { className: "grid student-view" }, [panel(heading, [content], id)]);
}

function renderStudentOut() {
  return studentShell("외출 신청", "학생은 고유번호로 신청만 남깁니다. 승인/반려는 교사용 화면에서 처리합니다.", [
    panel("신청 정보", [createOutForm()]),
    panel("내 진행 상태 확인", [studentLookup("신청 상태 보기")]),
  ]);
}

function createOutForm() {
  const authedStudent = typeof getAuthedStudent === "function" ? getAuthedStudent() : null;
  const studentIdInput = input("studentId", "text", "예: 18004", authedStudent?.id || state.settings.lastStudentId || "");
  const expectedReturnInput = splitTimeSelect("expectedReturn");
  const studentResult = el("div", { className: "student-check-result", ariaLive: "polite" });
  if (authedStudent) {
    studentIdInput.readOnly = true;
    studentResult.className = "student-check-result success";
    studentResult.textContent = authedStudent.name;
  }
  const studentIdControl = el("div", { className: "student-id-check" }, [
    studentIdInput,
    authedStudent ? null : button("조회", "btn secondary", "button", () => {
      const student = findStudent(studentIdInput.value);
      studentResult.innerHTML = "";
      if (!student) {
        studentResult.className = "student-check-result error";
        studentResult.textContent = "등록된 학생을 찾을 수 없습니다.";
        return;
      }
      studentResult.className = "student-check-result success";
      studentResult.textContent = `${student.name}`;
    }),
  ]);

  studentIdInput.addEventListener("input", () => {
    if (authedStudent) return;
    studentResult.className = "student-check-result";
    studentResult.textContent = "";
  });

  const form = el("form", { className: "form-grid" }, [
    field("학생 고유번호", el("div", {}, [studentIdControl, studentResult]), "", "예: 18기 4번 → 18004"),
    field("외출 사유", select("reason", ["병원", "은행", "수영레슨", "개인 사유 인증", "기타"])),
    field("예상 복귀 시각", expectedReturnInput, "time-field"),
    field("상세 사유", textarea("detail", "방문 장소나 필요한 내용을 입력하세요."), "full"),
    el("div", { className: "field full" }, [
      button("외출 신청하기", "btn"),
    ]),
  ]);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = formData(form);
    const student = findStudent(data.studentId);
    if (!student) {
      studentResult.className = "student-check-result error";
      studentResult.textContent = "등록된 학생을 찾을 수 없습니다.";
      return notify("등록된 학생 고유번호가 아닙니다. 교사용 관리에서 학생을 먼저 등록해주세요.");
    }
    const activeOuting = getActiveOuting(data.studentId);
    if (activeOuting) {
      state.settings.lastStudentId = student.id;
      setStudentStep(activeOuting.status === "requested" ? "verify" : "return");
      state.settings.earlyLeaveMode = false;
      saveState();
      render();
      notify("진행 중인 외출 신청 화면으로 이동했습니다.");
      return;
    }

    state.outings.unshift({
      id: createId(),
      studentId: student.id,
      studentName: student.name,
      className: student.className,
      reason: data.reason,
      detail: data.detail.trim(),
      expectedReturn: data.expectedReturn,
      status: "requested",
      decision: "pending",
      teacherMemo: "",
      earlyLeaveReason: "",
      receiptNote: "",
      photos: [],
      createdAt: new Date().toISOString(),
      verifiedAt: null,
      returnedAt: null,
    });
    state.settings.lastStudentId = student.id;
    setStudentStep("verify");
    saveState();
    form.reset();
    render();
    notify("외출 신청이 접수되었습니다. 사진 인증을 진행하세요.");
  });

  return form;
}

function renderStudentAttendance() {
  const student = getAuthedStudent();
  const todayCheck = getStudentAttendanceForDate(student.id);
  return el("div", { className: "grid student-view" }, [
    todayCheck
      ? panel("오늘 출석", [
          el("div", { className: "empty success-message" }, "오늘 출석 인증이 완료되었습니다."),
          renderStudentAttendanceCheckSummary(todayCheck),
        ])
      : panel("출석 체크", [createStudentAttendanceForm(student)]),
  ]);
}

function renderStudentAttendanceCheckSummary(check) {
  const src = getAttendancePhotoSrc(check);
  const nodes = [
    el("div", { className: "student-profile-list" }, [
      profileItem("출석일", check.checkDate || getTodayDateKey()),
      profileItem("상태", check.status === "pre_arrival_reason" ? "사유 인증" : "출석"),
      profileItem("인증 시간", formatTime(check.createdAt)),
    ]),
  ];
  if (src) {
    nodes.push(button("인증 사진 보기", "btn secondary", "button", () => {
      openPhotoModal({
        type: check.status === "pre_arrival_reason" ? "등원 전 사유 인증" : "출석 인증",
        photoUrl: check.photoUrl,
        photoDataUrl: check.photoDataUrl,
        uploadedAt: check.createdAt,
        details: [check.studentName, check.reason, check.detail],
      });
    }));
  }
  return el("div", { className: "grid" }, nodes);
}

function createStudentAttendanceForm(student) {
  const submitButton = button("출석 인증하기", "btn");
  const form = el("form", { className: "form-grid" }, [
    field("출석 인증 사진", photoCaptureInput("attendancePhoto"), "full", "학원 현장에서 사진을 찍어주세요."),
    el("div", { className: "field full" }, [
      submitButton,
      el("p", { className: "subtle" }, isAttendanceCheckOpen() ? "오늘 한 번만 출석 인증할 수 있습니다." : `출석 인증 시간이 마감되었습니다. 마감 시간: ${formatAttendanceDeadline()}`),
    ]),
  ]);

  if (!isAttendanceCheckOpen()) submitButton.disabled = true;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (getStudentAttendanceForDate(student.id)) {
      render();
      return notify("이미 오늘 출석 인증이 완료되었습니다.");
    }
    const file = form.elements.attendancePhoto.files[0];
    if (!file) return notify("출석 인증 사진을 촬영해주세요.");

    submitButton.disabled = true;
    setButtonLoading(submitButton, "출석 인증 중...");
    try {
      await createAttendanceCheck(student, file);
      form.reset();
      render();
      notify("출석 인증이 완료되었습니다.");
    } catch (error) {
      console.error(error);
      notify("출석 인증 중 오류가 발생했습니다. 다시 시도해주세요.");
      submitButton.disabled = false;
      submitButton.textContent = "출석 인증하기";
    }
  });

  return form;
}

function splitTimeSelect(name) {
  const hourSelect = el("select", { name: `${name}Hour` }, [
    el("option", { value: "" }, "시"),
    ...Array.from({ length: 15 }, (_, index) => {
      const hour = index + 9;
      const value = String(hour).padStart(2, "0");
      return el("option", { value }, `${value}시`);
    }),
  ]);
  const minuteSelect = el("select", { name: `${name}Minute` }, [
    el("option", { value: "" }, "분"),
    ...Array.from({ length: 12 }, (_, index) => {
      const value = String(index * 5).padStart(2, "0");
      return el("option", { value }, `${value}분`);
    }),
  ]);
  const hiddenInput = el("input", { type: "hidden", name, value: "" });
  const updateValue = () => {
    hiddenInput.value = hourSelect.value && minuteSelect.value ? `${hourSelect.value}:${minuteSelect.value}` : "";
  };
  hourSelect.addEventListener("change", updateValue);
  minuteSelect.addEventListener("change", updateValue);
  return el("div", { className: "split-time-select" }, [
    hourSelect,
    minuteSelect,
    hiddenInput,
  ]);
}

function renderStudentVerify() {
  return studentShell("사진 인증", "외출 장소나 영수증 사진을 제출하면 교사용 화면에서 바로 확인됩니다.", [
    panel("인증 제출", [createVerifyForm()]),
    panel("내 진행 상태 확인", [studentLookup("인증 상태 보기")]),
  ]);
}

function createVerifyForm() {
  if (state.settings.earlyLeaveMode) return createEarlyLeaveForm();

  const submitButton = button("사진 인증 제출", "btn");
  const form = el("form", { className: "form-grid" }, [
    field("현장 인증 사진", photoCaptureInput("sitePhoto"), "full"),
    field("영수증 인증 사진 (선택)", photoCaptureInput("receiptPhoto"), "full"),
    el("div", { className: "field full" }, [
      submitButton,
    ]),
    el("div", { className: "field full" }, [
      button("조퇴", "btn secondary", "button", () => {
        state.settings.earlyLeaveMode = true;
        saveState();
        render();
      }),
    ]),
  ]);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const outing = getActiveOuting(state.settings.lastStudentId);
    if (!outing) return notify("진행 중인 외출 신청이 없습니다.");

    const sitePhoto = form.elements.sitePhoto.files[0];
    const receiptPhoto = form.elements.receiptPhoto.files[0];
    if (!sitePhoto) return notify("현장 인증 사진을 업로드해주세요.");

    submitButton.disabled = true;
    setButtonLoading(submitButton, "사진 업로드 중...");

    try {
      const siteDataUrl = await compressImage(sitePhoto);
      const receiptDataUrl = receiptPhoto ? await compressImage(receiptPhoto) : "";

    outing.photos = outing.photos.filter((photo) => photo.type !== "현장 인증" && photo.type !== "영수증 인증");
    outing.photos.push({
      id: createId(),
      type: "현장 인증",
      name: sitePhoto.name,
      dataUrl: siteDataUrl,
      uploadedAt: new Date().toISOString(),
    });
    if (receiptPhoto) {
      outing.photos.push({
        id: createId(),
        type: "영수증 인증",
        name: receiptPhoto.name,
        dataUrl: receiptDataUrl,
        uploadedAt: new Date().toISOString(),
      });
    }
    outing.receiptNote = "";
    outing.status = outing.status === "returned" ? "returned" : "verified";
    outing.verifiedAt = new Date().toISOString();
    state.settings.lastStudentId = outing.studentId;
    setStudentStep("return");
    state.settings.earlyLeaveMode = false;
    saveState();
    form.reset();
    render();
    notify("사진 인증이 제출되었습니다. 복귀 후 반납 처리하세요.");
    } catch (error) {
      console.error(error);
      notify("사진 처리 중 오류가 발생했습니다. 더 작은 사진으로 다시 시도해주세요.");
      submitButton.disabled = false;
      submitButton.textContent = "사진 인증 제출";
    }
  });

  return form;
}

function photoCaptureInput(name) {
  const inputNode = fileInput(name);
  inputNode.className = "visually-hidden-file";
  const status = el("span", { className: "photo-input-status" }, "사진을 촬영해주세요.");
  const preview = el("div", { className: "photo-input-preview", hidden: true });
  const trigger = button("인증하기", "btn secondary photo-input-button", "button", () => inputNode.click());
  let previewUrl = "";

  inputNode.addEventListener("change", () => {
    const file = inputNode.files[0];
    status.textContent = file ? "사진이 선택되었습니다." : "사진을 촬영해주세요.";
    status.className = file ? "photo-input-status selected" : "photo-input-status";
    preview.innerHTML = "";
    preview.hidden = !file;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = "";
    if (file) {
      previewUrl = URL.createObjectURL(file);
      preview.appendChild(el("img", { src: previewUrl, alt: "선택한 사진 미리보기" }));
    }
  });

  return el("div", { className: "photo-input-control" }, [
    inputNode,
    trigger,
    status,
    preview,
  ]);
}

function setButtonLoading(buttonNode, text) {
  buttonNode.innerHTML = "";
  buttonNode.appendChild(el("span", { className: "loading-spinner", ariaHidden: "true" }));
  buttonNode.appendChild(document.createTextNode(text));
}

function createEarlyLeaveForm() {
  const form = el("form", { className: "form-grid" }, [
    field("조퇴 사유", textarea("earlyLeaveReason", "조퇴 사유를 입력하세요."), "full"),
    el("div", { className: "field full" }, [
      button("조퇴 완료", "btn"),
      button("사진 인증으로 돌아가기", "btn secondary", "button", () => {
        state.settings.earlyLeaveMode = false;
        saveState();
        render();
      }),
    ]),
  ]);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = formData(form);
    const reason = data.earlyLeaveReason.trim();
    if (!reason) return notify("조퇴 사유를 입력해주세요.");
    const outing = getActiveOuting(state.settings.lastStudentId);
    if (!outing) return notify("진행 중인 외출 신청이 없습니다.");

    outing.status = "returned";
    outing.decision = "approved";
    outing.teacherMemo = outing.teacherMemo ? `${outing.teacherMemo}\n조퇴 사유: ${reason}` : `조퇴 사유: ${reason}`;
    outing.earlyLeaveReason = reason;
    outing.returnedAt = new Date().toISOString();
    setStudentStep("done");
    state.settings.earlyLeaveMode = false;
    state.settings.completionType = "earlyLeave";
    saveState();
    form.reset();
    render();
    notify("조퇴 처리가 완료되었습니다.");
  });

  return form;
}

function renderStudentReturn() {
  return studentShell("학원 복귀 인증", "복귀 시간을 남기면 교사가 한 페이지에서 최종 상태를 확인할 수 있습니다.", [
    panel("복귀 처리", [createReturnForm()]),
    panel("내 진행 상태 확인", [studentLookup("복귀 상태 보기")]),
  ]);
}

function createReturnForm() {
  const submitButton = button("복귀 완료", "btn");
  const form = el("form", { className: "form-grid" }, [
    field("학생 고유번호", input("studentId", "text", "예: 18004", state.settings.lastStudentId || ""), "", "예: 18기 4번 → 18004"),
    field("복귀 현장 사진", photoCaptureInput("returnPhoto"), "full", "사무실에 있는 복귀 사진을 찍어주세요."),
    el("div", { className: "field full" }, [
      submitButton,
      el("p", { className: "subtle" }, "복귀 후 현장 사진 인증을 꼭 해주세요."),
    ]),
  ]);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = formData(form);
    const outing = getActiveOuting(data.studentId);
    if (!outing) return notify("진행 중인 외출 신청이 없습니다.");
    const returnPhoto = form.elements.returnPhoto.files[0];
    if (!returnPhoto) return notify("복귀 현장 사진을 촬영해주세요.");
    submitButton.disabled = true;
    setButtonLoading(submitButton, "복귀 처리 중...");
    try {
    const returnDataUrl = await compressImage(returnPhoto);
    outing.photos = outing.photos.filter((photo) => photo.type !== "복귀 인증");
    outing.photos.push({
      id: createId(),
      type: "복귀 인증",
      name: returnPhoto.name,
      dataUrl: returnDataUrl,
      uploadedAt: new Date().toISOString(),
    });
    outing.status = "returned";
    outing.returnedAt = new Date().toISOString();
    state.settings.lastStudentId = outing.studentId;
    setStudentStep("done");
    state.settings.completionType = "return";
    saveState();
    form.reset();
    render();
    notify("복귀 완료되었습니다.");
    } catch (error) {
      console.error(error);
      notify("복귀 사진 처리 중 오류가 발생했습니다. 다시 시도해주세요.");
      submitButton.disabled = false;
      submitButton.textContent = "복귀 완료";
    }
  });

  return form;
}

function renderDoneState() {
  const message = state.settings.completionType === "earlyLeave" ? "조퇴 처리되었습니다." : "복귀 완료되었습니다.";
  return el("div", { className: "grid" }, [
    el("div", { className: "empty success-message" }, message),
    button("홈으로", "btn secondary", "button", goStudentHome),
  ]);
}

function goStudentHome() {
  setStudentStep("request");
  state.settings.earlyLeaveMode = false;
  state.settings.completionType = "";
  state.settings.lastStudentId = "";
  saveState();
  render();
}

function studentShell(heading, copy, children) {
  return el("div", { className: "grid student-view" }, [
    el("section", { className: "student-hero" }, [el("h2", {}, heading), el("p", {}, copy)]),
    ...children,
  ]);
}

function studentLookup(buttonText) {
  const form = el("form", { className: "form-grid" }, [
    field("학생 고유번호", input("studentId", "text", "예: 18004"), "", "예: 18기 4번 → 18004"),
    el("div", { className: "field full" }, [button(buttonText, "btn secondary")]),
  ]);
  const result = el("div", { className: "lookup-result" });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = formData(form);
    const outing = getLatestOuting(data.studentId);
    if (outing) {
      state.settings.lastStudentId = outing.studentId;
      saveState();
    }
    result.innerHTML = "";
    result.appendChild(outing ? outingCard(outing) : el("div", { className: "empty" }, "최근 외출 신청을 찾지 못했습니다."));
  });

  return el("div", { className: "grid" }, [form, result]);
}
