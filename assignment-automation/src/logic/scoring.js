/**
 * 원점수 → 등급구간 판정 순수 함수 (FR-028). 점수 산정 규칙은 이 파일 한 곳에만 존재한다
 * (헌법 IV). "등급구간" 문자열 파싱, 판정, 정합성 검증까지 전부 여기서 다룬다.
 */

/**
 * "90:A;70:B;60:C;0:D" 형태의 문자열을 [{lowerBound, value}, ...]로 파싱한다.
 * 순서를 강제로 정렬하지 않는다 — 정렬 여부 확인은 validateGradeBands의 몫이다.
 */
function parseGradeBands(raw) {
  if (!raw) {
    return [];
  }
  return String(raw)
    .split(';')
    .map(function (pair) {
      var parts = pair.split(':');
      return { lowerBound: Number(parts[0]), value: parts[1] };
    });
}

/**
 * bands가 하한 내림차순으로 이미 정렬돼 있다고 가정하고(정합성 검증에서 보장),
 * 원점수가 하한 이상인 첫 구간의 반영값을 반환한다. 최고 하한을 넘는 원점수는 자연히
 * 그 최고 구간이 적용된다.
 */
function scoreToGrade(rawScore, bands) {
  for (var i = 0; i < bands.length; i++) {
    if (rawScore >= bands[i].lowerBound) {
      return bands[i].value;
    }
  }
  throw new Error('원점수 ' + rawScore + '에 해당하는 등급구간을 찾지 못했습니다');
}

/**
 * 등급구간 정의 자체의 정합성을 검증한다(FR-007): 하한 내림차순, 마지막 하한 0,
 * 하한 중복 없음, 최고 하한이 만점 이하. 문제를 발견한 만큼 문자열 배열로 반환한다.
 */
function validateGradeBands(bands, maxScore) {
  var issues = [];

  if (!bands || bands.length === 0) {
    issues.push('등급구간이 비어 있습니다');
    return issues;
  }

  for (var i = 1; i < bands.length; i++) {
    if (bands[i].lowerBound >= bands[i - 1].lowerBound) {
      issues.push(
        '등급구간이 하한 내림차순이 아닙니다: ' + bands[i - 1].lowerBound + ' 다음에 ' + bands[i].lowerBound
      );
    }
  }

  var last = bands[bands.length - 1];
  if (last.lowerBound !== 0) {
    issues.push('마지막 하한이 0이 아닙니다: ' + last.lowerBound);
  }

  var seen = {};
  bands.forEach(function (band) {
    if (seen[band.lowerBound]) {
      issues.push('하한이 중복됩니다: ' + band.lowerBound);
    }
    seen[band.lowerBound] = true;
  });

  if (typeof maxScore === 'number') {
    var highest = bands[0].lowerBound;
    if (highest > maxScore) {
      issues.push('가장 높은 하한(' + highest + ')이 만점(' + maxScore + ')을 초과합니다');
    }
  }

  return issues;
}

if (typeof module !== 'undefined') {
  module.exports = {
    parseGradeBands: parseGradeBands,
    scoreToGrade: scoreToGrade,
    validateGradeBands: validateGradeBands,
  };
}
