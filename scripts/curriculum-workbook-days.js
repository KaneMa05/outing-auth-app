// Extracted from the "비고" column of 론박_커리큘럼_DB.xlsx.
// Each number is the lecture count for that subject's sequential n일차 group.
const CURRICULUM_WORKBOOK_DAY_COUNTS = Object.freeze({
  "criminal-law": [1, 3, 4, 3, 4, 4, 4, 3, 5, 5, 5, 5, 4, 5, 7, 6, 4, 3, 5, 4, 4, 4, 4, 4, 3, 3, 2],
  "coast-guard-intro": [2, 6, 5, 5, 4, 5, 3, 5, 5, 6, 3, 5, 6, 7, 6, 4, 3, 4, 2],
  "maritime-law": [2, 4, 5, 5, 7, 5, 12, 3, 2, 6, 6, 7, 6, 3],
  "navigation-technique": [1, 4, 3, 4, 4, 3, 4, 4, 3, 4, 6, 4, 3, 2, 3, 4, 3, 4, 3],
  "marine-engineering": [1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 3, 3, 3, 3, 3, 2, 3],
  "maritime-english": [1, 5, 5, 5, 5, 4, 4, 5, 4, 4, 4, 5],
});

module.exports = { CURRICULUM_WORKBOOK_DAY_COUNTS };
