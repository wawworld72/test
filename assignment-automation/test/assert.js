/**
 * 자체 assert 헬퍼. 외부 테스트 프레임워크(Jest 등)를 쓰지 않는다(헌법 V).
 * 각 함수는 실패 시 Error를 던진다. 성공/실패 집계는 run.js가 담당한다.
 */

function stringify(value) {
  try {
    return JSON.stringify(value);
  } catch (err) {
    return String(value);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      (message ? message + ' — ' : '') + `expected ${stringify(expected)}, got ${stringify(actual)}`
    );
  }
}

function assertDeepEqual(actual, expected, message) {
  const a = stringify(actual);
  const e = stringify(expected);
  if (a !== e) {
    throw new Error((message ? message + ' — ' : '') + `expected ${e}, got ${a}`);
  }
}

function assertTrue(value, message) {
  if (value !== true) {
    throw new Error((message ? message + ' — ' : '') + `expected true, got ${stringify(value)}`);
  }
}

function assertFalse(value, message) {
  if (value !== false) {
    throw new Error((message ? message + ' — ' : '') + `expected false, got ${stringify(value)}`);
  }
}

function assertThrows(fn, message) {
  let threw = false;
  try {
    fn();
  } catch (err) {
    threw = true;
  }
  if (!threw) {
    throw new Error((message ? message + ' — ' : '') + 'expected function to throw, but it did not');
  }
}

module.exports = { assertEqual, assertDeepEqual, assertTrue, assertFalse, assertThrows };
