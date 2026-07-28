/**
 * UC-15: 연계된 문제 만들기 과제의 제출 데이터로 퀴즈 폼을 구성한다 (FR-035, FR-036).
 *
 * 설계 노트(스펙에 명시되지 않아 구현 시 정한 규칙): 문제 만들기 응답 시트는 변형마다
 * "문항N", "정답N", "해설N" 열(N=1..퀴즈변형수)을 가진다고 가정한다. 각 열은 손상 복구를
 * 위해 "원본_문항N" 같은 원본 텍스트 열과 짝을 이룬다(학번/판정수식과 같은 방식으로 텍스트
 * 서식 보호). 문자열이 아닌 값(Sheets가 날짜/숫자로 잘못 해석)이 들어오면 손상으로 보고
 * 원본 열로 복구를 시도한다.
 */

function generateQuizItems(quizFormId, sourceResponseSheetName, variantCount) {
  var ss = getBoundSpreadsheet();
  var sourceSheet = ss.getSheetByName(sourceResponseSheetName);
  if (!sourceSheet) {
    throw new Error('출제 응답 시트를 찾을 수 없습니다: ' + sourceResponseSheetName);
  }
  var quizForm = FormApp.openById(quizFormId);

  clearGeneratedQuizItems_(quizForm);
  quizForm.setIsQuiz(true);

  var submissions = readRowsAsObjects(sourceSheet);
  var questionsPerPage = 10;
  var itemCount = 0;
  var answerMapRows = [];

  submissions.forEach(function (submission) {
    var variantIndex = pickVariantIndex_(submission['학번'], variantCount);
    var question = recoverText_(submission, '문항' + variantIndex);
    var answer = recoverText_(submission, '정답' + variantIndex);
    var explanation = recoverText_(submission, '해설' + variantIndex);

    if (!question || !answer) {
      return; // 유효하지 않은 변형은 건너뛴다(전체 실패로 취급하지 않음)
    }

    if (itemCount > 0 && itemCount % questionsPerPage === 0) {
      quizForm.addPageBreakItem();
    }

    var title = question + '  [출처: ' + submission['학번'] + ']';
    var item = quizForm.addTextItem();
    item.setTitle(title);
    item.setPoints(1);
    if (explanation) {
      var feedback = FormApp.createFeedback().setText(explanation).build();
      item.setGeneralFeedback(feedback);
    }
    // 정답 텍스트는 별도 채점 로직(itemAnalysis.js)에서 응답과 대조해 채점한다 —
    // FormApp의 텍스트 항목 자체에는 "정답" 개념이 없어 자동 채점은 응답 수집 후에 한다.
    // 문항맵에 (헤더, 정답, 출제자학번)을 남겨 이후 응답 시트의 같은 이름 열과 대조한다.
    answerMapRows.push([title, answer, submission['학번']]);

    itemCount += 1;
  });

  if (itemCount === 0) {
    throw new Error('유효한 문항이 하나도 생성되지 않았습니다');
  }

  writeAnswerMap_(quizAnswerMapSheetName(sourceResponseSheetName), answerMapRows);
  return itemCount;
}

function quizAnswerMapSheetName(sourceResponseSheetName) {
  return '문항맵_' + sourceResponseSheetName;
}

function writeAnswerMap_(mapSheetName, rows) {
  var ss = getBoundSpreadsheet();
  var sheet = ss.getSheetByName(mapSheetName);
  if (sheet) {
    ss.deleteSheet(sheet); // 재생성 시 기존 문항맵을 지우고 다시 만든다(재실행 시 중복 방지)
  }
  sheet = ss.insertSheet(mapSheetName);
  sheet.hideSheet();
  sheet.getRange(1, 1, 1, 3).setValues([['문항', '정답', '출제자학번']]);
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, 3).setValues(rows);
  }
}

/**
 * 학번을 시드로 결정적으로 변형 하나를 고른다 — 같은 학생은 재실행해도 같은 변형을
 * 골라 재생성 시 결과가 흔들리지 않는다.
 */
function pickVariantIndex_(studentId, variantCount) {
  var normalized = normalizeStudentId(studentId);
  var sum = 0;
  for (var i = 0; i < normalized.length; i++) {
    sum += normalized.charCodeAt(i);
  }
  return (sum % variantCount) + 1;
}

function recoverText_(submission, fieldName) {
  var value = submission[fieldName];
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  var original = submission['원본_' + fieldName];
  if (typeof original === 'string' && original.trim()) {
    return original.trim();
  }
  return '';
}

function clearGeneratedQuizItems_(form) {
  var items = form.getItems();
  for (var i = items.length - 1; i >= 0; i--) {
    form.deleteItem(items[i]);
  }
}

/**
 * UC-15: 문제 만들기 과제의 수집이 막 끝나(진행상태 채점중 진입) 응답시트가 갖춰진 시점에
 * 연계된 퀴즈 풀기 과제의 문항을 구성한다. 문항맵 시트 존재 여부로 "이미 생성됨"을 판단해
 * 30분 주기 점검이 반복 실행되어도 중복 생성하지 않는다(재실행 안전).
 */
function generateLinkedQuizIfNeeded(sourceFormsRow, linkedQuizFormsRow, variantCount) {
  if (!sourceFormsRow['응답시트'] || !linkedQuizFormsRow['생성Form']) {
    return false;
  }
  var ss = getBoundSpreadsheet();
  var mapSheetName = quizAnswerMapSheetName(sourceFormsRow['응답시트']);
  if (ss.getSheetByName(mapSheetName)) {
    return false;
  }
  generateQuizItems(linkedQuizFormsRow['생성Form'], sourceFormsRow['응답시트'], variantCount);
  return true;
}

/**
 * FR-040/UC-19: 연계 퀴즈의 채점이 끝나면, 문제 만들기 원본 과제의 자체 평가(있다면 그
 * 진행 여부)와 무관하게 진행상태를 평가완료로 강제 전환한다 — "채점중에 남는 연계 과제가
 * 없어야 한다"는 요구를 그대로 따른 설계 결정이다.
 */
function advanceLinkedQuizSourceToEvaluated(sourceFormsRow) {
  if (sourceFormsRow['진행상태'] !== PROGRESS_STATUS.GRADING) {
    return false;
  }
  var ss = getBoundSpreadsheet();
  var formsSheet = getSheetOrThrow(ss, SHEET_NAMES.FORMS);
  writeRowObjectsBatched(formsSheet, [
    { __row: sourceFormsRow.__row, 진행상태: transitionProgress(sourceFormsRow['진행상태'], PROGRESS_STATUS.EVALUATED) },
  ]);
  return true;
}

if (typeof module !== 'undefined') {
  module.exports = {
    generateQuizItems: generateQuizItems,
    pickVariantIndex_: pickVariantIndex_,
    quizAnswerMapSheetName: quizAnswerMapSheetName,
    generateLinkedQuizIfNeeded: generateLinkedQuizIfNeeded,
    advanceLinkedQuizSourceToEvaluated: advanceLinkedQuizSourceToEvaluated,
  };
}
