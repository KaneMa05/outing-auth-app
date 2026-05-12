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
  if (step === "return") {
    return el("div", { className: "grid student-view" }, [
      panel("학원 복귀 인증", [
        el("p", { className: "subtle" }, "사무실에 있는 복귀 사진을 찍어주세요."),
        createReturnForm(),
      ], "return-step"),
    ]);
  }
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
    el("div", { className: "field full" }, [
      button("외출 신청하기", "btn"),
      button("조퇴 신청하기", "btn", "button", () => {
        state.settings.earlyLeaveMode = true;
        saveState();
        render();
      }),
    ]),
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

    if (shouldConfirmPreAttendanceOuting(student)) {
      openPreAttendanceOutingConfirmModal(() => submitOutingRequest(student, data, form));
      return;
    }

    submitOutingRequest(student, data, form);
  });

  return form;
}

function shouldConfirmPreAttendanceOuting(student) {
  return Boolean(
    student &&
    (!state.settings.attendanceDeadlineEnabled || isAttendanceCheckOpen()) &&
    !isAttendanceHoliday() &&
    !getStudentAttendanceForDate(student.id)
  );
}

function openPreAttendanceOutingConfirmModal(onContinue) {
  closeInfoModal();
  const goToReason = () => {
    closeInfoModal();
    state.settings.attendanceMode = "pre-arrival-reason";
    state.settings.earlyLeaveMode = false;
    saveState();
    navigate("attendance");
  };
  const continueOuting = () => {
    closeInfoModal();
    onContinue();
  };
  const modal = el("div", { className: "info-modal", role: "dialog", ariaModal: "true" }, [
    el("button", { className: "info-modal-backdrop", type: "button", ariaLabel: "외출 신청 안내 닫기" }),
    el("div", { className: "info-modal-panel pre-attendance-outing-modal" }, [
      el("strong", {}, "아직 오늘 출석 처리가 없습니다"),
      el("p", {}, "학원에 등원하기 전이라면 외출 신청이 아니라 등원 전 사유신청을 해주세요."),
      el("p", {}, "이미 등원한 뒤 잠시 나가는 경우에만 외출 신청을 계속 진행하세요."),
      el("div", { className: "attendance-action-row" }, [
        button("등원 전 사유신청으로 이동", "btn", "button", goToReason),
        button("외출 신청 계속하기", "btn secondary", "button", continueOuting),
      ]),
    ]),
  ]);
  modal.querySelector(".info-modal-backdrop").addEventListener("click", closeInfoModal);
  document.body.appendChild(modal);
  document.addEventListener("keydown", closeInfoModalOnEscape);
}

function submitOutingRequest(student, data, form) {
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
  const activeOuting = getActiveOuting(state.settings.lastStudentId);
  const isReceiptRequired = String(activeOuting?.reason || "").trim() === "병원";
  const form = el("form", { className: "form-grid" }, [
    el("p", { className: "subtle full" }, "외출 신청이 접수되었습니다. 현장 인증 사진을 제출해주세요."),
    field("현장 인증 사진", photoCaptureInput("sitePhoto"), "full"),
    field(
      isReceiptRequired ? "영수증 인증 사진 (필수)" : "영수증 인증 사진 (선택)",
      photoCaptureInput("receiptPhoto"),
      "full",
      isReceiptRequired ? "병원 외출은 영수증 인증 사진을 함께 제출해야 합니다." : ""
    ),
    el("div", { className: "field full" }, [submitButton]),
  ]);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const outing = getActiveOuting(state.settings.lastStudentId);
    if (!outing) return notify("진행 중인 외출 신청이 없습니다.");

    const sitePhoto = form.elements.sitePhoto.files[0];
    const receiptPhoto = form.elements.receiptPhoto.files[0];
    if (!sitePhoto) return notify("현장 인증 사진을 업로드해주세요.");
    if (String(outing.reason || "").trim() === "병원" && !receiptPhoto) return notify("병원 외출은 영수증 인증 사진을 업로드해주세요.");

    submitButton.disabled = true;
    setButtonLoading(submitButton, "사진 업로드 중...");

    try {
      await flushRemoteSave();
      outing.photos = outing.photos.filter((photo) => photo.type !== "현장 인증" && photo.type !== "영수증 인증");
      outing.photos.push(await createOutingPhoto(outing, sitePhoto, "현장 인증"));
      if (receiptPhoto) {
        outing.photos.push(await createOutingPhoto(outing, receiptPhoto, "영수증 인증"));
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
  const holiday = getAttendanceHoliday();
  const isReasonMode = state.settings.attendanceMode === "pre-arrival-reason" && !todayCheck;
  const isOpen = isAttendanceCheckOpen();
  return el("div", { className: "grid student-view" }, [
    panel(isReasonMode ? "등원 전 사유신청" : "오늘 출석", [
      todayCheck
        ? renderStudentAttendanceComplete(todayCheck)
        : holiday
          ? renderStudentAttendanceHoliday(holiday)
        : isReasonMode
          ? createPreArrivalReasonForm(student)
          : createAttendanceForm(student, { showPreArrival: true }),
    ]),
  ]);
}

function renderStudentAttendanceHoliday(holiday) {
  return el("div", { className: "attendance-complete" }, [
    el("div", { className: "empty success-message" }, attendanceHolidayMessage(holiday?.dateKey || getTodayDateKey())),
  ]);
}

function createAttendanceForm(student, options = {}) {
  if (isAttendanceHoliday()) return renderStudentAttendanceHoliday(getAttendanceHoliday());
  const isOpen = isAttendanceCheckOpen();
  const submitButton = button("출석 인증하기", "btn");
  submitButton.disabled = !isOpen;
  const preArrivalButton = options.showPreArrival
    ? button("등원 전 사유신청", "btn", "button", () => {
        if (!isAttendanceCheckOpen()) return notify("출석 인정 시간이 지나 사유신청을 할 수 없습니다.");
        state.settings.attendanceMode = "pre-arrival-reason";
        saveState();
        render();
      })
    : null;
  if (preArrivalButton) preArrivalButton.disabled = !isOpen;
  const form = el("form", { className: "form-grid attendance-form" }, [
    field("출석 학생", el("strong", {}, student ? student.name + " (" + student.id + ")" : "-")),
    field("출석 확인 현장 사진", photoCaptureInput("attendancePhoto", { disabled: !isOpen }), "full"),
    el("div", { className: "field full" }, [
      submitButton,
      preArrivalButton,
      el(
        "p",
        { className: "subtle attendance-deadline-note" },
        state.settings.attendanceDeadlineEnabled
          ? isOpen
            ? `출석 인정은 오전 ${formatAttendanceDeadline()}까지입니다.`
            : `오전 ${formatAttendanceDeadline()} 이후에는 출석 인증을 할 수 없습니다.`
          : "테스트 중에는 출석 인증 시간 제한이 꺼져 있습니다."
      ),
      preArrivalButton && !isOpen && state.settings.attendanceDeadlineEnabled
        ? el("p", { className: "subtle attendance-deadline-note" }, `오전 ${formatAttendanceDeadline()} 이후에는 등원 전 사유신청을 할 수 없습니다.`)
        : null,
    ]),
  ]);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!student) return notify("학생 등록 후 출석 체크를 이용할 수 있습니다.");
    const existingCheck = getStudentAttendanceForDate(student.id);
    if (existingCheck?.status === "pre_arrival_reason") {
      return notify("등원 전 사유신청 후에는 아래 등원 인증하기 버튼으로 인증해주세요.");
    }
    if (existingCheck) return notify("오늘 출석은 이미 인증되었습니다.");
    if (isAttendanceHoliday()) return notify("휴일은 출석체크를 하지 않습니다.");
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
  if (isAttendanceHoliday()) return renderStudentAttendanceHoliday(getAttendanceHoliday());
  const isOpen = isAttendanceCheckOpen();
  const submitButton = button("사유 인증하기", "btn");
  submitButton.disabled = !isOpen;
  const cancelButton = button("출석 체크로 돌아가기", "btn secondary", "button", () => {
    state.settings.attendanceMode = "";
    saveState();
    render();
  });
  const form = el("form", { className: "form-grid attendance-form" }, [
    field("신청 학생", el("strong", {}, student ? student.name + " (" + student.id + ")" : "-")),
    field("사유", select("reason", ["병원", "교통 지연", "개인 사유 인증", "기타"])),
    field("상세 사유", textarea("detail", "필요한 내용을 입력하세요."), "full"),
    field("인증 사진", photoCaptureInput("reasonPhoto", { disabled: !isOpen }), "full"),
    el("div", { className: "field full" }, [
      el("div", { className: "attendance-action-row" }, [submitButton, cancelButton]),
      el(
        "p",
        { className: "subtle attendance-deadline-note" },
        state.settings.attendanceDeadlineEnabled
          ? isOpen
            ? `등원 전 사유신청은 오전 ${formatAttendanceDeadline()}까지입니다.`
            : `오전 ${formatAttendanceDeadline()} 이후에는 등원 전 사유신청을 할 수 없습니다.`
          : "테스트 중에는 등원 전 사유신청 시간 제한이 꺼져 있습니다."
      ),
    ]),
  ]);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!student) return notify("학생 등록 후 사유신청을 이용할 수 있습니다.");
    if (getStudentAttendanceForDate(student.id)) return notify("오늘 출석 처리가 이미 완료되었습니다.");
    if (isAttendanceHoliday()) return notify("휴일은 출석체크를 하지 않습니다.");
    if (!isAttendanceCheckOpen()) return notify("출석 인정 시간이 지나 사유신청을 할 수 없습니다.");
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
  const thumbnailSrc = getAttendanceThumbnailSrc(check);
  const arrivalPhotoSrc = getAttendanceArrivalPhotoSrc(check);
  const arrivalThumbnailSrc = getAttendanceArrivalThumbnailSrc(check);
  const isReason = check.status === "pre_arrival_reason";
  const isReasonVerified = check.status === "pre_arrival_verified";
  return el("div", { className: "attendance-complete" }, [
    el("div", { className: `empty ${isReason ? "" : "success-message"}` }, isReason ? "등원 전 사유신청이 접수되었습니다. 학원에 도착하면 등원 인증을 완료해주세요." : "오늘 출석 인증이 완료되었습니다."),
    el("div", { className: "detail-grid attendance-detail-grid" }, [
      el("div", { className: "detail-item" }, [el("span", {}, "인증 날짜"), el("strong", {}, check.checkDate || "-")]),
      el("div", { className: "detail-item" }, [el("span", {}, isReason || isReasonVerified ? "사유 제출 시각" : "인증 시각"), el("strong", {}, formatTimeOnly(check.createdAt))]),
      isReasonVerified ? el("div", { className: "detail-item" }, [el("span", {}, "등원 인증 시각"), el("strong", {}, formatTimeOnly(check.arrivedAt))]) : null,
      isReason || isReasonVerified ? el("div", { className: "detail-item" }, [el("span", {}, "사유"), el("strong", {}, check.reason || "-")]) : null,
      isReason || isReasonVerified ? el("div", { className: "detail-item" }, [el("span", {}, "상세"), el("strong", {}, check.detail || "-")]) : null,
    ]),
    isReason ? createArrivalVerificationForm(check) : null,
    photoSrc
      ? el("div", { className: "photo-grid attendance-photo-grid" }, [
          button("", "photo-thumb attendance-photo-button", "button", () => openPhotoModal({
            type: isReason || isReasonVerified ? "등원 전 사유 인증" : "출석 인증",
            photoUrl: photoSrc,
            uploadedAt: check.createdAt,
          }), [
            el("img", { src: thumbnailSrc, alt: isReason || isReasonVerified ? "등원 전 사유 인증 사진" : "출석 인증 사진", loading: "lazy" }),
            el("span", {}, isReason || isReasonVerified ? "사유 인증" : "출석 인증"),
            el("time", { dateTime: check.createdAt || "" }, formatTime(check.createdAt)),
          ]),
          arrivalPhotoSrc
            ? button("", "photo-thumb attendance-photo-button", "button", () => openPhotoModal({
                type: "등원 인증",
                photoUrl: arrivalPhotoSrc,
                uploadedAt: check.arrivedAt,
              }), [
                el("img", { src: arrivalThumbnailSrc, alt: "등원 인증 사진", loading: "lazy" }),
                el("span", {}, "등원 인증"),
                el("time", { dateTime: check.arrivedAt || "" }, formatTime(check.arrivedAt)),
              ])
            : null,
        ])
      : null,
  ]);
}

function createArrivalVerificationForm(check) {
  const student = getAuthedStudent();
  const submitButton = button("등원 인증하기", "btn");
  const form = el("form", { className: "form-grid attendance-form" }, [
    field("등원 현장 사진", photoCaptureInput("arrivalPhoto"), "full"),
    el("div", { className: "field full" }, [
      submitButton,
      el("p", { className: "subtle attendance-deadline-note" }, "사유신청은 접수 상태입니다. 학원에 도착한 뒤 현장 사진으로 등원 인증을 완료해주세요."),
    ]),
  ]);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!student) return notify("학생 등록 후 등원 인증을 이용할 수 있습니다.");
    const arrivalPhoto = form.elements.arrivalPhoto.files[0];
    if (!arrivalPhoto) return notify("등원 현장 사진을 촬영해주세요.");
    submitButton.disabled = true;
    setButtonLoading(submitButton, "등원 인증 중...");
    try {
      await completePreArrivalAttendanceCheck(student, check, arrivalPhoto);
      form.reset();
      render();
      notify("등원 인증이 완료되었습니다.");
    } catch (error) {
      console.error(error);
      notify(getPhotoSubmitErrorMessage(error));
      submitButton.disabled = false;
      submitButton.textContent = "등원 인증하기";
    }
  });

  return form;
}

function createReturnForm() {
  const student = getAuthedStudent();
  const submitButton = button("복귀 완료", "btn");
  const form = el("form", { className: "form-grid" }, [
    field("복귀 현장 사진", photoCaptureInput("returnPhoto"), "full"),
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
      await flushRemoteSave();
      outing.photos = outing.photos.filter((photo) => photo.type !== "복귀 인증");
      outing.photos.push(await createOutingPhoto(outing, returnPhoto, "복귀 인증"));
      outing.status = "returned";
      if (outing.decision === "pending") outing.decision = "approved";
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
  const message =
    outing.decision === "approved"
      ? "조퇴 완료되었습니다."
      : outing.decision === "rejected"
        ? "조퇴 신청이 반려되었습니다."
        : "조퇴 신청이 접수되었습니다.";
  return el("div", { className: "grid" }, [
    el("div", { className: "empty success-message" }, message),
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

let selectedStudentExamId = "";
let studentGradesView = "";
let studentExamDraft = { sectionId: "", page: 0, answers: {}, locked: {}, editing: {}, review: false, confirmed: false };

function renderStudentGrades() {
  const student = getAuthedStudent();
  if (!student) return renderStudentAuth();
  if (studentGradesView !== "weekly") return renderStudentGradesHome();
  return renderStudentWeeklyGrades(student);
}

function renderStudentGradesHome() {
  return el("div", { className: "grid student-view student-grade-home" }, [
    panel("성적", [
      el("div", { className: "student-grade-card-grid" }, [
        button("", "student-grade-card", "button", () => {
          studentGradesView = "weekly";
          render();
        }, [
          el("strong", {}, "주간평가"),
          el("span", {}, "주차별 평가 목록과 과목별 제출 현황을 확인합니다."),
        ]),
        button("", "student-grade-card", "button", () => notify("파이널 성적은 아직 준비 중입니다."), [
          el("strong", {}, "파이널"),
          el("span", {}, "파이널 성적은 준비 중입니다."),
        ]),
      ]),
    ]),
  ]);
}

function renderStudentWeeklyGrades(student) {
  const exams = getVisibleStudentExams(student);
  const selectedExam = exams.find((exam) => exam.id === selectedStudentExamId) || exams[0] || null;
  if (selectedExam) selectedStudentExamId = selectedExam.id;
  if (!selectedExam) {
    return el("div", { className: "grid student-view" }, [
      panel("주간평가", [
        button("성적 선택으로 돌아가기", "mini-btn", "button", () => {
          studentGradesView = "";
          render();
        }),
        el("div", { className: "empty" }, "현재 공개된 주간평가가 없습니다."),
      ]),
    ]);
  }
  const sections = getStudentExamSections(selectedExam, student);
  const selectedSection = sections.find((section) => section.id === studentExamDraft.sectionId);
  return el("div", { className: "grid student-view student-exam-view" }, [
    renderStudentGradesBackPanel(),
    renderStudentExamList(exams, selectedExam),
    selectedSection ? renderStudentExamAnswerEntry(selectedExam, selectedSection, student, sections) : renderStudentExamSubjectList(selectedExam, sections, student),
  ]);
}

function renderStudentGradesBackPanel() {
  return panel("성적 구분", [
    button("성적 선택으로 돌아가기", "mini-btn", "button", () => {
      studentGradesView = "";
      studentExamDraft = { sectionId: "", page: 0, answers: {}, locked: {}, editing: {}, review: false, confirmed: false };
      render();
    }),
  ]);
}

function getVisibleStudentExams(student) {
  const track = normalizeCoastGuardTrack(student.track);
  const cohort = getStudentCohort(student);
  return (state.exams || [])
    .filter((exam) => exam.isPublished)
    .filter((exam) => !exam.cohort || !cohort || String(exam.cohort) === cohort)
    .filter((exam) => (state.examSections || []).some((section) => section.examId === exam.id && isStudentSectionMatch(section, track)))
    .sort((a, b) => Number(b.weekNumber) - Number(a.weekNumber));
}

function getStudentExamSections(exam, student) {
  const track = normalizeCoastGuardTrack(student.track);
  return (state.examSections || []).filter((section) => section.examId === exam.id && isStudentSectionMatch(section, track));
}

function isStudentSectionMatch(section, studentTrack) {
  return section.isActive !== false && isStudentSectionPublished(section) && (section.track === studentTrack || section.track === "전체");
}

function isStudentSectionPublished(section) {
  const answerCount = (state.examAnswers || []).filter((answer) => answer.examSectionId === section.id && answer.correctAnswer).length;
  return answerCount >= (Number(section.questionCount) || 20);
}

function renderStudentExamList(exams, selectedExam) {
  return panel("주간평가 목록", [
    el("div", { className: "student-exam-tabs" }, exams.map((exam) =>
      button(`${exam.weekNumber}주차`, exam.id === selectedExam.id ? "mini-btn active" : "mini-btn", "button", () => {
        studentExamDraft.sectionId = "";
        selectedStudentExamId = exam.id;
        render();
      })
    )),
    el("p", { className: "subtle" }, formatStudentWeeklyExamName(selectedExam.weekNumber)),
  ]);
}

function renderStudentExamSubjectList(exam, sections, student) {
  const scoreOpen = canStudentSeeScore(exam, sections, student);
  const totalScore = sections.reduce((sum, section) => sum + (getStudentSubmission(student.id, section.id)?.score || 0), 0);
  return panel(formatStudentWeeklyExamName(exam.weekNumber), [
    scoreOpen ? el("div", { className: "student-exam-total" }, [`총점 ${Math.round(totalScore * 10) / 10}점`, el("span", {}, `평균 ${Math.round((totalScore / Math.max(sections.length, 1)) * 10) / 10}점`)]) : null,
    sections.length
      ? el("div", { className: "student-exam-subjects" }, sections.map((section) => renderStudentExamSubjectCard(exam, section, student, sections, scoreOpen)))
      : el("div", { className: "empty" }, "본인 직렬에 해당하는 과목이 없습니다."),
  ]);
}

function renderStudentExamSubjectCard(exam, section, student, sections, scoreOpen) {
  const submission = getStudentSubmission(student.id, section.id);
  const status = getStudentSectionStatus(exam, section, submission);
  return el("article", { className: "student-exam-subject" }, [
    el("div", {}, [el("strong", {}, section.subject), el("span", { className: "badge" }, status)]),
    el("p", { className: "subtle" }, `${section.questionCount}문항 · ${section.totalScore}점`),
    submission?.status === "submitted" && scoreOpen ? el("p", { className: "student-score-line" }, `점수 ${submission.score}점 · 정답 ${submission.correctCount}/${section.questionCount}`) : null,
    submission?.status === "submitted" && !scoreOpen ? el("p", { className: "subtle" }, "모든 과목을 제출해야 점수와 해설을 확인할 수 있습니다.") : null,
    submission?.status === "submitted"
      ? renderStudentExamFiles(exam, section, canStudentSeeExplanation(exam, sections, student))
      : isExamOpen(exam)
        ? button("답안 입력", "btn", "button", () => startStudentSectionAnswer(section))
        : el("p", { className: "subtle" }, "현재 응시할 수 없는 기간입니다."),
  ]);
}

function renderStudentExamFiles(exam, section, canOpen) {
  if (!canOpen || exam.explanationReleaseMode === "hidden") return null;
  const labels = { answer_pdf: "답안지" };
  const files = (state.examFiles || []).filter((file) => file.examSectionId === section.id && file.fileType === "answer_pdf" && file.fileUrl);
  return files.length ? el("div", { className: "student-exam-files" }, files.map((file) => el("a", { href: file.fileUrl, target: "_blank", rel: "noreferrer", className: "mini-btn" }, labels[file.fileType] || "파일"))) : null;
}

function getStudentSectionStatus(exam, section, submission) {
  if (submission?.status === "submitted") return "제출 완료";
  if (exam.startAt && Date.now() < new Date(exam.startAt).getTime()) return "기간 전";
  if (exam.endAt && Date.now() > new Date(exam.endAt).getTime()) return "기간 종료";
  if (studentExamDraft.sectionId === section.id) return "입력 중";
  return "미제출";
}

function isExamOpen(exam) {
  const now = Date.now();
  if (exam.startAt && now < new Date(exam.startAt).getTime()) return false;
  if (exam.endAt && now > new Date(exam.endAt).getTime()) return false;
  return true;
}

function canStudentSeeScore(exam, sections, student) {
  if (exam.scoreReleaseMode === "hidden") return false;
  if (exam.scoreReleaseMode === "after_submit") return true;
  return sections.every((section) => getStudentSubmission(student.id, section.id)?.status === "submitted");
}

function canStudentSeeExplanation(exam, sections, student) {
  if (exam.explanationReleaseMode === "hidden") return false;
  if (exam.explanationReleaseMode === "after_submit") return true;
  return sections.every((section) => getStudentSubmission(student.id, section.id)?.status === "submitted");
}

function getStudentSubmission(studentId, sectionId) {
  return (state.examSubmissions || []).find((submission) => submission.studentId === studentId && submission.examSectionId === sectionId && submission.status === "submitted");
}

function startStudentSectionAnswer(section) {
  studentExamDraft = { sectionId: section.id, page: 0, answers: {}, locked: {}, editing: {}, review: false, confirmed: false };
  render();
}

function renderStudentExamAnswerEntry(exam, section, student, allSections) {
  if (getStudentSubmission(student.id, section.id)?.status === "submitted") {
    studentExamDraft.sectionId = "";
    return renderStudentExamSubjectList(exam, allSections, student);
  }
  if (studentExamDraft.review) return renderStudentExamReview(exam, section, student);
  const start = studentExamDraft.page * 10 + 1;
  const end = Math.min(start + 9, section.questionCount);
  const cards = [];
  for (let question = start; question <= end; question += 1) cards.push(renderStudentAnswerQuestion(question));
  return panel(`${section.subject} ${section.questionCount}문제`, [
    el("div", { className: "student-answer-range" }, `${start}~${end}번`),
    el("div", { className: "student-answer-list" }, cards),
    renderStudentAnswerNav(section),
  ]);
}

function renderStudentAnswerQuestion(questionNumber) {
  const current = studentExamDraft.answers[questionNumber] || "";
  const locked = studentExamDraft.locked[questionNumber] && !studentExamDraft.editing[questionNumber];
  const options = [1, 2, 3, 4].map((value) => {
    const selected = Number(current) === value;
    const node = button(`${toCircledAnswer(value)}${selected ? " ✓" : ""}`, selected ? "answer-choice selected" : "answer-choice", "button", () => {
      if (locked) return;
      const previous = studentExamDraft.answers[questionNumber];
      studentExamDraft.answers[questionNumber] = value;
      studentExamDraft.locked[questionNumber] = true;
      studentExamDraft.editing[questionNumber] = false;
      render();
      if (previous && previous !== value) notify(`${questionNumber}번 답안이 ${toCircledAnswer(previous)}에서 ${toCircledAnswer(value)}로 변경되었습니다.`);
    });
    node.disabled = locked;
    return node;
  });
  return el("article", { className: locked ? "student-answer-card locked" : "student-answer-card" }, [
    el("div", { className: "student-answer-head" }, [el("strong", {}, `${questionNumber}번`), el("span", {}, current ? `선택 ${toCircledAnswer(current)}` : "미입력")]),
    el("div", { className: "answer-choice-row" }, options),
    locked ? el("p", { className: "subtle" }, "수정하려면 수정 버튼을 눌러주세요.") : null,
    current
      ? el("div", { className: "action-row" }, [
          studentExamDraft.editing[questionNumber]
            ? button("수정 취소", "mini-btn", "button", () => {
                studentExamDraft.editing[questionNumber] = false;
                render();
              })
            : button("수정", "mini-btn", "button", () => {
                studentExamDraft.editing[questionNumber] = true;
                render();
              }),
        ])
      : null,
  ]);
}

function renderStudentAnswerNav(section) {
  const prev = button("이전 10문제", "btn secondary", "button", () => {
    studentExamDraft.page = Math.max(0, studentExamDraft.page - 1);
    render();
  });
  prev.disabled = studentExamDraft.page === 0;
  const next = button("다음 10문제", "btn secondary", "button", () => {
    studentExamDraft.page = Math.min(Math.ceil(section.questionCount / 10) - 1, studentExamDraft.page + 1);
    render();
  });
  next.disabled = studentExamDraft.page >= Math.ceil(section.questionCount / 10) - 1;
  return el("div", { className: "student-answer-nav" }, [
    prev,
    button("답안표", "btn", "button", () => {
      studentExamDraft.review = true;
      studentExamDraft.confirmed = false;
      render();
    }),
    next,
  ]);
}

function renderStudentExamReview(exam, section, student) {
  const missing = [];
  const cells = [];
  for (let question = 1; question <= section.questionCount; question += 1) {
    const answer = studentExamDraft.answers[question];
    if (!answer) missing.push(question);
    cells.push(button(`${question}. ${answer ? toCircledAnswer(answer) : "미입력"}`, answer ? "answer-sheet-cell" : "answer-sheet-cell missing", "button", () => {
      studentExamDraft.review = false;
      studentExamDraft.page = Math.floor((question - 1) / 10);
      render();
    }));
  }
  const checkbox = el("input", { type: "checkbox" });
  const submitButton = button("최종 제출", "btn", "button", () => confirmStudentExamSubmit(section, student, missing));
  submitButton.disabled = true;
  checkbox.addEventListener("change", () => {
    studentExamDraft.confirmed = checkbox.checked;
    submitButton.disabled = !checkbox.checked;
  });
  return panel(`${section.subject} 답안표 확인`, [
    el("div", { className: "answer-sheet-grid" }, cells),
    missing.length ? el("p", { className: "missing-warning" }, `미입력 문항: ${missing.join(", ")}번`) : el("p", { className: "subtle" }, "모든 문항을 입력했습니다."),
    el("label", { className: "confirm-check" }, [checkbox, el("span", {}, "위 답안을 모두 확인했습니다.")]),
    el("div", { className: "student-answer-nav" }, [
      button("답안 수정", "btn secondary", "button", () => {
        studentExamDraft.review = false;
        render();
      }),
      submitButton,
    ]),
  ]);
}

function confirmStudentExamSubmit(section, student, missing) {
  const message = missing.length
    ? `총 ${section.questionCount}문항 중 ${section.questionCount - missing.length}문항만 입력했습니다.\n미입력 문항: ${missing.join(", ")}번\n미입력 문항은 오답 처리됩니다.\n그래도 제출하시겠습니까?`
    : `총 ${section.questionCount}문항 중 ${section.questionCount}문항을 모두 입력했습니다.\n제출 후에는 답안을 수정할 수 없습니다.\n최종 제출하시겠습니까?`;
  if (!confirm(message)) return;
  submitStudentSectionAnswers(section, student);
}

async function submitStudentSectionAnswers(section, student) {
  if (getStudentSubmission(student.id, section.id)?.status === "submitted") return notify("이미 제출한 과목입니다. 제출 후에는 수정할 수 없습니다.");
  const submission = {
    id: createId(),
    examSectionId: section.id,
    studentId: student.id,
    studentName: student.name,
    track: normalizeCoastGuardTrack(student.track),
    status: "submitted",
    score: 0,
    correctCount: 0,
    submittedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
  gradeStudentSubmission(section, submission);
  state.examSubmissions = [...(state.examSubmissions || []), submission];
  saveState({ skipRemote: true });
  if (remoteStore) {
    await saveStudentExamSubmissionToRemote(submission);
    await saveStudentSubmissionAnswersToRemote((state.submissionAnswers || []).filter((answer) => answer.submissionId === submission.id));
  }
  studentExamDraft.sectionId = "";
  studentExamDraft.review = false;
  render();
  notify("답안을 제출했습니다.");
}

function gradeStudentSubmission(section, submission) {
  const key = (state.examAnswers || []).filter((answer) => answer.examSectionId === section.id);
  let score = 0;
  let correctCount = 0;
  state.submissionAnswers = (state.submissionAnswers || []).filter((answer) => answer.submissionId !== submission.id);
  for (let question = 1; question <= section.questionCount; question += 1) {
    const answerKey = key.find((answer) => answer.questionNumber === question);
    const selectedAnswer = Number(studentExamDraft.answers[question]) || null;
    const isCorrect = Boolean(answerKey?.correctAnswer && selectedAnswer === answerKey.correctAnswer);
    const pointsAwarded = isCorrect ? Number(answerKey.points) || 0 : 0;
    if (isCorrect) correctCount += 1;
    score += pointsAwarded;
    state.submissionAnswers.push({ id: createId(), submissionId: submission.id, questionNumber: question, selectedAnswer, isCorrect, pointsAwarded });
  }
  submission.score = Math.round(score * 10) / 10;
  submission.correctCount = correctCount;
}

async function saveStudentExamSubmissionToRemote(submission) {
  const { error } = await remoteStore.from("exam_submissions").upsert({
    id: submission.id,
    exam_section_id: submission.examSectionId,
    student_id: submission.studentId,
    student_name: submission.studentName,
    track: submission.track,
    status: submission.status,
    score: submission.score,
    correct_count: submission.correctCount,
    submitted_at: submission.submittedAt,
    created_at: submission.createdAt,
  }, { onConflict: "student_id,exam_section_id" });
  if (error) throw error;
}

async function saveStudentSubmissionAnswersToRemote(answers) {
  if (!answers.length) return;
  const rows = answers.map((answer) => ({
    id: answer.id,
    submission_id: answer.submissionId,
    question_number: answer.questionNumber,
    selected_answer: answer.selectedAnswer || null,
    is_correct: answer.isCorrect,
    points_awarded: answer.pointsAwarded || 0,
  }));
  const { error } = await remoteStore.from("submission_answers").upsert(rows, { onConflict: "submission_id,question_number" });
  if (error) throw error;
}

function toCircledAnswer(value) {
  return ["", "①", "②", "③", "④"][Number(value)] || "-";
}

function formatStudentWeeklyExamName(weekNumber) {
  return `${Number(weekNumber) || 1}주차 주간평가`;
}
