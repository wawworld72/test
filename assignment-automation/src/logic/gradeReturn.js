/**
 * UC-21/UC-22: 점수 산정과 Classroom 성적 반환 오케스트레이션 (FR-028~032). 판정 자체는
 * scoring.js/gradeSendPolicy.js에 위임하고, 여기서는 시트 읽기·쓰기와 classroomGateway
 * 호출을 조합한다.
 *
 * "이미 보낸 점수"는 별도 열을 새로 만들지 않고 변경이력 탭에서 이 대상(과제·학번)의 가장
 * 최근 이후값을 찾아 판단한다 — 데이터 모델에 열을 추가하지 않고도 멱등 판정에 필요한 값을
 * 구할 수 있다.
 */

/**
 * UC-21: 수집상태가 완료인 대장 행 중 아직 점수가 없는 행에 등급구간을 적용한다.
 * 이 과제의 모든 대상 학생 원점수가 확정되면 진행상태를 평가완료로 전환한다(FR-028).
 */
function computeGradesAndAdvanceState(formsRow) {
  var ss = getBoundSpreadsheet();
  var ledgerSheet = getSheetOrThrow(ss, SHEET_NAMES.LEDGER);
  var definitionSheet = getSheetOrThrow(ss, SHEET_NAMES.ASSIGNMENT_DEFINITION);
  var grouped = groupDefinitionRowsByType(readRowsAsObjects(definitionSheet));
  var typeDef = grouped.groups[formsRow['역량과제']];
  if (!typeDef) {
    return 0;
  }
  var bands = parseGradeBands(typeDef[0]['등급구간']);

  var allRowsForAssignment = readRowsAsObjects(ledgerSheet).filter(function (r) {
    return r['주제'] === formsRow['주제'] && r['역량과제'] === formsRow['역량과제'];
  });

  var updates = [];
  allRowsForAssignment.forEach(function (row) {
    if (row['수집상태'] !== '완료') {
      return;
    }
    if (row['점수'] !== '' && row['점수'] !== null && row['점수'] !== undefined) {
      return;
    }
    var grade = scoreToGrade(Number(row['원점수']) || 0, bands);
    updates.push({ __row: row.__row, 점수: grade, 반영: grade });
  });
  if (updates.length > 0) {
    writeRowObjectsBatched(ledgerSheet, updates);
  }

  var allCollected = allRowsForAssignment.every(function (r) {
    return r['수집상태'] === '완료';
  });
  if (allCollected && formsRow['진행상태'] === PROGRESS_STATUS.GRADING) {
    updateFormsRowField_(formsRow, { 진행상태: transitionProgress(formsRow['진행상태'], PROGRESS_STATUS.EVALUATED) });
  }

  return updates.length;
}

function updateFormsRowField_(formsRow, patch) {
  var ss = getBoundSpreadsheet();
  var formsSheet = getSheetOrThrow(ss, SHEET_NAMES.FORMS);
  writeRowObjectsBatched(formsSheet, [Object.assign({ __row: formsRow.__row }, patch)]);
}

function buildLastSentScoreIndex_(changeLogRows) {
  var index = {};
  changeLogRows.forEach(function (entry) {
    index[entry['대상']] = entry['이후값'];
  });
  return index;
}

/**
 * UC-22: 산정된 점수를 Classroom에 반영한다. 드라이런이면 실제 API 호출 없이 보낼 값만
 * 헤아린다. 모든 대상 학생 전송이 끝나면 진행상태를 반환완료로 전환한다(FR-031).
 */
function returnGradesToClassroom(formsRow, courseId, dryRun) {
  var ss = getBoundSpreadsheet();
  var ledgerSheet = getSheetOrThrow(ss, SHEET_NAMES.LEDGER);
  var changeLogSheet = getSheetOrThrow(ss, SHEET_NAMES.CHANGE_LOG);

  var rows = readRowsAsObjects(ledgerSheet).filter(function (r) {
    return r['주제'] === formsRow['주제'] && r['역량과제'] === formsRow['역량과제'] && r['수집상태'] === '완료';
  });
  if (rows.length === 0) {
    return { sent: 0, skipped: 0, failed: 0 };
  }

  var lastSentIndex = buildLastSentScoreIndex_(readRowsAsObjects(changeLogSheet));
  var submissionIdByStudentKey = dryRun ? {} : resolveSubmissionIdsByStudent_(courseId, formsRow['과제ID']);

  var now = new Date().toISOString();
  var changeLogRowsToAppend = [];
  var sentCount = 0;
  var skippedCount = 0;
  var failedCount = 0;

  rows.forEach(function (row) {
    var target = formsRow['역량과제'] + '·' + row['학번'];
    var rawPrevious = lastSentIndex[target];
    var previousScore = rawPrevious === undefined || rawPrevious === '' ? null : Number(rawPrevious);
    var newScore = Number(row['점수']);

    if (!shouldSendGrade(previousScore, newScore)) {
      skippedCount += 1;
      return;
    }

    if (dryRun) {
      sentCount += 1;
      return;
    }

    var studentKey = normalizeStudentId(row['학번']);
    var submissionId = submissionIdByStudentKey[studentKey];
    if (!submissionId) {
      failedCount += 1;
      Logger.log('제출물을 찾지 못해 성적 전송 실패: ' + target);
      return;
    }

    var result = returnGradeToSubmission(courseId, formsRow['과제ID'], submissionId, newScore);
    if (result.ok) {
      sentCount += 1;
      var entry = buildChangeLogEntry(now, target, previousScore, newScore);
      if (entry) {
        changeLogRowsToAppend.push([entry.시각, entry.대상, entry.이전값, entry.이후값]);
      }
    } else {
      failedCount += 1;
      Logger.log('성적 전송 실패 ' + target + ': ' + result.error);
    }
  });

  if (!dryRun && changeLogRowsToAppend.length > 0) {
    appendRowsBatched(changeLogSheet, changeLogRowsToAppend);
  }

  if (!dryRun && failedCount === 0 && sentCount + skippedCount === rows.length) {
    updateFormsRowField_(formsRow, {
      진행상태: transitionProgress(formsRow['진행상태'], PROGRESS_STATUS.RETURNED),
      성적전송: true,
      전송시각: now,
    });
  }

  return { sent: sentCount, skipped: skippedCount, failed: failedCount };
}

/**
 * Classroom 학생 명단과 제출물 목록을 각각 실행당 1회만 조회해(FR: 명단/제출물 캐시)
 * 학번 → 제출물ID 매핑을 만든다. 학번-이메일 대조는 수강생 시트를 기준으로 한다.
 */
function resolveSubmissionIdsByStudent_(courseId, courseWorkId) {
  var roster = readRowsAsObjects(getSheetOrThrow(getBoundSpreadsheet(), SHEET_NAMES.ROSTER));
  var emailByStudentKey = {};
  roster.forEach(function (r) {
    emailByStudentKey[normalizeStudentId(r['학번'])] = String(r['이메일']).toLowerCase();
  });

  var courseStudents = listCourseStudents(courseId);
  var userIdByEmail = {};
  courseStudents.forEach(function (s) {
    var email = s.profile && s.profile.emailAddress ? s.profile.emailAddress.toLowerCase() : null;
    if (email) {
      userIdByEmail[email] = s.userId;
    }
  });

  var submissions = listStudentSubmissions(courseId, courseWorkId);
  var submissionIdByUserId = {};
  submissions.forEach(function (s) {
    submissionIdByUserId[s.userId] = s.id;
  });

  var result = {};
  Object.keys(emailByStudentKey).forEach(function (studentKey) {
    var email = emailByStudentKey[studentKey];
    var userId = userIdByEmail[email];
    if (userId && submissionIdByUserId[userId]) {
      result[studentKey] = submissionIdByUserId[userId];
    }
  });
  return result;
}

if (typeof module !== 'undefined') {
  module.exports = {
    computeGradesAndAdvanceState: computeGradesAndAdvanceState,
    returnGradesToClassroom: returnGradesToClassroom,
  };
}
