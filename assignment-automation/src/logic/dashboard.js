/**
 * UC-25/FR-041: 주차·유형별 게시상태·진행상태, 제출/미제출, 대기 중인 처리, 실패 항목을
 * 교사가 한 화면(현황 시트)에서 확인할 수 있도록 집계한다. Forms를 그대로 읽어 만드는 파생
 * 뷰이며 자체 상태를 저장하지 않는다 — 매번 다시 계산해도 항상 최신값이다.
 */

var DASHBOARD_SHEET_NAME = '현황';
var DASHBOARD_HEADERS = ['주차', '주제', '역량과제', '게시상태', '진행상태', '제출수', '미제출수', '대기중처리', '실패'];

function buildDashboardRows(formsRows) {
  return formsRows
    .filter(function (row) {
      return row['활성'] === true || row['활성'] === 'TRUE';
    })
    .map(function (row) {
      var isError = row['게시상태'] === PUBLISH_STATUS.ERROR || row['진행상태'] === PROGRESS_STATUS.ERROR;
      var isPending = !isError && row['진행상태'] !== PROGRESS_STATUS.RETURNED;
      return {
        주차: row['주차'],
        주제: row['주제'],
        역량과제: row['역량과제'],
        게시상태: row['게시상태'],
        진행상태: row['진행상태'],
        제출수: row['제출수'] || 0,
        미제출수: row['미제출수'] || 0,
        대기중처리: isPending ? 'Y' : '',
        실패: isError ? 'Y' : '',
      };
    });
}

/**
 * 현황 시트를 최신 집계로 통째로 덮어쓴다(파생 뷰라서 부분 갱신 대신 항상 전체 재작성).
 */
function refreshDashboard() {
  var ss = getBoundSpreadsheet();
  var formsSheet = getSheetOrThrow(ss, SHEET_NAMES.FORMS);
  var rows = buildDashboardRows(readRowsAsObjects(formsSheet));

  var sheet = ensureSheetWithHeaders(ss, DASHBOARD_SHEET_NAME, DASHBOARD_HEADERS);
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, DASHBOARD_HEADERS.length).clearContent();
  }
  if (rows.length > 0) {
    var values = rows.map(function (r) {
      return DASHBOARD_HEADERS.map(function (h) {
        return r[h];
      });
    });
    sheet.getRange(2, 1, values.length, DASHBOARD_HEADERS.length).setValues(values);
  }
  return rows.length;
}

/**
 * FR-042: 하루 치 실패/대기 항목만 추려 사람이 읽는 요약 텍스트로 만든다. 건별 알림이 아닌
 * 1일 1회 통지의 본문으로 쓰인다.
 */
function buildDailySummaryText(rows) {
  var failed = rows.filter(function (r) {
    return r.실패 === 'Y';
  });
  var pending = rows.filter(function (r) {
    return r.대기중처리 === 'Y' && r.실패 !== 'Y';
  });

  var lines = [];
  lines.push('[실패 항목] ' + failed.length + '건');
  failed.forEach(function (r) {
    lines.push('- ' + r.주제 + ' / ' + r.역량과제 + ' (게시상태:' + r.게시상태 + ', 진행상태:' + r.진행상태 + ')');
  });
  lines.push('');
  lines.push('[대기 중인 처리] ' + pending.length + '건');
  pending.forEach(function (r) {
    lines.push('- ' + r.주제 + ' / ' + r.역량과제 + ' (진행상태:' + r.진행상태 + ')');
  });
  return lines.join('\n');
}

if (typeof module !== 'undefined') {
  module.exports = {
    buildDashboardRows: buildDashboardRows,
    buildDailySummaryText: buildDailySummaryText,
  };
}
