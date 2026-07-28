/**
 * UC-06: 설정 정합성 검증. 문제가 있으면 이후 자동화(과제 행 생성 등)를 시작하지 않는다
 * (FR-006, FR-007, FR-008). UC-04(판정수식 표본 미리보기, FR-009)도 이 파일에서 다룬다.
 *
 * scoring.js의 parseGradeBands/validateGradeBands를 재사용한다 — 등급구간 판정 로직은
 * 그 한 파일에만 존재해야 하므로(헌법 IV), 여기서 다시 구현하지 않는다.
 */

var CROSS_SHEET_FORMULA_PATTERN = /'[^']+'!|IMPORTRANGE\s*\(/i;

function validateConfig() {
  var ss = getBoundSpreadsheet();
  var issues = [];

  var missingSheets = Object.keys(SHEET_DEFINITIONS).filter(function (name) {
    return !ss.getSheetByName(name);
  });
  if (missingSheets.length > 0) {
    return {
      ok: false,
      issues: ['필수 시트가 없습니다: ' + missingSheets.join(', ') + ' — 먼저 초기 설정을 실행하세요'],
    };
  }

  Object.keys(SHEET_DEFINITIONS).forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    var headerMap = getHeaderMap(sheet);
    var missingHeaders = SHEET_DEFINITIONS[name].headers.filter(function (h) {
      return !headerMap[h];
    });
    if (missingHeaders.length > 0) {
      issues.push(name + ' 시트에 필수 열이 없습니다: ' + missingHeaders.join(', '));
    }
  });
  if (issues.length > 0) {
    return { ok: false, issues: issues };
  }

  issues = issues.concat(validateAssignmentDefinitions_(ss));
  issues = issues.concat(validateActiveFormsRows_(ss));

  return { ok: issues.length === 0, issues: issues };
}

function groupDefinitionRowsByType(rows) {
  var groups = {};
  var order = [];
  rows.forEach(function (row) {
    var type = row['역량과제유형'];
    if (!type) {
      return;
    }
    if (!groups[type]) {
      groups[type] = [];
      order.push(type);
    }
    groups[type].push(row);
  });
  return { groups: groups, order: order };
}

var TYPE_LEVEL_ATTRIBUTES = ['템플릿Form', '팀평가여부', '시작오프셋', '기간', '등급구간', '누적반영가중치'];

function validateAssignmentDefinitions_(ss) {
  var issues = [];
  var sheet = ss.getSheetByName(SHEET_NAMES.ASSIGNMENT_DEFINITION);
  var rows = readRowsAsObjects(sheet);
  var grouped = groupDefinitionRowsByType(rows);

  grouped.order.forEach(function (type) {
    var groupRows = grouped.groups[type];
    var firstRow = groupRows[0];

    TYPE_LEVEL_ATTRIBUTES.forEach(function (attr) {
      if (firstRow[attr] === '' || firstRow[attr] === null || firstRow[attr] === undefined) {
        issues.push('[' + type + '] 유형 첫 행에 ' + attr + ' 값이 없습니다');
        return;
      }
      var distinctValues = {};
      distinctValues[firstRow[attr]] = true;
      groupRows.slice(1).forEach(function (row) {
        var value = row[attr];
        if (value !== '' && value !== null && value !== undefined) {
          distinctValues[value] = true;
        }
      });
      if (Object.keys(distinctValues).length > 1) {
        issues.push('[' + type + '] 유형 그룹 내 ' + attr + ' 값이 서로 다릅니다');
      }
    });

    var itemNames = {};
    var totalScore = 0;
    groupRows.forEach(function (row) {
      var itemName = row['평가항목'];
      if (!itemName) {
        return;
      }
      if (itemNames[itemName]) {
        issues.push('[' + type + '] 평가항목명이 중복됩니다: ' + itemName);
      }
      itemNames[itemName] = true;
      totalScore += Number(row['배점']) || 0;

      if (row['선택지'] && row['판정수식']) {
        issues.push('[' + type + '] ' + itemName + ' 항목에 선택지와 판정수식이 모두 채워져 있습니다');
      }
      if (row['판정수식'] && CROSS_SHEET_FORMULA_PATTERN.test(row['판정수식'])) {
        issues.push('[' + type + '] ' + itemName + ' 판정수식이 다른 시트를 참조합니다: ' + row['판정수식']);
      }
      if (row['판정수식']) {
        previewFormulaReferences_(type, itemName, row['판정수식'], Object.keys(itemNames)).forEach(function (msg) {
          issues.push(msg);
        });
      }
    });

    if (totalScore === 0) {
      issues.push('[' + type + '] 배점 합이 0입니다');
    }

    var bands = parseGradeBands(firstRow['등급구간']);
    validateGradeBands(bands, totalScore).forEach(function (msg) {
      issues.push('[' + type + '] ' + msg);
    });
  });

  var typeNames = grouped.order;
  var hasQuizMaker = typeNames.indexOf('문제 만들기') !== -1;
  var hasQuizTaker = typeNames.indexOf('퀴즈 풀기') !== -1;
  if (hasQuizMaker !== hasQuizTaker) {
    issues.push(
      '연계 유형("문제 만들기"·"퀴즈 풀기") 중 하나만 정의돼 있습니다 — 코드가 전제하는 연계 유형명이 부재합니다'
    );
  }

  return issues;
}

/**
 * 판정수식 표본 미리보기(FR-009)의 근사 구현: 실제 스프레드시트 계산 엔진 없이는 수식 값을
 * 그대로 재현할 수 없으므로(research.md #5 — 계산은 시트 엔진에 위임), 여기서는 수식이 참조하는
 * 것으로 보이는 평가항목 이름들이 같은 유형 안에 실제로 존재하는지만 정적으로 확인한다.
 * 존재하지 않는 이름을 참조하면 "미해결 참조"로 보고한다.
 */
function previewFormulaReferences_(type, itemName, formula, knownItemNames) {
  var issues = [];
  var candidateRefs = formula.match(/[A-Za-z가-힣_][A-Za-z0-9가-힣_]*/g) || [];
  var knownSet = {};
  knownItemNames.forEach(function (n) {
    knownSet[n] = true;
  });

  candidateRefs.forEach(function (ref) {
    var looksLikeItemReference = knownSet[ref] !== undefined;
    var isKnownFunctionOrSelf = /^[A-Z]+$/.test(ref) || ref === itemName;
    if (!looksLikeItemReference && !isKnownFunctionOrSelf && ref.length > 1) {
      // 알려진 평가항목 이름도 아니고, 대문자 함수명(LEN, IF 등)도 아니고, 자기 자신도 아니면
      // 아직 정의되지 않은 항목을 참조하는 것으로 간주한다.
      issues.push('[' + type + '] ' + itemName + ' 판정수식이 미해결 참조를 포함합니다: ' + ref);
    }
  });

  return issues;
}

function validateActiveFormsRows_(ss) {
  var issues = [];
  var sheet = ss.getSheetByName(SHEET_NAMES.FORMS);
  var weeksSheet = ss.getSheetByName(SHEET_NAMES.WEEKS);
  var rows = readRowsAsObjects(sheet);
  var weekRows = readRowsAsObjects(weeksSheet);
  var knownTopics = {};
  weekRows.forEach(function (w) {
    if (w['주제']) {
      knownTopics[w['주제']] = true;
    }
  });

  rows
    .filter(function (row) {
      return row['활성'] === true || row['활성'] === 'TRUE';
    })
    .forEach(function (row) {
      if (!knownTopics[row['주제']]) {
        issues.push('활성 과제 행의 주제가 주차 시트에 없습니다: ' + row['주제']);
      }
      if (!row['시작'] || !row['종료']) {
        issues.push('활성 과제 행의 시작 또는 종료가 비어 있습니다: ' + row['주제'] + '/' + row['역량과제']);
      }
    });

  return issues;
}

if (typeof module !== 'undefined') {
  module.exports = { validateConfig: validateConfig };
}
