const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync("student.js", "utf8");
const start = source.indexOf("function renderStudentAnswerQuestion");
const end = source.indexOf("\nfunction renderStudentAnswerNav", start);
const functionSource = start >= 0 && end > start ? source.slice(start, end) : "";

assert.ok(functionSource, "renderStudentAnswerQuestion source should be available");

class FakeClassList {
  constructor(className = "") {
    this.values = new Set(String(className).split(/\s+/).filter(Boolean));
  }

  add(value) {
    this.values.add(value);
  }

  toggle(value, enabled) {
    if (enabled) this.values.add(value);
    else this.values.delete(value);
  }

  contains(value) {
    return this.values.has(value);
  }
}

class FakeElement {
  constructor(className = "", children = []) {
    this.classList = new FakeClassList(className);
    this.children = children.filter(Boolean);
    this.attributes = {};
    this.disabled = false;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  querySelectorAll(selector) {
    const result = [];
    const className = selector.startsWith(".") ? selector.slice(1) : "";
    const visit = (node) => {
      if (node?.classList?.contains(className)) result.push(node);
      (node?.children || []).forEach(visit);
    };
    this.children.forEach(visit);
    return result;
  }
}

const studentExamDraft = {
  answers: {},
  locked: {},
  editing: {},
  saving: false,
};
const notices = [];

function button(label, className, type, onClick) {
  const node = new FakeElement(className);
  node.label = label;
  node.type = type;
  node.click = onClick;
  return node;
}

function el(tag, attrs = {}, children = []) {
  const node = new FakeElement(attrs.className || "", Array.isArray(children) ? children : [children]);
  node.tag = tag;
  return node;
}

function notify(message) {
  notices.push(message);
}

function toCircledAnswer(value) {
  return ["", "①", "②", "③", "④"][Number(value)] || "-";
}

const renderStudentAnswerQuestion = new Function(
  "studentExamDraft",
  "button",
  "el",
  "notify",
  "toCircledAnswer",
  `${functionSource}; return renderStudentAnswerQuestion;`
)(studentExamDraft, button, el, notify, toCircledAnswer);

const row = renderStudentAnswerQuestion(7, 2);
const choices = row.querySelectorAll(".answer-choice");

assert.equal(choices.length, 4);
choices[2].click();
assert.equal(studentExamDraft.answers[7], 3);
assert.equal(studentExamDraft.locked[7], true);
assert.equal(row.classList.contains("answered"), true);
assert.deepEqual(choices.map((choice) => choice.classList.contains("selected")), [false, false, true, false]);
assert.deepEqual(choices.map((choice) => choice.attributes["aria-pressed"]), ["false", "false", "true", "false"]);
assert.equal(notices.length, 0, "the first answer should not show a change notice");

choices[0].click();
assert.equal(studentExamDraft.answers[7], 1);
assert.deepEqual(choices.map((choice) => choice.classList.contains("selected")), [true, false, false, false]);
assert.deepEqual(choices.map((choice) => choice.attributes["aria-pressed"]), ["true", "false", "false", "false"]);
assert.equal(notices.length, 1, "changing an existing answer should show one notice");

studentExamDraft.saving = true;
choices[3].click();
assert.equal(studentExamDraft.answers[7], 1, "answer changes must be ignored while saving");

console.log("answer UI tests passed");
