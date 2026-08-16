/**
 * 성적 전송 여부(멱등) 판정 순수 함수 (FR-031). 이미 같은 점수로 반환됐다면 다시 쓰지 않는다.
 */

/**
 * @param {number|null|undefined} previouslySentScore 마지막으로 반환에 성공한 점수. 아직 한
 *   번도 보내지 않았다면 null/undefined.
 * @param {number} newScore 지금 반영하려는 점수.
 * @returns {boolean} 전송해야 하면 true, 이미 같은 값이 반영돼 있어 건너뛰어야 하면 false.
 */
function shouldSendGrade(previouslySentScore, newScore) {
  if (previouslySentScore === null || previouslySentScore === undefined) {
    return true;
  }
  return previouslySentScore !== newScore;
}

/**
 * 실제로 값이 바뀐 건에 대해서만 변경이력에 남길 항목을 만든다(FR-031). 값이 같으면 null을
 * 반환해 호출부가 변경이력에 아무 것도 추가하지 않게 한다.
 */
function buildChangeLogEntry(timestampIso, target, previouslySentScore, newScore) {
  if (!shouldSendGrade(previouslySentScore, newScore)) {
    return null;
  }
  return {
    시각: timestampIso,
    대상: target,
    이전값: previouslySentScore === null || previouslySentScore === undefined ? '' : previouslySentScore,
    이후값: newScore,
  };
}

if (typeof module !== 'undefined') {
  module.exports = { shouldSendGrade: shouldSendGrade, buildChangeLogEntry: buildChangeLogEntry };
}
