/**
 * UC-12: 아직 처리되지 않은 모든 과제의 시작·종료 시각 중 가장 가까운 미래 시각 하나만
 * 다음 실행으로 예약한다(FR-017). 항상 "다음 이벤트" 트리거 하나만 존재하도록 재생성한다
 * (research.md #3) — 여러 개를 걸어두지 않는다.
 */

function computeNextProcessingTime(formsRows, now) {
  var candidateTimes = [];
  formsRows.forEach(function (row) {
    if (row['활성'] !== true && row['활성'] !== 'TRUE') {
      return;
    }
    var schedule = resolveEffectiveSchedule(row);
    if (row['게시상태'] === PUBLISH_STATUS.PENDING && schedule.start) {
      candidateTimes.push(new Date(schedule.start));
    } else if (row['진행상태'] === PROGRESS_STATUS.COLLECTING && schedule.end) {
      candidateTimes.push(new Date(schedule.end));
    }
  });

  var future = candidateTimes.filter(function (t) {
    return t.getTime() >= now.getTime();
  });
  var pool = future.length > 0 ? future : candidateTimes;
  if (pool.length === 0) {
    return null;
  }
  return pool.reduce(function (earliest, t) {
    return t < earliest ? t : earliest;
  });
}

var SCHEDULED_HANDLER_NAME = 'runScheduledProcessing';

function rescheduleNextTrigger() {
  var ss = getBoundSpreadsheet();
  var formsSheet = getSheetOrThrow(ss, SHEET_NAMES.FORMS);
  var rows = readRowsAsObjects(formsSheet);
  var nextTime = computeNextProcessingTime(rows, new Date());

  deleteTriggersByHandler_(SCHEDULED_HANDLER_NAME);

  if (!nextTime) {
    clearNextProcessingTime();
    return null;
  }

  ScriptApp.newTrigger(SCHEDULED_HANDLER_NAME).timeBased().at(nextTime).create();
  setNextProcessingTime(nextTime);
  return nextTime;
}

function deleteTriggersByHandler_(handlerName) {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === handlerName) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

if (typeof module !== 'undefined') {
  module.exports = {
    computeNextProcessingTime: computeNextProcessingTime,
    SCHEDULED_HANDLER_NAME: SCHEDULED_HANDLER_NAME,
  };
}
