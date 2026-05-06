function renderStudentChecklist() {
  const step = getStudentStepFromRoute();
  state.settings.studentStep = step;
  if (step !== "request" && !getActiveOuting(state.settings.lastStudentId) && step !== "done") {
    setStudentStep("request");
    return renderStudentRequestStep();
  }
  const activeOuting = getActiveOuting(state.settings.lastStudentId);
  if (activeOuting?.earlyLeaveReason) return el("div", { className: "grid student-view" }, [panel("조퇴 신청 완료", [renderEarlyLeaveDoneState(activeOuting)])]);
  if (step === "verify") return studentStepView("사진 인증", createVerifyForm(), "photo-step");
  if (step === "return") return studentStepView("학원 복귀 인증", createReturnForm(), "return-step");
  if (step === "done") return el("div", { className: "grid student-view" }, [panel("복귀 완료", [renderDoneState()])]);
  return renderStudentRequestStep();
}

function getStudentStepFromRoute() {
  if (currentRoute === "student") {
    const student = getAuthedStudent();
    const activeOuting = getActiveOuting(student?.id || state.settings.lastStudentId);
    if (activeOuting) return activeOuting.status === "requested" ? "verify" : "return";
    return "request";
  }
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
  if (currentRoute === nextRoute && location.hash === "#" + nextRoute) return;
  currentRoute = nextRoute;
  if (location.hash !== "#" + nextRoute) location.hash = nextRoute;
}

function studentStepView(heading, content, id) {
  return el("div", { className: "grid student-view" }, [panel(heading, [content], id)]);
}

function renderStudentRequestStep() {
  const isEarlyLeaveMode = Boolean(state.settings.earlyLeaveMode);
  return el("div", { className: "grid student-view" }, [
    panel(isEarlyLeaveMode ? "조퇴 신청" : "외출 신청", [isEarlyLeaveMode ? createEarlyLeaveForm() : createOutForm()], "request-step"),
    !isEarlyLeaveMode
      ? el("div", { className: "attendance-secondary-action" }, [
          button("조퇴 신청하기", "btn secondary", "button", () => {
            state.settings.earlyLeaveMode = true;
            saveState();
            render();
          }),
        ])
      : null,
  ]);
}

function renderStudentOut() {
  return studentShell("외출 신청", "학생은 고유번호로 신청만 남깁니다. 승인/반려는 교사용 화면에서 처리합니다.", [
    panel("신청 정보", [createOutForm()]),
    panel("내 진행 상태 확인", [studentLookup("신청 상태 보기")]),
  ]);
}

function createOutForm() {
  const student = getAuthedStudent();
  if (!student) return el("div", { className: "empty" }, "학생 등록 후 외출 신청을 이용할 수 있습니다.");
  const expectedReturnInput = splitTimeSelect("expectedReturn");

  const form = el("form", { className: "form-grid" }, [
    field("신청 학생", el("strong", {}, student.name + " (" + student.id + ")")),
    field("외출 사유", select("reason", ["병원", "은행", "수영레슨", "개인 사유 인증", "기타"])),
    field("예상 복귀 시각", expectedReturnInput, "time-field"),
    field("상세 사유", textarea("detail", "방문 장소나 필요한 내용을 입력하세요."), "full"),
    el("div", { className: "field full" }, [button("외출 신청하기", "btn")]),
  ]);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = formData(form);
    if (!isValidExpectedReturn(data.expectedReturn)) {
      return notify("예상 복귀 시각을 시와 분까지 선택해주세요.");
    }
    const activeOuting = getActiveOuting(student.id);
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

function createEarlyLeaveForm() {
  const student = getAuthedStudent();
  if (!student) return el("div", { className: "empty" }, "학생 등록 후 조퇴 신청을 이용할 수 있습니다.");
  const submitButton = button("조퇴 신청하기", "btn");
  const cancelButton = button("외출 신청으로 돌아가기", "btn secondary", "button", () => {
    state.settings.earlyLeaveMode = false;
    saveState();
    render();
  });
  const form = el("form", { className: "form-grid" }, [
    field("신청 학생", el("strong", {}, student.name + " (" + student.id + ")")),
    field("조퇴 사유", textarea("earlyLeaveReason", "조퇴 사유를 입력하세요."), "full"),
    el("div", { className: "field full attendance-action-row" }, [submitButton, cancelButton]),
  ]);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = formData(form);
    const earlyLeaveReason = String(data.earlyLeaveReason || "").trim();
    if (!earlyLeaveReason) return notify("조퇴 사유를 입력해주세요.");
    const activeOuting = getActiveOuting(student.id);
    if (activeOuting) {
      state.settings.lastStudentId = student.id;
      saveState();
      render();
      notify("이미 진행 중인 신청이 있습니다.");
      return;
    }

    state.outings.unshift({
      id: createId(),
      studentId: student.id,
      studentName: student.name,
      className: student.className,
      reason: "조퇴",
      detail: "",
      expectedReturn: "",
      status: "requested",
      decision: "pending",
      teacherMemo: "",
      earlyLeaveReason,
      receiptNote: "",
      photos: [],
      createdAt: new Date().toISOString(),
      verifiedAt: null,
      returnedAt: null,
    });
    state.settings.lastStudentId = student.id;
    state.settings.earlyLeaveMode = false;
    saveState();
    form.reset();
    render();
    notify("조퇴 신청이 접수되었습니다.");
  });

  return form;
}

function splitTimeSelect(name) {
  const hourSelect = el("select", { name: name + "Hour" }, [
    el("option", { value: "" }, "시"),
    ...Array.from({ length: 15 }, (_, index) => {
      const hour = index + 9;
      const value = String(hour).padStart(2, "0");
      return el("option", { value }, value + "시");
    }),
  ]);
  const minuteSelect = el("select", { name: name + "Minute" }, [
    el("option", { value: "" }, "분"),
    ...Array.from({ length: 12 }, (_, index) => {
      const value = String(index * 5).padStart(2, "0");
      return el("option", { value }, value + "분");
    }),
  ]);
  const hiddenInput = el("input", { type: "hidden", name, value: "" });
  hourSelect.required = true;
  minuteSelect.required = true;
  const updateValue = () => {
    hiddenInput.value = hourSelect.value && minuteSelect.value ? hourSelect.value + ":" + minuteSelect.value : "";
  };
  hourSelect.addEventListener("change", updateValue);
  minuteSelect.addEventListener("change", updateValue);
  return el("div", { className: "split-time-select" }, [hourSelect, minuteSelect, hiddenInput]);
}

function isValidExpectedReturn(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""));
}

function renderStudentVerify() {
  return studentShell("사진 인증", "외출 장소나 영수증 사진을 제출하면 교사용 화면에서 확인합니다.", [
    panel("인증 제출", [createVerifyForm()]),
    panel("내 진행 상태 확인", [studentLookup("인증 상태 보기")]),
  ]);
}

function createVerifyForm() {
  const submitButton = button("사진 인증 제출", "btn");
  const form = el("form", { className: "form-grid" }, [
    field("현장 인증 사진", photoCaptureInput("sitePhoto"), "full"),
    field("영수증 인증 사진 (선택)", photoCaptureInput("receiptPhoto"), "full"),
    el("div", { className: "field full" }, [submitButton]),
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
      notify("사진 인증을 제출했습니다. 복귀 후 반납 처리하세요.");
    } catch (error) {
      console.error(error);
      notify(getPhotoSubmitErrorMessage(error));
      submitButton.disabled = false;
      submitButton.textContent = "사진 인증 제출";
    }
  });

  return form;
}

function photoCaptureInput(name, options = {}) {
  const disabled = Boolean(options.disabled);
  const inputNode = fileInput(name);
  inputNode.disabled = disabled;
  inputNode.className = "visually-hidden-file";
  const status = el("span", { className: "photo-input-status" }, disabled ? "인증 가능 시간이 지났습니다." : "사진을 촬영해주세요.");
  const preview = el("div", { className: "photo-input-preview", hidden: true });
  let pickerResetTimer = null;
  const trigger = button("인증하기", "btn secondary photo-input-button", "button", () => {
    if (disabled) return;
    markStudentFilePickerOpen();
    setPhotoInputLoading(trigger, status, true, "사진 선택 중...");
    inputNode.click();
  });
  trigger.disabled = disabled;
  let previewUrl = "";

  window.addEventListener("focus", () => {
    window.clearTimeout(pickerResetTimer);
    pickerResetTimer = window.setTimeout(() => {
      if (!inputNode.files?.length) setPhotoInputLoading(trigger, status, false, "사진을 촬영해주세요.");
    }, 700);
  });

  inputNode.addEventListener("cancel", () => {
    markStudentFilePickerClosed();
    setPhotoInputLoading(trigger, status, false, "사진을 촬영해주세요.");
  });

  inputNode.addEventListener("change", async () => {
    window.clearTimeout(pickerResetTimer);
    markStudentFilePickerClosed();
    const file = inputNode.files[0];
    preview.innerHTML = "";
    preview.hidden = !file;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = "";
    if (!file) {
      setPhotoInputLoading(trigger, status, false, "사진을 촬영해주세요.");
      return;
    }

    setPhotoInputLoading(trigger, status, true, "미리보기 준비 중...");
    previewUrl = URL.createObjectURL(file);
    const previewImage = el("img", { alt: "선택한 사진 미리보기" });
    previewImage.addEventListener("load", () => {
      status.textContent = "사진이 선택되었습니다.";
      status.className = "photo-input-status selected";
      trigger.disabled = false;
    });
    previewImage.addEventListener("error", () => {
      setPhotoInputLoading(trigger, status, false, "사진을 다시 선택해주세요.");
    });
    previewImage.src = previewUrl;
    preview.appendChild(previewImage);
  });

  return el("div", { className: "photo-input-control" }, [inputNode, trigger, status, preview]);
}

function setPhotoInputLoading(trigger, status, loading, text) {
  trigger.disabled = loading;
  status.className = loading ? "photo-input-status loading" : "photo-input-status";
  status.innerHTML = "";
  if (loading) status.appendChild(el("span", { className: "loading-spinner", ariaHidden: "true" }));
  status.appendChild(document.createTextNode(text));
}

function setButtonLoading(buttonNode, text) {
  buttonNode.innerHTML = "";
  buttonNode.appendChild(el("span", { className: "loading-spinner", ariaHidden: "true" }));
  buttonNode.appendChild(document.createTextNode(text));
}

function renderStudentReturn() {
  return studentShell("학원 복귀 인증", "복귀 시간을 남기면 교사가 관리 화면에서 최종 상태를 확인할 수 있습니다.", [
    panel("복귀 처리", [createReturnForm()]),
    panel("내 진행 상태 확인", [studentLookup("복귀 상태 보기")]),
  ]);
}

function renderStudentAttendance() {
  const student = getAuthedStudent();
  const todayCheck = student ? getStudentAttendanceForDate(student.id) : null;
  const isReasonMode = state.settings.attendanceMode === "pre-arrival-reason" && !todayCheck;
  return el("div", { className: "grid student-view" }, [
    panel(isReasonMode ? "등원 전 사유신청" : "오늘 출석", [
      todayCheck ? renderStudentAttendanceComplete(todayCheck) : isReasonMode ? createPreArrivalReasonForm(student) : createAttendanceForm(student),
    ]),
    !todayCheck && !isReasonMode
      ? el("div", { className: "attendance-secondary-action" }, [
          button("등원 전 사유신청", "btn secondary", "button", () => {
            state.settings.attendanceMode = "pre-arrival-reason";
            saveState();
            render();
          }),
        ])
      : null,
  ]);
}

function createAttendanceForm(student) {
  const isOpen = isAttendanceCheckOpen();
  const submitButton = button("출석 인증하기", "btn");
  submitButton.disabled = !isOpen;
  const form = el("form", { className: "form-grid attendance-form" }, [
    field("출석 학생", el("strong", {}, student ? student.name + " (" + student.id + ")" : "-")),
    field("출석 확인 현장 사진", photoCaptureInput("attendancePhoto", { disabled: !isOpen }), "full"),
    el("div", { className: "field full" }, [
      submitButton,
      el(
        "p",
        { className: "subtle attendance-deadline-note" },
        state.settings.attendanceDeadlineEnabled
          ? isOpen
            ? `출석 인정은 오전 ${formatAttendanceDeadline()}까지입니다.`
            : `오전 ${formatAttendanceDeadline()} 이후에는 출석 인증을 할 수 없습니다.`
          : "테스트 중에는 출석 인증 시간 제한이 꺼져 있습니다."
      ),
    ]),
  ]);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!student) return notify("학생 등록 후 출석 체크를 이용할 수 있습니다.");
    if (getStudentAttendanceForDate(student.id)) return notify("오늘 출석은 이미 인증되었습니다.");
    if (!isAttendanceCheckOpen()) return notify("출석 인정 시간이 지나 인증할 수 없습니다.");
    const attendancePhoto = form.elements.attendancePhoto.files[0];
    if (!attendancePhoto) return notify("출석 확인 현장 사진을 촬영해주세요.");

    submitButton.disabled = true;
    setButtonLoading(submitButton, "출석 인증 중...");
    try {
      await createAttendanceCheck(student, attendancePhoto);
      form.reset();
      render();
      notify("오늘 출석이 인증되었습니다.");
    } catch (error) {
      console.error(error);
      notify(getPhotoSubmitErrorMessage(error));
      submitButton.disabled = false;
      submitButton.textContent = "출석 인증하기";
    }
  });

  return form;
}

function createPreArrivalReasonForm(student) {
  const submitButton = button("사유 인증하기", "btn");
  const cancelButton = button("출석 체크로 돌아가기", "btn secondary", "button", () => {
    state.settings.attendanceMode = "";
    saveState();
    render();
  });
  const form = el("form", { className: "form-grid attendance-form" }, [
    field("신청 학생", el("strong", {}, student ? student.name + " (" + student.id + ")" : "-")),
    field("사유", select("reason", ["병원", "교통 지연", "개인 사유 인증", "기타"])),
    field("상세 사유", textarea("detail", "필요한 내용을 입력하세요."), "full"),
    field("인증 사진", photoCaptureInput("reasonPhoto"), "full"),
    el("div", { className: "field full attendance-action-row" }, [submitButton, cancelButton]),
  ]);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!student) return notify("학생 등록 후 사유신청을 이용할 수 있습니다.");
    if (getStudentAttendanceForDate(student.id)) return notify("오늘 출석 처리가 이미 완료되었습니다.");
    const data = formData(form);
    const reasonPhoto = form.elements.reasonPhoto.files[0];
    if (!reasonPhoto) return notify("인증 사진을 촬영해주세요.");

    submitButton.disabled = true;
    cancelButton.disabled = true;
    setButtonLoading(submitButton, "사유 인증 중...");
    try {
      await createPreArrivalReasonCheck(student, reasonPhoto, data.reason, data.detail);
      state.settings.attendanceMode = "";
      form.reset();
      render();
      notify("등원 전 사유신청이 인증되었습니다.");
    } catch (error) {
      console.error(error);
      notify(getPhotoSubmitErrorMessage(error));
      submitButton.disabled = false;
      cancelButton.disabled = false;
      submitButton.textContent = "사유 인증하기";
    }
  });

  return form;
}

function renderStudentAttendanceComplete(check) {
  const photoSrc = getAttendancePhotoSrc(check);
  const isReason = check.status === "pre_arrival_reason";
  return el("div", { className: "attendance-complete" }, [
    el("div", { className: "empty success-message" }, isReason ? "등원 전 사유신청이 완료되었습니다." : "오늘 출석 인증이 완료되었습니다."),
    el("div", { className: "detail-grid attendance-detail-grid" }, [
      el("div", { className: "detail-item" }, [el("span", {}, "인증 날짜"), el("strong", {}, check.checkDate || "-")]),
      el("div", { className: "detail-item" }, [el("span", {}, "인증 시각"), el("strong", {}, formatTimeOnly(check.createdAt))]),
      isReason ? el("div", { className: "detail-item" }, [el("span", {}, "사유"), el("strong", {}, check.reason || "-")]) : null,
      isReason ? el("div", { className: "detail-item" }, [el("span", {}, "상세"), el("strong", {}, check.detail || "-")]) : null,
    ]),
    photoSrc
      ? el("div", { className: "photo-grid attendance-photo-grid" }, [
          button("", "photo-thumb attendance-photo-button", "button", () => openPhotoModal({
            type: isReason ? "등원 전 사유 인증" : "출석 인증",
            photoUrl: photoSrc,
            uploadedAt: check.createdAt,
          }), [
            el("img", { src: photoSrc, alt: isReason ? "등원 전 사유 인증 사진" : "출석 인증 사진" }),
            el("span", {}, isReason ? "사유 인증" : "출석 인증"),
            el("time", { dateTime: check.createdAt || "" }, formatTime(check.createdAt)),
          ]),
        ])
      : null,
  ]);
}

function createReturnForm() {
  const student = getAuthedStudent();
  const submitButton = button("복귀 완료", "btn");
  const form = el("form", { className: "form-grid" }, [
    field("복귀 학생", el("strong", {}, student ? student.name + " (" + student.id + ")" : "-")),
    field("복귀 현장 사진", photoCaptureInput("returnPhoto"), "full", "사무실에 있는 복귀 사진을 찍어주세요."),
    el("div", { className: "field full" }, [
      submitButton,
      el("p", { className: "subtle" }, "복귀 현장 사진 인증 후 복귀 완료 버튼을 눌러주세요."),
    ]),
  ]);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!student) return notify("학생 등록 후 복귀 인증을 이용할 수 있습니다.");
    const outing = getActiveOuting(student.id);
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
      notify(getPhotoSubmitErrorMessage(error));
      submitButton.disabled = false;
      submitButton.textContent = "복귀 완료";
    }
  });

  return form;
}

function getPhotoSubmitErrorMessage(error) {
  if (isStorageQuotaError(error)) {
    return "기기 저장공간이 부족해 임시 저장을 줄였습니다. 다시 한 번 제출해주세요.";
  }
  return "사진 처리 중 오류가 발생했습니다. 다른 사진으로 다시 시도해주세요.";
}

function renderDoneState() {
  return el("div", { className: "grid" }, [
    el("div", { className: "empty success-message" }, "복귀 완료되었습니다."),
    button("홈으로", "btn secondary", "button", goStudentHome),
  ]);
}

function renderEarlyLeaveDoneState(outing) {
  return el("div", { className: "grid" }, [
    el("div", { className: "empty success-message" }, "조퇴 신청이 접수되었습니다."),
    el("div", { className: "detail-grid attendance-detail-grid" }, [
      el("div", { className: "detail-item" }, [el("span", {}, "신청 시각"), el("strong", {}, formatTimeOnly(outing.createdAt))]),
      el("div", { className: "detail-item" }, [el("span", {}, "처리 상태"), el("strong", {}, decisionText(outing.decision))]),
      el("div", { className: "detail-item" }, [el("span", {}, "조퇴 사유"), el("strong", {}, outing.earlyLeaveReason || "-")]),
    ]),
    button("홈으로", "btn secondary", "button", goStudentHome),
  ]);
}

function goStudentHome() {
  setStudentStep("request");
  state.settings.earlyLeaveMode = false;
  state.settings.completionType = "";
  state.settings.lastStudentId = "";
  saveState();
  currentRoute = "home";
  if (location.hash !== "#home") {
    location.hash = "home";
    return;
  }
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
    field("학생 고유번호", input("studentId", "text", "예: 18004"), "", "예: 18기 4번 -> 18004"),
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
