/* Study record PNGs are generated locally. The preview and shared file use the same blob. */
(function (root) {
  "use strict";

  const PERIODS = { daily: "일간", weekly: "주간", monthly: "월간" };
  const RATIOS = { "1:1": 1, "3:4": 3 / 4, "9:16": 9 / 16 };
  const FONT = '"Gong Gothic Light", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  const INK = "#132238", MUTED = "#64748b", BLUE = "#075da4", NAVY = "#06386f";
  let active = null;
  const selections = {};

  function defaultFields(period) {
    const daily = period === "daily";
    return { chart: !daily, studiedDays: !daily, subjects: daily, completion: daily,
      average: false, maximum: false, longest: false, start: false, end: false };
  }

  function seconds(value) {
    return Math.max(0, Math.floor(Number(value) || 0));
  }

  function duration(value, withSeconds = false) {
    const total = seconds(value);
    const hours = String(Math.floor(total / 3600));
    const minutes = String(Math.floor(total % 3600 / 60)).padStart(2, "0");
    return withSeconds
      ? `${hours.padStart(2, "0")}:${minutes}:${String(total % 60).padStart(2, "0")}`
      : `${hours}:${minutes}`;
  }

  function dateParts(key) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key))) throw new Error("invalid_date");
    const date = new Date(`${key}T12:00:00Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== key) throw new Error("invalid_date");
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), weekday: date.getUTCDay() };
  }

  function displayDuration(value) {
    const total = seconds(value), minutes = Math.floor(total / 60), hours = Math.floor(minutes / 60);
    if (!minutes) return total ? "1분 미만" : "0분";
    return hours ? `${hours}시간${minutes % 60 ? ` ${minutes % 60}분` : ""}` : `${minutes}분`;
  }

  function dateLabel(key) {
    const d = dateParts(key);
    return `${d.year}년 ${d.month}월 ${d.day}일`;
  }

  function recordRange(period, anchor) {
    if (!PERIODS[period]) throw new Error("invalid_period");
    dateParts(anchor);
    const start = new Date(`${anchor}T12:00:00Z`), end = new Date(start);
    if (period === "weekly") {
      start.setUTCDate(start.getUTCDate() - (start.getUTCDay() || 7) + 1);
      end.setTime(start.getTime()); end.setUTCDate(end.getUTCDate() + 6);
    } else if (period === "monthly") {
      start.setUTCDate(1); end.setUTCMonth(end.getUTCMonth() + 1, 0);
    }
    return { dateFrom: start.toISOString().slice(0, 10), dateTo: end.toISOString().slice(0, 10) };
  }

  function shiftRecordAnchor(period, anchor, amount) {
    recordRange(period, anchor);
    const date = new Date(`${anchor}T12:00:00Z`);
    if (period === "monthly") date.setUTCMonth(date.getUTCMonth() + amount, 1);
    else date.setUTCDate(date.getUTCDate() + amount * (period === "weekly" ? 7 : 1));
    return date.toISOString().slice(0, 10);
  }

  function aggregatePlans(plans, from, to, today) {
    const end = today && today < to ? today : to;
    let total = 0, completed = 0;
    const seen = new Set();
    for (const row of Array.isArray(plans) ? plans : []) {
      const key = String(row?.studyDate || "");
      if (key < from || key > end || seen.has(key)) continue;
      seen.add(key);
      const count = seconds(row.total);
      total += count;
      completed += Math.min(count, seconds(row.completed));
    }
    return total ? { total, completed, percent: Math.round(completed / total * 100) } : null;
  }

  function createModel(data, period, today, plans = null) {
    if (!PERIODS[period] || data?.localOnly) throw new Error("unconfirmed_record");
    const from = String(data?.dateFrom || ""), to = String(data?.dateTo || "");
    const first = dateParts(from), last = dateParts(to);
    dateParts(today);
    if (from > to || (period === "daily" && from !== to)) throw new Error("invalid_range");
    const days = (Array.isArray(data.days) ? data.days : []).map(day => ({
      date: String(day.date), totalSeconds: seconds(day.totalSeconds),
      longestSeconds: seconds(day.longestSeconds),
      firstStartedAt: String(day.firstStartedAt || ""), lastEndedAt: String(day.lastEndedAt || ""),
    }));
    if (!days.length || days.length > 31) throw new Error("invalid_days");
    const seen = new Set();
    for (const day of days) {
      dateParts(day.date);
      if (day.date < from || day.date > to || seen.has(day.date)) throw new Error("invalid_days");
      seen.add(day.date);
    }
    days.sort((a, b) => a.date.localeCompare(b.date));
    const total = days.reduce((sum, day) => sum + day.totalSeconds, 0);
    if (!total || total !== seconds(data.summary?.totalSeconds)) throw new Error("invalid_total");
    const studiedDays = days.filter(day => day.totalSeconds > 0).length;
    const subjects = Object.entries(data.subjectTotals || {}).map(([name, value]) => ({
      name: String(name), seconds: seconds(value),
    })).filter(item => item.seconds > 0).sort((a, b) => b.seconds - a.seconds);
    const heading = period === "daily" ? dateLabel(from)
      : period === "monthly" ? `${first.year}년 ${first.month}월`
        : `${first.month}.${first.day} – ${last.month}.${last.day}`;
    return {
      period, from, to, today, heading, days, subjects,
      total, studiedDays, average: Math.floor(total / studiedDays),
      maximum: Math.max(...days.map(day => day.totalSeconds)),
      completion: Array.isArray(plans) ? aggregatePlans(plans, from, to, today) : null,
      asOf: String(data.serverNow || ""),
    };
  }

  function clock(value) {
    if (!value || Number.isNaN(new Date(value).getTime())) return "-";
    return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date(value));
  }

  async function preparePhoto(file) {
    if (!file || file.size > 25 * 1024 * 1024) throw new Error("photo_size");
    if (!/^image\/(jpeg|png|webp|gif|avif|heic|heif|bmp)$/i.test(file.type)) throw new Error("photo_format");
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      if (!image.naturalWidth || !image.naturalHeight) throw new Error("photo_format");
      const ratio = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
      const photo = document.createElement("canvas");
      photo.width = Math.max(1, Math.round(image.naturalWidth * ratio));
      photo.height = Math.max(1, Math.round(image.naturalHeight * ratio));
      const context = photo.getContext("2d");
      if (!context) throw new Error("canvas_unavailable");
      context.drawImage(image, 0, 0, photo.width, photo.height);
      return photo;
    } finally { URL.revokeObjectURL(url); }
  }

  async function renderCard(model, fields = defaultFields(model.period), photo = null, ratio = "1:1") {
    if (document.fonts?.load) await document.fonts.load(`700 16px ${FONT}`);
    const width = 360, scale = 3;
    const calendarRows = Math.ceil((dateParts(model.from).weekday + model.days.length) / 7);
    const daily = model.period === "daily";
    const showChart = !daily && fields.chart;
    const showDays = fields.studiedDays;
    const chartHeight = (showChart ? model.period === "monthly" ? 227 + calendarRows * 43 : 386 : 166) + (showDays ? 32 : 0);
    const metrics = [];
    if (fields.average) metrics.push(["하루 평균", displayDuration(model.average)]);
    if (fields.maximum) metrics.push(["최고 기록", displayDuration(model.maximum)]);
    if (daily) {
      if (fields.longest) metrics.push(["최대 집중시간", displayDuration(model.days[0].longestSeconds)]);
      if (fields.start) metrics.push(["시작 시간", clock(model.days[0].firstStartedAt)]);
      if (fields.end) metrics.push(["종료 시간", clock(model.days[0].lastEndedAt)]);
    }
    const metricsHeight = metrics.length ? Math.ceil(metrics.length / 2) * 66 + 12 : 0;
    const canvas = document.createElement("canvas");
    const scratch = canvas.getContext("2d");
    if (!scratch) throw new Error("canvas_unavailable");
    scratch.font = `700 12px ${FONT}`;
    function wrap(text, maxWidth) {
      const lines = []; let line = "";
      for (const letter of Array.from(text)) {
        if (line && scratch.measureText(line + letter).width > maxWidth) { lines.push(line); line = ""; }
        line += letter;
      }
      if (line) lines.push(line);
      return lines.length ? lines : [""];
    }
    const subjectRows = fields.subjects ? model.subjects.map(subject => ({ ...subject, lines: wrap(subject.name, 94) })) : [];
    const subjectsHeight = 44 + subjectRows.reduce((n, row) => n + Math.max(30, row.lines.length * 16 + 10), 0);
    const showSubjects = subjectRows.length > 0;
    const showCompletion = fields.completion && model.completion;
    const fixedRatio = photo ? RATIOS[ratio] || 0 : 0;
    const photoSpace = photo && !fixedRatio ? 180 : 0;
    const height = 54 + photoSpace + chartHeight + 12 + metricsHeight + (showSubjects ? subjectsHeight + 12 : 0) + (showCompletion ? 47 : 0) + 30;
    if (height > 5000) throw new Error("record_too_long");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);
    if (!photo || !fixedRatio) { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, width, height); }
    if (photo && !fixedRatio) {
      const ratio = Math.max(width / photo.width, height / photo.height);
      const cropWidth = width / ratio, cropHeight = height / ratio;
      ctx.drawImage(photo, (photo.width - cropWidth) / 2, (photo.height - cropHeight) / 2, cropWidth, cropHeight, 0, 0, width, height);
      const shade = ctx.createLinearGradient(0, 0, 0, height);
      shade.addColorStop(0, "rgba(3,18,35,.48)");
      shade.addColorStop(.3, "rgba(3,18,35,.15)");
      shade.addColorStop(.6, "rgba(3,18,35,.65)");
      shade.addColorStop(1, "rgba(3,18,35,.8)");
      ctx.fillStyle = shade; ctx.fillRect(0, 0, width, height);
    }

    function text(value, x, y, size = 12, color = INK, align = "left", maxWidth = 0) {
      let fontSize = size;
      ctx.font = `700 ${fontSize}px ${FONT}`;
      while (maxWidth && ctx.measureText(String(value)).width > maxWidth && fontSize > 8) {
        ctx.font = `700 ${--fontSize}px ${FONT}`;
      }
      ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = "middle";
      ctx.fillText(String(value), x, y);
    }
    function box(x, y, w, h, fill = "#ffffff", radius = 14, border = "") {
      const r = Math.min(radius, w / 2, h / 2);
      ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
      ctx.fillStyle = fill; ctx.fill();
      if (border) { ctx.strokeStyle = border; ctx.lineWidth = 1; ctx.stroke(); }
    }
    if (!photo || !fixedRatio) {
      text("해양경찰 전문학원 론박스터디", 22, 29, 12, photo ? "#fff" : NAVY, "left", 210);
      text(`${PERIODS[model.period]} 공부 기록`, 338, 29, 11, photo ? "#fff" : MUTED, "right");
    }
    let y = 54;
    if (!photo) box(16, y, 328, chartHeight, "#fff", 16, "#e6edf4");
    else if (showChart || showDays) box(16, y + photoSpace + 151, 328, chartHeight - 151, "rgba(255,255,255,.94)", 16);
    text(model.heading, 180, y + 25, 17, photo ? "#fff" : INK, "center", 294);
    y += photoSpace;
    if (!photo) box(29, y + 53, 302, 90, "#edf7ff");
    text(`${PERIODS[model.period]} 공부시간`, 180, y + 77, 12, photo ? "#fff" : BLUE, "center");
    text(displayDuration(model.total), 180, y + 113, 32, photo ? "#fff" : NAVY, "center", 278);
    const plotY = y + 110;
    if (showChart && model.period === "weekly") {
      text("공부시간 (시간:분)", 330, plotY + 55, 10, MUTED, "right");
      model.days.forEach((day, index) => {
        const x = 40 + index * 46;
        const d = dateParts(day.date);
        text(day.totalSeconds ? duration(day.totalSeconds) : "-", x, plotY + 83, 10, MUTED, "center", 40);
        box(x - 12, plotY + 107, 24, 116, "#eff3f7", 6);
        if (day.totalSeconds) {
          const barHeight = Math.max(5, day.totalSeconds / model.maximum * 116);
          const gradient = ctx.createLinearGradient(0, plotY + 107, 0, plotY + 223);
          gradient.addColorStop(0, "#45a9d0"); gradient.addColorStop(1, BLUE);
          box(x - 12, plotY + 223 - barHeight, 24, barHeight, gradient, 5);
        }
        text("일월화수목금토"[d.weekday], x, plotY + 238, 11, MUTED, "center");
        text(d.day, x, plotY + 258, 10, "#98a4b1", "center");
      });
    } else if (showChart && model.period === "monthly") {
      text("공부시간 (시간:분)", 330, plotY + 51, 10, MUTED, "right");
      Array.from("일월화수목금토").forEach((label, i) => text(label, 43 + i * 46, plotY + 72, 11, MUTED, "center"));
      const offset = dateParts(model.from).weekday;
      const fills = ["#f3f5f7", "#dceefa", "#add8ef", "#5daed4", BLUE];
      const inks = ["#718093", "#386d92", "#174f77", "#fff", "#fff"];
      model.days.forEach((day, index) => {
        const slot = offset + index, x = 23 + slot % 7 * 46, top = plotY + 87 + Math.floor(slot / 7) * 43;
        const level = day.totalSeconds ? Math.max(1, Math.ceil(day.totalSeconds / model.maximum * 4)) : 0;
        box(x, top, 40, 39, fills[level], 7, day.date === model.today ? "#f0a73b" : "");
        text(dateParts(day.date).day, x + 20, top + (day.totalSeconds ? 12 : 19), 12, inks[level], "center");
        if (day.totalSeconds) text(duration(day.totalSeconds), x + 20, top + 28, 9, inks[level], "center", 36);
      });
      const legendY = plotY + 98 + calendarRows * 43;
      text("적게", 229, legendY, 8, MUTED, "right");
      fills.forEach((fill, index) => box(236 + index * 13, legendY - 4, 10, 9, fill, 2));
      text("많이", 325, legendY, 8, MUTED, "right");
    }
    if (showDays) text(`${model.studiedDays}일 공부했어요`, 180, y + chartHeight - 20, 12, NAVY, "center");
    y += chartHeight + 12;
    metrics.forEach(([label, value], index) => {
      const x = 16 + index % 2 * 168, top = y + Math.floor(index / 2) * 66;
      box(x, top, 160, 58, "#f4f8fb");
      text(label, x + 12, top + 17, 11, MUTED);
      text(value, x + 12, top + 39, 16, NAVY, "left", 136);
    });
    y += metricsHeight;
    if (showSubjects) {
    box(16, y, 328, subjectsHeight, "#fff", 16, "#e6edf4");
    text("과목별 순공시간", 29, y + 22, 13);
    text(`${subjectRows.length}개 과목`, 330, y + 22, 10, MUTED, "right");
    let rowY = y + 42;
    const maximumSubject = Math.max(1, ...model.subjects.map(subject => subject.seconds));
    subjectRows.forEach((subject, index) => {
      const rowHeight = Math.max(30, subject.lines.length * 16 + 10);
      const center = rowY + rowHeight / 2;
      box(29, center - 3, 6, 6, [BLUE,"#8d77c9","#45aca9","#eaaa47","#cf6f83","#52b99c"][index % 6], 3);
      subject.lines.forEach((line, n) => text(line, 42, rowY + 10 + n * 16, 12));
      box(142, center - 3, 96, 6, "#edf1f5", 3);
      box(142, center - 3, Math.max(3, subject.seconds / maximumSubject * 96), 6, BLUE, 3);
      text(displayDuration(subject.seconds), 330, center, 11, MUTED, "right", 85);
      rowY += rowHeight;
    });
    y += subjectsHeight + 12;
    }
    if (showCompletion) {
      text("할 일 달성률", 29, y + 14, 12, photo ? "#fff" : MUTED);
      text(`${model.completion.percent}% · ${model.completion.completed}/${model.completion.total} 완료`, 330, y + 14, 12, photo ? "#fff" : NAVY, "right", 219);
      y += 47;
    }
    let output = canvas;
    if (fixedRatio) {
      output = document.createElement("canvas");
      output.width = 1440;
      output.height = Math.round(output.width / fixedRatio);
      const target = output.getContext("2d");
      if (!target) throw new Error("canvas_unavailable");
      target.fillStyle = "#fff"; target.fillRect(0, 0, output.width, output.height);
      if (photo) {
        const fillScale = Math.max(output.width / photo.width, output.height / photo.height);
        const cropWidth = output.width / fillScale, cropHeight = output.height / fillScale;
        target.drawImage(photo, (photo.width - cropWidth) / 2, (photo.height - cropHeight) / 2, cropWidth, cropHeight, 0, 0, output.width, output.height);
        target.fillStyle = "rgba(3,18,35,.58)"; target.fillRect(0, 0, output.width, output.height);
      }
      // Portrait ratios use the full available width, keeping records at least
      // as large as the square layout instead of shrinking them into columns.
      const padding = 24;
      const fit = Math.min((output.width - padding * 2) / canvas.width, (output.height - padding * 2) / canvas.height);
      target.drawImage(canvas, (output.width - canvas.width * fit) / 2, (output.height - canvas.height * fit) / 2, canvas.width * fit, canvas.height * fit);
      if (photo) {
        // Keep the academy name at the photo's upper-left edge in every ratio.
        target.fillStyle = "#fff"; target.textBaseline = "middle"; target.textAlign = "left";
        target.font = `700 40px ${FONT}`;
        target.fillText("해양경찰 전문학원 론박스터디", 72, 76);
        target.textAlign = "right"; target.font = `700 36px ${FONT}`;
        target.fillText(`${PERIODS[model.period]} 공부 기록`, output.width - 72, 76);
      }
    }
    return new Promise((resolve, reject) => output.toBlob(blob => blob ? resolve(blob) : reject(new Error("png_failed")), "image/png"));
  }

  function close() {
    const view = active;
    if (!view) return;
    active = null;
    if (view.url) URL.revokeObjectURL(view.url);
    if (view.dialog.open) view.dialog.close();
    view.dialog.remove();
    document.documentElement.classList.remove("study-record-share-open");
    window.removeEventListener("hashchange", close);
    window.removeEventListener("pagehide", close);
    const focusTarget = view.trigger?.isConnected ? view.trigger : document.querySelector(".study-timer-share-button");
    focusTarget?.focus({ preventScroll: true });
  }

  function canShareFile(file) {
    try { return typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] }); }
    catch { return false; }
  }

  async function open({ data, period, today, loadPlans, loadRecord, anchorDate = data?.dateFrom, isCurrent = () => true, photoState = { image: null } }) {
    close();
    if (!photoState.mode) photoState.mode = "card";
    if (photoState.ratio !== "original" && !RATIOS[photoState.ratio]) photoState.ratio = "1:1";
    // Copy only display data; never include student names, registration numbers or credentials.
    let model = createModel(data, period, today);
    dateParts(anchorDate);
    const selection = { period, anchor: anchorDate > today ? today : anchorDate };
    const node = (tag, className, text) => {
      const element = document.createElement(tag); element.className = className;
      if (text) element.textContent = text;
      return element;
    };
    const trigger = document.activeElement;
    const dialog = node("dialog", "study-record-share-dialog");
    dialog.setAttribute("aria-label", "공부 기록 공유");
    const layout = node("div", "study-record-share-layout");
    const header = node("header", "study-record-share-head");
    const back = node("button", "study-record-share-back", "‹"); back.type = "button"; back.setAttribute("aria-label", "통계로 돌아가기");
    const title = node("h2", "", "기록 공유");
    const picker = node("div", "study-record-share-period-picker");
    picker.hidden = typeof loadRecord !== "function";
    layout.classList.toggle("has-period-picker", !picker.hidden);
    const tabs = node("nav", "study-timer-stats-periods"); tabs.setAttribute("aria-label", "공유할 기록 기간 선택");
    const periodButtons = Object.entries(PERIODS).map(([value, label]) => {
      const button = node("button", "study-timer-stats-period-button", label); button.type = "button";
      button.dataset.sharePeriod = value;
      button.addEventListener("click", () => {
        if (sharing || loadingPhoto || selection.period === value) return;
        selection.period = value; void loadSelection();
      });
      tabs.append(button); return button;
    });
    const dates = node("div", "study-timer-stats-date-nav study-record-share-dates");
    const previous = node("button", "study-timer-stats-date-button", "‹"); previous.type = "button"; previous.setAttribute("aria-label", "이전 기간");
    const next = node("button", "study-timer-stats-date-button", "›"); next.type = "button"; next.setAttribute("aria-label", "다음 기간");
    const rangeTitle = node("strong", ""); rangeTitle.setAttribute("aria-live", "polite");
    for (const [button, amount] of [[previous, -1], [next, 1]]) button.addEventListener("click", () => {
      if (sharing || loadingPhoto || button.disabled) return;
      selection.anchor = shiftRecordAnchor(selection.period, selection.anchor, amount);
      if (selection.anchor > today) selection.anchor = today;
      void loadSelection();
    });
    dates.append(previous, rangeTitle, next); picker.append(tabs, dates);
    const content = node("div", "study-record-share-content");
    const status = node("p", "study-record-share-status", "공유 이미지를 준비하고 있어요."); status.setAttribute("role", "status");
    const preview = node("img", "study-record-share-image"); preview.hidden = true; preview.alt = `${model.heading} ${PERIODS[period]} 공부 기록`;
    const note = node("p", "study-record-share-note"); note.hidden = true;
    const retry = node("button", "study-record-share-retry", "다시 불러오기"); retry.type = "button"; retry.hidden = true;
    retry.addEventListener("click", () => { void loadSelection(); });
    const formatPicker = node("div", "study-record-share-formats");
    formatPicker.setAttribute("role", "group"); formatPicker.setAttribute("aria-label", "공유 이미지 형식");
    const cardFormat = node("button", "", "기록 카드"); cardFormat.type = "button";
    const photoFormat = node("button", "", "사진 인증"); photoFormat.type = "button";
    formatPicker.append(cardFormat, photoFormat);
    const ratioRow = node("label", "study-record-share-ratio");
    const ratioSelect = node("select", ""); ratioSelect.setAttribute("aria-label", "이미지 비율");
    for (const [value, label] of [["original", "원본"], ["1:1", "정방형 · 1:1"], ["3:4", "세로 · 3:4"], ["9:16", "세로 · 9:16"]]) {
      const option = node("option", "", label); option.value = value; ratioSelect.append(option);
    }
    ratioSelect.value = photoState.ratio;
    ratioRow.append(node("span", "", "이미지 비율"), ratioSelect);
    const options = node("details", "study-record-share-options");
    const optionsTitle = node("summary", "", "표시 항목 설정");
    const optionList = node("fieldset", "study-record-share-fields");
    optionList.disabled = true;
    optionList.append(node("legend", "", "공유 이미지에 넣을 항목"));
    options.append(optionsTitle, node("p", "study-record-share-options-hint", "날짜와 총 공부시간은 항상 표시됩니다."), optionList);
    const actions = node("footer", "study-record-share-actions");
    const save = node("button", "btn secondary", "이미지 저장"); save.type = "button"; save.disabled = true;
    const share = node("button", "btn", "공유하기"); share.type = "button"; share.disabled = true;
    const photoPicker = node("div", "study-record-share-photo-picker");
    photoPicker.setAttribute("role", "group"); photoPicker.setAttribute("aria-label", "인증 사진 선택");
    const takePhoto = node("button", "", "카메라로 촬영"); takePhoto.type = "button";
    const chooseAlbum = node("button", "", "앨범에서 선택"); chooseAlbum.type = "button";
    photoPicker.append(node("p", "", "공부한 사진을 선택해 주세요."), takePhoto, chooseAlbum);
    const photoTools = node("div", "study-record-share-photo-tools");
    const photoButton = node("button", "study-record-share-photo-button", "사진 변경");
    photoButton.type = "button"; photoButton.disabled = true;
    photoButton.setAttribute("aria-expanded", "false");
    const photoMenu = node("div", "study-record-share-photo-menu"); photoMenu.hidden = true;
    photoMenu.id = "study-record-share-photo-menu";
    photoMenu.setAttribute("role", "group"); photoMenu.setAttribute("aria-label", "사진 추가 방법");
    photoButton.setAttribute("aria-controls", photoMenu.id);
    const camera = node("button", "", "카메라로 촬영"); camera.type = "button";
    const album = node("button", "", "앨범에서 선택"); album.type = "button";
    const removePhoto = node("button", "", "사진 삭제"); removePhoto.type = "button"; removePhoto.hidden = !photoState.image;
    const cameraInput = node("input", ""); cameraInput.type = "file"; cameraInput.accept = "image/*";
    cameraInput.setAttribute("capture", "environment"); cameraInput.hidden = true; cameraInput.setAttribute("aria-label", "촬영 사진 선택");
    const albumInput = node("input", ""); albumInput.type = "file"; albumInput.accept = "image/*";
    albumInput.hidden = true; albumInput.setAttribute("aria-label", "앨범 사진 선택");
    photoMenu.append(camera, album, removePhoto);
    photoTools.append(photoMenu, photoButton);
    header.append(back, title); content.append(formatPicker, ratioRow, options, photoPicker, status, retry, preview, photoTools, note, cameraInput, albumInput); actions.append(save, share);
    layout.append(header, picker, content, actions); dialog.append(layout); document.body.append(dialog);
    const view = { dialog, trigger, url: "", file: null };
    active = view;
    const current = () => active === view && dialog.isConnected && isCurrent();
    let fields = { ...defaultFields(period), ...selections[period] };
    let revision = 0;
    let recordRevision = 0;
    let sharing = false;
    let loadingPhoto = false;
    let ready = false;
    function syncPhotoUI() {
      const photoMode = photoState.mode === "photo";
      ratioRow.hidden = !photoMode;
      cardFormat.setAttribute("aria-pressed", String(!photoMode));
      photoFormat.setAttribute("aria-pressed", String(photoMode));
      photoPicker.hidden = !photoMode || !!photoState.image;
      photoTools.hidden = !photoMode || !photoState.image;
      removePhoto.hidden = !photoState.image;
      const busy = !ready || loadingPhoto || sharing;
      for (const control of [cardFormat, photoFormat, ratioSelect, photoButton, takePhoto, chooseAlbum, camera, album, removePhoto]) control.disabled = busy;
      optionList.disabled = busy;
      for (const button of periodButtons) button.disabled = loadingPhoto || sharing;
      previous.disabled = loadingPhoto || sharing;
      next.disabled = loadingPhoto || sharing || recordRange(selection.period, selection.anchor).dateTo >= today;
    }
    syncPhotoUI();
    function changeFormat(mode) {
      if (!ready || loadingPhoto || sharing || photoState.mode === mode) return;
      photoState.mode = mode; setPhotoMenu(false); void refreshImage();
    }
    cardFormat.addEventListener("click", () => changeFormat("card"));
    photoFormat.addEventListener("click", () => changeFormat("photo"));
    ratioSelect.addEventListener("change", () => { photoState.ratio = ratioSelect.value; void refreshImage(); });
    function setPhotoMenu(opened) {
      photoMenu.hidden = !opened;
      photoButton.setAttribute("aria-expanded", String(opened));
    }
    photoButton.addEventListener("click", () => {
      setPhotoMenu(photoMenu.hidden);
      if (!photoMenu.hidden) camera.focus();
    });
    photoTools.addEventListener("keydown", event => {
      if (event.key === "Escape" && !photoMenu.hidden) {
        event.preventDefault(); event.stopPropagation(); setPhotoMenu(false); photoButton.focus();
      }
    });
    dialog.addEventListener("click", event => { if (!photoTools.contains(event.target)) setPhotoMenu(false); });
    const openCamera = () => { setPhotoMenu(false); cameraInput.value = ""; cameraInput.click(); };
    const openAlbum = () => { setPhotoMenu(false); albumInput.value = ""; albumInput.click(); };
    camera.addEventListener("click", openCamera); takePhoto.addEventListener("click", openCamera);
    album.addEventListener("click", openAlbum); chooseAlbum.addEventListener("click", openAlbum);
    async function selectPhoto(event) {
      const file = event.target.files?.[0];
      if (!file || !current() || !ready || loadingPhoto || sharing || photoState.mode !== "photo") return;
      loadingPhoto = true;
      ++revision;
      view.file = null;
      save.disabled = true; share.disabled = true; syncPhotoUI();
      status.hidden = false; status.textContent = "사진을 준비하고 있어요.";
      try {
        const photo = await preparePhoto(file);
        if (!current()) return;
        photoState.image = photo;
        await refreshImage();
      } catch (error) {
        if (!current()) return;
        // A failed replacement keeps the previous photo and regenerates its downloadable file.
        await refreshImage();
        if (current()) {
          status.hidden = false;
          status.textContent = error?.message === "photo_size" ? "25MB 이하의 사진을 선택해 주세요." : "이 사진을 열 수 없어요. JPG, PNG 등 다른 사진을 선택해 주세요.";
        }
      } finally {
        if (current()) {
          loadingPhoto = false; syncPhotoUI();
          (photoState.image ? photoButton : takePhoto).focus({ preventScroll: true });
        }
      }
    }
    cameraInput.addEventListener("change", selectPhoto);
    albumInput.addEventListener("change", selectPhoto);
    for (const input of [cameraInput, albumInput]) input.addEventListener("cancel", () => {
      if (current()) (photoState.image ? photoButton : takePhoto).focus({ preventScroll: true });
    });
    removePhoto.addEventListener("click", () => {
      if (loadingPhoto || sharing) return;
      photoState.image = null;
      setPhotoMenu(false); void refreshImage(); takePhoto.focus();
    });
    async function refreshImage() {
      const ticket = ++revision;
      save.disabled = true; share.disabled = true;
      view.file = null;
      preview.hidden = true;
      syncPhotoUI();
      if (photoState.mode === "photo" && !photoState.image) {
        if (view.url) URL.revokeObjectURL(view.url);
        view.url = ""; preview.removeAttribute("src"); status.hidden = true;
        return;
      }
      status.hidden = false; status.textContent = "공유 이미지를 준비하고 있어요.";
      try {
        const outputRatio = photoState.mode === "photo" ? photoState.ratio : "original";
        const blob = await renderCard(model, { ...fields }, photoState.mode === "photo" ? photoState.image : null, outputRatio);
        if (!current() || ticket !== revision) return;
        const filename = `론박스터디-${PERIODS[period]}-${model.from}${model.from === model.to ? "" : "_" + model.to}${outputRatio === "original" ? "" : "-" + outputRatio.replace(":", "x")}.png`;
        const url = URL.createObjectURL(blob);
        if (view.url) URL.revokeObjectURL(view.url);
        view.file = new File([blob], filename, { type: "image/png" });
        view.url = url; preview.src = url; preview.hidden = false;
        status.hidden = true; save.disabled = false; share.disabled = sharing || !canShareFile(view.file);
      } catch {
        if (current() && ticket === revision) {
          status.hidden = false; status.textContent = "이미지를 만들지 못했어요. 표시 항목을 다시 선택해 주세요.";
        }
      }
    }
    back.addEventListener("click", close);
    dialog.addEventListener("close", () => { if (active === view) close(); });
    window.addEventListener("hashchange", close); window.addEventListener("pagehide", close);
    document.documentElement.classList.add("study-record-share-open");
    dialog.showModal();
    save.addEventListener("click", () => {
      if (!current() || !view.url || !view.file) return;
      const link = document.createElement("a");
      const downloadUrl = URL.createObjectURL(view.file);
      link.href = downloadUrl; link.download = view.file.name; document.body.append(link); link.click(); link.remove();
      // Closing the preview must not revoke a download that the browser is still reading.
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 60000);
    });
    share.addEventListener("click", async () => {
      if (!current() || !view.file) return;
      if (!canShareFile(view.file)) {
        share.disabled = true;
        return;
      }
      sharing = true; share.disabled = true; syncPhotoUI(); setPhotoMenu(false);
      try {
        // File is already prepared: native sharing runs during the user's click activation.
        await navigator.share({ files: [view.file], title: `${model.heading} 공부 기록` });
      } catch (error) {
        if (current() && error?.name !== "AbortError") {
          status.hidden = false; status.textContent = "공유 메뉴를 열지 못했어요. 이미지를 저장해서 공유해 주세요.";
        }
      } finally { sharing = false; if (current()) { syncPhotoUI(); share.disabled = !view.file || !canShareFile(view.file); } }
    });
    function renderOptions() {
      optionList.replaceChildren(node("legend", "", "공유 이미지에 넣을 항목"));
      const available = [
        ...(period === "daily" ? [] : [["chart", period === "weekly" ? "요일별 그래프" : "공부 달력"]]),
        ["subjects", "과목별 공부시간", !model.subjects.length],
        ["completion", "할 일 달성률", !model.completion],
        ["studiedDays", "공부한 날"], ["average", "하루 평균"], ["maximum", "최고 기록"],
        ...(period === "daily" ? [["longest", "최대 집중시간"], ["start", "시작 시간"], ["end", "종료 시간"]] : []),
      ];
      for (const [key, label, unavailable] of available) {
        const item = node("label", "study-record-share-field");
        const input = node("input", ""); input.type = "checkbox";
        input.checked = !!fields[key] && !unavailable; input.disabled = !!unavailable;
        item.append(input, node("span", "", label + (unavailable ? " (기록 없음)" : "")));
        input.addEventListener("change", () => {
          fields[key] = input.checked;
          selections[period] = { ...fields };
          void refreshImage();
        });
        optionList.append(item);
      }
    }

    async function loadSelection(initialData) {
      if (!current()) { if (active === view) close(); return; }
      const ticket = ++recordRevision;
      const latest = () => {
        if (!current()) { if (active === view) close(); return false; }
        return ticket === recordRevision;
      };
      const selectedPeriod = selection.period, range = recordRange(selectedPeriod, selection.anchor);
      const from = dateParts(range.dateFrom), to = dateParts(range.dateTo);
      rangeTitle.textContent = selectedPeriod === "daily" ? dateLabel(range.dateFrom)
        : selectedPeriod === "monthly" ? `${from.year}년 ${from.month}월`
          : `${from.year}. ${from.month}.${from.day} – ${to.year !== from.year ? to.year + ". " : ""}${to.month}.${to.day}`;
      for (const button of periodButtons) {
        const selected = button.dataset.sharePeriod === selectedPeriod;
        button.classList.toggle("active", selected); button.setAttribute("aria-pressed", String(selected));
      }
      dialog.setAttribute("aria-label", `${PERIODS[selectedPeriod]} 기록 공유, ${rangeTitle.textContent}`);
      ready = false; ++revision;
      view.file = null;
      if (view.url) URL.revokeObjectURL(view.url);
      view.url = ""; preview.removeAttribute("src"); preview.hidden = true;
      save.disabled = true; share.disabled = true; options.hidden = true; retry.hidden = true; note.hidden = true;
      status.hidden = false; status.textContent = "공부 기록을 불러오는 중입니다.";
      syncPhotoUI(); setPhotoMenu(false);
      try {
        const record = initialData || await loadRecord(range);
        if (!latest()) return;
        if (!record || record.localOnly || record.ok === false || record.dateFrom !== range.dateFrom || record.dateTo !== range.dateTo) throw new Error("unconfirmed_record");
        if (Number(record.summary?.totalSeconds) === 0) {
          status.textContent = "이 기간에는 공유할 공부 기록이 없습니다. 다른 기간을 선택해 주세요.";
          return;
        }
        const nextModel = createModel(record, selectedPeriod, today);
        let plansFailed = false;
        if (loadPlans) {
          try { nextModel.completion = aggregatePlans(await loadPlans(range, today), nextModel.from, nextModel.to, today); }
          catch { plansFailed = true; }
        }
        if (!latest()) return;
        model = nextModel; period = selectedPeriod;
        fields = { ...defaultFields(period), ...selections[period] };
        preview.alt = `${model.heading} ${PERIODS[period]} 공부 기록`;
        note.hidden = !plansFailed;
        note.textContent = plansFailed ? "할 일 달성률을 불러오지 못해 공부시간만 표시합니다." : "";
        renderOptions(); options.hidden = false; ready = true;
        await refreshImage();
      } catch {
        if (!latest()) return;
        status.hidden = false; status.textContent = "이 기간의 기록을 불러오지 못했어요. 다시 불러오거나 다른 기간을 선택해 주세요.";
        retry.hidden = typeof loadRecord !== "function";
      }
    }
    await loadSelection(data);
  }

  const api = { open, close, createModel, aggregatePlans, duration, renderCard, canShareFile, recordRange, shiftRecordAnchor };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.StudyRecordShare = api;
})(typeof window !== "undefined" ? window : globalThis);
