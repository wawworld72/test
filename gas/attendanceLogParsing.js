/**
 * fetchCourseDataAndLog()가 GitHub Actions job 로그 텍스트에서 실제 출결/토론방
 * 결과 구간만 잘라내는 순수 로직. UrlFetchApp 호출 자체는 Code.js에서 하고,
 * 여기서는 문자열 처리만 담당해 Node/Jest로 테스트한다.
 */

var ATTENDANCE_LOG_START = '=== ATTENDANCE_LONG';
var ATTENDANCE_LOG_END = '=== END ATTENDANCE_LONG ===';
var FORUM_EXPORT_LOG_START = '=== FORUM_EXPORT';
var FORUM_EXPORT_LOG_END = '=== END FORUM_EXPORT ===';

function extractLogSection(logText, startMarker, endMarker, label) {
  var start = logText.indexOf(startMarker);
  var end = logText.indexOf(endMarker);
  if (start === -1 || end === -1) {
    return label + ' 구간을 로그에서 찾지 못했습니다. 최근 로그:\n' + logText.slice(-2000);
  }
  return logText.slice(start, end + endMarker.length);
}

function extractAttendanceSection(logText) {
  return extractLogSection(logText, ATTENDANCE_LOG_START, ATTENDANCE_LOG_END, '출결 결과');
}

function extractForumExportSection(logText) {
  return extractLogSection(logText, FORUM_EXPORT_LOG_START, FORUM_EXPORT_LOG_END, '토론방 결과');
}

function authHeaders(token) {
  return { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' };
}

if (typeof module !== 'undefined') {
  module.exports = {
    extractAttendanceSection: extractAttendanceSection,
    extractForumExportSection: extractForumExportSection,
    authHeaders: authHeaders
  };
}
