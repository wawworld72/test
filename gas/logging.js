/**
 * "Logs" 시트 탭에 실행 기록을 남기기 위한 순수 로직 (행 포맷 + 트림 계산).
 * 실제 시트 읽기/쓰기(appendLog, readRecentLogs)는 Code.js에서 SpreadsheetApp으로 수행한다.
 *
 * Apps Script 실행 로그는 짧게만 남고 Cloud Logging은 별도 GCP 프로젝트 연결/API 활성화가
 * 필요해 조회가 번거로우므로, 같은 스프레드시트에 로그를 직접 적재해 doGet으로 꺼내 보는
 * 우회 경로를 쓴다.
 */

var LOG_SHEET_NAME = 'Logs';
var LOG_HEADER = ['시간', '레벨', '출처', '메시지', '상세'];
var MAX_LOG_ROWS = 500;

function formatLogRow(timestampIso, level, source, message, details) {
  var detailsText = (details === undefined || details === null) ? '' : JSON.stringify(details);
  return [timestampIso, level, source, String(message), detailsText];
}

/**
 * dataRowCount(헤더 제외 현재 데이터 행 수)가 maxRows를 넘으면 몇 행을 지워야
 * 다시 maxRows 이하가 되는지 계산한다. 넘지 않으면 0.
 */
function rowsToTrim(dataRowCount, maxRows) {
  var limit = maxRows || MAX_LOG_ROWS;
  return dataRowCount > limit ? dataRowCount - limit : 0;
}

if (typeof module !== 'undefined') {
  module.exports = {
    formatLogRow: formatLogRow,
    rowsToTrim: rowsToTrim,
    LOG_SHEET_NAME: LOG_SHEET_NAME,
    LOG_HEADER: LOG_HEADER,
    MAX_LOG_ROWS: MAX_LOG_ROWS,
  };
}
