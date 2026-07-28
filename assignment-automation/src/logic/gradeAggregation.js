/**
 * UC-28/FR-048: 학기 말 누적 성적 집계 — 학생별로 여러 주차·과제의 반영값(점수)을 유형별
 * 가중치(역량과제정의의 누적반영가중치, 유형 단위)로 가중합산해 최종 성적과 산출 근거
 * (반영값별 기여도)를 만든다. 이 집계는 파생값일 뿐 등급구간 자체를 바꾸지 않는다.
 */

var GRADE_AGGREGATION_SHEET_NAME = '누적성적';
var GRADE_AGGREGATION_HEADERS = ['학번', '최종성적', '기여도'];

/**
 * ledgerRows: 역량과제 대장 전체. weightByType: 역량과제 유형 → 가중치. 수집상태가 완료이고
 * 점수가 확정된 행만 집계 대상이다. 가중치가 0이거나 없는 유형은 집계에서 제외한다.
 */
function aggregateStudentGrades(ledgerRows, weightByType) {
  var byStudent = {};

  ledgerRows
    .filter(function (row) {
      return row['수집상태'] === '완료' && row['점수'] !== '' && row['점수'] !== null && row['점수'] !== undefined;
    })
    .forEach(function (row) {
      var weight = Number(weightByType[row['역량과제']]) || 0;
      if (weight === 0) {
        return;
      }
      var key = normalizeStudentId(row['학번']);
      if (!byStudent[key]) {
        byStudent[key] = { 학번: row['학번'], contributions: [], weightedSum: 0, weightTotal: 0 };
      }
      var score = Number(row['점수']) || 0;
      var contribution = score * weight;
      byStudent[key].contributions.push({
        주제: row['주제'],
        역량과제: row['역량과제'],
        점수: score,
        가중치: weight,
        기여도: contribution,
      });
      byStudent[key].weightedSum += contribution;
      byStudent[key].weightTotal += weight;
    });

  var result = {};
  Object.keys(byStudent).forEach(function (key) {
    var entry = byStudent[key];
    result[key] = {
      학번: entry.학번,
      최종성적: entry.weightTotal > 0 ? entry.weightedSum / entry.weightTotal : 0,
      기여도: entry.contributions,
    };
  });
  return result;
}

/**
 * 역량과제정의에서 유형별 가중치를 뽑아낸다(유형 단위 속성, 첫 행 값만 유효).
 */
function buildWeightByType_(groupedDefinitions) {
  var weightByType = {};
  Object.keys(groupedDefinitions.groups).forEach(function (type) {
    var firstRow = groupedDefinitions.groups[type][0];
    weightByType[type] = Number(firstRow['누적반영가중치']) || 0;
  });
  return weightByType;
}

function formatContributions_(contributions) {
  return contributions
    .map(function (c) {
      return c.주제 + '·' + c.역량과제 + ':' + c.점수 + '(가중치' + c.가중치 + ', 기여' + c.기여도.toFixed(2) + ')';
    })
    .join('; ');
}

/**
 * "누적성적" 시트를 최신 집계로 통째로 다시 쓴다(파생 뷰라서 부분 갱신 대신 항상 전체
 * 재작성 — refreshDashboard와 같은 관례).
 */
function aggregateAndWriteGrades() {
  var ss = getBoundSpreadsheet();
  var ledgerSheet = getSheetOrThrow(ss, SHEET_NAMES.LEDGER);
  var definitionSheet = getSheetOrThrow(ss, SHEET_NAMES.ASSIGNMENT_DEFINITION);

  var grouped = groupDefinitionRowsByType(readRowsAsObjects(definitionSheet));
  var weightByType = buildWeightByType_(grouped);
  var aggregated = aggregateStudentGrades(readRowsAsObjects(ledgerSheet), weightByType);

  var sheet = ensureSheetWithHeaders(ss, GRADE_AGGREGATION_SHEET_NAME, GRADE_AGGREGATION_HEADERS);
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, GRADE_AGGREGATION_HEADERS.length).clearContent();
  }
  var rows = Object.keys(aggregated).map(function (key) {
    var entry = aggregated[key];
    return [entry.학번, entry.최종성적, formatContributions_(entry.기여도)];
  });
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, GRADE_AGGREGATION_HEADERS.length).setValues(rows);
  }
  return rows.length;
}

if (typeof module !== 'undefined') {
  module.exports = {
    aggregateStudentGrades: aggregateStudentGrades,
    aggregateAndWriteGrades: aggregateAndWriteGrades,
  };
}
