/**
 * 시간 기반/onEdit 트리거가 호출하는 얇은 진입점. 이 계층에서는 UI 호출(getUi/alert)을
 * 하지 않는다(헌법 VI) — 사람에게 알려야 할 내용은 mailGateway(일일 요약)로만 나간다.
 * 모든 트리거 함수는 lockGateway로 동시 실행을 막는다(FR-061).
 */

/**
 * UC-08/UC-09/UC-10: 활성 과제 중 아직 준비가 끝나지 않은 행을 찾아 생성 Form → 응답 시트
 * 연결 → Classroom 게시 순서로 이어서 처리한다. 각 행의 실패는 그 행 단위로 격리되어
 * 나머지 행 처리를 막지 않는다(FR-052).
 */
function runAssignmentPreparation() {
  return runWithExclusiveLock('runAssignmentPreparation', function () {
    var ss = getBoundSpreadsheet();
    var formsSheet = getSheetOrThrow(ss, SHEET_NAMES.FORMS);
    var definitionSheet = getSheetOrThrow(ss, SHEET_NAMES.ASSIGNMENT_DEFINITION);
    var grouped = groupDefinitionRowsByType(readRowsAsObjects(definitionSheet));

    var courseId = readCourseConfigValue_(ss, '코스식별자');
    var semesterLabel = readCourseConfigValue_(ss, '학기') + ' ' + readCourseConfigValue_(ss, '과목명');

    var rows = readRowsAsObjects(formsSheet);
    var updates = [];

    rows
      .filter(function (row) {
        return row['활성'] === true || row['활성'] === 'TRUE';
      })
      .forEach(function (row) {
        try {
          var typeDef = (grouped.groups[row['역량과제']] || [])[0];
          if (!typeDef) {
            return;
          }

          var patch = { __row: row.__row };
          var changed = false;

          if (!row['생성Form']) {
            var title = semesterLabel + ' ' + row['주제'] + ' - ' + row['역량과제'];
            patch['생성Form'] = createGeneratedForm(typeDef['템플릿Form'], title, row['주제']);
            changed = true;
          }

          var formId = patch['생성Form'] || row['생성Form'];
          if (formId && !row['응답시트']) {
            var responseSheetTitle = '응답_' + row['주제'] + '_' + row['역량과제'];
            var sheetName = linkAndPrepareResponseSheet(formId, ss.getId(), responseSheetTitle);
            if (sheetName) {
              patch['응답시트'] = sheetName;
              changed = true;
            }
          }

          if (formId && (patch['응답시트'] || row['응답시트']) && !row['과제ID']) {
            var maxScore = (grouped.groups[row['역량과제']] || []).reduce(function (sum, r) {
              return sum + (Number(r['배점']) || 0);
            }, 0);
            var schedule = resolveEffectiveSchedule(row);
            patch['과제ID'] = createCourseWorkForAssignment(
              courseId, title || row['주제'] + ' - ' + row['역량과제'], formId, schedule.start, schedule.end, maxScore
            );
            patch['게시상태'] = PUBLISH_STATUS.PENDING;
            changed = true;
          }

          if (changed) {
            updates.push(patch);
          }
        } catch (err) {
          Logger.log('runAssignmentPreparation 행 ' + row.__row + ' 실패: ' + err.message);
        }
      });

    if (updates.length > 0) {
      writeRowObjectsBatched(formsSheet, updates);
    }
    return updates.length;
  });
}

/**
 * 초기 설정(runInitialSetup) 시 한 번 호출되어 onEdit 설치형 트리거를 등록한다. 이미
 * 등록돼 있으면 다시 만들지 않는다(멱등). 일일 요약 메일용 고정 시각 트리거도 여기서
 * 확인·생성한다(FR-042, US6에서 채워짐).
 */
function ensureInstallableTriggers() {
  var existingHandlers = ScriptApp.getProjectTriggers().map(function (t) {
    return t.getHandlerFunction();
  });
  if (existingHandlers.indexOf('onFormsScheduleEdited') === -1) {
    ScriptApp.newTrigger('onFormsScheduleEdited')
      .forSpreadsheet(getBoundSpreadsheet())
      .onEdit()
      .create();
  }
}

/**
 * UC-12: 교사가 일정/진행상태를 수정하면 다음 처리 시각을 다시 계산한다(FR-018).
 * ensureInstallableTriggers()가 등록하는 설치형 onEdit 트리거가 이 함수를 호출한다.
 */
function onFormsScheduleEdited(e) {
  if (!e || !e.range) {
    return;
  }
  var sheet = e.range.getSheet();
  if (sheet.getName() !== SHEET_NAMES.FORMS) {
    return;
  }
  runWithExclusiveLock('onFormsScheduleEdited', function () {
    rescheduleNextTrigger();
  });
}

/**
 * UC-13/UC-14: 예약된 "다음 이벤트" 시각에 실행된다. 시작 시각이 된 과제는 수집을 열고,
 * 종료 시각이 된 과제는 수집을 닫고 제출 현황을 집계한다. 각 행은 개별적으로 실패가
 * 격리된다(FR-052). 처리 후 항상 다음 트리거를 다시 계산해 예약한다.
 */
function runScheduledProcessing() {
  return runWithExclusiveLock('runScheduledProcessing', function () {
    var startedAt = Date.now();
    var ss = getBoundSpreadsheet();
    var formsSheet = getSheetOrThrow(ss, SHEET_NAMES.FORMS);
    var retryLimit = Number(readCourseConfigValue_(ss, '재시도한도')) || 3;

    var now = new Date();
    var rows = readRowsAsObjects(formsSheet);

    // 직전 실행이 4분 한도에 걸려 못 끝냈다면, 그때 남겨둔 행들만 이어서 처리한다(FR-021).
    var resumeRowNumbers = loadCheckpoint('runScheduledProcessing_remaining');
    if (resumeRowNumbers) {
      var resumeSet = {};
      resumeRowNumbers.forEach(function (n) {
        resumeSet[n] = true;
      });
      rows = rows.filter(function (r) {
        return resumeSet[r.__row];
      });
    }

    var updates = [];
    var checkpointed = false;

    for (var i = 0; i < rows.length; i++) {
      if (millisecondsRemaining(startedAt, 4 * 60 * 1000) < 15000) {
        saveCheckpoint('runScheduledProcessing_remaining', rows.slice(i).map(function (r) { return r.__row; }));
        checkpointed = true;
        break;
      }

      var row = rows[i];
      if (row['활성'] !== true && row['활성'] !== 'TRUE') {
        continue;
      }
      var schedule = resolveEffectiveSchedule(row);

      try {
        if (row['게시상태'] === PUBLISH_STATUS.PENDING && schedule.start && new Date(schedule.start) <= now) {
          var startResult = attemptCollectionStart_(row, retryLimit);
          if (startResult) {
            updates.push(Object.assign({ __row: row.__row }, startResult));
          }
        } else if (
          row['진행상태'] === PROGRESS_STATUS.COLLECTING &&
          schedule.end &&
          new Date(schedule.end) <= now
        ) {
          var endResult = attemptCollectionEnd_(row);
          updates.push(Object.assign({ __row: row.__row }, endResult));
        }
      } catch (err) {
        Logger.log('runScheduledProcessing 행 ' + row.__row + ' 실패: ' + err.message);
      }
    }

    if (updates.length > 0) {
      writeRowObjectsBatched(formsSheet, updates);
    }

    if (checkpointed) {
      // 남은 작업이 있다 — "다음 이벤트" 계산에 맡기지 않고 최대한 빨리 이어서 실행되도록
      // 별도로 예약한다(FR-021).
      deleteTriggersByHandler_(SCHEDULED_HANDLER_NAME);
      var resumeAt = new Date(Date.now() + 60 * 1000);
      ScriptApp.newTrigger(SCHEDULED_HANDLER_NAME).timeBased().at(resumeAt).create();
    } else {
      clearCheckpoint('runScheduledProcessing_remaining');
      rescheduleNextTrigger();
    }
    return updates.length;
  });
}

function attemptCollectionStart_(row, retryLimit) {
  var key = row['주제'] + '::' + row['역량과제'];
  try {
    var form = FormApp.openById(row['생성Form']);
    form.setAcceptingResponses(true);
    clearCheckpoint('startFail_' + key);
    return {
      게시상태: transitionPublish(row['게시상태'], PUBLISH_STATUS.PUBLISHED),
      진행상태: transitionProgress(row['진행상태'], PROGRESS_STATUS.COLLECTING),
    };
  } catch (err) {
    var failCount = (loadCheckpoint('startFail_' + key) || 0) + 1;
    saveCheckpoint('startFail_' + key, failCount);
    if (failCount >= retryLimit) {
      return {
        게시상태: transitionPublish(row['게시상태'], PUBLISH_STATUS.ERROR),
        진행상태: transitionProgress(row['진행상태'], PROGRESS_STATUS.ERROR),
      };
    }
    return null;
  }
}

function attemptCollectionEnd_(row) {
  var form = FormApp.openById(row['생성Form']);
  form.setAcceptingResponses(false);

  var responses = form.getResponses();
  var rosterSheet = getSheetOrThrow(getBoundSpreadsheet(), SHEET_NAMES.ROSTER);
  var rosterCount = readRowsAsObjects(rosterSheet).length;
  var submitted = responses.length;

  return {
    제출수: submitted,
    미제출수: Math.max(rosterCount - submitted, 0),
    진행상태: transitionProgress(row['진행상태'], PROGRESS_STATUS.GRADING),
  };
}
