/**
 * 출결 결과를 이 스크립트가 바인딩된 스프레드시트에 기록하는 웹앱.
 * GitHub Actions(scripts/push_to_sheet.py)가 스크레이핑 직후 이 웹앱의 /exec URL로
 * {token, sheetName, rows} JSON을 POST하면 doPost가 해당 시트 탭을 통째로 덮어쓴다.
 */

var DEFAULT_SHEET_NAME = 'Attendance';

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var expectedToken = PropertiesService.getScriptProperties().getProperty('API_TOKEN');

    if (!isAuthorized(payload, expectedToken)) {
      return jsonOutput({ ok: false, error: 'unauthorized' });
    }

    var rows = validateRows(payload.rows || []);
    var sheetName = normalizeSheetName(payload, DEFAULT_SHEET_NAME);
    writeRowsToSheet(sheetName, rows);

    return jsonOutput({ ok: true, sheetName: sheetName, rowCount: rows.length });
  } catch (err) {
    return jsonOutput({ ok: false, error: err.message });
  }
}

function writeRowsToSheet(sheetName, rows) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  sheet.clearContents();
  if (rows.length === 0) {
    return;
  }
  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Apps Script 편집기에서 한 번 수동 실행해 API_TOKEN 스크립트 속성을 생성한다.
 * 실행 로그(보기 > 실행 기록)에 출력된 토큰을 GitHub Secret GAS_API_TOKEN에 등록한다.
 */
function setupApiToken() {
  var token = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperty('API_TOKEN', token);
  Logger.log('API_TOKEN = ' + token);
  return token;
}
