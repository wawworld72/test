/**
 * UC-00: 최초 실행 시 강좌설정·역량과제정의·수강생·주차·Forms·역량과제·변경이력 7개 시트를
 * 생성한다. 여러 번 실행해도 안전하다(FR-005) — 이미 있는 시트는 다시 만들지 않고 누락된 열만
 * 추가하며, 기존 데이터를 덮어쓰거나 삭제하지 않는다. 서식·보호·드롭다운은 매번 다시 적용해
 * 구분 표시가 흐트러졌을 때 복구할 수 있게 한다.
 *
 * 구역 배경색: 교사 입력(흰색, 미지정) / 자동 계산(연한 파랑) / 시스템 기록(연한 회색).
 */

var SHEET_NAMES = {
  COURSE_CONFIG: '강좌설정',
  ASSIGNMENT_DEFINITION: '역량과제정의',
  ROSTER: '수강생',
  WEEKS: '주차',
  FORMS: 'Forms',
  LEDGER: '역량과제',
  CHANGE_LOG: '변경이력',
};

var REGION_COLOR = {
  CALCULATED: '#d9e8fb',
  SYSTEM: '#eeeeee',
};

var SHEET_DEFINITIONS = {};
SHEET_DEFINITIONS[SHEET_NAMES.COURSE_CONFIG] = {
  headers: ['키', '값', '설명'],
  notes: {
    키: '강좌설정 항목의 이름. 코드가 이 이름으로 값을 읽는다.',
    값: '실제 값. 비어 있으면 안 되는 필수 설정들이다.',
    설명: '이 키가 무엇에 쓰이는지 설명.',
  },
  seedRows: [
    ['학기', '', '예: 2026-2'],
    ['과목명', '', '예: 소프트웨어공학'],
    ['분반', '', '예: 01분반 — 조인 키나 주제에는 포함하지 않음'],
    ['코스식별자', '', 'Google Classroom 코스 ID'],
    ['교사이메일', '', '일일 요약·개인 통지 발신자'],
    ['기본종료시각', '18:00', 'override 없는 과제의 기본 마감 시각'],
    ['퀴즈변형수', '3', '학생별로 준비할 퀴즈 변형 개수'],
    ['성적자동반환', 'TRUE', '기능 토글'],
    ['드라이런', 'TRUE', '기능 토글 — 신규 기능 첫 배포 시 TRUE 권장'],
    ['학생통지', 'TRUE', '기능 토글'],
    ['외부전송', 'FALSE', 'Dynalist 연동 토글'],
    ['외부문서식별자', '', 'Dynalist 문서 ID'],
    ['재시도한도', '3', '반복 실패 시 오류로 전환하는 기준 횟수'],
    ['일일요약발송시각', '09:00', '요약 메일 고정 발송 시각'],
  ],
  calculatedColumns: [],
  systemColumns: [],
};
SHEET_DEFINITIONS[SHEET_NAMES.ASSIGNMENT_DEFINITION] = {
  headers: [
    '역량과제유형', '템플릿Form', '팀평가여부', '시작오프셋', '기간', '등급구간', '누적반영가중치',
    '평가항목', '배점', '선택지', '판정수식', '기준값',
  ],
  notes: {
    역량과제유형: '과제 종류 이름. 같은 유형은 여러 행에 반복 입력(항목마다 한 행).',
    템플릿Form: '유형의 첫 행에만: 복사할 템플릿 Form의 Drive 파일 ID.',
    팀평가여부: '유형의 첫 행에만: TRUE/FALSE.',
    시작오프셋: '유형의 첫 행에만: 수업일 기준 시작 시점(예: 0일, 1일).',
    기간: '유형의 첫 행에만: 시작부터 종료까지 기간(예: 7일).',
    등급구간: '유형의 첫 행에만: "하한:반영값" 쌍을 세미콜론으로 나열, 하한 내림차순, 마지막 0.',
    누적반영가중치: '유형의 첫 행에만: 학기 말 누적 성적 집계(FR-048)에서 이 유형에 곱할 가중치. 0이면 집계에서 제외.',
    평가항목: '이 행의 평가 항목 이름. 유형 내에서 중복 불가.',
    배점: '이 항목의 배점(정수).',
    선택지: '드롭다운 선택지 목록(쉼표 구분). 이 항목에서 실제로 받을 수 있는 점수를 그대로 숫자 문자열로 나열한다(예: "0,30,60"). 판정수식과 동시에 채우지 않음.',
    판정수식: '이 항목의 점수를 직접 산출하는 스프레드시트 수식(문자열, 결과가 0~배점 사이의 숫자여야 함). 같은 응답 시트의 열만 참조 가능.',
    기준값: '판정수식이 참조하는 임계값(선택).',
  },
  seedRows: [
    [
      '학습성찰', '', 'FALSE', '0', '7', '90:A;70:B;60:C;0:D', '1',
      '분량', '40', '', '=IF(LEN(응답)>=200,40,0)', '200',
    ],
    ['학습성찰', '', '', '', '', '', '', '성실성', '60', '0,30,60', '', ''],
  ],
  calculatedColumns: [],
  systemColumns: [],
};
SHEET_DEFINITIONS[SHEET_NAMES.ROSTER] = {
  headers: ['학번', '이름', '이메일', '팀'],
  notes: {
    학번: '표기가 달라도(공백, 자리수 등) 정규화 후 동일 학생으로 인식됨.',
    팀: '팀평가 유형에서 사용. 비어 있으면 단독 팀으로 취급.',
  },
  seedRows: [],
  calculatedColumns: [],
  systemColumns: [],
};
SHEET_DEFINITIONS[SHEET_NAMES.WEEKS] = {
  headers: ['주차', '주제', '수업일', '비고'],
  notes: {
    주제: '폼 생성 이후에는 변경하지 않음(조인 키의 일부).',
    수업일: '날짜와 시각을 함께 입력. 모든 과제 일정의 기준점.',
  },
  seedRows: [],
  calculatedColumns: [],
  systemColumns: [],
};
SHEET_DEFINITIONS[SHEET_NAMES.FORMS] = {
  headers: [
    '활성', '주차', '주제', '역량과제', '시작override', '종료override', '비고',
    '시작', '종료',
    '생성Form', '응답시트', '과제ID', '게시상태', '진행상태', '제출수', '미제출수', '성적전송', '전송시각',
  ],
  notes: {
    활성: '체크 해제하면 이 과제 행은 이후 자동화에서 제외됨.',
    시작override: '비워두면 수업일+오프셋으로 자동 계산. 값이 있으면 이 값이 우선.',
    게시상태: '대기/게시/오류 중 하나. 시스템이 관리.',
    진행상태: '대기/수집중/채점중/평가완료/반환완료/오류 중 하나. 시스템이 관리.',
  },
  seedRows: [],
  calculatedColumns: ['시작', '종료'],
  systemColumns: [
    '생성Form', '응답시트', '과제ID', '게시상태', '진행상태', '제출수', '미제출수', '성적전송', '전송시각',
  ],
};
SHEET_DEFINITIONS[SHEET_NAMES.LEDGER] = {
  headers: [
    '주제', '역량과제', '이름', '학번', '평가', '원점수', '만점', '피드백', '점수', '수집상태', '반영', '비고',
  ],
  notes: {
    만점: '저장값이 아니라 역량과제정의 배점 합을 가리키는 참조값.',
    수집상태: '대기/완료. Forms의 진행상태와는 다른, 학생 단위 필드.',
  },
  seedRows: [],
  calculatedColumns: ['평가', '원점수', '만점', '피드백', '점수', '수집상태', '반영'],
  systemColumns: [],
};
SHEET_DEFINITIONS[SHEET_NAMES.CHANGE_LOG] = {
  headers: ['시각', '대상', '이전값', '이후값'],
  notes: {
    대상: '"과제·학번" 형식. 성적이 실제로 바뀐 건만 기록됨(조회·건너뜀은 기록 안 함).',
  },
  seedRows: [],
  calculatedColumns: [],
  systemColumns: ['시각', '대상', '이전값', '이후값'],
};

function bootstrapConfigSheets() {
  var ss = getBoundSpreadsheet();
  Object.keys(SHEET_DEFINITIONS).forEach(function (sheetName) {
    var def = SHEET_DEFINITIONS[sheetName];
    var sheet = ensureSheetWithHeaders(ss, sheetName, def.headers);
    applyHeaderNotes_(sheet, def);
    applyRegionFormatting_(sheet, def);
    seedExampleRowsIfEmpty_(sheet, def);
  });
  return validateConfig();
}

function applyHeaderNotes_(sheet, def) {
  var headerMap = getHeaderMap(sheet);
  Object.keys(def.notes || {}).forEach(function (headerName) {
    var col = headerMap[headerName];
    if (col) {
      sheet.getRange(1, col).setNote(def.notes[headerName]);
    }
  });
}

function applyRegionFormatting_(sheet, def) {
  var headerMap = getHeaderMap(sheet);
  var lastColumn = sheet.getLastColumn();
  var maxRows = Math.max(sheet.getMaxRows(), 200);

  (def.calculatedColumns || []).forEach(function (name) {
    var col = headerMap[name];
    if (col) {
      sheet.getRange(1, col, maxRows, 1).setBackground(REGION_COLOR.CALCULATED);
    }
  });
  (def.systemColumns || []).forEach(function (name) {
    var col = headerMap[name];
    if (col) {
      var range = sheet.getRange(1, col, maxRows, 1);
      range.setBackground(REGION_COLOR.SYSTEM);
      protectWithWarning_(range, name + ' — 자동 처리가 관리하는 열입니다.');
    }
  });

  protectStudentIdColumnAsText_(sheet, headerMap);
  protectFormulaColumnAsText_(sheet, headerMap);
}

function protectWithWarning_(range, description) {
  var protection = range.protect().setDescription(description);
  protection.setWarningOnly(true);
}

function protectStudentIdColumnAsText_(sheet, headerMap) {
  var col = headerMap['학번'];
  if (col) {
    sheet.getRange(1, col, Math.max(sheet.getMaxRows(), 200), 1).setNumberFormat('@');
  }
}

function protectFormulaColumnAsText_(sheet, headerMap) {
  var col = headerMap['판정수식'];
  if (col) {
    sheet.getRange(1, col, Math.max(sheet.getMaxRows(), 200), 1).setNumberFormat('@');
  }
}

function seedExampleRowsIfEmpty_(sheet, def) {
  if (!def.seedRows || def.seedRows.length === 0) {
    return;
  }
  if (sheet.getLastRow() > 1) {
    return;
  }
  sheet.getRange(2, 1, def.seedRows.length, def.seedRows[0].length).setValues(def.seedRows);
}

if (typeof module !== 'undefined') {
  module.exports = { SHEET_NAMES: SHEET_NAMES, SHEET_DEFINITIONS: SHEET_DEFINITIONS };
}
