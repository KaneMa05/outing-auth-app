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
    if (!activeOuting) {
      setStudentStep("request");
      return renderStudentRequestStep();
    }
    if (!isOutingReadyForReturn(activeOuting)) {
      state.settings.studentStep = "verify";
      return studentStepView("사진 인증", createVerifyForm(), "photo-step");
    }
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
    if (activeOuting) return isOutingReadyForReturn(activeOuting) ? "return" : "verify";
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
  return studentShell("외출 신청", "외출 신청 후 사진 인증과 복귀 인증까지 완료해주세요.", [
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
  const savedSitePhoto = getOutingPhotoByType(activeOuting, "현장 인증");
  const savedReceiptPhoto = getOutingPhotoByType(activeOuting, "영수증 인증");
  const savedTypes = new Set((activeOuting?.photos || []).map((photo) => photo.type));
  const hasRequiredPhotos =
    savedTypes.has("현장 인증") &&
    (!isReceiptRequired || savedTypes.has("영수증 인증"));
  const isPendingFinalSubmit = Boolean(activeOuting && activeOuting.status === "requested" && hasRequiredPhotos);
  const savingTypes = new Set();
  const saveVerificationPhoto = async (file, type) => {
    const outing = getActiveOuting(state.settings.lastStudentId);
    if (!outing) throw new Error("outing_required");
    savingTypes.add(type);
    submitButton.disabled = true;
    try {
      const photo = await createOutingPhoto(outing, file, type);
      await saveOutingPhotoMetadataToRemote(outing, photo);
      outing.photos = outing.photos.filter((item) => item.type !== type);
      outing.photos.push(photo);
      state.settings.lastStudentId = outing.studentId;
      saveState({ skipRemote: true });
      savedTypes.add(type);
    } finally {
      savingTypes.delete(type);
      submitButton.disabled = Boolean(savingTypes.size);
    }
  };
  const form = el("form", { className: "form-grid" }, [
    el("p", { className: "subtle full" }, "외출 신청이 접수되었습니다. 현장 인증 사진을 제출해주세요."),
    isPendingFinalSubmit
      ? el("div", { className: "pending-verification-notice full" }, [
          el("strong", {}, "사진은 저장됐고, 아직 최종 제출 전입니다."),
          el("span", {}, "사진을 바꾸려면 다시 촬영하고, 이 사진으로 확정하려면 아래 사진 인증 제출 버튼을 눌러주세요."),
        ])
      : null,
    field("현장 인증 사진", photoCaptureInput("sitePhoto", {
      thumbnailPreview: true,
      initialStatus: savedTypes.has("현장 인증") ? "현장 사진 저장 완료. 아래 사진 인증 제출 버튼을 눌러주세요." : "",
      initialPreviewSrc: getOutingThumbnailSrc(savedSitePhoto),
      onFileSelected: (file) => saveVerificationPhoto(file, "현장 인증"),
      savingText: "현장 사진 저장 중...",
      savingMessages: [
        "현장 사진 저장 중...",
        "사진 용량을 줄이는 중이에요.",
        "서버로 전송하고 있어요.",
        "저장 확인 중이에요. 다시 촬영하지 말고 기다려주세요.",
      ],
      savedText: "현장 사진 저장 완료. 아래 사진 인증 제출 버튼을 눌러주세요.",
    }), "full"),
    field(
      isReceiptRequired ? "영수증 인증 사진 (필수)" : "영수증 인증 사진 (선택)",
      photoCaptureInput("receiptPhoto", {
        thumbnailPreview: true,
        initialStatus: savedTypes.has("영수증 인증") ? "영수증 사진 저장 완료. 아래 사진 인증 제출 버튼을 눌러주세요." : "",
        initialPreviewSrc: getOutingThumbnailSrc(savedReceiptPhoto),
        onFileSelected: (file) => saveVerificationPhoto(file, "영수증 인증"),
        savingText: "영수증 사진 저장 중...",
        savingMessages: [
          "영수증 사진 저장 중...",
          "사진 용량을 줄이는 중이에요.",
          "서버로 전송하고 있어요.",
          "저장 확인 중이에요. 다시 촬영하지 말고 기다려주세요.",
        ],
        savedText: "영수증 사진 저장 완료. 아래 사진 인증 제출 버튼을 눌러주세요.",
      }),
      "full",
      isReceiptRequired ? "병원 외출은 영수증 인증 사진을 함께 제출해야 합니다." : ""
    ),
    el("div", { className: "field full" }, [
      submitButton,
      el("p", { className: "subtle" }, "사진 저장 완료 후 인증 제출이 안 되면 사진을 다시 찍지 말고 이 버튼만 다시 눌러주세요."),
    ]),
  ]);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const outing = getActiveOuting(state.settings.lastStudentId);
    if (!outing) return notify("진행 중인 외출 신청이 없습니다.");

    if (savingTypes.size) return notify("사진 저장이 끝난 뒤 인증 제출을 눌러주세요.");
    if (!hasOutingPhotoType(outing, "현장 인증")) return notify("현장 인증 사진을 먼저 저장해주세요.");
    if (String(outing.reason || "").trim() === "병원" && !hasOutingPhotoType(outing, "영수증 인증")) return notify("병원 외출은 영수증 인증 사진을 먼저 저장해주세요.");

    submitButton.disabled = true;
    const loadingProgress = startButtonLoadingProgress(submitButton, [
      "인증 내역 저장 중...",
      "서버에 인증 상태를 저장하고 있어요.",
      "조금 걸려도 사진을 다시 찍지 말고 기다려주세요.",
    ]);

    const previousOuting = {
      receiptNote: outing.receiptNote,
      status: outing.status,
      verifiedAt: outing.verifiedAt,
    };
    const previousSettings = {
      lastStudentId: state.settings.lastStudentId,
      earlyLeaveMode: state.settings.earlyLeaveMode,
      studentStep: state.settings.studentStep,
    };

    try {
      outing.receiptNote = "";
      outing.status = outing.status === "returned" ? "returned" : "verified";
      outing.verifiedAt = new Date().toISOString();
      state.settings.lastStudentId = outing.studentId;
      state.settings.earlyLeaveMode = false;
      saveState({ skipRemote: true });
      await saveOutingVerificationStatusToRemote(outing);
      loadingProgress.stop();
      notify("사진 인증을 제출했습니다. 복귀 후 반납 처리하세요.");
      form.reset();
      setStudentStep("return");
      saveState({ skipRemote: true });
      render();
    } catch (error) {
      console.error(error);
      outing.receiptNote = previousOuting.receiptNote;
      outing.status = previousOuting.status;
      outing.verifiedAt = previousOuting.verifiedAt;
      state.settings.lastStudentId = previousSettings.lastStudentId;
      state.settings.earlyLeaveMode = previousSettings.earlyLeaveMode;
      state.settings.studentStep = previousSettings.studentStep;
      saveState({ skipRemote: true });
      loadingProgress.stop();
      notify("사진은 저장되어 있습니다. 다시 촬영하지 말고 잠시 후 사진 인증 제출 버튼만 다시 눌러주세요.");
      submitButton.disabled = false;
      submitButton.textContent = "사진 인증 제출";
    }
  });

  return form;
}

function getOutingPhotoByType(outing, type) {
  return (outing?.photos || []).find((photo) => photo?.type === type) || null;
}

function photoCaptureInput(name, options = {}) {
  const disabled = Boolean(options.disabled);
  const skipPreview = Boolean(options.skipPreview);
  const thumbnailPreview = Boolean(options.thumbnailPreview);
  const onFileSelected = typeof options.onFileSelected === "function" ? options.onFileSelected : null;
  const inputNode = fileInput(name);
  inputNode.disabled = disabled;
  inputNode.className = "visually-hidden-file";
  const status = el("span", { className: `photo-input-status ${options.initialStatus ? "selected" : ""}` }, disabled ? "인증 가능 시간이 지났습니다." : options.initialStatus || "사진을 촬영해주세요.");
  const preview = el("div", { className: "photo-input-preview", hidden: true });
  if (options.initialPreviewSrc) {
    preview.appendChild(el("img", { src: options.initialPreviewSrc, alt: "저장된 사진 미리보기", loading: "lazy" }));
    preview.hidden = false;
  }
  let pickerResetTimer = null;
  let pickerInProgress = false;
  const fallbackTrigger = button("사진 선택", "btn secondary photo-input-button", "button", () => {
    if (disabled) return;
    pickerInProgress = true;
    markStudentFilePickerOpen();
    inputNode.value = "";
    inputNode.removeAttribute("capture");
    setPhotoInputLoading(fallbackTrigger, status, true, "사진 선택 중...");
    inputNode.click();
  });
  fallbackTrigger.hidden = true;
  fallbackTrigger.disabled = disabled;
  const showFallbackPicker = (message) => {
    pickerInProgress = false;
    markStudentFilePickerClosed();
    fallbackTrigger.hidden = false;
    fallbackTrigger.disabled = disabled;
    setPhotoInputLoading(trigger, status, false, message || "카메라 촬영을 완료하지 못했습니다. 사진 선택으로 다시 시도해주세요.");
  };
  const trigger = button("인증하기", "btn secondary photo-input-button", "button", () => {
    if (disabled) return;
    pickerInProgress = true;
    markStudentFilePickerOpen();
    setPhotoInputLoading(trigger, status, true, "사진 선택 중...");
    inputNode.value = "";
    inputNode.setAttribute("capture", "environment");
    if (shouldSimulatePhotoPickerFailure()) {
      window.clearTimeout(pickerResetTimer);
      pickerResetTimer = window.setTimeout(() => {
        if (pickerInProgress && !inputNode.files?.length) {
          showFallbackPicker("카메라 촬영을 완료하지 못했습니다. 사진 선택으로 다시 시도해주세요.");
        }
      }, 900);
      return;
    }
    inputNode.click();
  });
  trigger.disabled = disabled;
  let previewUrl = "";
  let previewRequestId = 0;

  window.addEventListener("focus", () => {
    window.clearTimeout(pickerResetTimer);
    pickerResetTimer = window.setTimeout(() => {
      if (pickerInProgress && !inputNode.files?.length) {
        showFallbackPicker("카메라 촬영을 완료하지 못했습니다. 사진 선택으로 다시 시도해주세요.");
      }
    }, 700);
  });

  inputNode.addEventListener("cancel", () => {
    window.clearTimeout(pickerResetTimer);
    pickerInProgress = false;
    markStudentFilePickerClosed();
    setPhotoInputLoading(trigger, status, false, "사진을 촬영해주세요.");
  });

  inputNode.addEventListener("change", async () => {
    window.clearTimeout(pickerResetTimer);
    pickerInProgress = false;
    markStudentFilePickerClosed();
    previewRequestId += 1;
    const currentPreviewRequestId = previewRequestId;
    const file = inputNode.files[0];
    preview.innerHTML = "";
    preview.hidden = !file;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = "";
    if (!file) {
      pickerInProgress = false;
      markStudentFilePickerClosed();
      setPhotoInputLoading(trigger, status, false, "사진을 촬영해주세요.");
      return;
    }
    fallbackTrigger.hidden = true;
    fallbackTrigger.disabled = disabled;
    trigger.disabled = disabled;

    if (skipPreview || (!thumbnailPreview && shouldSkipPhotoPreview(file))) {
      preview.hidden = true;
      await finishPhotoSelection(file, () => currentPreviewRequestId === previewRequestId, trigger, status, onFileSelected, options);
      return;
    }
    setPhotoInputLoading(trigger, status, true, "미리보기 준비 중...");
    if (thumbnailPreview) {
      renderPhotoThumbnailPreview(file, preview, () => currentPreviewRequestId === previewRequestId);
      await finishPhotoSelection(file, () => currentPreviewRequestId === previewRequestId, trigger, status, onFileSelected, options);
      return;
    }
    previewUrl = URL.createObjectURL(file);
    const previewImage = el("img", { alt: "선택한 사진 미리보기" });
    previewImage.addEventListener("load", async () => {
      await finishPhotoSelection(file, () => currentPreviewRequestId === previewRequestId, trigger, status, onFileSelected, options);
    });
    previewImage.addEventListener("error", () => {
      setPhotoInputLoading(trigger, status, false, "사진을 다시 선택해주세요.");
    });
    previewImage.src = previewUrl;
    preview.appendChild(previewImage);
  });

  return el("div", { className: "photo-input-control" }, [inputNode, el("div", { className: "photo-input-actions" }, [trigger, fallbackTrigger]), status, preview]);
}

function isOutingReceiptRequired(outing) {
  return String(outing?.reason || "").trim() === "병원";
}

function hasOutingPhotoType(outing, type) {
  return (outing?.photos || []).some((photo) => photo?.type === type);
}

function isOutingReadyForReturn(outing) {
  if (!outing) return false;
  return Boolean(
    outing.status !== "requested" &&
      hasOutingPhotoType(outing, "현장 인증") &&
      (!isOutingReceiptRequired(outing) || hasOutingPhotoType(outing, "영수증 인증"))
  );
}

function getReturnBlockedMessage(outing) {
  if (!hasOutingPhotoType(outing, "현장 인증")) return "현장 사진 인증을 먼저 완료해주세요.";
  if (isOutingReceiptRequired(outing) && !hasOutingPhotoType(outing, "영수증 인증")) return "병원 외출은 영수증 사진 인증을 먼저 완료해주세요.";
  return "현장 사진과 영수증 사진을 먼저 인증해주세요.";
}

function shouldSkipPhotoPreview(file) {
  return !file || file.size > 1024 * 1024;
}

function shouldSimulatePhotoPickerFailure() {
  if (!["localhost", "127.0.0.1"].includes(location.hostname)) return false;
  return new URLSearchParams(location.search).get("simulatePhotoFailure") === "memory";
}

async function renderPhotoThumbnailPreview(file, preview, isCurrentSelection) {
  try {
    const thumbnailDataUrl = await createPhotoThumbnailPreview(file);
    if (typeof isCurrentSelection === "function" && !isCurrentSelection()) return;
    preview.innerHTML = "";
    if (thumbnailDataUrl) {
      preview.appendChild(el("img", { src: thumbnailDataUrl, alt: "선택한 사진 미리보기" }));
      preview.hidden = false;
    } else {
      preview.hidden = true;
    }
  } catch (error) {
    console.warn("Photo thumbnail preview failed; continuing without preview.", error);
    if (typeof isCurrentSelection === "function" && !isCurrentSelection()) return;
    preview.innerHTML = "";
    preview.hidden = true;
  }
}

async function createPhotoThumbnailPreview(file, maxSize = 160) {
  if (!file?.type?.startsWith("image/")) return "";

  const canvas = document.createElement("canvas");
  let image = null;
  let objectUrl = "";

  try {
    objectUrl = URL.createObjectURL(file);
    image = await loadImage(objectUrl);
    const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return "";
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.5);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
    if (image) image.src = "";
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

function setPhotoInputLoading(trigger, status, loading, text) {
  trigger.disabled = loading;
  status.className = loading ? "photo-input-status loading" : "photo-input-status";
  status.innerHTML = "";
  if (loading) status.appendChild(el("span", { className: "loading-spinner", ariaHidden: "true" }));
  status.appendChild(document.createTextNode(text));
}

async function finishPhotoSelection(file, isCurrentSelection, trigger, status, onFileSelected, options = {}) {
  if (!file) return;
  if (typeof isCurrentSelection === "function" && !isCurrentSelection()) return;
  if (!onFileSelected) {
    status.textContent = options.selectedText || "사진이 선택되었습니다. 아래 버튼을 눌러 인증을 완료해주세요.";
    status.className = "photo-input-status selected";
    trigger.disabled = false;
    return;
  }

  const savingProgress = startInlineStatusProgress(status, options.savingMessages || [options.savingText || "사진 저장 중..."]);
  trigger.disabled = true;
  try {
    await onFileSelected(file);
    savingProgress.stop();
    if (typeof isCurrentSelection === "function" && !isCurrentSelection()) return;
    status.textContent = options.savedText || "사진 저장 완료";
    status.className = "photo-input-status selected";
  } catch (error) {
    console.error(error);
    savingProgress.stop();
    if (typeof isCurrentSelection === "function" && !isCurrentSelection()) return;
    status.textContent = "사진 저장 실패. 다시 촬영해주세요.";
    status.className = "photo-input-status";
    notify(getPhotoSubmitErrorMessage(error));
  } finally {
    trigger.disabled = false;
  }
}

function startInlineStatusProgress(status, messages, intervalMs = 1800) {
  let index = 0;
  const renderMessage = () => {
    status.className = "photo-input-status loading";
    status.innerHTML = "";
    status.appendChild(el("span", { className: "loading-spinner", ariaHidden: "true" }));
    status.appendChild(document.createTextNode(messages[index] || messages[messages.length - 1] || "저장 중..."));
  };
  renderMessage();
  const timer = window.setInterval(() => {
    index = Math.min(index + 1, messages.length - 1);
    renderMessage();
  }, intervalMs);
  return {
    stop() {
      window.clearInterval(timer);
    },
  };
}

function startButtonLoadingProgress(buttonNode, messages, intervalMs = 2400) {
  let index = 0;
  setButtonLoading(buttonNode, messages[index] || "처리 중...");
  const timer = window.setInterval(() => {
    index = Math.min(index + 1, messages.length - 1);
    setButtonLoading(buttonNode, messages[index] || messages[messages.length - 1]);
  }, intervalMs);
  return {
    set(text) {
      setButtonLoading(buttonNode, text);
    },
    stop() {
      window.clearInterval(timer);
    },
  };
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
    field("출석 확인 현장 사진", photoCaptureInput("attendancePhoto", { disabled: !isOpen, thumbnailPreview: true }), "full"),
    el("div", { className: "field full" }, [
      submitButton,
      preArrivalButton,
      el(
        "p",
        { className: "subtle attendance-deadline-note" },
        state.settings.attendanceDeadlineEnabled
          ? isOpen
            ? `출석 인정은 오전 ${formatAttendanceDeadline()}까지입니다.`
            : `오전 ${formatAttendanceDeadline()} 이후에는 인증이 불가합니다.`
          : "테스트 중에는 출석 인증 시간 제한이 꺼져 있습니다."
      ),
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
    openLoadingModal("출석 인증 중", "사진을 저장하고 있습니다. 완료될 때까지 화면을 닫지 마세요.");
    try {
      await createAttendanceCheck(student, attendancePhoto, {
        onAttendanceSaved: () => {
          setButtonLoading(submitButton, "사진 저장 중...");
          openLoadingModal("사진 저장 중", "출석은 접수됐고 사진을 저장하고 있습니다. 잠시만 기다려주세요.");
        },
      });
      form.reset();
      render();
      notify("오늘 출석이 인증되었습니다.");
    } catch (error) {
      console.error(error);
      notify(getPhotoSubmitErrorMessage(error));
      submitButton.disabled = false;
      submitButton.textContent = "출석 인증하기";
    } finally {
      closeLoadingModal();
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
    field("인증 사진", photoCaptureInput("reasonPhoto", { disabled: !isOpen, thumbnailPreview: true }), "full"),
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
    openLoadingModal("사유 인증 중", "사진을 저장하고 있습니다. 완료될 때까지 화면을 닫지 마세요.");
    try {
      await createPreArrivalReasonCheck(student, reasonPhoto, data.reason, data.detail, {
        onAttendanceSaved: () => {
          setButtonLoading(submitButton, "사진 저장 중...");
          openLoadingModal("사진 저장 중", "사유신청은 접수됐고 사진을 저장하고 있습니다. 잠시만 기다려주세요.");
        },
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
    } finally {
      closeLoadingModal();
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
    field("등원 현장 사진", photoCaptureInput("arrivalPhoto", { thumbnailPreview: true }), "full"),
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
    openLoadingModal("등원 인증 중", "사진을 저장하고 있습니다. 완료될 때까지 화면을 닫지 마세요.");
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
    } finally {
      closeLoadingModal();
    }
  });

  return form;
}

function createReturnForm() {
  const student = getAuthedStudent();
  const submitButton = button("복귀 완료", "btn");
  const activeOuting = getActiveOuting(student?.id);
  const savedReturnPhoto = getOutingPhotoByType(activeOuting, "복귀 인증");
  let savingReturnPhoto = false;
  const saveReturnPhoto = async (file) => {
    const outing = getActiveOuting(student?.id);
    if (!student) throw new Error("student_required");
    if (!outing) throw new Error("outing_required");
    if (!isOutingReadyForReturn(outing)) throw new Error(getReturnBlockedMessage(outing));
    savingReturnPhoto = true;
    submitButton.disabled = true;
    try {
      const photo = await createOutingPhoto(outing, file, "복귀 인증");
      await saveOutingPhotoMetadataToRemote(outing, photo);
      outing.photos = outing.photos.filter((item) => item.type !== "복귀 인증");
      outing.photos.push(photo);
      state.settings.lastStudentId = outing.studentId;
      saveState({ skipRemote: true });
    } finally {
      savingReturnPhoto = false;
      submitButton.disabled = false;
    }
  };
  const form = el("form", { className: "form-grid" }, [
    field("복귀 현장 사진", photoCaptureInput("returnPhoto", {
      thumbnailPreview: true,
      initialStatus: savedReturnPhoto ? "복귀 사진 저장 완료. 아래 복귀 완료 버튼을 눌러주세요." : "",
      initialPreviewSrc: getOutingThumbnailSrc(savedReturnPhoto),
      onFileSelected: saveReturnPhoto,
      savingText: "복귀 사진 저장 중...",
      savingMessages: [
        "복귀 사진 저장 중...",
        "사진 용량을 줄이는 중이에요.",
        "서버로 전송하고 있어요.",
        "저장 확인 중이에요. 다시 촬영하지 말고 기다려주세요.",
      ],
      savedText: "복귀 사진 저장 완료. 아래 복귀 완료 버튼을 눌러주세요.",
    }), "full"),
    el("div", { className: "field full" }, [
      submitButton,
      el("p", { className: "subtle" }, "복귀 사진 저장 완료 후 복귀 처리가 안 되면 사진을 다시 찍지 말고 이 버튼만 다시 눌러주세요."),
    ]),
  ]);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!student) return notify("학생 등록 후 복귀 인증을 이용할 수 있습니다.");
    const outing = getActiveOuting(student.id);
    if (!outing) return notify("진행 중인 외출 신청이 없습니다.");
    if (!isOutingReadyForReturn(outing)) {
      setStudentStep("verify");
      render();
      return notify(getReturnBlockedMessage(outing));
    }
    if (savingReturnPhoto) return notify("복귀 사진 저장이 끝난 뒤 복귀 완료를 눌러주세요.");
    if (!hasOutingPhotoType(outing, "복귀 인증")) return notify("복귀 현장 사진을 먼저 저장해주세요.");
    submitButton.disabled = true;
    const loadingProgress = startButtonLoadingProgress(submitButton, [
      "복귀 처리 중...",
      "서버에 복귀 상태를 저장하고 있어요.",
      "조금 걸려도 사진을 다시 찍지 말고 기다려주세요.",
    ]);
    const previousOuting = {
      status: outing.status,
      decision: outing.decision,
      returnedAt: outing.returnedAt,
    };
    const previousSettings = {
      lastStudentId: state.settings.lastStudentId,
      completionType: state.settings.completionType,
      studentStep: state.settings.studentStep,
    };

    try {
      outing.status = "returned";
      if (outing.decision === "pending") outing.decision = "approved";
      outing.returnedAt = new Date().toISOString();
      state.settings.lastStudentId = outing.studentId;
      state.settings.completionType = "return";
      saveState({ skipRemote: true });
      await saveOutingReturnStatusToRemote(outing);
      loadingProgress.stop();
      notify("복귀 완료되었습니다.");
      form.reset();
      setStudentStep("done");
      saveState({ skipRemote: true });
      render();
    } catch (error) {
      console.error(error);
      outing.status = previousOuting.status;
      outing.decision = previousOuting.decision;
      outing.returnedAt = previousOuting.returnedAt;
      state.settings.lastStudentId = previousSettings.lastStudentId;
      state.settings.completionType = previousSettings.completionType;
      state.settings.studentStep = previousSettings.studentStep;
      saveState({ skipRemote: true });
      loadingProgress.stop();
      notify("복귀 사진은 저장되어 있습니다. 다시 촬영하지 말고 잠시 후 복귀 완료 버튼만 다시 눌러주세요.");
      submitButton.disabled = false;
      submitButton.textContent = "복귀 완료";
    }
  });

  return form;
}

async function saveOutingVerificationStatusToRemote(outing) {
  if (!remoteStore) return;
  const { error } = await remoteStore
    .from("outings")
    .update({
      status: outing.status === "returned" ? "returned" : "verified",
      receipt_note: outing.receiptNote || null,
      verified_at: outing.verifiedAt || new Date().toISOString(),
    })
    .eq("id", outing.id);
  if (error) throw error;
}

async function saveOutingReturnStatusToRemote(outing) {
  if (!remoteStore) return;
  const returnedAt = outing.returnedAt || new Date().toISOString();
  const { error } = await remoteStore
    .from("outings")
    .update({
      status: "returned",
      decision: outing.decision === "pending" ? "approved" : outing.decision,
      returned_at: returnedAt,
    })
    .eq("id", outing.id);
  if (!error) return;

  const { error: fallbackError } = await remoteStore
    .from("outings")
    .update({
      status: "returned",
      returned_at: returnedAt,
    })
    .eq("id", outing.id);
  if (fallbackError) throw fallbackError;
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

async function saveOutingPhotoMetadataToRemote(outing, photo) {
  if (!remoteStore || !outing || !photo) return;
  const row = {
    id: photo.id,
    outing_id: outing.id,
    photo_type: photo.type,
    data_url: photo.dataUrl || null,
    photo_path: photo.photoPath || null,
    photo_url: photo.photoUrl || null,
    thumbnail_path: photo.thumbnailPath || null,
    thumbnail_url: photo.thumbnailUrl || null,
    original_name: photo.name || null,
    uploaded_at: photo.uploadedAt,
  };
  const { error } = await remoteStore
    .from("outing_photos")
    .upsert(row, { onConflict: "id", ignoreDuplicates: true });
  if (
    isMissingColumnError(error, "thumbnail_path") ||
    isMissingColumnError(error, "thumbnail_url")
  ) {
    const { thumbnail_path, thumbnail_url, ...fallbackRow } = row;
    const { error: fallbackError } = await remoteStore
      .from("outing_photos")
      .upsert(fallbackRow, { onConflict: "id", ignoreDuplicates: true });
    if (fallbackError) throw fallbackError;
    return;
  }
  if (error) throw error;
}

function isPhotoPermissionError(error) {
  const text = getErrorText(error);
  return text.includes("row-level security") || text.includes("violates row-level security") || text.includes("permission denied") || text.includes("403") || text.includes("42501");
}

function isPhotoPayloadError(error) {
  const text = getErrorText(error);
  return text.includes("payload too large") || text.includes("file size") || text.includes("too large") || text.includes("out of memory") || text.includes("memory") || text.includes("413");
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
let selectedStudentFinalRound = 0;
let studentGradeLookupType = "weekly";
let studentGradesView = "";
let studentExamDraft = { sectionId: "", page: 0, answers: {}, locked: {}, editing: {}, review: false, confirmed: false };
let selectedStudentFitnessMonth = "";

const STUDENT_FITNESS_EVENTS = [
  { key: "sitUpCount", scoreKey: "sitUp", label: "윗몸일으키기", shortLabel: "윗몸", unit: "회" },
  { key: "pushUpCount", scoreKey: "pushUp", label: "팔굽혀펴기", shortLabel: "팔굽", unit: "회" },
  { key: "gripStrength", scoreKey: "grip", label: "악력", shortLabel: "악력", unit: "kg" },
];

const STUDENT_FITNESS_CRITERIA_EVENTS = [
  ...STUDENT_FITNESS_EVENTS.map((event) => ({ ...event, mode: "min" })),
  { scoreKey: "run100m", shortLabel: "100m", unit: "초", mode: "max" },
  { scoreKey: "swim50m", shortLabel: "50m 수영", unit: "초", mode: "max" },
];

const STUDENT_FITNESS_SCORE_RULES = {
  male: {
    run100m: [
      { max: 13.0, score: 10 }, { max: 13.5, score: 9 }, { max: 14.0, score: 8 }, { max: 14.5, score: 7 }, { max: 15.0, score: 6 },
      { max: 15.5, score: 5 }, { max: 16.0, score: 4 }, { max: 16.5, score: 3 }, { max: 16.9, score: 2 }, { min: 17.0, score: 1 },
    ],
    sitUp: [
      { min: 58, score: 10 }, { min: 55, score: 9 }, { min: 51, score: 8 }, { min: 46, score: 7 }, { min: 40, score: 6 },
      { min: 36, score: 5 }, { min: 31, score: 4 }, { min: 25, score: 3 }, { min: 22, score: 2 }, { min: 0, score: 1 },
    ],
    pushUp: [
      { min: 58, score: 10 }, { min: 54, score: 9 }, { min: 50, score: 8 }, { min: 46, score: 7 }, { min: 42, score: 6 },
      { min: 38, score: 5 }, { min: 33, score: 4 }, { min: 28, score: 3 }, { min: 23, score: 2 }, { min: 0, score: 1 },
    ],
    grip: [
      { min: 61, score: 10 }, { min: 59, score: 9 }, { min: 56, score: 8 }, { min: 54, score: 7 }, { min: 51, score: 6 },
      { min: 48, score: 5 }, { min: 45, score: 4 }, { min: 42, score: 3 }, { min: 38, score: 2 }, { min: 0, score: 1 },
    ],
    swim50m: [
      { max: 40, score: 10 }, { max: 50, score: 9 }, { max: 60, score: 8 }, { max: 70, score: 7 }, { max: 80, score: 6 },
      { max: 90, score: 5 }, { max: 100, score: 4 }, { max: 110, score: 3 }, { max: 120, score: 2 }, { min: 121, score: 1 },
    ],
  },
  female: {
    run100m: [
      { max: 15.5, score: 10 }, { max: 16.3, score: 9 }, { max: 17.1, score: 8 }, { max: 17.9, score: 7 }, { max: 18.7, score: 6 },
      { max: 19.4, score: 5 }, { max: 20.1, score: 4 }, { max: 20.8, score: 3 }, { max: 21.5, score: 2 }, { min: 21.6, score: 1 },
    ],
    sitUp: [
      { min: 55, score: 10 }, { min: 50, score: 9 }, { min: 45, score: 8 }, { min: 40, score: 7 }, { min: 35, score: 6 },
      { min: 30, score: 5 }, { min: 25, score: 4 }, { min: 19, score: 3 }, { min: 13, score: 2 }, { min: 0, score: 1 },
    ],
    pushUp: [
      { min: 31, score: 10 }, { min: 28, score: 9 }, { min: 25, score: 8 }, { min: 22, score: 7 }, { min: 19, score: 6 },
      { min: 16, score: 5 }, { min: 13, score: 4 }, { min: 10, score: 3 }, { min: 7, score: 2 }, { min: 0, score: 1 },
    ],
    grip: [
      { min: 40, score: 10 }, { min: 38, score: 9 }, { min: 36, score: 8 }, { min: 34, score: 7 }, { min: 31, score: 6 },
      { min: 29, score: 5 }, { min: 27, score: 4 }, { min: 25, score: 3 }, { min: 22, score: 2 }, { min: 0, score: 1 },
    ],
    swim50m: [
      { max: 40, score: 10 }, { max: 50, score: 9 }, { max: 60, score: 8 }, { max: 70, score: 7 }, { max: 80, score: 6 },
      { max: 90, score: 5 }, { max: 100, score: 4 }, { max: 110, score: 3 }, { max: 120, score: 2 }, { min: 121, score: 1 },
    ],
  },
};

function resetStudentGradesView() {
  selectedStudentExamId = "";
  selectedStudentGradeLookupExamId = "";
  selectedStudentFinalRound = 0;
  studentGradeLookupType = "weekly";
  studentGradesView = "";
  selectedStudentFitnessMonth = "";
  studentExamDraft = { sectionId: "", page: 0, answers: {}, locked: {}, editing: {}, review: false, confirmed: false };
}

function isStudentFinalGradeTestLink() {
  const params = new URLSearchParams(location.search || "");
  const hash = String(location.hash || "");
  return params.get("finalGradeTest") === "1" || hash === "#grades-final" || hash.includes("finalGradeTest=1");
}

function getStudentRegisteredTrack(student) {
  const profile = getStudentProfile(student?.id);
  return normalizeCoastGuardTrack(student?.track || profile?.track || profile?.initialTrack);
}

function renderStudentGrades() {
  const student = getAuthedStudent();
  if (!student) return renderStudentAuth();
  if (studentGradesView === "fitness") return renderStudentFitnessGrades(student);
  if (studentGradesView === "lookup" || isStudentFinalGradeTestLink()) return renderStudentGradeLookup();
  if (studentGradesView !== "entry") return renderStudentGradesHome();
  return renderStudentWeeklyGrades(student);
}

function renderStudentGradesHome() {
  return el("div", { className: "grid student-view student-grade-home" }, [
    panel("성적", [
      el("div", { className: "student-grade-action-list" }, [
        renderStudentGradeAction("입력", "주간평가 답안 입력", "주간평가", () => {
          selectedStudentExamId = "";
          studentExamDraft = { sectionId: "", page: 0, answers: {}, locked: {}, editing: {}, review: false, confirmed: false };
          studentGradesView = "entry";
          render();
        }),
        renderStudentGradeAction(
          "조회",
          "성적 조회",
          "주간평가·파이널",
          () => {
            selectedStudentGradeLookupExamId = "";
            studentGradesView = "lookup";
            render();
          }
        ),
        renderStudentGradeAction(
          "체력",
          "체력평가",
          "월별 점수 조회",
          () => {
            selectedStudentFitnessMonth = "";
            studentGradesView = "fitness";
            render();
          }
        ),
      ]),
    ]),
  ]);
}

function renderStudentGradeAction(label, title, meta, onClick) {
  return button("", "student-grade-action-card", "button", onClick, [
    el("span", { className: "student-grade-action-label" }, label),
    el("span", { className: "student-grade-action-text" }, [
      el("strong", {}, title),
      el("span", {}, meta),
    ]),
  ]);
}

function renderStudentFitnessGrades(student) {
  const records = getStudentFitnessRecords(student);
  const monthOptions = records.map((record) => record.assessmentMonth).filter(Boolean);
  if (!selectedStudentFitnessMonth || !monthOptions.includes(selectedStudentFitnessMonth)) {
    selectedStudentFitnessMonth = monthOptions[0] || getStudentCurrentFitnessMonth();
  }
  const selectedRecord = records.find((record) => record.assessmentMonth === selectedStudentFitnessMonth) || null;
  const summary = selectedRecord ? getStudentFitnessSummary(selectedRecord, student) : null;
  return el("div", { className: "grid student-view student-grade-home student-fitness-view" }, [
    panel("체력평가", [
      el("div", { className: "student-grade-result" }, [
        el("div", { className: "student-grade-result-title" }, [
          el("strong", {}, "월별 점수"),
          monthOptions.length ? renderStudentFitnessMonthSelect(monthOptions) : null,
        ]),
        summary ? renderStudentFitnessOverview(summary) : renderStudentFitnessEmpty(),
        summary ? renderStudentFitnessEventList(summary, student) : null,
        renderStudentFitnessCriteriaButton(),
        button("성적 메뉴", "mini-btn student-grade-menu-back", "button", () => {
          studentGradesView = "";
          render();
        }),
      ]),
    ]),
  ]);
}

function renderStudentFitnessMonthSelect(monthOptions) {
  const node = el("select", {
    className: "student-grade-round-select student-fitness-month-select",
    ariaLabel: "체력평가 월 선택",
  }, monthOptions.map((month) => el("option", { value: month }, formatStudentFitnessMonth(month))));
  node.value = selectedStudentFitnessMonth;
  node.addEventListener("change", () => {
    selectedStudentFitnessMonth = node.value;
    render();
  });
  return node;
}

function renderStudentFitnessEmpty() {
  return el("div", { className: "student-fitness-empty" }, [
    renderStudentFitnessOverview(null),
    el("div", { className: "empty" }, "아직 입력된 체력평가 점수가 없습니다."),
  ]);
}

function renderStudentFitnessOverview(summary) {
  const isPending = summary?.isPending === true;
  return el("section", { className: "student-grade-overview student-fitness-overview", ariaLabel: "체력평가 요약" }, [
    el("div", { className: "student-grade-overview-head" }, [
      el("span", { className: "student-grade-overview-label" }, "체력 총점"),
      summary?.gender ? el("span", { className: "student-grade-overview-track" }, studentFitnessGenderLabel(summary.gender)) : null,
    ]),
    el("strong", { className: "student-grade-overview-value" }, summary ? (isPending ? "측정 대기" : `${formatStudentFitnessNumber(summary.totalScore)}점`) : "-"),
    el("div", { className: "detail-grid student-grade-overview-grid" }, [
      renderStudentGradeMetric("총점", summary ? (isPending ? "측정 대기" : `${formatStudentFitnessNumber(summary.totalScore)}/30점`) : "-"),
      renderStudentGradeMetric("등수", !isPending && summary?.rank && summary?.total ? `${summary.rank}등 / ${summary.total}명` : "-"),
      renderStudentGradeMetric("측정일", summary?.measuredAt ? formatStudentFitnessMeasuredDate(summary.measuredAt) : "-"),
    ]),
  ]);
}

function renderStudentFitnessEventList(summary, student) {
  return el("div", { className: "student-grade-subject-list student-fitness-event-list" }, [
    el("strong", {}, "항목별 점수"),
    ...STUDENT_FITNESS_EVENTS.map((event) => {
      const eventRank = getStudentFitnessEventRank(summary.raw, student, event);
      const isEventPending = isStudentFitnessEventUnmeasured(summary.raw, event);
      return el("article", { className: "student-grade-subject-card student-fitness-event-card" }, [
        el("h3", {}, event.label),
        el("div", { className: "detail-grid" }, [
          el("div", { className: "detail-item" }, [
            el("span", {}, "원점수"),
            el("strong", {}, isEventPending ? "측정 대기" : formatStudentFitnessRawScore(summary.raw[event.key], event.unit)),
          ]),
          el("div", { className: "detail-item" }, [
            el("span", {}, "환산"),
            el("strong", {}, isEventPending ? "측정 대기" : `${Number(summary.converted[event.scoreKey]) || 0}점`),
          ]),
          el("div", { className: "detail-item" }, [
            el("span", {}, "등수"),
            el("strong", {}, !isEventPending && eventRank.rank && eventRank.total ? `${eventRank.rank}등 / ${eventRank.total}명` : "-"),
          ]),
        ]),
      ]);
    }),
  ]);
}

function renderStudentFitnessCriteriaButton() {
  return button("측정 기준 보기", "mini-btn student-fitness-criteria-button", "button", openStudentFitnessCriteriaModal);
}

function openStudentFitnessCriteriaModal() {
  openInfoModal({
    title: "체력평가 측정 기준",
    className: "student-fitness-criteria-modal",
    content: el("div", { className: "student-fitness-criteria-content" }, [
      ...["male", "female"].map((gender) => renderStudentFitnessCriteriaTable(gender)),
    ]),
  });
}

function renderStudentFitnessCriteriaTable(gender) {
  const normalizedGender = normalizeStudentFitnessGender(gender);
  return el("section", { className: "student-fitness-criteria-section" }, [
    el("h3", {}, studentFitnessGenderLabel(normalizedGender)),
    el("div", { className: "student-fitness-criteria-table-wrap" }, [
      el("table", { className: "student-fitness-criteria-table" }, [
        el("thead", {}, [
          el("tr", {}, [
            el("th", {}, "점수"),
            ...STUDENT_FITNESS_CRITERIA_EVENTS.map((event) => el("th", {}, event.shortLabel)),
          ]),
        ]),
        el("tbody", {}, Array.from({ length: 10 }, (_, index) => {
          const score = 10 - index;
          return el("tr", {}, [
            el("td", {}, `${score}점`),
            ...STUDENT_FITNESS_CRITERIA_EVENTS.map((event) =>
              el("td", {}, formatStudentFitnessCriteriaValue(normalizedGender, event.scoreKey, score, event.unit))
            ),
          ]);
        })),
      ]),
    ]),
  ]);
}

function getStudentFitnessRecords(student) {
  const studentId = String(student?.id || "").trim();
  if (!studentId) return [];
  const byMonth = new Map();
  (state.fitnessScores || [])
    .filter((record) => String(record.studentId || "").trim() === studentId)
    .filter(hasStudentFitnessScoreValue)
    .forEach((record) => {
      const month = normalizeStudentFitnessMonth(record.assessmentMonth);
      const normalized = { ...record, assessmentMonth: month };
      const existing = byMonth.get(month);
      if (!existing || new Date(normalized.updatedAt || normalized.measuredAt || normalized.createdAt || 0) > new Date(existing.updatedAt || existing.measuredAt || existing.createdAt || 0)) {
        byMonth.set(month, normalized);
      }
    });
  return Array.from(byMonth.values()).sort((a, b) => String(b.assessmentMonth).localeCompare(String(a.assessmentMonth)));
}

function hasStudentFitnessScoreValue(record) {
  return STUDENT_FITNESS_EVENTS.some((event) => record?.[event.key] !== "" && record?.[event.key] !== null && record?.[event.key] !== undefined);
}

function hasCompleteStudentFitnessScore(record) {
  return STUDENT_FITNESS_EVENTS.every((event) => !isStudentFitnessEventUnmeasured(record, event));
}

function isStudentFitnessEventUnmeasured(record, event) {
  const value = record?.[event.key];
  if (value === "" || value === null || value === undefined) return true;
  const number = Number(value);
  return Number.isFinite(number) && number <= 0;
}

function getStudentFitnessSummary(record, student) {
  const gender = normalizeStudentFitnessGender(record.gender || student?.gender || getStudentProfile(student?.id)?.gender);
  const converted = record.convertedScores && Object.keys(record.convertedScores).length
    ? record.convertedScores
    : calculateStudentFitnessScore(record, gender).converted;
  const totalScore = record.totalScore !== "" && record.totalScore !== null && record.totalScore !== undefined
    ? Number(record.totalScore) || 0
    : Object.values(converted).reduce((sum, score) => sum + (Number(score) || 0), 0);
  const rank = getStudentFitnessRank(record, student);
  const isPending = !hasCompleteStudentFitnessScore(record);
  return {
    month: record.assessmentMonth,
    gender,
    raw: record,
    converted,
    totalScore,
    isPending,
    rank: rank.rank,
    total: rank.total,
    measuredAt: record.measuredAt || record.updatedAt || record.createdAt || "",
  };
}

function getStudentFitnessRank(record, student) {
  const month = normalizeStudentFitnessMonth(record.assessmentMonth);
  const cohort = getStudentCohort(student);
  const gender = normalizeStudentFitnessGender(record.gender || student?.gender || getStudentProfile(student?.id)?.gender);
  const ranked = (state.fitnessScores || [])
    .filter((item) => normalizeStudentFitnessMonth(item.assessmentMonth) === month)
    .filter((item) => !cohort || getStudentCohort({ id: item.studentId }) === cohort)
    .filter((item) => normalizeStudentFitnessGender(item.gender || findStudent(item.studentId)?.gender) === gender)
    .filter(hasCompleteStudentFitnessScore)
    .map((item) => {
      const summary = getStudentFitnessRecordTotal(item, gender);
      return { id: String(item.studentId || "").trim(), totalScore: summary.totalScore };
    })
    .sort((a, b) => Number(b.totalScore || 0) - Number(a.totalScore || 0) || String(a.id).localeCompare(String(b.id), "ko-KR", { numeric: true }));
  const index = ranked.findIndex((item) => item.id === String(student?.id || "").trim());
  return { rank: index >= 0 ? index + 1 : 0, total: ranked.length };
}

function getStudentFitnessEventRank(record, student, event) {
  const month = normalizeStudentFitnessMonth(record?.assessmentMonth);
  const cohort = getStudentCohort(student);
  const gender = normalizeStudentFitnessGender(record?.gender || student?.gender || getStudentProfile(student?.id)?.gender);
  const ranked = (state.fitnessScores || [])
    .filter((item) => normalizeStudentFitnessMonth(item.assessmentMonth) === month)
    .filter((item) => !cohort || getStudentCohort({ id: item.studentId }) === cohort)
    .filter((item) => normalizeStudentFitnessGender(item.gender || findStudent(item.studentId)?.gender) === gender)
    .map((item) => ({
      id: String(item.studentId || "").trim(),
      value: Number(item?.[event.key]),
    }))
    .filter((item) => item.id && Number.isFinite(item.value) && item.value > 0)
    .sort((a, b) => Number(b.value || 0) - Number(a.value || 0) || String(a.id).localeCompare(String(b.id), "ko-KR", { numeric: true }));
  const index = ranked.findIndex((item) => item.id === String(student?.id || "").trim());
  return { rank: index >= 0 ? index + 1 : 0, total: ranked.length };
}

function getStudentFitnessRecordTotal(record, gender) {
  const converted = record.convertedScores && Object.keys(record.convertedScores).length
    ? record.convertedScores
    : calculateStudentFitnessScore(record, gender).converted;
  const totalScore = record.totalScore !== "" && record.totalScore !== null && record.totalScore !== undefined
    ? Number(record.totalScore) || 0
    : Object.values(converted).reduce((sum, score) => sum + (Number(score) || 0), 0);
  return { converted, totalScore };
}

function calculateStudentFitnessScore(values, gender) {
  const normalizedGender = normalizeStudentFitnessGender(gender);
  const converted = {};
  STUDENT_FITNESS_EVENTS.forEach((event) => {
    converted[event.scoreKey] = convertStudentFitnessEventScore(values[event.key], normalizedGender, event.scoreKey);
  });
  const totalScore = Object.values(converted).reduce((sum, score) => sum + (Number(score) || 0), 0);
  return { converted, totalScore };
}

function convertStudentFitnessEventScore(rawValue, gender, eventKey) {
  if (rawValue === "" || rawValue === null || rawValue === undefined) return 0;
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return 0;
  const rules = STUDENT_FITNESS_SCORE_RULES[normalizeStudentFitnessGender(gender)]?.[eventKey] || [];
  const matched = rules.find((rule) => value >= rule.min);
  return matched ? matched.score : 0;
}

function normalizeStudentFitnessGender(gender) {
  const value = String(gender || "").trim().toLowerCase();
  if (["여", "여자", "여성", "female", "f"].includes(value)) return "female";
  return "male";
}

function studentFitnessGenderLabel(gender) {
  return normalizeStudentFitnessGender(gender) === "female" ? "여" : "남";
}

function normalizeStudentFitnessMonth(value) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}$/.test(text) ? text : getStudentCurrentFitnessMonth();
}

function getStudentCurrentFitnessMonth() {
  return new Date().toISOString().slice(0, 7);
}

function formatStudentFitnessMonth(value) {
  const month = normalizeStudentFitnessMonth(value);
  const [, monthNumber] = month.split("-");
  return `${Number(monthNumber)}월`;
}

function formatStudentFitnessMeasuredDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return `${String(date.getFullYear()).slice(-2)}년 ${date.getMonth() + 1}월`;
}

function formatStudentFitnessCriteriaValue(gender, eventKey, score, unit) {
  const rules = STUDENT_FITNESS_SCORE_RULES[normalizeStudentFitnessGender(gender)]?.[eventKey] || [];
  const rule = rules.find((item) => Number(item.score) === Number(score));
  if (!rule) return "-";
  if (rule.max !== undefined) return `${formatStudentFitnessNumber(rule.max)}${unit} 이하`;
  if (rule.min !== undefined && Number(score) === 1) {
    const nextRule = rules.find((item) => Number(item.score) === 2);
    if (nextRule?.min !== undefined) return `${formatStudentFitnessNumber(nextRule.min - 1)}${unit} 이하`;
    return `${formatStudentFitnessNumber(rule.min)}${unit} 이상`;
  }
  if (rule.min !== undefined) return `${formatStudentFitnessNumber(rule.min)}${unit} 이상`;
  return "-";
}

function formatStudentFitnessRawScore(value, unit) {
  if (value === "" || value === null || value === undefined) return "-";
  return `${formatStudentFitnessNumber(value)}${unit}`;
}

function formatStudentFitnessNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return Number.isInteger(number) ? String(number) : String(Math.round(number * 10) / 10);
}

function renderStudentGradeLookup() {
  const student = getAuthedStudent();
  const hasFinalGrades = hasStudentFinalGradeData(student);
  if (isStudentFinalGradeTestLink() && hasFinalGrades) studentGradeLookupType = "final";
  if (studentGradeLookupType === "final" && !hasFinalGrades) studentGradeLookupType = "weekly";
  const typeTabs = renderStudentGradeLookupTabs();
  const content = studentGradeLookupType === "weekly"
    ? renderStudentWeeklyGradeLookup(student)
    : renderStudentFinalGradeLookup(student);

  return el("div", { className: "grid student-view student-grade-home" }, [
    panel("성적 조회", [
      typeTabs,
      content,
      button("성적 메뉴", "mini-btn student-grade-menu-back", "button", () => {
        studentGradesView = "";
        render();
      }),
    ]),
  ]);
}

function renderStudentGradeLookupTabs() {
  const student = getAuthedStudent();
  const items = [{ key: "weekly", label: "주간평가" }];
  if (hasStudentFinalGradeData(student)) items.push({ key: "final", label: "파이널 성적" });
  return el("div", { className: "student-grade-type-tabs" }, items.map((item) =>
    button(item.label, studentGradeLookupType === item.key ? "mini-btn active" : "mini-btn", "button", () => {
      studentGradeLookupType = item.key;
      render();
    })
  ));
}

function hasStudentFinalGradeData(student) {
  return Boolean(student && getStudentFinalRoundOptions(student).length);
}

function renderStudentWeeklyGradeLookup(student) {
  const exams = getVisibleStudentExams(student);
  const selectedExam = exams.find((exam) => exam.id === selectedStudentGradeLookupExamId) || exams[0] || null;
  if (selectedExam) selectedStudentGradeLookupExamId = selectedExam.id;
  const summary = selectedExam ? getStudentWeeklyGradeSummary(selectedExam, student) : null;
  return renderStudentGradeResultPanel(summary, {
    title: selectedExam ? formatStudentWeeklyExamName(selectedExam.weekNumber) : "주간평가 성적",
    headerControl: selectedExam ? renderStudentWeeklyGradeLookupSelect(exams, selectedExam) : null,
    emptyText: selectedExam ? "제출된 주간평가 성적이 없습니다." : "조회할 주간평가가 없습니다.",
  });
}

function renderStudentWeeklyGradeLookupSelect(exams, selectedExam) {
  const node = el("select", {
    className: "student-grade-round-select",
    ariaLabel: "주간평가 주차 선택",
  }, exams.map((exam) => el("option", { value: exam.id }, `${Number(exam.weekNumber) || 1}주차`)));
  node.value = selectedExam.id;
  node.addEventListener("change", () => {
    selectedStudentGradeLookupExamId = node.value;
    render();
  });
  return node;
}

function renderStudentFinalGradeLookup(student) {
  const roundOptions = student ? getStudentFinalRoundOptions(student) : [];
  if (!roundOptions.includes(Number(selectedStudentFinalRound))) selectedStudentFinalRound = roundOptions[0] || 0;
  const summary = student && selectedStudentFinalRound ? getStudentFinalGradeSummary(student, selectedStudentFinalRound) : null;
  return renderStudentGradeResultPanel(summary, {
    title: "파이널 성적",
    headerControl: roundOptions.length ? renderStudentFinalRoundSelect(roundOptions) : null,
    emptyText: "파이널 성적은 준비 중입니다.",
  });
}

function getStudentFinalRoundOptions(student) {
  const studentId = String(student?.id || "").trim();
  if (!studentId) return [];
  const sources = [state.finalExamScores, state.finalMockScores, state.mockExamScores, state.finalScores].filter(Array.isArray);
  const records = sources.flat().filter(hasStudentFinalScoreRecord);
  const studentRounds = records
    .filter((record) => String(record.studentId || record.student_id || record.studentNumber || "").trim() === studentId)
    .map(getStudentFinalRecordRound)
    .filter((round) => Number.isFinite(round) && round > 0);
  const uniqueRounds = Array.from(new Set(studentRounds)).sort((a, b) => b - a);
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
  const peerIds = new Set(peers.map((peer) => String(peer.id)));
  const externalPeers = records
    .filter((record) => {
      const studentId = String(record.studentId || "").trim();
      if (!studentId || peerIds.has(studentId)) return false;
      if ((state.students || []).some((item) => String(item.id) === studentId)) return false;
      const recordCohort = String(record.cohort || "");
      const recordTrack = normalizeCoastGuardTrack(record.track || "");
      return (!recordCohort || recordCohort === cohort) && recordTrack === registeredTrack;
    })
    .map((record) => ({
      id: record.studentId,
      name: record.studentName || record.studentId,
      track: normalizeCoastGuardTrack(record.track || registeredTrack),
      isExternalFinalScore: true,
    }));
  const summaries = [...peers, ...externalPeers].map((peer) => {
    const record = records.find((item) => String(item.studentId || "").trim() === String(peer.id || "").trim());
    if (!record) return { student: peer, hasScore: false, submittedCount: 0, score: 0, maxScore: 0, wrongCount: "", subjectSummaries: [] };
    const peerTrack = getStudentRegisteredTrack(peer);
    const subjectSummaries = getFinalGradeSubjectHeadersForTrack(peerTrack)
      .map((subject) => normalizeStudentFinalSubjectSummary(subject, record.subjectScores[subject], peerTrack));
    const submittedSubjectSummaries = subjectSummaries.filter((item) => item.submitted);
    const score = submittedSubjectSummaries.length
      ? submittedSubjectSummaries.reduce((sum, item) => sum + (Number(item.score) || 0), 0)
      : Number(record.score) || 0;
    const maxScore = submittedSubjectSummaries.length
      ? submittedSubjectSummaries.reduce((sum, item) => sum + (Number(item.maxScore) || 0), 0)
      : Number(record.maxScore) || 0;
    const subjectWrongCount = submittedSubjectSummaries.reduce((sum, item) => sum + (Number(item.wrongCount) || 0), 0);
    return {
      student: peer,
      hasScore: true,
      submittedCount: 1,
      sectionCount: 1,
      title: `${Number(round) || 1}회차 파이널 성적`,
      score,
      maxScore,
      percent: maxScore ? Math.round((score / maxScore) * 1000) / 10 : 0,
      wrongCount: submittedSubjectSummaries.length
        ? subjectWrongCount
        : record.wrongCount !== "" && record.wrongCount !== null && record.wrongCount !== undefined
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
    summary.total = sorted.length;
    summary.topPercent = calculateStudentTopPercent(rank, sorted.length);
    summary.displayTopPercent = rank ? Math.max(1, Math.ceil(summary.topPercent)) : 0;
    summary.percentile = Math.round((100 - summary.topPercent) * 10) / 10;
    previousScore = score;
    previousWrong = wrong;
    previousRank = rank;
  });
  applyStudentFinalSubjectRanks(summaries);
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
  if (own && Number(round) > 1) {
    const previousOwn = getStudentFinalGradeSummary(student, Number(round) - 1);
    if (previousOwn?.rank) {
      own.previousRank = previousOwn.rank;
      own.rankDelta = Number(previousOwn.rank) - Number(own.rank);
    }
  }
  return own || null;
}

function applyStudentFinalSubjectRanks(summaries = []) {
  const subjectNames = Array.from(new Set(summaries.flatMap((summary) =>
    (summary.subjectSummaries || []).map((subjectSummary) => subjectSummary.subject)
  )));
  subjectNames.forEach((subject) => {
    const ranked = summaries
      .map((summary) => {
        const subjectSummary = (summary.subjectSummaries || []).find((item) => item.subject === subject);
        if (!subjectSummary || !subjectSummary.submitted) return null;
        return { summary, subjectSummary };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const scoreCompare = (Number(b.subjectSummary.score) || 0) - (Number(a.subjectSummary.score) || 0);
        if (scoreCompare) return scoreCompare;
        const wrongA = Number(a.subjectSummary.wrongCount);
        const wrongB = Number(b.subjectSummary.wrongCount);
        const wrongCompare = (Number.isFinite(wrongA) ? wrongA : 9999) - (Number.isFinite(wrongB) ? wrongB : 9999);
        if (wrongCompare) return wrongCompare;
        return String(a.summary.student.id).localeCompare(String(b.summary.student.id), "ko-KR", { numeric: true });
      });
    let previousScore = null;
    let previousWrong = null;
    let previousRank = 0;
    ranked.forEach((item, index) => {
      const score = Number(item.subjectSummary.score) || 0;
      const wrong = Number(item.subjectSummary.wrongCount);
      const normalizedWrong = Number.isFinite(wrong) ? wrong : null;
      const rank = score === previousScore && normalizedWrong === previousWrong ? previousRank : index + 1;
      item.subjectSummary.rank = rank;
      item.subjectSummary.topPercent = calculateStudentTopPercent(rank, ranked.length);
      item.subjectSummary.displayTopPercent = rank ? Math.max(1, Math.ceil(item.subjectSummary.topPercent)) : 0;
      previousScore = score;
      previousWrong = normalizedWrong;
      previousRank = rank;
    });
  });
}

function getStudentFinalScoreRecords(round) {
  const sources = [state.finalExamScores, state.finalMockScores, state.mockExamScores, state.finalScores].filter(Array.isArray);
  return sources.flat().filter((record) => {
    const value = Number(record.round || record.roundNumber || record.session || record.sessionNumber || record.examRound || record.examNumber || 0);
    return value === Number(round);
  }).map((record) => ({
    studentId: record.studentId || record.student_id || record.studentNumber || "",
    studentName: record.studentName || record.student_name || record.name || "",
    track: normalizeCoastGuardTrack(record.track || record.studentTrack || record.student_track || ""),
    cohort: String(record.cohort || record.studentCohort || record.student_cohort || ""),
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

function getFinalGradeSubjectHeadersForTrack(track) {
  const finalSubjects = getFinalGradeSubjectHeaders();
  return getFinalGradeSubjectsForTrack(track, finalSubjects);
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

function normalizeStudentFinalSubjectSummary(subject, subjectScore = {}, track = "") {
  const score = Number(subjectScore.score) || 0;
  const submitted = subjectScore.status !== "empty";
  const maxScore = Number(subjectScore.maxScore) || (submitted ? 100 : 0);
  return {
    subject,
    track,
    score,
    maxScore,
    wrongCount: subjectScore.wrongCount !== "" && subjectScore.wrongCount !== null && subjectScore.wrongCount !== undefined
      ? Number(subjectScore.wrongCount) || 0
      : maxScore
        ? Math.max(0, Math.round((maxScore - score) / 5))
        : "-",
    rank: 0,
    displayTopPercent: 0,
    submitted,
  };
}

function getStudentWeeklyGradeSummary(exam, student) {
  const sections = getStudentExamSections(exam, student);
  const ownSubmissions = sections.map((section) => ({ section, submission: getStudentSubmission(student.id, section.id) }));
  const submitted = ownSubmissions.filter((item) => item.submission);
  const maxScore = sections.reduce((sum, section) => sum + getStudentVisibleSectionAnswers(section, student).length * 5, 0);
  const score = submitted.reduce((sum, item) => sum + (Number(item.submission.score) || 0), 0);
  const wrongCount = submitted.reduce((sum, item) => {
    const questionCount = getStudentVisibleSectionAnswers(item.section, student).length;
    return sum + Math.max(0, questionCount - (Number(item.submission.correctCount) || 0));
  }, 0);
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
    wrongCount,
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
      renderStudentGradeSummaryCard(null),
      el("div", { className: "empty" }, options.emptyText || "아직 제출된 성적이 없습니다."),
    ]);
  }
  const released = canReleaseStudentGradeSummary(summary);
  return el("div", { className: "student-grade-result" }, [
    header,
    renderStudentGradeSummaryCard(summary, { released }),
    released ? renderStudentSubjectGradeList(summary.subjectSummaries) : null,
  ]);
}

function canReleaseStudentGradeSummary(summary) {
  return Boolean(summary?.submittedCount);
}

function renderStudentSubjectGradeList(subjectSummaries = []) {
  return el("div", { className: "student-grade-subject-list" }, [
    el("strong", {}, "과목별 성적"),
    subjectSummaries.length
      ? subjectSummaries.map((item) => el("article", { className: "student-grade-subject-card" }, [
          el("h3", {}, formatFinalGradeSubjectName(item.subject, item.track)),
          el("div", { className: "detail-grid" }, [
            el("div", { className: "detail-item" }, [el("span", {}, "점수"), el("strong", {}, item.submitted ? `${item.score}점` : "미제출")]),
            el("div", { className: "detail-item" }, [el("span", {}, "오답"), el("strong", {}, item.submitted ? formatStudentWrongCount(item.wrongCount) : "-")]),
            el("div", { className: "detail-item" }, [el("span", {}, "위치"), el("strong", {}, item.rank ? formatStudentSubjectPositionLabel(item.topPercent ?? item.displayTopPercent) : "-")]),
          ]),
        ]))
      : el("div", { className: "empty" }, "표시할 과목별 성적이 없습니다."),
  ]);
}

function formatFinalGradeSubjectName(subject, track = "") {
  return formatFinalGradeSubjectDisplayName(subject, track);
}

function formatStudentSubjectPositionLabel(value) {
  const percent = Number(value);
  if (!Number.isFinite(percent)) return "-";
  return `상위 ${Math.max(1, Math.ceil(percent))}%`;
}

function renderStudentGradeSummaryCard(summary, options = {}) {
  const student = summary?.student || getAuthedStudent();
  const trackText = student ? getStudentRegisteredTrack(student) : "";
  const released = options.released !== false;
  const rankLabel = summary?.rank && released ? formatTopPercentLabel(summary.topPercent) : "-";
  const rankDeltaText = formatStudentRankDelta(summary?.rankDelta);
  const metaText = summary?.rank && summary?.total && released
    ? [`응시자 ${summary.total}명 중 ${summary.rank}등`, rankDeltaText ? `전회차 대비 ${rankDeltaText}` : ""].filter(Boolean).join(" · ")
    : "아직 제출된 성적이 없습니다.";
  return el("section", { className: "student-grade-overview", ariaLabel: "성적 요약" }, [
    el("div", { className: "student-grade-overview-head" }, [
      el("span", { className: "student-grade-overview-label" }, "내 위치"),
      trackText ? el("span", { className: "student-grade-overview-track" }, trackText) : null,
    ]),
    el("strong", { className: "student-grade-overview-value" }, rankLabel),
    el("span", { className: "student-grade-overview-meta" }, metaText),
    renderStudentGradeProgress(summary),
    el("div", { className: "detail-grid student-grade-overview-grid" }, [
      renderStudentGradeMetric("총점", summary && released ? `${summary.score}/${summary.maxScore}점` : "-"),
      renderStudentGradeMetric("오답", summary && released ? formatStudentWrongCount(summary.wrongCount) : "-"),
      renderStudentGradeMetric("등수", summary?.rank && released ? `${summary.rank}등` : "-"),
    ]),
  ]);
}

function renderStudentGradeProgress(summary) {
  const rawPercent = summary?.rank ? Number(summary.topPercent) || 0 : 0;
  const percent = summary?.rank ? Math.max(1, Math.min(100, Math.ceil(100 - rawPercent))) : 0;
  return el("div", {
    className: "student-grade-progress",
    role: "meter",
    ariaLabel: "내 위치 백분율",
    ariaValueMin: "0",
    ariaValueMax: "100",
    ariaValueNow: String(percent),
  }, [
    el("span", { className: "student-grade-progress-fill", style: `width: ${percent}%` }),
  ]);
}

function renderStudentGradeMetric(label, value) {
  return el("div", { className: "detail-item" }, [
    el("span", {}, label),
    el("strong", {}, value),
  ]);
}

function formatStudentWrongCount(value) {
  if (value === "" || value === null || value === undefined || value === "-") return "-";
  const count = Number(value);
  return Number.isFinite(count) ? `${count}개` : "-";
}

function formatStudentRankDelta(delta) {
  if (delta === "" || delta === null || delta === undefined) return "";
  const value = Number(delta);
  if (!Number.isFinite(value)) return "";
  if (!value) return "변동 없음";
  return value > 0 ? `▲ ${value}` : `▼ ${Math.abs(value)}`;
}

function renderStudentWeeklyGrades(student) {
  const exams = getVisibleStudentExams(student);
  const selectedExam = exams.find((exam) => exam.id === selectedStudentExamId) || exams[0] || null;
  if (selectedExam) selectedStudentExamId = selectedExam.id;
  if (!selectedExam) {
    return el("div", { className: "grid student-view" }, [
      panel(studentGradesView === "entry" ? "성적 입력" : "성적 조회", [
        renderStudentGradesBackButton(),
        el("div", { className: "empty" }, "현재 공개된 주간평가가 없습니다."),
      ]),
    ]);
  }
  const readiness = getStudentWeeklyExamReadiness(selectedExam, student);
  const sections = readiness.sections;
  const selectedSection = readiness.isReady ? sections.find((section) => section.id === studentExamDraft.sectionId) : null;
  if (selectedSection) {
    return el("div", { className: "grid student-view student-exam-view student-answer-only-view" }, [
      renderStudentGradesBackPanel(),
      renderStudentExamAnswerEntry(selectedExam, selectedSection, student, sections),
    ]);
  }
  return el("div", { className: "grid student-view student-exam-view" }, [
    renderStudentWeeklyExamHeader(exams, selectedExam),
    renderStudentExamEntrySubjectList(selectedExam, sections, student, readiness),
  ]);
}

function renderStudentWeeklyExamHeader(exams, selectedExam) {
  return el("section", { className: "panel student-weekly-header-panel" }, [
    el("div", { className: "student-weekly-header" }, [
      el("div", { className: "student-weekly-header-title" }, [
        el("h2", {}, "주간평가"),
        el("span", { className: "subtle" }, studentGradesView === "entry" ? "성적 입력" : "성적 조회"),
      ]),
      renderStudentExamWeekSelect(exams, selectedExam),
      renderStudentGradesBackButton(),
    ]),
  ]);
}

function renderStudentGradesBackPanel() {
  return el("section", { className: "panel student-weekly-back-panel" }, [
    el("div", { className: "panel-title-row student-weekly-back-title" }, [
      el("div", {}, [
        el("h2", {}, "주간평가"),
        el("span", { className: "subtle" }, studentGradesView === "entry" ? "성적 입력" : "성적 조회"),
      ]),
      renderStudentGradesBackButton(),
    ]),
  ]);
}

function renderStudentGradesBackButton() {
  return button("돌아가기", "mini-btn student-weekly-back-button", "button", () => {
    studentGradesView = "";
    studentExamDraft = { sectionId: "", page: 0, answers: {}, locked: {}, editing: {}, review: false, confirmed: false };
    render();
  });
}

function getVisibleStudentExams(student) {
  const track = getStudentRegisteredTrack(student);
  const cohort = getStudentCohort(student);
  return (state.exams || [])
    .filter(isStudentWeeklyExamVisible)
    .filter((exam) => !exam.cohort || !cohort || String(exam.cohort) === cohort)
    .filter((exam) => (state.examSections || []).some((section) => section.examId === exam.id && isStudentSectionMatch(section, track)))
    .sort((a, b) => Number(b.weekNumber) - Number(a.weekNumber));
}

function isStudentWeeklyExamVisible(exam) {
  if (!exam?.isPublished) return false;
  if (!exam.startAt) return false;
  const startTime = new Date(exam.startAt).getTime();
  return Number.isFinite(startTime) && Date.now() >= startTime;
}

function getStudentExamSections(exam, student) {
  const track = getStudentRegisteredTrack(student);
  return (state.examSections || [])
    .filter((section) => section.examId === exam.id && isStudentSectionMatch(section, track))
    .sort((a, b) => compareWeeklySubjects(a.subject, b.subject) || String(a.track || "").localeCompare(String(b.track || ""), "ko-KR"));
}

function getStudentRequiredWeeklyExamSections(exam, student) {
  return getStudentExamSections(exam, student);
}

function getStudentWeeklyExamReadiness(exam, student) {
  const sections = getStudentExamSections(exam, student);
  return { isReady: sections.length > 0, sections, missingSubjects: [] };
}

function isStudentSectionMatch(section, studentTrack) {
  const sectionTrack = normalizeCoastGuardTrack(section.track);
  const trackMatched = sectionTrack === studentTrack || sectionTrack === "전체";
  const subjectMatched = sectionTrack !== "전체" || isWeeklySubjectAllowedForTrack(section.subject, studentTrack);
  return section.isActive !== false && trackMatched && subjectMatched && isStudentSectionPublished(section, studentTrack);
}

function isStudentSectionPublished(section, studentTrack = "") {
  const answers = getStudentVisibleSectionAnswers(section, { track: studentTrack });
  const questionCount = Number(section.questionCount) || 0;
  if (isWeeklyQuestionTrackScopedSubject(section.subject)) {
    return answers.length > 0 && answers.every((answer) => answer.correctAnswer);
  }
  return answers.length > 0 && answers.length >= questionCount && answers.every((answer) => answer.correctAnswer);
}

function getStudentVisibleSectionAnswers(section, student) {
  const studentTrack = typeof student === "string"
    ? normalizeCoastGuardTrack(student)
    : student?.id
      ? getStudentRegisteredTrack(student)
      : normalizeCoastGuardTrack(student?.track);
  const questionCount = Number(section.questionCount) || 0;
  return (state.examAnswers || [])
    .filter((answer) => answer.examSectionId === section.id)
    .filter((answer) => !questionCount || Number(answer.questionNumber) <= questionCount)
    .filter((answer) => !isWeeklyQuestionTrackScopedSubject(section.subject) || isWeeklyQuestionForTrack(answer, studentTrack))
    .sort((a, b) => Number(a.questionNumber) - Number(b.questionNumber));
}

function renderStudentExamList(exams, selectedExam) {
  return panel("주간평가 목록", [
    field("주차 선택", renderStudentExamWeekSelect(exams, selectedExam)),
  ]);
}

function renderStudentExamWeekSelect(exams, selectedExam) {
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
  examSelect.classList.add("student-weekly-week-select");
  return examSelect;
}

function renderStudentExamSubjectList(exam, sections, student, readiness = getStudentWeeklyExamReadiness(exam, student)) {
  const scoreOpen = canStudentSeeScore(exam, sections, student);
  const totalScore = sections.reduce((sum, section) => sum + (getStudentSubmission(student.id, section.id)?.score || 0), 0);
  return panel(formatStudentWeeklyExamName(exam.weekNumber), [
    readiness.isReady && scoreOpen ? el("div", { className: "student-exam-total" }, [`총점 ${Math.round(totalScore * 10) / 10}점`, el("span", {}, `평균 ${Math.round((totalScore / Math.max(sections.length, 1)) * 10) / 10}점`)]) : null,
    !readiness.isReady
      ? renderStudentWeeklyExamPreparingMessage()
      : sections.length
      ? el("div", { className: "student-exam-subjects" }, sections.map((section) => renderStudentExamSubjectCard(exam, section, student, sections, scoreOpen)))
      : el("div", { className: "empty" }, "본인 직렬에 해당하는 과목이 없습니다."),
    readiness.isReady ? renderStudentWeeklyExamFiles(exam, sections, student) : null,
  ]);
}

function renderStudentWeeklyExamPreparingMessage() {
  return el("div", { className: "empty" }, "시험 준비중입니다. 본인 직렬에 해당되는 시험 과목이 모두 올라오면 응시할 수 있습니다.");
}

function renderStudentExamSubjectCard(exam, section, student, sections, scoreOpen) {
  const submission = getStudentSubmission(student.id, section.id);
  const status = getStudentSectionStatus(exam, section, submission);
  const visibleQuestionCount = getStudentVisibleSectionAnswers(section, student).length;
  const answerSheetOpen = Boolean(submission?.status === "submitted" && scoreOpen);
  return el("article", { className: "student-exam-subject" }, [
    el("div", {}, [el("strong", {}, section.subject), el("span", { className: "badge" }, status)]),
    el("p", { className: "subtle" }, `${visibleQuestionCount}문항 · ${visibleQuestionCount * 5}점`),
    submission?.status === "submitted" && scoreOpen ? el("p", { className: "student-score-line" }, `점수 ${submission.score}점 · 정답 ${submission.correctCount}/${visibleQuestionCount}`) : null,
    submission?.status === "submitted" && !scoreOpen ? el("p", { className: "subtle" }, "모든 과목을 제출해야 점수와 해설을 확인할 수 있습니다.") : null,
    answerSheetOpen ? button("내 답안지 보기", "mini-btn student-answer-sheet-button", "button", () => openStudentGradedAnswerSheetModal(section, submission, student)) : null,
    submission?.status === "submitted"
      ? null
      : isExamOpen(exam)
        ? button("답안 입력", "btn", "button", () => startStudentSectionAnswer(section))
        : el("p", { className: "subtle" }, "현재 응시할 수 없는 기간입니다."),
  ]);
}
function renderStudentWeeklyExamFiles(exam, sections, student) {
  if (!sections.length || exam.explanationReleaseMode === "hidden") return null;
  const requiredSections = getStudentRequiredWeeklyExamSections(exam, student);
  const allSubmitted = requiredSections.length > 0 && requiredSections.every((section) => getStudentSubmission(student.id, section.id)?.status === "submitted");
  if (!allSubmitted) return null;
  const sectionIds = new Set(requiredSections.map((section) => section.id));
  const fileMap = new Map();
  (state.examFiles || [])
    .filter((file) => sectionIds.has(file.examSectionId) && file.fileType === "answer_pdf" && file.fileUrl)
    .forEach((file) => {
      const key = file.filePath || file.fileUrl || file.originalName || file.id;
      if (!fileMap.has(key)) fileMap.set(key, file);
    });
  const files = [...fileMap.values()];
  if (!files.length) return null;
  return el("section", { className: "student-weekly-files" }, [
    el("div", { className: "student-weekly-files-head" }, [
      el("strong", {}, "답안 및 해설"),
      el("span", {}, "모든 과목 제출 후 확인할 수 있습니다."),
    ]),
    el("div", { className: "student-exam-files" }, files.map((file, index) =>
      el("a", { href: file.fileUrl, target: "_blank", rel: "noreferrer", className: "mini-btn" }, file.originalName || `답안지 ${index + 1}`)
    )),
  ]);
}
async function openStudentGradedAnswerSheetModal(section, submission, student) {
  await ensureStudentSubmissionAnswersLoaded(submission);
  openInfoModal({
    title: `${section.subject} 내 답안지`,
    className: "student-graded-answer-modal",
    content: renderStudentGradedAnswerSheet(section, submission, student),
  });
}

async function ensureStudentSubmissionAnswersLoaded(submission) {
  if (!remoteStore || !submission?.id) return;
  const hasLoadedAnswers = (state.submissionAnswers || []).some((answer) => answer.submissionId === submission.id);
  if (hasLoadedAnswers) return;
  const { data, error } = await remoteStore
    .from("submission_answers")
    .select("id,submission_id,question_number,selected_answer,is_correct,points_awarded")
    .eq("submission_id", submission.id)
    .order("question_number", { ascending: true });
  if (error) {
    if (!isMissingRelationError(error, "submission_answers")) console.warn("Failed to load student submission answers", error);
    return;
  }
  const loadedAnswers = (data || []).map(mapSubmissionAnswerFromRemote);
  if (!loadedAnswers.length) return;
  const loadedIds = new Set(loadedAnswers.map((answer) => answer.id).filter(Boolean));
  const loadedQuestionKeys = new Set(loadedAnswers.map((answer) => `${answer.submissionId}:${answer.questionNumber}`));
  state.submissionAnswers = [
    ...(state.submissionAnswers || []).filter((answer) => {
      if (answer.id && loadedIds.has(answer.id)) return false;
      return !loadedQuestionKeys.has(`${answer.submissionId}:${answer.questionNumber}`);
    }),
    ...loadedAnswers,
  ];
  saveState({ skipRemote: true });
}

function renderStudentGradedAnswerSheet(section, submission, student) {
  const answerRows = getStudentGradedAnswerRows(section, submission, student);
  const correctCount = answerRows.filter((row) => row.isCorrect).length;
  const wrongCount = answerRows.length - correctCount;
  return el("div", { className: "student-graded-answer-sheet" }, [
    el("div", { className: "student-graded-answer-summary" }, [
      el("div", {}, [el("span", {}, "\uC810\uC218"), el("strong", {}, `${submission.score || 0}\uC810`)]),
      el("div", {}, [el("span", {}, "\uC815\uB2F5"), el("strong", {}, `${correctCount}/${answerRows.length}`)]),
      el("div", {}, [el("span", {}, "\uC624\uB2F5"), el("strong", {}, `${wrongCount}\uAC1C`)]),
    ]),
    el("div", { className: "student-graded-answer-board answer-sheet-grid" }, answerRows.map(renderStudentGradedAnswerCell)),
  ]);
}
function getStudentGradedAnswerRows(section, submission, student) {
  const submittedAnswers = new Map(
    (state.submissionAnswers || [])
      .filter((answer) => answer.submissionId === submission.id)
      .map((answer) => [Number(answer.questionNumber), answer])
  );
  return getStudentVisibleSectionAnswers(section, student).map((answerKey, index) => {
    const submittedAnswer = submittedAnswers.get(Number(answerKey.questionNumber));
    const selectedAnswer = normalizeExamAnswerChoice(submittedAnswer?.selectedAnswer);
    const correctAnswer = normalizeExamAnswerChoice(answerKey.correctAnswer);
    return {
      displayNumber: index + 1,
      questionNumber: answerKey.questionNumber,
      selectedAnswer,
      correctAnswer,
      isCorrect: Boolean(selectedAnswer && correctAnswer && selectedAnswer === correctAnswer),
    };
  });
}

function renderStudentGradedAnswerCell(row) {
  const className = row.isCorrect ? "answer-sheet-cell graded-answer-cell correct" : "answer-sheet-cell graded-answer-cell wrong";
  return el("article", { className }, [
    el("span", {}, String(row.displayNumber) + "\uBC88"),
    el("strong", {}, toCircledAnswer(row.selectedAnswer)),
    row.isCorrect ? null : el("em", {}, "\uC815\uB2F5 " + toCircledAnswer(row.correctAnswer)),
  ]);
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
  return panel("답안 입력", [
    el("div", { className: "student-answer-list" }, cards),
    renderStudentAnswerNav(section, visibleAnswers.length),
  ]);
}

function renderStudentAnswerSubjectTabs(exam, currentSection, student, sections) {
  return el("div", { className: "student-answer-subject-tabs" }, sections.map((section) => {
    const submission = getStudentSubmission(student.id, section.id);
    const isCurrent = section.id === currentSection.id;
    const className = [
      "student-answer-subject-tab",
      isCurrent ? "active" : "",
      submission ? "submitted" : "",
    ].filter(Boolean).join(" ");
    const node = button("", className, "button", () => switchStudentAnswerSection(section, currentSection, student));
    node.disabled = isCurrent || Boolean(submission) || !isExamOpen(exam);
    node.append(
      el("strong", {}, section.subject),
      el("span", {}, submission ? "제출 완료" : isCurrent ? "입력 중" : "미제출")
    );
    return node;
  }));
}

function switchStudentAnswerSection(nextSection, currentSection, student) {
  if (!nextSection || nextSection.id === currentSection.id) return;
  if (getStudentSubmission(student.id, nextSection.id)?.status === "submitted") return notify("이미 제출한 과목입니다.");
  const hasDraft = Object.values(studentExamDraft.answers || {}).some(Boolean);
  if (hasDraft && !confirm("현재 과목에서 입력 중인 답안이 사라질 수 있습니다. 다른 과목으로 이동할까요?")) return;
  startStudentSectionAnswer(nextSection);
}

function renderStudentAnswerProgress(answeredCount, questionCount, start, end) {
  const percent = questionCount ? Math.round((answeredCount / questionCount) * 100) : 0;
  return el("div", { className: "student-answer-progress" }, [
    el("div", { className: "student-answer-progress-top" }, [
      el("strong", {}, `${answeredCount}/${questionCount} 입력`),
      el("span", {}, `${start}~${end}번`),
    ]),
    el("div", { className: "student-answer-progress-track" }, [
      el("span", { style: `width: ${percent}%` }),
    ]),
  ]);
}

function renderStudentExamEntrySubjectList(exam, sections, student, readiness = getStudentWeeklyExamReadiness(exam, student)) {
  const scoreOpen = canStudentSeeScore(exam, sections, student);
  return panel(formatStudentWeeklyExamName(exam.weekNumber), [
    !readiness.isReady
      ? renderStudentWeeklyExamPreparingMessage()
      : sections.length
      ? el("div", { className: "student-exam-subjects" }, sections.map((section) => renderStudentExamSubjectCard(exam, section, student, sections, scoreOpen)))
      : el("div", { className: "empty" }, "입력할 주간평가 과목이 없습니다."),
    readiness.isReady ? renderStudentWeeklyExamFiles(exam, sections, student) : null,
  ]);
}

function renderStudentAnswerQuestion(questionNumber, displayNumber = questionNumber) {
  const current = studentExamDraft.answers[questionNumber] || "";
  const options = [1, 2, 3, 4].map((value) => {
    const selected = Number(current) === value;
    const node = button(String(value), selected ? "answer-choice selected" : "answer-choice", "button", () => {
      const previous = studentExamDraft.answers[questionNumber];
      studentExamDraft.answers[questionNumber] = value;
      studentExamDraft.locked[questionNumber] = true;
      studentExamDraft.editing[questionNumber] = false;
      render();
      if (previous && previous !== value) notify(`${questionNumber}번 답안이 ${toCircledAnswer(previous)}에서 ${toCircledAnswer(value)}로 변경되었습니다.`);
    });
    node.setAttribute("aria-label", `${displayNumber}번 ${value}번 선택`);
    node.setAttribute("aria-pressed", selected ? "true" : "false");
    return node;
  });
  return el("article", { className: current ? "student-answer-row answered" : "student-answer-row" }, [
    el("div", { className: "student-answer-head" }, [
      el("strong", {}, `${displayNumber}번`),
    ]),
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
    el("div", { className: "student-answer-page-nav" }, [
      prev,
      next,
    ]),
    button("검토 후 제출", "btn student-answer-review-button", "button", () => {
      studentExamDraft.review = true;
      studentExamDraft.confirmed = false;
      render();
    }),
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
    cells.push(button("", answer ? "answer-sheet-cell" : "answer-sheet-cell missing", "button", () => {
      studentExamDraft.review = false;
      studentExamDraft.page = Math.floor(index / 10);
      render();
    }, [
      el("span", {}, `${displayNumber}번`),
      el("strong", {}, answer ? toCircledAnswer(answer) : "-"),
    ]));
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
    missing.length ? el("p", { className: "missing-warning" }, `미입력 문항: ${missing.join(", ")}번`) : el("p", { className: "answer-complete-message" }, "모든 문항을 입력했습니다."),
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
    try {
      await saveStudentSubmissionAnswersToRemote((state.submissionAnswers || []).filter((answer) => answer.submissionId === submission.id));
    } catch (error) {
      console.warn("Failed to sync student submission answers", error);
    }
    saveState({ skipRemote: true });
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
    const selectedAnswer = normalizeExamAnswerChoice(studentExamDraft.answers[question]);
    const correctAnswer = normalizeExamAnswerChoice(answerKey?.correctAnswer);
    const isCorrect = Boolean(selectedAnswer && correctAnswer && selectedAnswer === correctAnswer);
    const pointsAwarded = isCorrect ? getExamAnswerPointValue(answerKey) : 0;
    if (isCorrect) correctCount += 1;
    score += pointsAwarded;
    state.submissionAnswers.push({ id: createId(), submissionId: submission.id, questionNumber: question, selectedAnswer, isCorrect, pointsAwarded });
  });
  submission.score = Math.round(score * 10) / 10;
  submission.correctCount = correctCount;
}

async function saveStudentExamSubmissionToRemote(submission) {
  const previousId = submission.id;
  const row = {
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
  };
  const result = await remoteStore
    .from("exam_submissions")
    .upsert(row, { onConflict: "student_id,exam_section_id" })
    .select("id,score,correct_count")
    .maybeSingle();
  if (result.error) {
    const fallback = await remoteStore.from("exam_submissions").upsert(row, { onConflict: "student_id,exam_section_id" });
    if (fallback.error) throw fallback.error;
    await syncStudentSubmissionRemoteIdentity(submission, previousId);
    return;
  }
  const data = result.data;
  applyStudentSubmissionRemoteIdentity(submission, previousId, data);
}

function applyStudentSubmissionRemoteIdentity(submission, previousId, data) {
  if (data?.id && data.id !== previousId) {
    submission.id = data.id;
    state.submissionAnswers = (state.submissionAnswers || []).map((answer) =>
      answer.submissionId === previousId ? { ...answer, submissionId: data.id } : answer
    );
  }
  if (data?.score !== undefined) submission.score = Number(data.score) || submission.score;
  if (data?.correct_count !== undefined) submission.correctCount = Number(data.correct_count) || submission.correctCount;
}

async function syncStudentSubmissionRemoteIdentity(submission, previousId) {
  const { data, error } = await remoteStore
    .from("exam_submissions")
    .select("id,score,correct_count")
    .eq("student_id", submission.studentId)
    .eq("exam_section_id", submission.examSectionId)
    .maybeSingle();
  if (error) {
    console.warn("Failed to confirm student submission id", error);
    return;
  }
  applyStudentSubmissionRemoteIdentity(submission, previousId, data);
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
