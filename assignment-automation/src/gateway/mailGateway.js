/**
 * MailApp 호출 전담 (FR-033, FR-042). 발송 한도에 걸리면 남은 수신자 목록을 체크포인트로
 * 저장해 다음 실행에서 이어 보낸다 — 중복 발송 없이, 누락도 없이(research.md #7).
 */

function sendIndividualFeedback(formsRow) {
  var ss = getBoundSpreadsheet();
  var ledgerSheet = getSheetOrThrow(ss, SHEET_NAMES.LEDGER);
  var checkpointKey = 'notify_' + formsRow['주제'] + '::' + formsRow['역량과제'];

  var rows = readRowsAsObjects(ledgerSheet).filter(function (r) {
    return r['주제'] === formsRow['주제'] && r['역량과제'] === formsRow['역량과제'] && r['수집상태'] === '완료';
  });
  var rowsByStudentKey = {};
  rows.forEach(function (r) {
    rowsByStudentKey[normalizeStudentId(r['학번'])] = r;
  });

  var roster = readRowsAsObjects(getSheetOrThrow(ss, SHEET_NAMES.ROSTER));
  var emailByStudentKey = {};
  roster.forEach(function (r) {
    emailByStudentKey[normalizeStudentId(r['학번'])] = r['이메일'];
  });

  var pendingKeys = loadCheckpoint(checkpointKey);
  if (!pendingKeys) {
    pendingKeys = Object.keys(rowsByStudentKey);
  }

  var sentCount = 0;
  var stillPending = [];
  for (var i = 0; i < pendingKeys.length; i++) {
    var studentKey = pendingKeys[i];
    var row = rowsByStudentKey[studentKey];
    var email = emailByStudentKey[studentKey];
    if (!row || !email) {
      continue;
    }
    try {
      MailApp.sendEmail(email, formsRow['주제'] + ' ' + formsRow['역량과제'] + ' 평가 결과', buildFeedbackBody_(row));
      sentCount += 1;
    } catch (err) {
      stillPending = pendingKeys.slice(i);
      Logger.log('개인 통지 발송 중단(한도 등): ' + err.message);
      break;
    }
  }

  if (stillPending.length > 0) {
    saveCheckpoint(checkpointKey, stillPending);
  } else {
    clearCheckpoint(checkpointKey);
  }
  return sentCount;
}

function buildFeedbackBody_(ledgerRow) {
  return '평가: ' + ledgerRow['평가'] + '\n피드백: ' + (ledgerRow['피드백'] || '') + '\n점수: ' + ledgerRow['점수'];
}

/**
 * FR-042: 하루 동안 쌓인 실패를 건별이 아닌 한 통으로 모아 강좌설정의 교사 이메일로 보낸다.
 */
function sendDailySummary(summaryText, teacherEmail) {
  if (!teacherEmail) {
    Logger.log('sendDailySummary: 교사이메일이 설정되지 않아 발송하지 않음');
    return false;
  }
  MailApp.sendEmail(teacherEmail, '[과제 자동화] 일일 요약', summaryText);
  return true;
}
