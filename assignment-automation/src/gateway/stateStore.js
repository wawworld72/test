/**
 * PropertiesService 기반 실행 상태 저장소. 전역 가변 상태를 두지 않고, 실행 간 상태는 여기와
 * 시트에만 둔다(헌법 VI). 다음 처리 시각(FR-017)과 4분 체크포인트(FR-021)에 사용한다.
 */

var STATE_KEYS = {
  NEXT_PROCESSING_TIME: 'NEXT_PROCESSING_TIME',
  CHECKPOINT_PREFIX: 'CHECKPOINT_',
};

function getProperties_() {
  return PropertiesService.getScriptProperties();
}

function getNextProcessingTime() {
  var raw = getProperties_().getProperty(STATE_KEYS.NEXT_PROCESSING_TIME);
  return raw ? new Date(raw) : null;
}

function setNextProcessingTime(date) {
  getProperties_().setProperty(STATE_KEYS.NEXT_PROCESSING_TIME, date.toISOString());
}

function clearNextProcessingTime() {
  getProperties_().deleteProperty(STATE_KEYS.NEXT_PROCESSING_TIME);
}

/**
 * 4분 체크포인트: 긴 처리가 시간 제한 안에 못 끝날 것 같을 때, 어디까지 했는지 저장해두고
 * 다음 실행이 이어받게 한다. value는 JSON 직렬화 가능한 값이어야 한다.
 */
function saveCheckpoint(taskName, value) {
  getProperties_().setProperty(STATE_KEYS.CHECKPOINT_PREFIX + taskName, JSON.stringify(value));
}

function loadCheckpoint(taskName) {
  var raw = getProperties_().getProperty(STATE_KEYS.CHECKPOINT_PREFIX + taskName);
  return raw ? JSON.parse(raw) : null;
}

function clearCheckpoint(taskName) {
  getProperties_().deleteProperty(STATE_KEYS.CHECKPOINT_PREFIX + taskName);
}

/**
 * 실행 시작 시각 기준으로 남은 여유 시간(ms)을 계산한다. 4분(헌법 여유 한도)을 넘기기 전에
 * 호출부가 스스로 체크포인트를 저장하고 종료하도록 돕는다.
 */
function millisecondsRemaining(startedAt, budgetMs) {
  var elapsed = Date.now() - startedAt;
  return budgetMs - elapsed;
}
