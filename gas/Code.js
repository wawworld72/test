/**
 * 출결 결과를 이 스크립트가 바인딩된 스프레드시트에 기록하는 웹앱.
 * GitHub Actions(scripts/push_to_sheet.py)가 스크레이핑 직후 이 웹앱의 /exec URL로
 * {token, sheetName, rows} JSON을 POST하면 doPost가 해당 시트 탭을 통째로 덮어쓴다.
 *
 * doGet(.../exec?token=...&limit=50)은 같은 토큰으로 "Logs" 탭의 최근 실행 기록을
 * JSON으로 돌려준다. Apps Script 실행 로그는 금방 사라지고 Cloud Logging은 별도 GCP
 * 설정이 필요해 조회가 번거로우므로, 대신 이 엔드포인트를 curl 등으로 직접 호출해 확인한다.
 */

var DEFAULT_SHEET_NAME = 'Attendance';

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var expectedToken = PropertiesService.getScriptProperties().getProperty('API_TOKEN');

    if (!isAuthorized(payload, expectedToken)) {
      appendLog('WARN', 'doPost', 'unauthorized request', {});
      return jsonOutput({ ok: false, error: 'unauthorized' });
    }

    var rows = validateRows(payload.rows || []);
    var sheetName = normalizeSheetName(payload, DEFAULT_SHEET_NAME);
    writeRowsToSheet(sheetName, rows);

    appendLog('INFO', 'doPost', 'sheet updated', { sheetName: sheetName, rowCount: rows.length });
    return jsonOutput({ ok: true, sheetName: sheetName, rowCount: rows.length });
  } catch (err) {
    appendLog('ERROR', 'doPost', err.message, { stack: err.stack });
    return jsonOutput({ ok: false, error: err.message });
  }
}

function doGet(e) {
  var params = (e && e.parameter) || {};
  var expectedToken = PropertiesService.getScriptProperties().getProperty('API_TOKEN');

  if (!expectedToken || params.token !== expectedToken) {
    return jsonOutput({ ok: false, error: 'unauthorized' });
  }

  var limit = Math.min(parseInt(params.limit, 10) || 50, MAX_LOG_ROWS);
  return jsonOutput({ ok: true, logs: readRecentLogs(limit) });
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
 * "Logs" 탭에 한 줄을 추가하고 MAX_LOG_ROWS를 넘으면 오래된 행부터 정리한다.
 * 로깅 자체가 실패해도 원래 요청 처리를 막지 않도록 예외를 삼킨다.
 */
function appendLog(level, source, message, details) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(LOG_SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(LOG_SHEET_NAME);
      sheet.appendRow(LOG_HEADER);
    }
    sheet.appendRow(formatLogRow(new Date().toISOString(), level, source, message, details));

    var trim = rowsToTrim(sheet.getLastRow() - 1, MAX_LOG_ROWS);
    if (trim > 0) {
      sheet.deleteRows(2, trim);
    }
  } catch (err) {
    Logger.log('appendLog failed: ' + err.message);
  }
}

function readRecentLogs(limit) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(LOG_SHEET_NAME);
  if (!sheet || sheet.getLastRow() <= 1) {
    return [];
  }
  var lastRow = sheet.getLastRow();
  var startRow = Math.max(2, lastRow - limit + 1);
  var numRows = lastRow - startRow + 1;
  var values = sheet.getRange(startRow, 1, numRows, LOG_HEADER.length).getValues();
  return values
    .map(function (row) {
      return { time: row[0], level: row[1], source: row[2], message: row[3], details: row[4] };
    })
    .reverse();
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

/**
 * 시트를 열 때 "출결 갱신" 메뉴를 추가한다. 스크래핑을 GitHub Actions의
 * workflow_dispatch API로 직접 트리거하는 버튼 역할.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('출결 갱신')
    .addItem('Hoseo 출결 갱신 요청', 'triggerHoseoWorkflow')
    .addItem('IBK 출결 갱신 요청', 'triggerIbkWorkflow')
    .addToUi();
}

var GITHUB_OWNER = 'wawworld72';
var GITHUB_REPO = 'test';

function triggerHoseoWorkflow() {
  dispatchWorkflow('attendance-scrape.yml', {});
}

/**
 * 교과목명만으로는 같은 과목에 분반이 여러 개일 때 어느 분반인지 정할 수 없다 -
 * ibk_attendance_scraper.py도 이 경우 아무거나 하나를 조용히 고르지 않고 "분반을
 * 지정해달라"며 실패하도록 짜여 있으므로, 여기서도 분반을 같이 물어봐서 넘긴다.
 * 분반이 하나뿐인 과목이면 빈 값으로 둬도 그대로 동작한다.
 */
function triggerIbkWorkflow() {
  var ui = SpreadsheetApp.getUi();
  var courseResponse = ui.prompt('IBK 출결 갱신', '조회할 교과목명을 입력하세요 (필수)', ui.ButtonSet.OK_CANCEL);
  if (courseResponse.getSelectedButton() !== ui.Button.OK) {
    return;
  }
  var courseName = courseResponse.getResponseText().trim();
  if (!courseName) {
    ui.alert('교과목명을 입력해야 합니다.');
    return;
  }

  var sectionResponse = ui.prompt(
    'IBK 출결 갱신',
    '분반을 입력하세요 (같은 과목에 분반이 여러 개일 때만 필요 - 하나뿐이면 비워두세요)',
    ui.ButtonSet.OK_CANCEL
  );
  if (sectionResponse.getSelectedButton() !== ui.Button.OK) {
    return;
  }
  var section = sectionResponse.getResponseText().trim();

  dispatchWorkflow('ibk-attendance-scrape.yml', { course_name: courseName, section: section });
}

/**
 * GitHub Personal Access Token(스크립트 속성 GITHUB_TOKEN)으로 workflow_dispatch를 호출해
 * 지정한 워크플로 파일을 실행시킨다. 대상 브랜치는 스크립트 속성 GITHUB_REF로 바꿀 수 있고
 * 없으면 main을 사용한다 (워크플로 파일이 아직 main에 없다면 해당 브랜치명으로 설정해야 함).
 */
function dispatchWorkflow(workflowFile, inputs) {
  var ui = SpreadsheetApp.getUi();
  var properties = PropertiesService.getScriptProperties();
  var token = properties.getProperty('GITHUB_TOKEN');
  if (!token) {
    ui.alert('GITHUB_TOKEN 스크립트 속성이 설정되어 있지 않습니다.');
    return;
  }
  var ref = properties.getProperty('GITHUB_REF') || 'main';

  try {
    var request = buildDispatchRequest(GITHUB_OWNER, GITHUB_REPO, workflowFile, ref, inputs, token);
    var response = UrlFetchApp.fetch(request.url, request.options);
    var code = response.getResponseCode();

    if (code === 204) {
      appendLog('INFO', 'dispatchWorkflow', workflowFile + ' triggered', { ref: ref, inputs: inputs });
      ui.alert(workflowFile + ' 실행 요청을 보냈습니다. 잠시 후 시트가 갱신됩니다.');
    } else {
      appendLog('ERROR', 'dispatchWorkflow', workflowFile + ' request failed (' + code + ')', {
        body: response.getContentText(),
      });
      ui.alert('요청 실패 (' + code + '): ' + response.getContentText());
    }
  } catch (err) {
    appendLog('ERROR', 'dispatchWorkflow', err.message, { workflowFile: workflowFile });
    ui.alert('요청 중 오류: ' + err.message);
  }
}

var HOSEO_TASK_WORKFLOW = 'hoseo-task.yml';

/**
 * 과목 메인 화면 링크(예: course/view.php?id=40069) 하나만 넘기면 hoseo-task.yml의
 * task=course가 출결과 토론방을 한 번에 수집해 각각 시트 탭(Hoseo/ForumExport)에
 * 반영한다. 이 함수는 그 실행이 끝날 때까지 기다렸다가 두 결과를 모두 실행 로그
 * (보기 > 실행 기록)에 출력한다. Apps Script 편집기에서 이 함수를 직접 실행해
 * 확인하는 용도 - 시트 반영 자체는 워크플로가 이미 끝냈고, 여기서는 로그만 본다.
 *
 * 예전에는 출결은 local/ubonattend/report.php?id=N 링크를 직접 넘겨야 했지만,
 * 그 id가 과목 id(course/view.php?id=N)와 같다는 걸 확인해 course.py가 report_url을
 * 스스로 만든다 - 이제 항상 과목 링크 하나만 넘기면 된다.
 */
function fetchCourseDataAndLog(courseUrl) {
  var token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  var ref = PropertiesService.getScriptProperties().getProperty('GITHUB_REF') || 'main';
  if (!token) {
    Logger.log('GITHUB_TOKEN 스크립트 속성이 설정되어 있지 않습니다.');
    return;
  }

  var dispatchedAt = new Date();
  var request = buildDispatchRequest(
    GITHUB_OWNER, GITHUB_REPO, HOSEO_TASK_WORKFLOW, ref,
    { task: 'course', course_url: courseUrl }, token
  );
  var dispatchResponse = UrlFetchApp.fetch(request.url, request.options);
  if (dispatchResponse.getResponseCode() !== 204) {
    Logger.log('실행 요청 실패: ' + dispatchResponse.getContentText());
    return;
  }

  var runId = waitForRunId(dispatchedAt, token);
  if (!runId) {
    Logger.log('실행된 워크플로를 찾지 못했습니다 (시간 초과).');
    return;
  }

  var conclusion = waitForRunConclusion(runId, token);
  Logger.log('워크플로 실행 결과: ' + conclusion);

  var logText = fetchJobLogText(runId, token);
  Logger.log(extractAttendanceSection(logText));
  Logger.log(extractForumExportSection(logText));
}

/** workflow_dispatch 응답에는 run_id가 없어서, 방금 시작한 것보다 최신인 run이
 * 나타날 때까지 목록을 다시 조회한다. */
function waitForRunId(dispatchedAt, token) {
  var url = 'https://api.github.com/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO +
    '/actions/workflows/' + HOSEO_TASK_WORKFLOW + '/runs?per_page=5';
  for (var i = 0; i < 10; i++) {
    Utilities.sleep(3000);
    var response = UrlFetchApp.fetch(url, { headers: authHeaders(token), muteHttpExceptions: true });
    var runs = JSON.parse(response.getContentText()).workflow_runs || [];
    for (var j = 0; j < runs.length; j++) {
      if (new Date(runs[j].created_at) >= dispatchedAt) return runs[j].id;
    }
  }
  return null;
}

function waitForRunConclusion(runId, token) {
  var url = 'https://api.github.com/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/actions/runs/' + runId;
  for (var i = 0; i < 20; i++) {
    var response = UrlFetchApp.fetch(url, { headers: authHeaders(token), muteHttpExceptions: true });
    var run = JSON.parse(response.getContentText());
    if (run.status === 'completed') return run.conclusion;
    Utilities.sleep(3000);
  }
  return 'timeout';
}

function fetchJobLogText(runId, token) {
  var jobsUrl = 'https://api.github.com/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO +
    '/actions/runs/' + runId + '/jobs';
  var jobsResponse = UrlFetchApp.fetch(jobsUrl, { headers: authHeaders(token), muteHttpExceptions: true });
  var jobId = JSON.parse(jobsResponse.getContentText()).jobs[0].id;

  var logsUrl = 'https://api.github.com/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO +
    '/actions/jobs/' + jobId + '/logs';
  // GitHub는 실제 로그를 서명된 blob storage URL로 302 리다이렉트한다. 리다이렉트를
  // 자동으로 따라가면서 Authorization 헤더를 그대로 넘기면 서명된 URL 쪽에서 거부할
  // 수 있어(이 프로젝트 CLAUDE.md에도 적어둔 것과 같은 종류의 문제), 직접 처리한다.
  var first = UrlFetchApp.fetch(logsUrl, {
    headers: authHeaders(token),
    muteHttpExceptions: true,
    followRedirects: false
  });
  var location = first.getHeaders()['Location'] || first.getHeaders()['location'];
  if (!location) return first.getContentText();
  return UrlFetchApp.fetch(location, { muteHttpExceptions: true }).getContentText();
}

/**
 * Apps Script 편집기에서 바로 실행해 fetchCourseDataAndLog()를 시험해보는 용도.
 * 실행 후 '실행 기록'(또는 Ctrl+Enter 로그 패널)에서 결과를 확인한다.
 */
function testFetchCourseData() {
  fetchCourseDataAndLog('https://learn.hoseo.ac.kr/course/view.php?id=43780');
}
