/**
 * fetchAttendanceAndLog()가 GitHub Actions job 로그 텍스트에서 실제 출결 결과
 * 구간만 잘라내는 순수 로직. UrlFetchApp 호출 자체는 Code.js에서 하고, 여기서는
 * 문자열 처리만 담당해 Node/Jest로 테스트한다.
 */

var ATTENDANCE_LOG_START = '=== ATTENDANCE_LONG';
var ATTENDANCE_LOG_END = '=== END ATTENDANCE_LONG ===';

function extractAttendanceSection(logText) {
  var start = logText.indexOf(ATTENDANCE_LOG_START);
  var end = logText.indexOf(ATTENDANCE_LOG_END);
  if (start === -1 || end === -1) {
    return '출결 결과 구간을 로그에서 찾지 못했습니다. 최근 로그:\n' + logText.slice(-2000);
  }
  return logText.slice(start, end + ATTENDANCE_LOG_END.length);
}

function authHeaders(token) {
  return { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' };
}

if (typeof module !== 'undefined') {
  module.exports = { extractAttendanceSection: extractAttendanceSection, authHeaders: authHeaders };
}
