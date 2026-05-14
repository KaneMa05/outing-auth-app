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
      await createAttendanceCheck(student, attendancePhoto, {
        onAttendanceSaved: () => setButtonLoading(submitButton, "사진 저장 중..."),
      });
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
      await createPreArrivalReasonCheck(student, reasonPhoto, data.reason, data.detail, {
        onAttendanceSaved: () => setButtonLoading(submitButton, "사진 저장 중..."),
      });
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
  if (error?.attendanceSaved) {
    return "출석은 접수됐지만 사진 저장이 완료되지 않았습니다. 화면을 닫지 말고 다시 시도해주세요.";
  }
  if (isStorageQuotaError(error)) {
    return "기기 저장공간이 부족해 임시 저장을 줄였습니다. 다시 한 번 제출해주세요.";
  }
  if (isPhotoPermissionError(error)) {
    return "사진 저장 권한 문제로 처리하지 못했습니다. 화면을 닫지 말고 선생님께 Supabase 스토리지 정책 적용 여부를 확인해주세요.";
  }
  if (isPhotoPayloadError(error)) {
    return "사진 용량이 커서 처리하지 못했습니다. 카메라로 새로 촬영하거나 더 작은 사진으로 다시 시도해주세요.";
  }
  if (isPhotoDecodeError(error)) {
    return "이 사진 형식을 읽지 못했습니다. 카메라로 새로 촬영해서 다시 제출해주세요.";
  }
  return "사진 처리 중 오류가 발생했습니다. 다른 사진으로 다시 시도해주세요.";
}

function isPhotoPermissionError(error) {
  const text = getErrorText(error);
  return text.includes("row-level security") || text.includes("violates row-level security") || text.includes("permission denied") || text.includes("403") || text.includes("42501");
}

function isPhotoPayloadError(error) {
  const text = getErrorText(error);
  return text.includes("payload too large") || text.includes("file size") || text.includes("too large") || text.includes("413");
}

function isPhotoDecodeError(error) {
  const text = getErrorText(error);
  return text.includes("decode") || text.includes("image") || text.includes("load") || error instanceof Event;
}

function getErrorText(error) {
  return [error?.message, error?.details, error?.hint, error?.code, error?.error, error?.statusCode, error?.name]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
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
let selectedStudentGradeLookupExamId = "";
let selectedStudentFinalRound = 1;
let studentGradeLookupType = "final";
let studentGradesView = "";
let studentExamDraft = { sectionId: "", page: 0, answers: {}, locked: {}, editing: {}, review: false, confirmed: false };

function resetStudentGradesView() {
  selectedStudentExamId = "";
  selectedStudentGradeLookupExamId = "";
  selectedStudentFinalRound = 1;
  studentGradeLookupType = "final";
  studentGradesView = "";
  studentExamDraft = { sectionId: "", page: 0, answers: {}, locked: {}, editing: {}, review: false, confirmed: false };
}

function getStudentRegisteredTrack(student) {
  const profile = getStudentProfile(student?.id);
  return normalizeCoastGuardTrack(profile?.initialTrack || profile?.track || student?.track);
}

function renderStudentGrades() {
  const student = getAuthedStudent();
  if (!student) return renderStudentAuth();
  if (studentGradesView === "lookup") return renderStudentGradeLookupComingSoon();
  if (studentGradesView !== "entry") return renderStudentGradesHome();
  return renderStudentWeeklyGrades(student);
}

function renderStudentGradesHome() {
  return el("div", { className: "grid student-view student-grade-home" }, [
    panel("성적", [
      el("div", { className: "student-grade-action-list" }, [
        renderStudentGradeAction("성적 조회", "파이널 성적 결과를 확인합니다.", "조회", () => {
          notify("성적 조회는 준비중입니다.");
        }),
      ]),
    ]),
  ]);
}

function renderStudentGradeAction(title, copy, actionText, onClick) {
  return el("section", { className: "student-grade-action-card" }, [
    el("div", { className: "student-history-head" }, [
      el("h2", {}, title),
      el("span", {}, copy),
    ]),
    button(actionText, "btn secondary", "button", onClick),
  ]);
}

function renderStudentGradeLookupComingSoon() {
  const typeTabs = el("div", { className: "student-grade-type-tabs" }, [
    button("파이널 성적", "mini-btn active", "button", () => {}),
  ]);
  const student = getAuthedStudent();
  const roundOptions = student ? getStudentFinalRoundOptions(student) : [];
  if (!roundOptions.includes(Number(selectedStudentFinalRound))) selectedStudentFinalRound = roundOptions[0] || 0;
  const summary = student && selectedStudentFinalRound ? getStudentFinalGradeSummary(student, selectedStudentFinalRound) : null;

  return el("div", { className: "grid student-view student-grade-home" }, [
    panel("성적 조회", [
      typeTabs,
      renderStudentGradeResultPanel(summary, {
        title: "성적 요약",
        headerControl: roundOptions.length ? renderStudentFinalRoundSelect(roundOptions) : null,
        emptyText: "파이널 성적은 준비 중입니다.",
      }),
      button("성적 메뉴", "mini-btn", "button", () => {
        studentGradesView = "";
        render();
      }),
    ]),
  ]);
}

function getStudentFinalRoundOptions(student) {
  const studentId = String(student?.id || "").trim();
  if (!studentId) return [];
  const sources = [state.finalExamScores, state.finalMockScores, state.mockExamScores, state.finalScores].filter(Array.isArray);
  const rounds = sources.flat()
    .filter((record) => String(record.studentId || record.student_id || record.studentNumber || "").trim() === studentId)
    .filter(hasStudentFinalScoreRecord)
    .map(getStudentFinalRecordRound)
    .filter((round) => Number.isFinite(round) && round > 0);
  const uniqueRounds = Array.from(new Set(rounds)).sort((a, b) => a - b);
  return uniqueRounds;
}

function getStudentFinalRecordRound(record) {
  return Number(record.round || record.roundNumber || record.session || record.sessionNumber || record.examRound || record.examNumber || 0);
}

function hasStudentFinalScoreRecord(record) {
  const directValues = [
    record.score,
    record.totalScore,
    record.total_score,
    record.maxScore,
    record.max_score,
    record.totalPossible,
    record.wrongCount,
    record.wrong_count,
    record.incorrectCount,
    record.incorrect_count,
  ];
  if (directValues.some((value) => value !== "" && value !== null && value !== undefined)) return true;
  return Object.values(normalizeStudentFinalSubjectScores(record)).some((subjectScore) => subjectScore.status !== "empty");
}

function renderStudentFinalRoundSelect(roundOptions = [1]) {
  const node = el("select", {
    className: "student-grade-round-select",
    ariaLabel: "파이널 성적 회차 선택",
  }, roundOptions.map((round) => el("option", { value: String(round) }, `${round}회차`)));
  node.value = String(selectedStudentFinalRound);
  node.addEventListener("change", () => {
    selectedStudentFinalRound = Number(node.value) || 1;
    render();
  });
  return node;
}

function getStudentFinalGradeSummary(student, round = 1) {
  const records = getStudentFinalScoreRecords(round);
  const cohort = getStudentCohort(student);
  const registeredTrack = getStudentRegisteredTrack(student);
  const peers = (state.students || []).filter((item) => getStudentCohort(item) === cohort && getStudentRegisteredTrack(item) === registeredTrack);
  const summaries = peers.map((peer) => {
    const record = records.find((item) => String(item.studentId || "").trim() === String(peer.id || "").trim());
    if (!record) return { student: peer, hasScore: false, submittedCount: 0, score: 0, maxScore: 0, wrongCount: "", subjectSummaries: [] };
    const score = Number(record.score) || 0;
    const maxScore = Number(record.maxScore) || 0;
    const subjectSummaries = getFinalGradeSubjectHeaders().map((subject) => normalizeStudentFinalSubjectSummary(subject, record.subjectScores[subject]));
    return {
      student: peer,
      hasScore: true,
      submittedCount: 1,
      sectionCount: 1,
      title: `${Number(round) || 1}회차 파이널 성적`,
      score,
      maxScore,
      percent: maxScore ? Math.round((score / maxScore) * 1000) / 10 : 0,
      wrongCount: record.wrongCount !== "" && record.wrongCount !== null && record.wrongCount !== undefined
        ? Number(record.wrongCount) || 0
        : maxScore
          ? Math.max(0, Math.round((maxScore - score) / 5))
          : 0,
      subjectSummaries,
      explicitRank: record.rank,
      explicitTotal: record.total,
      explicitTopPercent: record.topPercent,
    };
  }).filter((summary) => summary.hasScore);
  const sorted = [...summaries].sort((a, b) => {
    const scoreCompare = (Number(b.score) || 0) - (Number(a.score) || 0);
    if (scoreCompare) return scoreCompare;
    const wrongCompare = (Number(a.wrongCount) || 0) - (Number(b.wrongCount) || 0);
    if (wrongCompare) return wrongCompare;
    return String(a.student.id).localeCompare(String(b.student.id), "ko-KR", { numeric: true });
  });
  let previousScore = null;
  let previousWrong = null;
  let previousRank = 0;
  sorted.forEach((summary, index) => {
    const score = Number(summary.score) || 0;
    const wrong = Number(summary.wrongCount) || 0;
    const rank = score === previousScore && wrong === previousWrong ? previousRank : index + 1;
    summary.rank = rank;
    summary.topPercent = calculateStudentTopPercent(rank, sorted.length);
    summary.displayTopPercent = rank ? Math.max(1, Math.ceil(summary.topPercent)) : 0;
    summary.percentile = Math.round((100 - summary.topPercent) * 10) / 10;
    previousScore = score;
    previousWrong = wrong;
    previousRank = rank;
  });
  const own = sorted.find((summary) => String(summary.student.id) === String(student.id));
  if (own && own.explicitRank) {
    const explicitRank = Number(own.explicitRank) || 0;
    const explicitTotal = Number(own.explicitTotal) || sorted.length;
    const explicitTopPercent = own.explicitTopPercent !== "" && own.explicitTopPercent !== null && own.explicitTopPercent !== undefined
      ? Number(own.explicitTopPercent) || 0
      : calculateStudentTopPercent(explicitRank, explicitTotal);
    own.rank = explicitRank;
    own.total = explicitTotal;
    own.topPercent = Math.round(explicitTopPercent * 10) / 10;
    own.displayTopPercent = Math.max(1, Math.ceil(own.topPercent));
    own.percentile = Math.round((100 - own.topPercent) * 10) / 10;
  }
  return own || null;
}

function getStudentFinalScoreRecords(round) {
  const sources = [state.finalExamScores, state.finalMockScores, state.mockExamScores, state.finalScores].filter(Array.isArray);
  return sources.flat().filter((record) => {
    const value = Number(record.round || record.roundNumber || record.session || record.sessionNumber || record.examRound || record.examNumber || 0);
    return value === Number(round);
  }).map((record) => ({
    studentId: record.studentId || record.student_id || record.studentNumber || "",
    score: record.score ?? record.totalScore ?? record.total_score ?? "",
    maxScore: record.maxScore ?? record.max_score ?? record.totalPossible ?? "",
    wrongCount: record.wrongCount ?? record.wrong_count ?? record.incorrectCount ?? record.incorrect_count ?? "",
    rank: record.rank ?? "",
    total: record.total ?? record.totalStudents ?? record.total_students ?? "",
    topPercent: record.topPercent ?? record.top_percent ?? "",
    subjectScores: normalizeStudentFinalSubjectScores(record),
  }));
}

function getFinalGradeSubjectHeaders() {
  return Array.isArray(FINAL_GRADE_SUBJECTS) ? FINAL_GRADE_SUBJECTS : Array.from({ length: 8 }, (_, index) => `과목${index + 1}`);
}

function normalizeStudentFinalSubjectScores(record) {
  const subjectScores = {};
  const source = record.subjectScores || record.subject_scores || record.scoresBySubject || record.subjects || null;
  if (Array.isArray(source)) {
    source.slice(0, 8).forEach((value, index) => {
      subjectScores[`과목${index + 1}`] = normalizeStudentFinalSubjectValue(value);
    });
  } else if (source && typeof source === "object") {
    getFinalGradeSubjectHeaders().forEach((subject, index) => {
      const value = source[subject] ?? source[`subject${index + 1}`] ?? source[`과목${index + 1}`];
      if (value !== undefined) subjectScores[subject] = normalizeStudentFinalSubjectValue(value);
    });
  }
  getFinalGradeSubjectHeaders().forEach((subject, index) => {
    const direct = record[`subject${index + 1}`] ?? record[`subject_${index + 1}`] ?? record[`score${index + 1}`] ?? record[`score_${index + 1}`];
    if (direct !== undefined) subjectScores[subject] = normalizeStudentFinalSubjectValue(direct);
  });
  return subjectScores;
}

function normalizeStudentFinalSubjectValue(value) {
  if (value && typeof value === "object") {
    return {
      score: value.score ?? value.total ?? value.value ?? "",
      maxScore: value.maxScore ?? value.max_score ?? value.max ?? "",
      wrongCount: value.wrongCount ?? value.wrong_count ?? value.incorrectCount ?? value.incorrect_count ?? "",
      status: value.status || "submitted",
    };
  }
  if (value === "" || value === null || value === undefined) return { status: "empty" };
  return { score: value, maxScore: "", status: "submitted" };
}

function normalizeStudentFinalSubjectSummary(subject, subjectScore = {}) {
  const score = Number(subjectScore.score) || 0;
  const maxScore = Number(subjectScore.maxScore) || 0;
  return {
    subject,
    score,
    maxScore,
    wrongCount: subjectScore.wrongCount !== "" && subjectScore.wrongCount !== null && subjectScore.wrongCount !== undefined
      ? Number(subjectScore.wrongCount) || 0
      : maxScore
        ? Math.max(0, Math.round((maxScore - score) / 5))
        : "-",
    rank: 0,
    displayTopPercent: 0,
    submitted: subjectScore.status !== "empty",
  };
}

function getStudentWeeklyGradeSummary(exam, student) {
  const sections = getStudentExamSections(exam, student);
  const ownSubmissions = sections.map((section) => ({ section, submission: getStudentSubmission(student.id, section.id) }));
  const submitted = ownSubmissions.filter((item) => item.submission);
  const maxScore = sections.reduce((sum, section) => sum + getStudentVisibleSectionAnswers(section, student).length * 5, 0);
  const score = submitted.reduce((sum, item) => sum + (Number(item.submission.score) || 0), 0);
  const cohort = getStudentCohort(student);
  const registeredTrack = getStudentRegisteredTrack(student);
  const peers = (state.students || []).filter((item) => getStudentCohort(item) === cohort && getStudentRegisteredTrack(item) === registeredTrack);
  const peerScores = peers.map((peer) => {
    const peerSections = getStudentExamSections(exam, peer);
    const peerMax = peerSections.reduce((sum, section) => sum + getStudentVisibleSectionAnswers(section, peer).length * 5, 0);
    const peerSubmitted = peerSections.map((section) => getStudentSubmission(peer.id, section.id)).filter(Boolean);
    const peerScore = peerSubmitted.reduce((sum, submission) => sum + (Number(submission.score) || 0), 0);
    return {
      id: peer.id,
      score: peerScore,
      maxScore: peerMax,
      percent: peerMax ? Math.round((peerScore / peerMax) * 1000) / 10 : 0,
      submittedCount: peerSubmitted.length,
    };
  }).filter((item) => item.submittedCount > 0 && item.maxScore > 0);
  const own = peerScores.find((item) => item.id === student.id);
  const sorted = [...peerScores].sort((a, b) => b.percent - a.percent || b.score - a.score);
  const rank = own ? sorted.findIndex((item) => item.id === student.id) + 1 : 0;
  const topPercent = own && sorted.length ? calculateStudentTopPercent(rank, sorted.length) : 0;
  const displayTopPercent = rank ? Math.max(1, Math.ceil(topPercent)) : 0;
  const percentile = own ? Math.round((100 - topPercent) * 10) / 10 : 0;
  const subjectSummaries = ownSubmissions.map((item) => getStudentSubjectGradeSummary(exam, student, item.section, item.submission, peers));
  return {
    title: formatStudentWeeklyExamName(exam.weekNumber),
    score,
    maxScore,
    percent: maxScore ? Math.round((score / maxScore) * 1000) / 10 : 0,
    submittedCount: submitted.length,
    sectionCount: sections.length,
    rank,
    total: sorted.length,
    topPercent,
    displayTopPercent,
    percentile,
    subjectSummaries,
  };
}

function getStudentSubjectGradeSummary(exam, student, section, submission, peers) {
  const questionCount = getStudentVisibleSectionAnswers(section, student).length;
  const score = submission ? Number(submission.score) || 0 : 0;
  const correctCount = submission ? Number(submission.correctCount) || 0 : 0;
  const maxScore = questionCount * 5;
  const wrongCount = submission ? Math.max(0, questionCount - correctCount) : null;
  const peerScores = peers.map((peer) => {
    const peerSection = getStudentExamSections(exam, peer).find((item) => item.subject === section.subject);
    if (!peerSection) return null;
    const peerSubmission = getStudentSubmission(peer.id, peerSection.id);
    if (!peerSubmission) return null;
    const peerQuestionCount = getStudentVisibleSectionAnswers(peerSection, peer).length;
    const peerScore = Number(peerSubmission.score) || 0;
    return {
      id: peer.id,
      score: peerScore,
      wrongCount: Math.max(0, peerQuestionCount - (Number(peerSubmission.correctCount) || 0)),
      percent: peerQuestionCount ? Math.round((peerScore / (peerQuestionCount * 5)) * 1000) / 10 : 0,
    };
  }).filter(Boolean);
  const sorted = [...peerScores].sort((a, b) => b.percent - a.percent || b.score - a.score || a.wrongCount - b.wrongCount);
  const rank = submission ? sorted.findIndex((item) => item.id === student.id) + 1 : 0;
  const topPercent = rank ? calculateStudentTopPercent(rank, sorted.length) : 0;
  return {
    subject: section.subject,
    score,
    maxScore,
    wrongCount,
    rank,
    topPercent,
    displayTopPercent: rank ? Math.max(1, Math.ceil(topPercent)) : 0,
    submitted: Boolean(submission),
  };
}

function calculateStudentTopPercent(rank, total) {
  if (!rank || !total) return 0;
  if (total <= 1) return 0;
  return Math.round(((rank - 1) / (total - 1)) * 1000) / 10;
}

function renderStudentGradeResultPanel(summary, options = {}) {
  const headerTitle = summary?.title || options.title;
  const header = headerTitle
    ? el("div", { className: "student-grade-result-title" }, [
        el("strong", {}, headerTitle),
        options.headerControl || null,
      ])
    : null;
  if (!summary || !summary.submittedCount) {
    return el("div", { className: "student-grade-result" }, [
      header,
      renderStudentGradePyramid(null),
      el("div", { className: "empty" }, options.emptyText || "아직 제출된 성적이 없습니다."),
    ]);
  }
  return el("div", { className: "student-grade-result" }, [
    header,
    renderStudentGradePyramid(summary),
    renderStudentSubjectGradeList(summary.subjectSummaries),
  ]);
}

function renderStudentSubjectGradeList(subjectSummaries = []) {
  return el("div", { className: "student-grade-subject-list" }, [
    el("strong", {}, "과목별 성적"),
    subjectSummaries.length
      ? subjectSummaries.map((item) => el("article", { className: "student-grade-subject-card" }, [
          el("h3", {}, item.subject),
          el("div", { className: "detail-grid" }, [
            el("div", { className: "detail-item" }, [el("span", {}, "점수"), el("strong", {}, item.submitted ? `${item.score}점` : "미제출")]),
            el("div", { className: "detail-item" }, [el("span", {}, "오답"), el("strong", {}, item.submitted ? formatStudentWrongCount(item.wrongCount) : "-")]),
            el("div", { className: "detail-item" }, [el("span", {}, "위치"), el("strong", {}, item.rank ? formatTopPercentLabel(item.topPercent ?? item.displayTopPercent) : "-")]),
          ]),
        ]))
      : el("div", { className: "empty" }, "표시할 과목별 성적이 없습니다."),
  ]);
}

function renderStudentGradePyramid(summary) {
  const student = summary?.student || getAuthedStudent();
  const trackText = student ? getStudentRegisteredTrack(student) : "";
  return renderPercentilePyramid({
    percentile: summary?.rank ? summary.percentile : null,
    label: summary?.rank ? formatTopPercentLabel(summary.topPercent) : "",
    metaText: summary?.rank && summary?.total ? `응시자 ${summary.total}명 중 ${summary.rank}등` : "",
    scoreValue: summary ? `${summary.score}/${summary.maxScore}점` : "",
    wrongValue: summary ? formatStudentWrongCount(summary.wrongCount) : "",
    trackText,
    primaryColor: "var(--accent)",
    baseBgColor: "#e6edf5",
  });
}

function renderPercentilePyramid({ percentile = null, label = "", metaText = "", scoreValue = "", wrongValue = "", trackText = "", primaryColor = "var(--accent)", baseBgColor = "#e6edf5", levels = 4 } = {}) {
  const hasMarker = percentile !== null && percentile !== undefined && percentile !== "";
  const safePercentile = Math.max(0, Math.min(100, Number(percentile) || 0));
  const topPercent = hasMarker ? Math.max(0, Math.min(100, 100 - safePercentile)) : 0;
  const visualPosition = hasMarker ? 100 - topPercent : 0;
  const displayLabel = hasMarker ? label || formatTopPercentLabel(topPercent) : "준비 중";
  const style = [
    `--pyramid-primary:${primaryColor}`,
    `--pyramid-base:${baseBgColor}`,
    `--grade-position:${roundSvg(visualPosition)}%`,
  ].join(";");
  return el("div", { className: `student-grade-pyramid${hasMarker ? " has-marker" : ""}`, style, ariaLabel: "백분위 성적 요약" }, [
    el("div", { className: "student-grade-card-head" }, [
      el("span", { className: "student-grade-rank-badge" }, "내 위치"),
      trackText ? el("span", { className: "student-grade-rank-track" }, trackText) : null,
    ]),
    el("strong", { className: "student-grade-rank-value" }, displayLabel),
    metaText ? el("span", { className: "student-grade-rank-meta" }, metaText) : null,
    el("div", { className: "student-grade-position-meter", ariaLabel: hasMarker ? `${displayLabel} 위치 표시` : "성적 준비 중" }, [
      el("span", { className: "student-grade-position-fill" }),
      hasMarker ? el("span", { className: "student-grade-position-marker" }) : null,
    ]),
    el("div", { className: "student-grade-position-labels" }, [
      el("span", {}, "전체 구간"),
      el("span", {}, "상위권"),
    ]),
    scoreValue || wrongValue ? el("div", { className: "student-grade-metrics" }, [
      renderStudentGradeMetric("총점", scoreValue || "-"),
      renderStudentGradeMetric("오답", wrongValue || "-"),
    ]) : null,
  ]);
}

function renderStudentGradeMetric(label, value) {
  return el("div", { className: "student-grade-metric" }, [
    el("span", {}, label),
    el("strong", {}, value),
  ]);
}

function formatStudentWrongCount(value) {
  if (value === "" || value === null || value === undefined || value === "-") return "-";
  const count = Number(value);
  return Number.isFinite(count) ? `${count}개` : "-";
}

function roundSvg(value) {
  return Math.round(Number(value) * 10) / 10;
}

function renderStudentWeeklyGrades(student) {
  const exams = getVisibleStudentExams(student);
  const selectedExam = exams.find((exam) => exam.id === selectedStudentExamId) || exams[0] || null;
  if (selectedExam) selectedStudentExamId = selectedExam.id;
  if (!selectedExam) {
    return el("div", { className: "grid student-view" }, [
      panel(studentGradesView === "entry" ? "성적 입력" : "성적 조회", [
        button("성적 메뉴", "mini-btn", "button", () => {
          studentGradesView = "";
          render();
        }),
        el("div", { className: "empty" }, "현재 공개된 주간평가가 없습니다."),
      ]),
    ]);
  }
  const sections = getStudentExamSections(selectedExam, student);
  const visibleSections = studentGradesView === "entry"
    ? sections.filter((section) => !getStudentSubmission(student.id, section.id))
    : sections;
  const selectedSection = sections.find((section) => section.id === studentExamDraft.sectionId);
  if (selectedSection) {
    return el("div", { className: "grid student-view student-exam-view student-answer-only-view" }, [
      renderStudentExamAnswerEntry(selectedExam, selectedSection, student, sections),
    ]);
  }
  return el("div", { className: "grid student-view student-exam-view" }, [
    renderStudentExamList(exams, selectedExam),
    renderStudentExamEntrySubjectList(selectedExam, visibleSections, student),
  ]);
}

function renderStudentGradesBackPanel() {
  return panel("성적 구분", [
    button("성적 메뉴", "mini-btn", "button", () => {
      studentGradesView = "";
      studentExamDraft = { sectionId: "", page: 0, answers: {}, locked: {}, editing: {}, review: false, confirmed: false };
      render();
    }),
    el("span", { className: "subtle" }, studentGradesView === "entry" ? "성적 입력" : "성적 조회"),
  ]);
}

function getVisibleStudentExams(student) {
  const track = getStudentRegisteredTrack(student);
  const cohort = getStudentCohort(student);
  return (state.exams || [])
    .filter((exam) => exam.isPublished)
    .filter((exam) => !exam.cohort || !cohort || String(exam.cohort) === cohort)
    .filter((exam) => (state.examSections || []).some((section) => section.examId === exam.id && isStudentSectionMatch(section, track)))
    .sort((a, b) => Number(b.weekNumber) - Number(a.weekNumber));
}

function getStudentExamSections(exam, student) {
  const track = getStudentRegisteredTrack(student);
  return (state.examSections || []).filter((section) => section.examId === exam.id && isStudentSectionMatch(section, track));
}

function isStudentSectionMatch(section, studentTrack) {
  const sectionTrack = normalizeCoastGuardTrack(section.track);
  const trackMatched = sectionTrack === studentTrack || sectionTrack === "전체";
  const subjectMatched = sectionTrack !== "전체" || isWeeklySubjectAllowedForTrack(section.subject, studentTrack);
  return section.isActive !== false && trackMatched && subjectMatched && isStudentSectionPublished(section, studentTrack);
}

function isStudentSectionPublished(section, studentTrack = "") {
  const answers = getStudentVisibleSectionAnswers(section, { track: studentTrack });
  return answers.length > 0 && answers.every((answer) => answer.correctAnswer);
}

function getStudentVisibleSectionAnswers(section, student) {
  const studentTrack = typeof student === "string"
    ? normalizeCoastGuardTrack(student)
    : student?.id
      ? getStudentRegisteredTrack(student)
      : normalizeCoastGuardTrack(student?.track);
  return (state.examAnswers || [])
    .filter((answer) => answer.examSectionId === section.id)
    .filter((answer) => !isWeeklyQuestionTrackScopedSubject(section.subject) || isWeeklyQuestionForTrack(answer, studentTrack))
    .sort((a, b) => Number(a.questionNumber) - Number(b.questionNumber));
}

function renderStudentExamList(exams, selectedExam) {
  const examSelect = select("examId", exams.map((exam) => exam.id));
  examSelect.querySelectorAll("option").forEach((option) => {
    const exam = exams.find((item) => item.id === option.value);
    if (exam) option.textContent = `${exam.weekNumber}주차`;
  });
  examSelect.value = selectedExam.id;
  examSelect.addEventListener("change", () => {
    studentExamDraft = { sectionId: "", page: 0, answers: {}, locked: {}, editing: {}, review: false, confirmed: false };
    selectedStudentExamId = examSelect.value;
    render();
  });
  return panel("주간평가 목록", [
    field("주차 선택", examSelect),
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
  const visibleQuestionCount = getStudentVisibleSectionAnswers(section, student).length;
  return el("article", { className: "student-exam-subject" }, [
    el("div", {}, [el("strong", {}, section.subject), el("span", { className: "badge" }, status)]),
    el("p", { className: "subtle" }, `${visibleQuestionCount}문항 · ${visibleQuestionCount * 5}점`),
    submission?.status === "submitted" && scoreOpen ? el("p", { className: "student-score-line" }, `점수 ${submission.score}점 · 정답 ${submission.correctCount}/${visibleQuestionCount}`) : null,
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
  if (studentExamDraft.sectionId === section.id) return "입력 중";
  return "미제출";
}

function isExamOpen(exam) {
  const now = Date.now();
  if (exam.startAt && now < new Date(exam.startAt).getTime()) return false;
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
  const visibleAnswers = getStudentVisibleSectionAnswers(section, student);
  if (!visibleAnswers.length) {
    studentExamDraft.sectionId = "";
    return renderStudentExamSubjectList(exam, allSections, student);
  }
  studentExamDraft.page = Math.min(studentExamDraft.page || 0, Math.max(0, Math.ceil(visibleAnswers.length / 10) - 1));
  const start = studentExamDraft.page * 10 + 1;
  const end = Math.min(start + 9, visibleAnswers.length);
  const cards = [];
  visibleAnswers.slice(start - 1, end).forEach((answer, index) => cards.push(renderStudentAnswerQuestion(answer.questionNumber, start + index)));
  return panel(`${section.subject} ${visibleAnswers.length}문제`, [
    el("div", { className: "student-answer-range" }, `${start}~${end}번`),
    el("div", { className: "student-answer-list" }, cards),
    renderStudentAnswerNav(section, visibleAnswers.length),
  ]);
}

function renderStudentExamEntrySubjectList(exam, sections, student) {
  return panel(formatStudentWeeklyExamName(exam.weekNumber), [
    sections.length
      ? el("div", { className: "student-exam-subjects" }, sections.map((section) => renderStudentExamSubjectCard(exam, section, student, sections, false)))
      : el("div", { className: "empty" }, "입력할 주간평가 과목이 없습니다."),
  ]);
}

function renderStudentAnswerQuestion(questionNumber, displayNumber = questionNumber) {
  const current = studentExamDraft.answers[questionNumber] || "";
  const options = [1, 2, 3, 4].map((value) => {
    const selected = Number(current) === value;
    const node = button(`${toCircledAnswer(value)}${selected ? " ✓" : ""}`, selected ? "answer-choice selected" : "answer-choice", "button", () => {
      const previous = studentExamDraft.answers[questionNumber];
      studentExamDraft.answers[questionNumber] = value;
      studentExamDraft.locked[questionNumber] = true;
      studentExamDraft.editing[questionNumber] = false;
      render();
      if (previous && previous !== value) notify(`${questionNumber}번 답안이 ${toCircledAnswer(previous)}에서 ${toCircledAnswer(value)}로 변경되었습니다.`);
    });
    return node;
  });
  return el("article", { className: current ? "student-answer-card locked" : "student-answer-card" }, [
    el("div", { className: "student-answer-head" }, [el("strong", {}, `${displayNumber}번`), el("span", {}, current ? `선택 ${toCircledAnswer(current)}` : "미입력")]),
    el("div", { className: "answer-choice-row" }, options),
  ]);
}

function renderStudentAnswerNav(section, questionCount = section.questionCount) {
  const prev = button("이전 10문제", "btn secondary", "button", () => {
    studentExamDraft.page = Math.max(0, studentExamDraft.page - 1);
    render();
  });
  prev.disabled = studentExamDraft.page === 0;
  const next = button("다음 10문제", "btn secondary", "button", () => {
    studentExamDraft.page = Math.min(Math.ceil(questionCount / 10) - 1, studentExamDraft.page + 1);
    render();
  });
  next.disabled = studentExamDraft.page >= Math.ceil(questionCount / 10) - 1;
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
  const visibleAnswers = getStudentVisibleSectionAnswers(section, student);
  visibleAnswers.forEach((answerKey, index) => {
    const question = answerKey.questionNumber;
    const displayNumber = index + 1;
    const answer = studentExamDraft.answers[question];
    if (!answer) missing.push(displayNumber);
    cells.push(button(`${displayNumber}. ${answer ? toCircledAnswer(answer) : "미입력"}`, answer ? "answer-sheet-cell" : "answer-sheet-cell missing", "button", () => {
      studentExamDraft.review = false;
      studentExamDraft.page = Math.floor(index / 10);
      render();
    }));
  });
  const checkbox = el("input", { type: "checkbox" });
  const submitButton = button("최종 제출", "btn", "button", () => confirmStudentExamSubmit(section, student, missing, visibleAnswers.length));
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

function confirmStudentExamSubmit(section, student, missing, questionCount = section.questionCount) {
  const message = missing.length
    ? `총 ${questionCount}문항 중 ${questionCount - missing.length}문항만 입력했습니다.\n미입력 문항: ${missing.join(", ")}번\n미입력 문항은 오답 처리됩니다.\n그래도 제출하시겠습니까?`
    : `총 ${questionCount}문항 중 ${questionCount}문항을 모두 입력했습니다.\n제출 후에는 답안을 수정할 수 없습니다.\n최종 제출하시겠습니까?`;
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
    track: getStudentRegisteredTrack(student),
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
  const key = getStudentVisibleSectionAnswers(section, { track: submission.track });
  let score = 0;
  let correctCount = 0;
  state.submissionAnswers = (state.submissionAnswers || []).filter((answer) => answer.submissionId !== submission.id);
  key.forEach((answerKey) => {
    const question = answerKey.questionNumber;
    const selectedAnswer = Number(studentExamDraft.answers[question]) || null;
    const isCorrect = Boolean(answerKey?.correctAnswer && selectedAnswer === answerKey.correctAnswer);
    const pointsAwarded = isCorrect ? Number(answerKey.points) || 0 : 0;
    if (isCorrect) correctCount += 1;
    score += pointsAwarded;
    state.submissionAnswers.push({ id: createId(), submissionId: submission.id, questionNumber: question, selectedAnswer, isCorrect, pointsAwarded });
  });
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
