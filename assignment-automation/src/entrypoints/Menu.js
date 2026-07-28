/**
 * 시트를 열 때 보이는 메뉴. 메뉴는 비상 복구·최초 실행용이다(헌법 II) — 정상 운영에서 메뉴
 * 클릭이 필요한 기능은 Triggers.js의 시간 기반/onEdit 트리거로 대신한다.
 *
 * UI 호출(getUi/alert)은 이 진입점 계층에서만 허용된다(헌법 VI). logic/gateway 계층은 이
 * 함수들을 통해서만 간접적으로 사용자에게 결과를 보고한다.
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('과제 자동화')
    .addItem('초기 설정', 'runInitialSetup')
    .addItem('정합성 검증', 'runValidation')
    .addItem('과제 행 생성', 'runCreateAssignmentRows')
    .addToUi();
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
