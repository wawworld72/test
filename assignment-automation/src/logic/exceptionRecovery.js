/**
 * UC-25~28/FR-043~046: 예외 복구 3종(오류 재진행, 이의신청 재전송, 정의 변경 후 소급
 * 재계산)의 판정 로직. 상태 전이 자체는 stateTransition.js에, 재전송 여부 판정은
 * gradeReturn.js(내부적으로 gradeSendPolicy.js)에 그대로 위임해 여러 번 실행해도 안전하게
 * 만든다(FR-046) — 이 파일은 새 규칙을 만들지 않고 기존 순수 판정 함수들을 조합만 한다.
 */

/**
 * FR-043: "직전 상태"를 별도 열로 기록해두지 않으므로, 이미 시트에 남아있는 데이터로 되돌아갈
 * 상태를 역산한다 — 생성Form/응답시트/과제ID 확보 여부 → 제출 집계 여부 → 대장 수집 완료
 * 여부 → 성적전송 여부 순으로 판단한다.
 */
function determineRecoveryProgressState_(formsRow, ledgerRowsForAssignment) {
  if (!formsRow['생성Form'] || !formsRow['응답시트'] || !formsRow['과제ID']) {
    return PROGRESS_STATUS.PENDING;
  }
  var hasSubmissionTally =
    formsRow['제출수'] !== '' && formsRow['제출수'] !== null && formsRow['제출수'] !== undefined;
  if (!hasSubmissionTally) {
    return PROGRESS_STATUS.COLLECTING;
  }
  var allCollected =
    ledgerRowsForAssignment.length > 0 &&
    ledgerRowsForAssignment.every(function (r) {
      return r['수집상태'] === '완료';
    });
  if (!allCollected) {
    return PROGRESS_STATUS.GRADING;
  }
  if (!formsRow['성적전송']) {
    return PROGRESS_STATUS.EVALUATED;
  }
  return PROGRESS_STATUS.RETURNED;
}

/**
 * FR-043: 오류 상태 과제를 재진행 대상으로 되돌릴 patch를 계산한다. 이미 오류가 아니면 null을
 * 반환해 아무 것도 바꾸지 않는다 — 여러 번 실행해도 안전하다(FR-046).
 */
function recoverErroredAssignment(formsRow, ledgerRowsForAssignment) {
  var patch = {};
  if (formsRow['진행상태'] === PROGRESS_STATUS.ERROR) {
    patch['진행상태'] = transitionProgress(
      PROGRESS_STATUS.ERROR,
      determineRecoveryProgressState_(formsRow, ledgerRowsForAssignment)
    );
  }
  if (formsRow['게시상태'] === PUBLISH_STATUS.ERROR) {
    patch['게시상태'] = transitionPublish(PUBLISH_STATUS.ERROR, PUBLISH_STATUS.PENDING);
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

/**
 * FR-045: 역량과제정의가 바뀐 뒤, 그 유형의 이미 채점된(수집상태 완료) 대장 행 전부를 새
 * 등급구간으로 다시 산정한다. computeGradesAndAdvanceState의 "완료면 건너뛴다" 규칙과 달리,
 * 소급 재계산은 완료 행을 의도적으로 다시 계산하는 것이 목적이므로 항상 재적용한다.
 */
function recalculateGradesForType(ledgerRowsOfType, gradeBands) {
  return ledgerRowsOfType
    .filter(function (row) {
      return row['수집상태'] === '완료';
    })
    .map(function (row) {
      var grade = scoreToGrade(Number(row['원점수']) || 0, gradeBands);
      return { __row: row.__row, 점수: grade, 반영: grade };
    });
}

if (typeof module !== 'undefined') {
  module.exports = {
    determineRecoveryProgressState_: determineRecoveryProgressState_,
    recoverErroredAssignment: recoverErroredAssignment,
    recalculateGradesForType: recalculateGradesForType,
  };
}
