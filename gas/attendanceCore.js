/**
 * doPost(e)로 받은 요청 바디를 검증하고 시트에 쓸 형태로 다듬는 순수 로직.
 * SpreadsheetApp 등 Apps Script 전용 API에 의존하지 않아 Node/Jest로 바로 테스트할 수 있다.
 * Apps Script 런타임은 프로젝트 내 모든 파일을 하나의 전역 스코프로 합치므로
 * Code.js에서 이 파일의 함수를 require 없이 그대로 호출한다.
 */

function isAuthorized(payload, expectedToken) {
  return !!expectedToken && !!payload && payload.token === expectedToken;
}

function normalizeSheetName(payload, fallback) {
  var name = payload && payload.sheetName;
  return (typeof name === 'string' && name.trim()) ? name.trim() : fallback;
}

function validateRows(rows) {
  if (!Array.isArray(rows)) {
    throw new Error('rows must be an array');
  }
  if (rows.length === 0) {
    return rows;
  }
  var width = rows[0].length;
  rows.forEach(function (row, i) {
    if (!Array.isArray(row) || row.length !== width) {
      throw new Error('row ' + i + ' has inconsistent length (expected ' + width + ')');
    }
  });
  return rows;
}

if (typeof module !== 'undefined') {
  module.exports = { isAuthorized: isAuthorized, normalizeSheetName: normalizeSheetName, validateRows: validateRows };
}
