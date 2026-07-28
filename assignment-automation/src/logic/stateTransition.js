/**
 * Forms 행의 게시상태·진행상태 전이 판정 순수 함수 (data-model.md 상태 전이도 기준,
 * 2026-07-27 /speckit-clarify에서 확정). SpreadsheetApp 등에 의존하지 않는다.
 */

var PUBLISH_STATUS = { PENDING: '대기', PUBLISHED: '게시', ERROR: '오류' };

var PROGRESS_STATUS = {
  PENDING: '대기',
  COLLECTING: '수집중',
  GRADING: '채점중',
  EVALUATED: '평가완료',
  RETURNED: '반환완료',
  ERROR: '오류',
};

var PUBLISH_TRANSITIONS = {
  대기: ['게시', '오류'],
  게시: ['오류'],
  오류: ['대기', '게시'],
};

var PROGRESS_TRANSITIONS = {
  대기: ['수집중', '오류'],
  수집중: ['채점중', '오류'],
  채점중: ['평가완료', '오류'],
  평가완료: ['반환완료', '오류'],
  반환완료: ['오류'],
  // 오류에서는 예외 복구(FR-043)로 직전 상태 어디로든 되돌아갈 수 있다.
  오류: ['대기', '수집중', '채점중', '평가완료', '반환완료'],
};

function isValidPublishTransition(from, to) {
  var allowed = PUBLISH_TRANSITIONS[from];
  return !!allowed && allowed.indexOf(to) !== -1;
}

function isValidProgressTransition(from, to) {
  var allowed = PROGRESS_TRANSITIONS[from];
  return !!allowed && allowed.indexOf(to) !== -1;
}

function transitionPublish(from, to) {
  if (!isValidPublishTransition(from, to)) {
    throw new Error('허용되지 않는 게시상태 전이: ' + from + ' → ' + to);
  }
  return to;
}

function transitionProgress(from, to) {
  if (!isValidProgressTransition(from, to)) {
    throw new Error('허용되지 않는 진행상태 전이: ' + from + ' → ' + to);
  }
  return to;
}

if (typeof module !== 'undefined') {
  module.exports = {
    PUBLISH_STATUS: PUBLISH_STATUS,
    PROGRESS_STATUS: PROGRESS_STATUS,
    isValidPublishTransition: isValidPublishTransition,
    isValidProgressTransition: isValidProgressTransition,
    transitionPublish: transitionPublish,
    transitionProgress: transitionProgress,
  };
}
