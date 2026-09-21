const finalScopeAdmin = {
  draft: null, saved: null, selected: 0, loading: false, attempted: false,
  saving: false, error: "", message: "",
};

function isFinalScopeAdminDirty() {
  return !!finalScopeAdmin.draft && JSON.stringify(finalScopeAdmin.draft) !== JSON.stringify(finalScopeAdmin.saved);
}

async function loadFinalScopeAdmin() {
  if (finalScopeAdmin.loading || finalScopeAdmin.saving) return;
  finalScopeAdmin.loading = true;
  finalScopeAdmin.attempted = true;
  finalScopeAdmin.error = "";
  try {
    const response = await fetch("/api/app-settings", { credentials: "same-origin", cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error("load_failed");
    const saved = FinalScopePlanModel.normalize(data.settings?.finalScopePlan || window.FINAL_SCOPE_PLAN);
    applyRemoteAppSettings(data.settings);
    finalScopeAdmin.saved = saved;
    finalScopeAdmin.draft = JSON.parse(JSON.stringify(saved));
    finalScopeAdmin.selected = Math.min(finalScopeAdmin.selected, saved.rounds.length - 1);
    finalScopeAdmin.message = "저장된 플랜을 불러왔습니다.";
  } catch {
    finalScopeAdmin.error = "회독 플랜을 불러오지 못했습니다. 다시 불러오기를 눌러주세요.";
  } finally {
    finalScopeAdmin.loading = false;
    if (currentRoute === "final-scope-admin") render();
  }
}

async function saveFinalScopeAdmin() {
  if (!hasTeacherPermission("curriculum.write") || finalScopeAdmin.saving || finalScopeAdmin.loading) return;
  let plan;
  try { plan = FinalScopePlanModel.normalize(finalScopeAdmin.draft); }
  catch (error) { finalScopeAdmin.error = error.message; render(); return; }
  finalScopeAdmin.saving = true;
  finalScopeAdmin.error = "";
  finalScopeAdmin.message = "저장 중입니다…";
  render();
  try {
    const response = await fetch("/api/app-settings", {
      method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: { finalScopePlan: plan } }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      const messages = { unauthorized: "로그인이 만료되었습니다. 다시 로그인해주세요.", forbidden: "회독 플랜 수정 권한이 없습니다." };
      throw new Error(messages[data.error] || data.message || "저장하지 못했습니다. 입력 내용은 유지됩니다. 다시 시도해주세요.");
    }
    const saved = FinalScopePlanModel.normalize(data.settings?.finalScopePlan);
    applyRemoteAppSettings(data.settings);
    finalScopeAdmin.saved = saved;
    finalScopeAdmin.draft = JSON.parse(JSON.stringify(saved));
    finalScopeAdmin.message = "저장했습니다. 수강생 앱에서 새로고침하면 변경된 플랜이 표시됩니다.";
  } catch (error) {
    finalScopeAdmin.error = error.message || "저장하지 못했습니다. 입력 내용은 유지됩니다.";
  } finally {
    finalScopeAdmin.saving = false;
    if (currentRoute === "final-scope-admin") render();
  }
}

function renderFinalScopeAdmin() {
  if (!hasTeacherPermission("curriculum.read")) return renderForbidden();
  if (!finalScopeAdmin.attempted) loadFinalScopeAdmin();
  const canWrite = hasTeacherPermission("curriculum.write");
  const busy = finalScopeAdmin.loading || finalScopeAdmin.saving;
  const status = el("p", { className: "subtle", role: "status", "data-final-scope-status": "true" },
    isFinalScopeAdminDirty() ? "저장하지 않은 변경사항이 있습니다." : finalScopeAdmin.message);
  const changed = () => {
    finalScopeAdmin.message = "";
    status.textContent = isFinalScopeAdminDirty() ? "저장하지 않은 변경사항이 있습니다." : "변경사항이 없습니다.";
  };
  const reload = button("다시 불러오기", "btn secondary", "button", () => {
    if (isFinalScopeAdminDirty() && !confirm("저장하지 않은 변경사항을 버리고 다시 불러올까요?")) return;
    loadFinalScopeAdmin();
    render();
  });
  reload.disabled = busy;
  const save = button(finalScopeAdmin.saving ? "저장 중…" : "플랜 저장", "btn", "button", saveFinalScopeAdmin);
  save.disabled = busy || !canWrite || !finalScopeAdmin.draft;
  save.dataset.finalScopeSave = "true";
  const header = panel("회독 플랜 관리", [
    el("p", { className: "subtle" }, "온라인 관리반·인터넷 수강생에게 제공하는 회독 플랜입니다. 수정 후 ‘플랜 저장’을 눌러 반영해주세요."),
    !canWrite ? el("p", { className: "subtle" }, "조회만 가능한 계정입니다. 수정하려면 커리큘럼 수정 권한이 필요합니다.") : null,
    el("div", { className: "final-scope-admin-actions" }, [reload, save]),
    status,
    finalScopeAdmin.error ? el("p", { className: "final-scope-admin-error", role: "alert" }, finalScopeAdmin.error) : null,
  ]);
  if (!finalScopeAdmin.draft) return el("div", { className: "final-scope-admin grid" }, [header,
    el("p", { className: "empty" }, busy ? "회독 플랜을 불러오는 중입니다…" : "플랜을 불러온 뒤 수정할 수 있습니다."),
  ]);
  const plan = finalScopeAdmin.draft;
  const edit = (name, value, maxLength, update, multiline = false) => {
    const control = multiline ? el("textarea", { name, rows: 3 }) : input(name, "text", "", value);
    control.value = value;
    control.maxLength = maxLength;
    control.required = true;
    control.addEventListener("input", () => { update(control.value); changed(); });
    return control;
  };
  const selector = el("select", { name: "finalScopeRound", ariaLabel: "수정할 회차" }, plan.rounds.map((r, i) =>
    el("option", { value: String(i) }, `${r.round}회차 · ${r.date || "시험일 미입력"}`)));
  selector.value = String(finalScopeAdmin.selected);
  selector.disabled = busy;
  selector.addEventListener("change", () => { finalScopeAdmin.selected = Number(selector.value); render(); });
  const round = plan.rounds[finalScopeAdmin.selected];
  const roundNumber = input("finalScopeRoundNumber", "number", "회차 번호", round.round);
  roundNumber.min = "1"; roundNumber.max = "999"; roundNumber.step = "1"; roundNumber.required = true;
  roundNumber.addEventListener("input", () => { round.round = Number(roundNumber.value); changed(); });
  const addRound = button("회차 추가", "mini-btn", "button", () => {
    const number = Math.max(...plan.rounds.map(r => Number(r.round) || 0)) + 1;
    if (number > 999 || plan.rounds.length >= 30) return notify("회차는 최대 30개, 번호는 999까지 입력할 수 있습니다.");
    plan.rounds.push({ round: number, date: "", code: "전 범위",
      subjects: Object.fromEntries(FinalScopePlanModel.subjects.map(s => [s, [{ code: "전범위", text: "전범위" }]])) });
    finalScopeAdmin.selected = plan.rounds.length - 1;
    render();
  });
  addRound.disabled = !canWrite || busy || plan.rounds.length >= 30;
  const removeRound = button("이 회차 삭제", "mini-btn danger", "button", () => {
    if (!confirm(`${round.round}회차를 플랜에서 삭제할까요? 플랜 저장을 누르면 반영됩니다.`)) return;
    plan.rounds.splice(finalScopeAdmin.selected, 1);
    finalScopeAdmin.selected = Math.min(finalScopeAdmin.selected, plan.rounds.length - 1);
    render();
  });
  removeRound.disabled = !canWrite || busy || plan.rounds.length <= 1;
  const body = el("fieldset", { className: "final-scope-admin-fields", disabled: !canWrite || busy }, [
    field("플랜 제목", edit("finalScopeTitle", plan.title, 100, v => plan.title = v)),
    el("div", { className: "form-grid" }, [
      field("회차 번호", roundNumber),
      field("시험일", edit("finalScopeDate", round.date, 40, v => round.date = v)),
      field("회독 일정", edit("finalScopeCode", round.code, 80, v => round.code = v)),
    ]),
    el("p", { className: "subtle" }, "시험일 예: 9월 21일 · 회독 일정 예: 12-1 ~ 12-4, 9-1 ~ 9-3, 전 범위"),
    ...FinalScopePlanModel.subjects.map((subject, subjectIndex) => {
      const units = round.subjects[subject];
      const add = button("단원 추가", "mini-btn", "button", () => {
        if (units.length >= 24) return;
        units.push({ code: "", text: "" }); render();
      });
      add.disabled = units.length >= 24;
      return el("section", { className: "final-scope-admin-subject" }, [
        el("div", { className: "final-scope-admin-actions" }, [el("h3", {}, subject), add]),
        ...units.map((unit, index) => {
          const remove = button("삭제", "mini-btn danger", "button", () => {
            if (units.length <= 1) return;
            units.splice(index, 1); render();
          });
          remove.disabled = units.length <= 1;
          remove.setAttribute("aria-label", `${subject} ${index + 1}번째 단원 삭제`);
          return el("div", { className: "final-scope-admin-unit" }, [
            field("일차", edit(`unitCode-${subjectIndex}-${index}`, unit.code, 40, v => unit.code = v)),
            field("학습 범위", edit(`unitText-${subjectIndex}-${index}`, unit.text, 2000, v => unit.text = v, true)), remove,
          ]);
        }),
      ]);
    }),
  ]);
  const bottomSave = button(finalScopeAdmin.saving ? "저장 중…" : "플랜 저장", "btn", "button", saveFinalScopeAdmin);
  bottomSave.disabled = save.disabled;
  return el("div", { className: "final-scope-admin grid" }, [header,
    panel("회차별 계획 편집", [el("div", { className: "final-scope-admin-actions" }, [field("수정할 회차", selector), addRound, removeRound]), body, bottomSave]),
  ]);
}

window.addEventListener("beforeunload", (event) => {
  if (!isFinalScopeAdminDirty()) return;
  event.preventDefault();
  event.returnValue = "";
});
