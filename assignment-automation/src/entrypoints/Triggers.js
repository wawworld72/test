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
  // "다음 이벤트" 트리거는 시작·종료 시각이 남아있는 동안만 존재한다. 채점중/평가완료 행은
  // 교사가 평가를 언제 입력할지 알 수 없어 예측 가능한 다음 시각이 없으므로, 별도의 주기
  // 트리거로 채점 파이프라인을 정기적으로 점검한다. (시간 기반 트리거 총 3개: 다음 이벤트 +
  // 이 주기 점검 + 일일 요약 — 헌법의 8개 이하 한도에 여유가 크다.)
  if (existingHandlers.indexOf('runGradingPipeline') === -1) {
    ScriptApp.newTrigger('runGradingPipeline').timeBased().everyMinutes(30).create();
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

/**
 * UC-17/UC-19/UC-20/UC-21/UC-22/UC-23/UC-24: 채점중·평가완료 상태의 과제를 정기적으로
 * 점검해 평가 준비 → 평가 수집 → 점수 산정 → 성적 반환 → 통지까지 이어서 진행한다
 * (FR-020 후속 처리, FR-022~034). 교사가 응답 시트에 평가를 언제 입력할지 알 수 없으므로
 * ensureInstallableTriggers()가 등록한 30분 주기 트리거로 반복 점검한다. 행 단위로 실패를
 * 격리한다(FR-052).
 */
function runGradingPipeline() {
  return runWithExclusiveLock('runGradingPipeline', function () {
    var ss = getBoundSpreadsheet();
    var formsSheet = getSheetOrThrow(ss, SHEET_NAMES.FORMS);
    var courseId = readCourseConfigValue_(ss, '코스식별자');
    var dryRun = String(readCourseConfigValue_(ss, '드라이런')).toUpperCase() === 'TRUE';
    var notifyEnabled = String(readCourseConfigValue_(ss, '학생통지')).toUpperCase() === 'TRUE';
    var autoReturnEnabled = String(readCourseConfigValue_(ss, '성적자동반환')).toUpperCase() === 'TRUE';
    var variantCount = Number(readCourseConfigValue_(ss, '퀴즈변형수')) || 1;

    var allFormsRows = readRowsAsObjects(formsSheet);
    var rows = allFormsRows.filter(function (row) {
      var active = row['활성'] === true || row['활성'] === 'TRUE';
      var relevant = row['진행상태'] === PROGRESS_STATUS.GRADING || row['진행상태'] === PROGRESS_STATUS.EVALUATED;
      return active && relevant;
    });

    var processed = 0;
    rows.forEach(function (row) {
      try {
        flagNonCourseMembers_(row, courseId);

        if (row['진행상태'] === PROGRESS_STATUS.GRADING) {
          if (row['역량과제'] === '퀴즈 풀기') {
            processQuizGrading_(row, allFormsRows);
          } else {
            prepareEvaluationColumns(row);
            collectEvaluations(row);
            computeGradesAndAdvanceState(row);
          }

          if (row['역량과제'] === '문제 만들기') {
            var linkedQuiz = findLinkedFormsRow_(allFormsRows, row['주제'], '퀴즈 풀기');
            if (linkedQuiz) {
              generateLinkedQuizIfNeeded(row, linkedQuiz, variantCount);
            }
          }
        }

        var refreshed = readRowsAsObjects(formsSheet).filter(function (r) {
          return r.__row === row.__row;
        })[0];

        if (refreshed && refreshed['진행상태'] === PROGRESS_STATUS.EVALUATED && autoReturnEnabled) {
          returnGradesToClassroom(refreshed, courseId, dryRun);

          if (notifyEnabled) {
            var afterReturn = readRowsAsObjects(formsSheet).filter(function (r) {
              return r.__row === row.__row;
            })[0];
            if (afterReturn && afterReturn['진행상태'] === PROGRESS_STATUS.RETURNED) {
              sendIndividualFeedback(afterReturn);
            }
          }
        }
        processed += 1;
      } catch (err) {
        Logger.log('runGradingPipeline 행 ' + row.__row + ' 실패: ' + err.message);
      }
    });

    return processed;
  });
}

/**
 * 같은 주제(주차 참조)로 연결된 상대 유형의 Forms 행을 찾는다(연계 과제 관계, data-model.md).
 * 별도 링크 열 없이 "주제"만으로 런타임에 연결한다.
 */
function findLinkedFormsRow_(allFormsRows, topic, type) {
  var matches = allFormsRows.filter(function (r) {
    return r['주제'] === topic && r['역량과제'] === type;
  });
  return matches.length > 0 ? matches[0] : null;
}

/**
 * UC-17/UC-19: 퀴즈 풀기 과제는 일반 루브릭 수집(prepareEvaluationColumns/collectEvaluations)
 * 대신 자동 채점으로 대체한다. 연계된 문제 만들기 과제가 있으면 문항맵을 대조해 문항 분석까지
 * 수행하고(FR-037/038), 그 결과로 원본 과제를 평가완료로 강제 전환한다(FR-040). 연계가 없는
 * 퀴즈(예: 시험)는 문항 분석 없이 정답 대조로 총점만 낸다(FR-039) — 이 경우 문항맵은
 * quizGeneration.js가 자동 생성하지 않으므로, 교사가 같은 규칙(문항/정답/출제자학번 열)으로
 * "문항맵_<응답시트명>" 시트를 직접 준비해둬야 자동 채점이 실행된다. 문항맵이 아직 없으면
 * 이번 주기는 건너뛰고 다음 30분 점검에서 재시도한다(실패로 취급하지 않음).
 */
function processQuizGrading_(quizFormsRow, allFormsRows) {
  var ss = getBoundSpreadsheet();
  var responseSheet = ss.getSheetByName(quizFormsRow['응답시트']);
  if (!responseSheet) {
    return;
  }
  var responseRows = readRowsAsObjects(responseSheet);
  var linkedSource = findLinkedFormsRow_(allFormsRows, quizFormsRow['주제'], '문제 만들기');

  var mapSheetName = linkedSource && linkedSource['응답시트']
    ? quizAnswerMapSheetName(linkedSource['응답시트'])
    : quizAnswerMapSheetName(quizFormsRow['응답시트']);
  var mapSheet = ss.getSheetByName(mapSheetName);
  if (!mapSheet) {
    return;
  }
  var answerMapRows = readRowsAsObjects(mapSheet);

  var analysisResult = null;
  var scoresByStudent;
  if (linkedSource) {
    analysisResult = analyzeQuizResponses(responseRows, answerMapRows);
    scoresByStudent = analysisResult.scoresByStudent;
  } else {
    scoresByStudent = computeSimpleQuizScores(responseRows, answerMapRows);
  }

  collectQuizScores(quizFormsRow, scoresByStudent, analysisResult);
  computeGradesAndAdvanceState(quizFormsRow);

  if (linkedSource) {
    var formsSheet = getSheetOrThrow(ss, SHEET_NAMES.FORMS);
    var refreshedQuiz = readRowsAsObjects(formsSheet).filter(function (r) {
      return r.__row === quizFormsRow.__row;
    })[0];
    if (refreshedQuiz && refreshedQuiz['진행상태'] === PROGRESS_STATUS.EVALUATED) {
      advanceLinkedQuizSourceToEvaluated(linkedSource);
    }
  }
}

/**
 * UC-24 보완: 코스 구성원이 아닌 학생은 자동 채점·성적 전송 대상에서 제외하고 그 사실을
 * 대장 행 비고에 남긴다(FR-034). 원점수 0 부여 자체는 collectEvaluations의 "미제출" 분기가
 * 이미 처리한다 — 여기서는 "애초에 이 코스 학생이 아님"만 별도로 표시한다.
 */
function flagNonCourseMembers_(formsRow, courseId) {
  var ss = getBoundSpreadsheet();
  var ledgerSheet = getSheetOrThrow(ss, SHEET_NAMES.LEDGER);
  var rows = readRowsAsObjects(ledgerSheet).filter(function (r) {
    return r['주제'] === formsRow['주제'] && r['역량과제'] === formsRow['역량과제'] && !r['비고'];
  });
  if (rows.length === 0) {
    return;
  }

  var courseStudents = listCourseStudents(courseId);
  var roster = readRowsAsObjects(getSheetOrThrow(ss, SHEET_NAMES.ROSTER));
  var emailByStudentKey = {};
  roster.forEach(function (r) {
    emailByStudentKey[normalizeStudentId(r['학번'])] = String(r['이메일']).toLowerCase();
  });
  var courseEmails = {};
  courseStudents.forEach(function (s) {
    if (s.profile && s.profile.emailAddress) {
      courseEmails[s.profile.emailAddress.toLowerCase()] = true;
    }
  });

  var result = excludeNonCourseMembers(
    rows,
    Object.keys(emailByStudentKey).filter(function (key) {
      return courseEmails[emailByStudentKey[key]];
    })
  );

  if (result.excluded.length > 0) {
    var updates = result.excluded.map(function (r) {
      return { __row: r.__row, 비고: '코스 구성원 아님 — 자동 채점 대상 제외' };
    });
    writeRowObjectsBatched(ledgerSheet, updates);
  }
}
