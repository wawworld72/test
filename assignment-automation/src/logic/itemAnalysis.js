/**
 * UC-16: 퀴즈 자동 채점과 문항 분석 (FR-037, FR-038, FR-039). 정답은 quizGeneration.js가
 * 만든 "문항맵" 시트(문항 헤더 ↔ 정답·출제자학번)를 기준으로 대조한다.
 */

function normalizeAnswer_(value) {
  return String(value === null || value === undefined ? '' : value).trim().toLowerCase();
}

function average_(numbers) {
  if (numbers.length === 0) {
    return 0;
  }
  return numbers.reduce(function (a, b) { return a + b; }, 0) / numbers.length;
}

function variance_(numbers) {
  if (numbers.length === 0) {
    return 0;
  }
  var mean = average_(numbers);
  return average_(numbers.map(function (n) { return (n - mean) * (n - mean); }));
}

function standardDeviation_(numbers) {
  return Math.sqrt(variance_(numbers));
}

function computeDiscrimination_(itemScores, totalScores) {
  var paired = itemScores.map(function (s, i) {
    return { item: s, total: totalScores[i] };
  });
  paired.sort(function (a, b) {
    return b.total - a.total;
  });
  var groupSize = Math.max(1, Math.round(paired.length * 0.27));
  var top = paired.slice(0, groupSize);
  var bottom = paired.slice(paired.length - groupSize);
  var topRate = average_(top.map(function (p) { return p.item; }));
  var bottomRate = average_(bottom.map(function (p) { return p.item; }));
  return { discrimination: topRate - bottomRate, topRate: topRate, bottomRate: bottomRate };
}

function pointBiserialCorrelation_(itemScores, totalScores) {
  var n = itemScores.length;
  if (n === 0) {
    return 0;
  }
  var p = average_(itemScores);
  var q = 1 - p;
  if (p === 0 || q === 0) {
    return 0;
  }
  var correctTotals = [];
  var incorrectTotals = [];
  for (var i = 0; i < n; i++) {
    if (itemScores[i] === 1) {
      correctTotals.push(totalScores[i]);
    } else {
      incorrectTotals.push(totalScores[i]);
    }
  }
  var stdTotal = standardDeviation_(totalScores);
  if (stdTotal === 0) {
    return 0;
  }
  return ((average_(correctTotals) - average_(incorrectTotals)) / stdTotal) * Math.sqrt(p * q);
}

function cronbachAlpha_(itemScoreArrays) {
  var k = itemScoreArrays.length;
  if (k < 2 || itemScoreArrays[0].length === 0) {
    return null;
  }
  var itemVariances = itemScoreArrays.map(function (scores) {
    return variance_(scores);
  });
  var n = itemScoreArrays[0].length;
  var totalScores = [];
  for (var i = 0; i < n; i++) {
    var sum = 0;
    itemScoreArrays.forEach(function (scores) {
      sum += scores[i];
    });
    totalScores.push(sum);
  }
  var totalVariance = variance_(totalScores);
  if (totalVariance === 0) {
    return null;
  }
  var sumItemVariance = itemVariances.reduce(function (a, b) { return a + b; }, 0);
  return (k / (k - 1)) * (1 - sumItemVariance / totalVariance);
}

function classifyItem_(correctRate, discrimination) {
  if (discrimination < 0) {
    return '출제 오류 의심';
  }
  if (correctRate < 0.3) {
    return '오개념';
  }
  if (correctRate > 0.9 && discrimination < 0.1) {
    return '상위권 함정';
  }
  if (discrimination < 0.15) {
    return '폐기 검토';
  }
  if (correctRate > 0.6 && discrimination > 0.3) {
    return '우수 문항';
  }
  return '보통';
}

function detectAnswerMismatch_(responses, header, declaredAnswer) {
  var freq = {};
  responses.forEach(function (r) {
    var v = normalizeAnswer_(r[header]);
    freq[v] = (freq[v] || 0) + 1;
  });
  var mostCommon = Object.keys(freq).reduce(function (a, b) {
    return freq[a] >= freq[b] ? a : b;
  }, '');
  return !!mostCommon && mostCommon !== normalizeAnswer_(declaredAnswer);
}

/**
 * FR-038 "선택지별 오답 분포": 정답을 제외한 나머지 응답 값별 빈도.
 */
function computeWrongAnswerDistribution_(responses, header, declaredAnswer) {
  var normalizedAnswer = normalizeAnswer_(declaredAnswer);
  var distribution = {};
  responses.forEach(function (r) {
    var v = normalizeAnswer_(r[header]);
    if (!v || v === normalizedAnswer) {
      return;
    }
    distribution[v] = (distribution[v] || 0) + 1;
  });
  return distribution;
}

/**
 * 연계 과제(문제 만들기 → 퀴즈 풀기)가 있는 퀴즈에 대해 학생별 점수와 문항별 지표를
 * 산출한다(FR-037, FR-038). answerMapRows는 [{문항, 정답, 출제자학번}, ...] 형태다.
 */
function analyzeQuizResponses(responseRows, answerMapRows) {
  var answerMap = {};
  answerMapRows.forEach(function (r) {
    answerMap[r['문항']] = { 정답: r['정답'], 출제자학번: r['출제자학번'] };
  });
  var questionHeaders = Object.keys(answerMap);

  var itemScoresByHeader = {};
  questionHeaders.forEach(function (header) {
    itemScoresByHeader[header] = responseRows.map(function (resp) {
      return normalizeAnswer_(resp[header]) === normalizeAnswer_(answerMap[header].정답) ? 1 : 0;
    });
  });

  var totalScores = responseRows.map(function (_, idx) {
    return questionHeaders.reduce(function (sum, header) {
      return sum + itemScoresByHeader[header][idx];
    }, 0);
  });

  var items = {};
  questionHeaders.forEach(function (header) {
    var scores = itemScoresByHeader[header];
    var correctRate = average_(scores);
    var discriminationResult = computeDiscrimination_(scores, totalScores);
    items[header] = {
      정답률: correctRate,
      변별력: discriminationResult.discrimination,
      상위집단정답률: discriminationResult.topRate,
      하위집단정답률: discriminationResult.bottomRate,
      총점상관: pointBiserialCorrelation_(scores, totalScores),
      출제자학번: answerMap[header].출제자학번,
      분류: classifyItem_(correctRate, discriminationResult.discrimination),
      정답불일치: detectAnswerMismatch_(responseRows, header, answerMap[header].정답),
      오답분포: computeWrongAnswerDistribution_(responseRows, header, answerMap[header].정답),
    };
  });

  var reliability = cronbachAlpha_(questionHeaders.map(function (h) { return itemScoresByHeader[h]; }));

  var scoresByStudent = {};
  responseRows.forEach(function (resp, idx) {
    scoresByStudent[normalizeStudentId(resp['학번'])] = totalScores[idx];
  });

  return { items: items, reliability: reliability, scoresByStudent: scoresByStudent };
}

/**
 * FR-039: 연계 과제 관계가 없는 퀴즈(시험 등)는 문항 분석 없이 정답 대조만으로 총점을
 * 산출한다. 이는 실패로 취급되지 않는다.
 */
function computeSimpleQuizScores(responseRows, answerMapRows) {
  var answerMap = {};
  answerMapRows.forEach(function (r) {
    answerMap[r['문항']] = r['정답'];
  });
  var questionHeaders = Object.keys(answerMap);

  var scoresByStudent = {};
  responseRows.forEach(function (resp) {
    var score = questionHeaders.reduce(function (sum, header) {
      return sum + (normalizeAnswer_(resp[header]) === normalizeAnswer_(answerMap[header]) ? 1 : 0);
    }, 0);
    scoresByStudent[normalizeStudentId(resp['학번'])] = score;
  });
  return scoresByStudent;
}

/**
 * FR-047: 문항 개선 자료로 보낼 대상을 추린다 — 문제 있는 분류(출제 오류 의심/오개념/상위권
 * 함정)와 정답 불일치 문항은 전부, 우수 문항은 "일부"(표본)만 보낸다. 전부 보내면 개선이
 * 필요한 자료를 골라낸다는 목적에서 벗어난다.
 */
function selectItemsForImprovement(items, excellentSampleSize) {
  var sampleSize = excellentSampleSize || 3;
  var problematic = [];
  var excellent = [];
  Object.keys(items).forEach(function (title) {
    var item = items[title];
    var entry = Object.assign({ 문항: title }, item);
    var isProblematic =
      item.분류 === '출제 오류 의심' || item.분류 === '오개념' || item.분류 === '상위권 함정' || item.정답불일치;
    if (isProblematic) {
      problematic.push(entry);
    } else if (item.분류 === '우수 문항') {
      excellent.push(entry);
    }
  });
  return problematic.concat(excellent.slice(0, sampleSize));
}

function quizItemAnalysisSheetName(quizResponseSheetName) {
  return '문항분석_' + quizResponseSheetName;
}

/**
 * 문항별 지표를 숨은 시트에 남긴다 — 출제자(학번)별로 조회할 수 있도록(FR-038, "출제자와
 * 문항을 연결해 기록"). 재실행 시 통째로 지우고 다시 만든다(문항맵과 같은 관례).
 */
function writeItemAnalysis_(sheetName, items) {
  var ss = getBoundSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (sheet) {
    ss.deleteSheet(sheet);
  }
  sheet = ss.insertSheet(sheetName);
  sheet.hideSheet();
  var header = ['문항', '출제자학번', '정답률', '변별력', '총점상관', '분류', '정답불일치', '오답분포'];
  sheet.getRange(1, 1, 1, header.length).setValues([header]);
  var rows = Object.keys(items).map(function (title) {
    var it = items[title];
    return [
      title,
      it.출제자학번,
      it.정답률,
      it.변별력,
      it.총점상관,
      it.분류,
      it.정답불일치,
      JSON.stringify(it.오답분포),
    ];
  });
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, header.length).setValues(rows);
  }
}

/**
 * UC-17 연속: 자동 채점 결과(scoresByStudent)를 대장(역량과제 시트)의 원점수로 반영한다.
 * collectEvaluations(evaluationCollection.js)와 같은 규칙을 따른다 — 응답 없으면 0점으로
 * 확정, 수집상태가 이미 대기가 아닌 행은 건드리지 않는다(FR-025~027 재사용). 문항별 지표가
 * 있으면(연계 퀴즈) 숨은 분석 시트에도 남긴다.
 */
function collectQuizScores(formsRow, scoresByStudent, analysisResult) {
  var ss = getBoundSpreadsheet();
  var ledgerSheet = getSheetOrThrow(ss, SHEET_NAMES.LEDGER);
  var pendingLedgerRows = readRowsAsObjects(ledgerSheet).filter(function (row) {
    return row['주제'] === formsRow['주제'] && row['역량과제'] === formsRow['역량과제'] && row['수집상태'] === '대기';
  });
  if (pendingLedgerRows.length === 0) {
    return 0;
  }

  var updates = pendingLedgerRows.map(function (row) {
    var key = normalizeStudentId(row['학번']);
    var score = scoresByStudent[key];
    if (score === undefined) {
      return { __row: row.__row, 원점수: 0, 평가: '(미제출)', 수집상태: '완료' };
    }
    return { __row: row.__row, 원점수: score, 평가: '자동채점', 수집상태: '완료' };
  });
  writeRowObjectsBatched(ledgerSheet, updates);

  if (analysisResult && analysisResult.items && formsRow['응답시트']) {
    writeItemAnalysis_(quizItemAnalysisSheetName(formsRow['응답시트']), analysisResult.items);
  }
  return updates.length;
}

if (typeof module !== 'undefined') {
  module.exports = {
    analyzeQuizResponses: analyzeQuizResponses,
    computeSimpleQuizScores: computeSimpleQuizScores,
    collectQuizScores: collectQuizScores,
    quizItemAnalysisSheetName: quizItemAnalysisSheetName,
    selectItemsForImprovement: selectItemsForImprovement,
  };
}
