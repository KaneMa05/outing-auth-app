const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.resolve(__dirname, "..", "teacher-students.js"), "utf8");
assert.match(source, /button\("엑셀 다운로드"/);
assert.match(source, /downloadStudentCohortWorkbook\(selectedCohort, students\)/);
assert.match(source, /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/);

const functionNames = [
  "createStudentCohortWorkbookBlob",
  "createStudentRosterSheetXml",
  "createStoredZip",
  "workbookCrc32",
  "workbookColumnName",
  "escapeWorkbookXml",
  "sanitizeWorkbookSheetName",
];
const snippets = functionNames.map((name) => {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  let depth = 0;
  let bodyStarted = false;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === "{") {
      depth += 1;
      bodyStarted = true;
    } else if (source[index] === "}") {
      depth -= 1;
      if (bodyStarted && depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Could not extract ${name}`);
}).join("\n");

const context = { Blob, TextEncoder, Uint8Array, DataView };
vm.createContext(context);
vm.runInContext(snippets, context);

(async () => {
  const blob = context.createStudentCohortWorkbookBlob("18기", [
    ["등록번호", "이름"],
    ["18001", "홍길동 & 친구"],
  ]);
  assert.equal(blob.type, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  const text = new TextDecoder().decode(bytes);
  assert.match(text, /xl\/worksheets\/sheet1\.xml/);
  assert.match(text, /홍길동 &amp; 친구/);
  assert.match(text, /autoFilter ref="A1:B2"/);
  console.log("student roster export tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
