/**
 * 같은 자동 처리가 동시에 두 번 실행되는 것을 막는 공용 래퍼 (FR-061).
 * `LockService.getScriptLock().tryLock(0)`은 대기하지 않고 즉시 성공/실패를 반환하므로,
 * 이미 다른 실행이 진행 중이면 뒤이은 실행은 대기하지 않고 즉시 종료한다(research.md #4).
 *
 * 모든 트리거·메뉴 진입점은 실행 본문을 이 함수로 감싸야 한다.
 */
function runWithExclusiveLock(taskName, fn) {
  var lock = LockService.getScriptLock();
  var acquired = lock.tryLock(0);
  if (!acquired) {
    Logger.log('runWithExclusiveLock: ' + taskName + ' — 이미 실행 중이라 이번 실행은 건너뜀');
    return null;
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}
