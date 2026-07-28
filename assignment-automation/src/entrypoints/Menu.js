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
    .addToUi();
}

function runInitialSetup() {
  runWithExclusiveLock('runInitialSetup', function () {
    var result = bootstrapConfigSheets();
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
