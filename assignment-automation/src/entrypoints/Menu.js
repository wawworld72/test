/**
 * 시트를 열 때 보이는 메뉴. 메뉴는 비상 복구·최초 실행용이다(헌법 II) — 정상 운영에서 메뉴
 * 클릭이 필요한 기능은 Triggers.js의 시간 기반/onEdit 트리거로 대신한다.
 *
 * UI 호출(getUi/alert)은 이 진입점 계층에서만 허용된다(헌법 VI). logic/gateway 계층은 이
 * 함수들을 통해서만 간접적으로 사용자에게 결과를 보고한다.
 */

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('과제 자동화')
    .addItem('초기 설정', 'runInitialSetup')
    .addItem('정합성 검증', 'runValidation')
    .addItem('과제 행 생성', 'runCreateAssignmentRows')
    .addItem('현황 새로고침', 'runRefreshDashboard')
    .addSubMenu(
      ui
        .createMenu('예외 복구')
        .addItem('오류 과제 재진행', 'runRecoverErroredAssignment')
        .addItem('이의신청 재전송', 'runResendCorrectedGrade')
        .addItem('정의 변경 후 소급 재계산', 'runRecalculateGrades')
    )
    .addToUi();
}

/**
 * FR-041: 현황 시트를 최신 집계로 다시 그린다.
 */
function runRefreshDashboard() {
  runWithExclusiveLock('runRefreshDashboard', function () {
    var count = refreshDashboard();
    SpreadsheetApp.getUi().alert('현황 갱신 완료: ' + count + '개 과제 행.');
  });
}

/**
 * FR-043: 오류 상태로 일정에서 제외된 과제를 주제·역량과제로 지정해 재진행 대상으로
 * 되돌린다. 이미 오류가 아니면 아무 것도 바꾸지 않는다(FR-046 멱등).
 */
function runRecoverErroredAssignment() {
  var ui = SpreadsheetApp.getUi();
  var topicResponse = ui.prompt('오류 과제 재진행', '재진행할 과제의 주제를 입력하세요.', ui.ButtonSet.OK_CANCEL);
  if (topicResponse.getSelectedButton() !== ui.Button.OK) {
    return;
  }
  var topic = topicResponse.getResponseText().trim();
  var typeResponse = ui.prompt('오류 과제 재진행', '역량과제 유형을 입력하세요.', ui.ButtonSet.OK_CANCEL);
  if (typeResponse.getSelectedButton() !== ui.Button.OK) {
    return;
  }
  var competencyType = typeResponse.getResponseText().trim();

  runWithExclusiveLock('runRecoverErroredAssignment', function () {
    var ss = getBoundSpreadsheet();
    var formsSheet = getSheetOrThrow(ss, SHEET_NAMES.FORMS);
    var ledgerSheet = getSheetOrThrow(ss, SHEET_NAMES.LEDGER);
    var formsRow = readRowsAsObjects(formsSheet).filter(function (r) {
      return r['주제'] === topic && r['역량과제'] === competencyType;
    })[0];
    if (!formsRow) {
      ui.alert('해당 주제·역량과제의 과제 행을 찾지 못했습니다.');
      return;
    }
    var ledgerRows = readRowsAsObjects(ledgerSheet).filter(function (r) {
      return r['주제'] === topic && r['역량과제'] === competencyType;
    });
    var patch = recoverErroredAssignment(formsRow, ledgerRows);
    if (!patch) {
      ui.alert('이 과제는 오류 상태가 아닙니다 — 되돌릴 것이 없습니다.');
      return;
    }
    writeRowObjectsBatched(formsSheet, [Object.assign({ __row: formsRow.__row }, patch)]);
    rescheduleNextTrigger();
    ui.alert('재진행 처리됨: ' + JSON.stringify(patch));
  });
}

/**
 * FR-044: 이의신청에 따라 대장 시트에서 직접 수정한 점수를 재전송한다. 실제로 값이 바뀐
 * 학생만 다시 보내므로(shouldSendGrade) 여러 번 눌러도 안전하다(FR-046).
 */
function runResendCorrectedGrade() {
  var ui = SpreadsheetApp.getUi();
  var topicResponse = ui.prompt('이의신청 재전송', '재전송할 과제의 주제를 입력하세요.', ui.ButtonSet.OK_CANCEL);
  if (topicResponse.getSelectedButton() !== ui.Button.OK) {
    return;
  }
  var topic = topicResponse.getResponseText().trim();
  var typeResponse = ui.prompt('이의신청 재전송', '역량과제 유형을 입력하세요.', ui.ButtonSet.OK_CANCEL);
  if (typeResponse.getSelectedButton() !== ui.Button.OK) {
    return;
  }
  var competencyType = typeResponse.getResponseText().trim();

  runWithExclusiveLock('runResendCorrectedGrade', function () {
    var ss = getBoundSpreadsheet();
    var formsSheet = getSheetOrThrow(ss, SHEET_NAMES.FORMS);
    var formsRow = readRowsAsObjects(formsSheet).filter(function (r) {
      return r['주제'] === topic && r['역량과제'] === competencyType;
    })[0];
    if (!formsRow) {
      ui.alert('해당 주제·역량과제의 과제 행을 찾지 못했습니다.');
      return;
    }
    if (formsRow['진행상태'] !== PROGRESS_STATUS.EVALUATED && formsRow['진행상태'] !== PROGRESS_STATUS.RETURNED) {
      ui.alert('평가완료 또는 반환완료 상태인 과제만 재전송할 수 있습니다. 현재: ' + formsRow['진행상태']);
      return;
    }
    var courseId = readCourseConfigValue(ss, '코스식별자');
    var dryRun = String(readCourseConfigValue(ss, '드라이런')).toUpperCase() === 'TRUE';
    var result = returnGradesToClassroom(formsRow, courseId, dryRun);
    ui.alert('재전송 완료 — 전송:' + result.sent + ', 변경없음:' + result.skipped + ', 실패:' + result.failed);
  });
}

/**
 * FR-045: 역량과제정의를 변경한 뒤, 그 유형의 이미 채점된 대장 행 전부를 새 등급구간으로
 * 다시 산정하고, 그 결과로 값이 바뀐 과제만 골라 성적을 재전송한다(FR-046).
 */
function runRecalculateGrades() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.prompt('정의 변경 후 소급 재계산', '재계산할 역량과제 유형을 입력하세요.', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }
  var competencyType = response.getResponseText().trim();

  runWithExclusiveLock('runRecalculateGrades', function () {
    var ss = getBoundSpreadsheet();
    var definitionSheet = getSheetOrThrow(ss, SHEET_NAMES.ASSIGNMENT_DEFINITION);
    var ledgerSheet = getSheetOrThrow(ss, SHEET_NAMES.LEDGER);
    var formsSheet = getSheetOrThrow(ss, SHEET_NAMES.FORMS);

    var grouped = groupDefinitionRowsByType(readRowsAsObjects(definitionSheet));
    var typeDef = grouped.groups[competencyType];
    if (!typeDef) {
      ui.alert('역량과제정의에서 해당 유형을 찾지 못했습니다: ' + competencyType);
      return;
    }
    var bands = parseGradeBands(typeDef[0]['등급구간']);

    var ledgerRows = readRowsAsObjects(ledgerSheet).filter(function (r) {
      return r['역량과제'] === competencyType;
    });
    var updates = recalculateGradesForType(ledgerRows, bands);
    if (updates.length > 0) {
      writeRowObjectsBatched(ledgerSheet, updates);
    }

    var courseId = readCourseConfigValue(ss, '코스식별자');
    var dryRun = String(readCourseConfigValue(ss, '드라이런')).toUpperCase() === 'TRUE';
    var affectedTopics = {};
    updates.forEach(function (u) {
      var row = ledgerRows.filter(function (r) {
        return r.__row === u.__row;
      })[0];
      if (row) {
        affectedTopics[row['주제']] = true;
      }
    });
    var resent = 0;
    Object.keys(affectedTopics).forEach(function (topic) {
      var formsRow = readRowsAsObjects(formsSheet).filter(function (r) {
        return r['주제'] === topic && r['역량과제'] === competencyType;
      })[0];
      if (formsRow && (formsRow['진행상태'] === PROGRESS_STATUS.EVALUATED || formsRow['진행상태'] === PROGRESS_STATUS.RETURNED)) {
        var result = returnGradesToClassroom(formsRow, courseId, dryRun);
        resent += result.sent;
      }
    });

    ui.alert('재계산된 대장 행 ' + updates.length + '개, 재전송된 성적 ' + resent + '건.');
  });
}

function runCreateAssignmentRows() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.prompt('과제 행 생성', '몇 주차의 과제를 생성할까요? (숫자만 입력)', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }
  var weekNumber = Number(response.getResponseText().trim());
  if (!weekNumber) {
    ui.alert('올바른 주차 번호를 입력해야 합니다.');
    return;
  }

  runWithExclusiveLock('runCreateAssignmentRows', function () {
    var validationResult = validateConfig();
    if (!validationResult.ok) {
      reportValidationResult_(validationResult, '정합성 검증 실패 — 과제 행을 생성하지 않음');
      return;
    }
    var created = createAssignmentRowsForWeek(weekNumber);
    var ledgerCreated = createLedgerRowsForActiveAssignments();
    rescheduleNextTrigger();
    ui.alert(
      weekNumber + '주차 과제 행 ' + created + '개, 역량과제 대장 행 ' + ledgerCreated + '개 생성됨. ' +
        '폼·Classroom 게시는 다음 자동 실행에서 이어집니다.'
    );
  });
}

function runInitialSetup() {
  runWithExclusiveLock('runInitialSetup', function () {
    var result = bootstrapConfigSheets();
    ensureInstallableTriggers();
    reportValidationResult_(result, '초기 설정');
  });
}

function runValidation() {
  runWithExclusiveLock('runValidation', function () {
    var result = validateConfig();
    reportValidationResult_(result, '정합성 검증');
  });
}

function reportValidationResult_(result, label) {
  var ui = SpreadsheetApp.getUi();
  if (result.ok) {
    ui.alert(label + ' 완료: 문제가 없습니다.');
  } else {
    ui.alert(label + ' 실패:\n- ' + result.issues.join('\n- '));
  }
}
