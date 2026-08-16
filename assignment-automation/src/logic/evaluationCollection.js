/**
 * UC-17/UC-20/UC-24: 응답 시트에 평가 항목 열을 준비하고(FR-022~024), 대장 행으로 평가를
 * 모으며(FR-025~027), 미제출 학생을 처리한다(FR-034).
 *
 * 설계 노트: 선택지/판정수식 값은 그 항목에서 실제로 받을 점수를 나타내는 숫자여야 한다고
 * 가정한다(예: 선택지 "0,30,60", 판정수식 결과가 0~배점 사이 숫자). 원본 입력에는 항목별
 * "몇 점을 받았는가"를 텍스트로 정하는 별도 매핑이 정의돼 있지 않아, 숫자 자체를 판정
 * 결과이자 원점수 계산의 원천으로 겸용하는 것이 가장 단순한 해석이다.
 */

function prepareEvaluationColumns(formsRow) {
  var ss = getBoundSpreadsheet();
  var responseSheet = ss.getSheetByName(formsRow['응답시트']);
  if (!responseSheet) {
    return false;
  }

  var definitionSheet = getSheetOrThrow(ss, SHEET_NAMES.ASSIGNMENT_DEFINITION);
  var grouped = groupDefinitionRowsByType(readRowsAsObjects(definitionSheet));
  var typeDefs = grouped.groups[formsRow['역량과제']] || [];
  if (typeDefs.length === 0) {
    return false;
  }
  var isTeamType = typeDefs[0]['팀평가여부'] === true || typeDefs[0]['팀평가여부'] === 'TRUE';

  var existingHeaders = Object.keys(getHeaderMap(responseSheet));
  var itemNames = typeDefs.map(function (d) {
    return d['평가항목'];
  });
  var desiredHeaders = existingHeaders.concat(itemNames);
  if (isTeamType) {
    desiredHeaders = desiredHeaders.concat(['대표행']);
  }
  ensureSheetWithHeaders(ss, formsRow['응답시트'], desiredHeaders);

  var headerMap = getHeaderMap(responseSheet);
  var lastRow = responseSheet.getLastRow();
  if (lastRow < 2) {
    return true;
  }

  if (isTeamType) {
    assignTeamRepresentatives_(responseSheet, headerMap);
  }

  typeDefs.forEach(function (item) {
    var col = headerMap[item['평가항목']];
    if (!col) {
      return;
    }
    if (item['선택지']) {
      applyDropdown_(responseSheet, col, lastRow, String(item['선택지']).split(','));
    } else if (item['판정수식']) {
      applyFormula_(responseSheet, col, lastRow, item['판정수식'], headerMap, isTeamType);
    }
  });

  return true;
}

function assignTeamRepresentatives_(sheet, headerMap) {
  var repCol = headerMap['대표행'];
  var studentIdCol = headerMap['학번'];
  if (!repCol || !studentIdCol) {
    return;
  }

  var roster = readRowsAsObjects(getSheetOrThrow(getBoundSpreadsheet(), SHEET_NAMES.ROSTER));
  var teamByStudent = {};
  roster.forEach(function (r) {
    teamByStudent[normalizeStudentId(r['학번'])] = r['팀'] || '__' + normalizeStudentId(r['학번']);
  });

  var lastRow = sheet.getLastRow();
  var numRows = lastRow - 1;
  var lastColumn = sheet.getLastColumn();
  var range = sheet.getRange(2, 1, numRows, lastColumn);
  var values = range.getValues();
  var seenTeams = {};
  var changed = false;

  for (var i = 0; i < values.length; i++) {
    var existing = values[i][repCol - 1];
    if (existing === true || existing === false) {
      continue; // 이미 결정된 대표 행 여부는 다시 바꾸지 않는다(FR-023).
    }
    var studentId = normalizeStudentId(values[i][studentIdCol - 1]);
    var team = teamByStudent[studentId] || '__' + studentId;
    if (!seenTeams[team]) {
      seenTeams[team] = true;
      values[i][repCol - 1] = true;
    } else {
      values[i][repCol - 1] = false;
    }
    changed = true;
  }
  if (changed) {
    range.setValues(values);
  }
}

function applyDropdown_(sheet, col, lastRow, choices) {
  var numRows = lastRow - 1;
  if (numRows <= 0) {
    return;
  }
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(choices, true).build();
  sheet.getRange(2, col, numRows, 1).setDataValidation(rule);
}

function applyFormula_(sheet, targetCol, lastRow, formulaTemplate, headerMap, isTeamType) {
  var repCol = headerMap['대표행'];
  for (var r = 2; r <= lastRow; r++) {
    if (isTeamType && repCol) {
      var isRep = sheet.getRange(r, repCol).getValue();
      if (isRep !== true) {
        continue; // 대표 행에만 수식을 넣는다 — 나머지는 평가 수집 단계에서 대표 값을 따른다.
      }
    }
    var rowFormula = substituteColumnRefs_(formulaTemplate, headerMap, r);
    sheet.getRange(r, targetCol).setFormula(rowFormula);
  }
}

function substituteColumnRefs_(formulaTemplate, headerMap, rowNumber) {
  var result = formulaTemplate;
  Object.keys(headerMap).forEach(function (name) {
    var col = headerMap[name];
    var a1 = columnToLetter(col) + rowNumber;
    var pattern = new RegExp('(?<![A-Za-z0-9가-힣_])' + escapeRegExp_(name) + '(?![A-Za-z0-9가-힣_])', 'g');
    result = result.replace(pattern, a1);
  });
  return result;
}

function escapeRegExp_(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * UC-20: 수집상태가 대기인 대장 행만 골라 응답 시트에서 평가 값을 가져온다(FR-025~027).
 * 제출물이 없으면 원점수 0으로 확정, 제출은 했지만 항목이 비어 있으면 대기 유지(FR-026).
 */
function collectEvaluations(formsRow) {
  var ss = getBoundSpreadsheet();
  var ledgerSheet = getSheetOrThrow(ss, SHEET_NAMES.LEDGER);
  var responseSheet = ss.getSheetByName(formsRow['응답시트']);
  var definitionSheet = getSheetOrThrow(ss, SHEET_NAMES.ASSIGNMENT_DEFINITION);
  var grouped = groupDefinitionRowsByType(readRowsAsObjects(definitionSheet));
  var typeDefs = grouped.groups[formsRow['역량과제']] || [];
  var itemNames = typeDefs.map(function (d) {
    return d['평가항목'];
  });

  var pendingLedgerRows = readRowsAsObjects(ledgerSheet).filter(function (row) {
    return row['주제'] === formsRow['주제'] && row['역량과제'] === formsRow['역량과제'] && row['수집상태'] === '대기';
  });
  if (pendingLedgerRows.length === 0) {
    return 0;
  }

  var responsesByStudent = {};
  if (responseSheet) {
    var responseHeaderMap = getHeaderMap(responseSheet);
    var isTeamType = responseHeaderMap['대표행'] !== undefined;
    readRowsAsObjects(responseSheet).forEach(function (r) {
      var key = normalizeStudentId(r['학번']);
      responsesByStudent[key] = r;
    });
    if (isTeamType) {
      // 팀평가: 팀원 각자의 응답 행이 아니라, 같은 팀 대표 행의 값을 모두가 공유한다.
      var roster = readRowsAsObjects(getSheetOrThrow(ss, SHEET_NAMES.ROSTER));
      var teamByStudent = {};
      roster.forEach(function (r) {
        teamByStudent[normalizeStudentId(r['학번'])] = r['팀'];
      });
      var repRowByTeam = {};
      readRowsAsObjects(responseSheet).forEach(function (r) {
        if (r['대표행'] === true) {
          var repTeam = teamByStudent[normalizeStudentId(r['학번'])];
          repRowByTeam[repTeam] = r;
        }
      });
      Object.keys(teamByStudent).forEach(function (studentKey) {
        var team = teamByStudent[studentKey];
        if (repRowByTeam[team]) {
          responsesByStudent[studentKey] = repRowByTeam[team];
        }
      });
    }
  }

  var updates = [];
  pendingLedgerRows.forEach(function (ledgerRow) {
    var studentKey = normalizeStudentId(ledgerRow['학번']);
    var response = responsesByStudent[studentKey];

    if (!response) {
      updates.push({
        __row: ledgerRow.__row,
        원점수: 0,
        평가: '(미제출)',
        수집상태: '완료',
      });
      return;
    }

    var allFilled = itemNames.every(function (name) {
      return response[name] !== '' && response[name] !== null && response[name] !== undefined;
    });
    if (!allFilled) {
      return; // 아직 평가 미완료 — 대기 유지, 다음 실행에서 재시도
    }

    var rawScore = itemNames.reduce(function (sum, name) {
      return sum + (Number(response[name]) || 0);
    }, 0);
    var evaluationText = itemNames
      .map(function (name) {
        return name + ':' + response[name];
      })
      .join(', ');

    updates.push({
      __row: ledgerRow.__row,
      원점수: rawScore,
      평가: evaluationText,
      피드백: response['피드백'] || '',
      수집상태: '완료',
    });
  });

  if (updates.length > 0) {
    writeRowObjectsBatched(ledgerSheet, updates);
  }
  return updates.length;
}

/**
 * UC-24: 마감 후 미제출 학생을 식별해 원점수 0을 부여한다. collectEvaluations가 이미
 * "응답 없음 → 0점 확정"을 처리하므로, 여기서는 코스 구성원이 아닌 학생을 대상에서 제외하고
 * 그 사실을 로그로 남기는 추가 필터만 수행한다(FR-034).
 */
function excludeNonCourseMembers(ledgerRows, courseStudentIds) {
  var courseSet = {};
  courseStudentIds.forEach(function (id) {
    courseSet[normalizeStudentId(id)] = true;
  });
  var excluded = [];
  var kept = ledgerRows.filter(function (row) {
    var isMember = courseSet[normalizeStudentId(row['학번'])];
    if (!isMember) {
      excluded.push(row);
    }
    return isMember;
  });
  return { kept: kept, excluded: excluded };
}

if (typeof module !== 'undefined') {
  module.exports = {
    prepareEvaluationColumns: prepareEvaluationColumns,
    collectEvaluations: collectEvaluations,
    excludeNonCourseMembers: excludeNonCourseMembers,
  };
}
