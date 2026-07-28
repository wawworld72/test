/**
 * UC-07/UC-11: 주차 지정 → 과제 행 생성, 활성 과제×수강생 교차로 역량과제 대장 행 생성
 * (FR-010~012, FR-016). Google 서비스 호출은 sheetsGateway를 통해서만 한다(헌법 VI).
 */

function createAssignmentRowsForWeek(weekNumber) {
  var ss = getBoundSpreadsheet();
  var weekSheet = getSheetOrThrow(ss, SHEET_NAMES.WEEKS);
  var weekRow = readRowsAsObjects(weekSheet).filter(function (w) {
    return Number(w['주차']) === Number(weekNumber);
  })[0];
  if (!weekRow) {
    throw new Error('주차 시트에서 ' + weekNumber + '주차를 찾을 수 없습니다');
  }

  var definitionSheet = getSheetOrThrow(ss, SHEET_NAMES.ASSIGNMENT_DEFINITION);
  var grouped = groupDefinitionRowsByType(readRowsAsObjects(definitionSheet));

  var formsSheet = getSheetOrThrow(ss, SHEET_NAMES.FORMS);
  var existingRows = readRowsAsObjects(formsSheet);
  var existingKeys = {};
  existingRows.forEach(function (row) {
    existingKeys[row['주제'] + '::' + row['역량과제']] = true;
  });

  var defaultEndTime = readCourseConfigValue(ss, '기본종료시각') || '18:00';
  var newRows = [];

  grouped.order.forEach(function (type) {
    var key = weekRow['주제'] + '::' + type;
    if (existingKeys[key]) {
      return;
    }
    var typeDef = grouped.groups[type][0];
    var schedule = computeAssignmentSchedule_(
      weekRow['수업일'],
      Number(typeDef['시작오프셋']),
      Number(typeDef['기간']),
      defaultEndTime
    );
    newRows.push({
      활성: true,
      주차: weekRow['주차'],
      주제: weekRow['주제'],
      역량과제: type,
      시작override: '',
      종료override: '',
      비고: '',
      시작: schedule.start,
      종료: schedule.end,
      생성Form: '',
      응답시트: '',
      과제ID: '',
      게시상태: PUBLISH_STATUS.PENDING,
      진행상태: PROGRESS_STATUS.PENDING,
      제출수: '',
      미제출수: '',
      성적전송: false,
      전송시각: '',
    });
  });

  appendRowObjects_(formsSheet, newRows);
  return newRows.length;
}

function computeAssignmentSchedule_(classDate, startOffsetDays, durationDays, defaultEndTimeText) {
  var start = new Date(classDate);
  start.setDate(start.getDate() + startOffsetDays);

  var end = new Date(start);
  end.setDate(end.getDate() + durationDays);
  applyTimeOfDay_(end, defaultEndTimeText);

  return { start: start, end: end };
}

function applyTimeOfDay_(date, hhmm) {
  var parts = String(hhmm).split(':');
  var hours = Number(parts[0]);
  var minutes = Number(parts[1]) || 0;
  date.setHours(hours, minutes, 0, 0);
}

/**
 * override가 있으면 그 값을 우선한다(FR-011). 이후 트리거가 실제 시작/종료를 판단할 때
 * 항상 이 함수를 통해 유효 일정을 구한다.
 */
function resolveEffectiveSchedule(formsRow) {
  return {
    start: formsRow['시작override'] || formsRow['시작'],
    end: formsRow['종료override'] || formsRow['종료'],
  };
}

function readCourseConfigValue(ss, key) {
  var sheet = ss.getSheetByName(SHEET_NAMES.COURSE_CONFIG);
  var rows = readRowsAsObjects(sheet);
  var match = rows.filter(function (row) {
    return row['키'] === key;
  })[0];
  return match ? match['값'] : null;
}

function appendRowObjects_(sheet, rowObjects) {
  if (rowObjects.length === 0) {
    return;
  }
  var headerMap = getHeaderMap(sheet);
  var headerNames = Object.keys(headerMap).sort(function (a, b) {
    return headerMap[a] - headerMap[b];
  });
  var startRow = sheet.getLastRow() + 1;
  var values = rowObjects.map(function (obj) {
    return headerNames.map(function (name) {
      return Object.prototype.hasOwnProperty.call(obj, name) ? obj[name] : '';
    });
  });
  sheet.getRange(startRow, 1, values.length, headerNames.length).setValues(values);
}

/**
 * 활성 과제×수강생 교차로 역량과제 대장 행을 만든다(FR-016). 이미 있는 조합은 건드리지 않는다.
 */
function createLedgerRowsForActiveAssignments() {
  var ss = getBoundSpreadsheet();
  var formsSheet = getSheetOrThrow(ss, SHEET_NAMES.FORMS);
  var rosterSheet = getSheetOrThrow(ss, SHEET_NAMES.ROSTER);
  var ledgerSheet = getSheetOrThrow(ss, SHEET_NAMES.LEDGER);
  var definitionSheet = getSheetOrThrow(ss, SHEET_NAMES.ASSIGNMENT_DEFINITION);

  var activeAssignments = readRowsAsObjects(formsSheet).filter(function (row) {
    return row['활성'] === true || row['활성'] === 'TRUE';
  });
  var students = readRowsAsObjects(rosterSheet);
  var grouped = groupDefinitionRowsByType(readRowsAsObjects(definitionSheet));

  var existingKeys = {};
  readRowsAsObjects(ledgerSheet).forEach(function (row) {
    var studentKey = normalizeStudentId(row['학번']);
    existingKeys[row['주제'] + '::' + row['역량과제'] + '::' + studentKey] = true;
  });

  var newRows = [];
  activeAssignments.forEach(function (assignment) {
    var typeRows = grouped.groups[assignment['역량과제']] || [];
    var maxScore = typeRows.reduce(function (sum, row) {
      return sum + (Number(row['배점']) || 0);
    }, 0);

    students.forEach(function (student) {
      var studentKey = normalizeStudentId(student['학번']);
      var key = assignment['주제'] + '::' + assignment['역량과제'] + '::' + studentKey;
      if (existingKeys[key]) {
        return;
      }
      existingKeys[key] = true;
      newRows.push({
        주제: assignment['주제'],
        역량과제: assignment['역량과제'],
        이름: student['이름'],
        학번: student['학번'],
        평가: '',
        원점수: '',
        만점: maxScore,
        피드백: '',
        점수: '',
        수집상태: '대기',
        반영: '',
        비고: '',
      });
    });
  });

  appendRowObjects_(ledgerSheet, newRows);
  return newRows.length;
}

if (typeof module !== 'undefined') {
  module.exports = {
    createAssignmentRowsForWeek: createAssignmentRowsForWeek,
    resolveEffectiveSchedule: resolveEffectiveSchedule,
    createLedgerRowsForActiveAssignments: createLedgerRowsForActiveAssignments,
  };
}
