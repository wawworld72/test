/**
 * 학번 정규화 순수 함수 (FR-058). 표기가 달라도(공백, 구분자, 자리수 등) 동일 학생으로
 * 인식되도록 정규화한 뒤에만 비교한다. SpreadsheetApp 등에 의존하지 않아 Node에서 바로
 * 테스트한다.
 */

function normalizeStudentId(raw) {
  if (raw === null || raw === undefined) {
    return '';
  }
  var value = String(raw).trim().replace(/[\s\-_]/g, '');
  if (/^\d+$/.test(value)) {
    value = value.replace(/^0+(?=\d)/, '');
  }
  return value.toUpperCase();
}

function studentIdsEqual(a, b) {
  return normalizeStudentId(a) === normalizeStudentId(b);
}

if (typeof module !== 'undefined') {
  module.exports = { normalizeStudentId: normalizeStudentId, studentIdsEqual: studentIdsEqual };
}
