/**
 * SpreadsheetApp 호출을 전담하는 게이트웨이. 열은 항상 헤더 이름으로 조회한다 — 열 위치나
 * 항목 인덱스를 하드코딩하지 않는다(헌법 IV). logic/gateway 계층은 이 파일을 통해서만 시트에
 * 접근하고, UI 호출(getUi/alert)은 여기서도 하지 않는다(헌법 VI).
 */

function getBoundSpreadsheet() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * 1-based 열 번호를 A1 표기 열 문자로 바꾼다(1 -> A, 27 -> AA).
 */
function columnToLetter(column) {
  var letter = '';
  var n = column;
  while (n > 0) {
    var remainder = (n - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

function getSheetOrThrow(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('시트를 찾을 수 없습니다: ' + sheetName);
  }
  return sheet;
}

/**
 * 헤더 행(1행)을 읽어 { 헤더이름: 1-based 열 번호 } 맵을 반환한다.
 */
function getHeaderMap(sheet) {
  var lastColumn = sheet.getLastColumn();
  if (lastColumn === 0) {
    return {};
  }
  var headerRow = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  var map = {};
  for (var i = 0; i < headerRow.length; i++) {
    var name = String(headerRow[i]).trim();
    if (name) {
      map[name] = i + 1;
    }
  }
  return map;
}

function getColumnIndexByHeader(headerMap, headerName) {
  var index = headerMap[headerName];
  if (!index) {
    throw new Error('헤더를 찾을 수 없습니다: ' + headerName);
  }
  return index;
}

/**
 * 데이터 행(2행부터)을 헤더 이름 기준 객체 배열로 한 번에 읽는다(범위 단위 배치 읽기).
 */
function readRowsAsObjects(sheet) {
  var lastRow = sheet.getLastRow();
  var lastColumn = sheet.getLastColumn();
  if (lastRow < 2 || lastColumn === 0) {
    return [];
  }
  var headerMap = getHeaderMap(sheet);
  var headerNames = Object.keys(headerMap);
  var values = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();

  return values.map(function (row, rowOffset) {
    var obj = { __row: rowOffset + 2 };
    headerNames.forEach(function (name) {
      obj[name] = row[headerMap[name] - 1];
    });
    return obj;
  });
}

/**
 * 객체 배열을 헤더 순서에 맞춰 한 번에 씀(범위 단위 배치 쓰기). rowObjects는 __row(1-based 행
 * 번호)를 포함해야 하며, 서로 다른 __row라도 같은 시트라면 한 번의 setValues 호출로 묶는다.
 */
function writeRowObjectsBatched(sheet, rowObjects) {
  if (rowObjects.length === 0) {
    return;
  }
  var headerMap = getHeaderMap(sheet);
  var headerNames = Object.keys(headerMap);
  var lastColumn = sheet.getLastColumn();

  var rowsByNumber = {};
  rowObjects.forEach(function (obj) {
    rowsByNumber[obj.__row] = obj;
  });
  var rowNumbers = Object.keys(rowsByNumber)
    .map(Number)
    .sort(function (a, b) {
      return a - b;
    });

  var minRow = rowNumbers[0];
  var maxRow = rowNumbers[rowNumbers.length - 1];
  var range = sheet.getRange(minRow, 1, maxRow - minRow + 1, lastColumn);
  var existing = range.getValues();

  rowNumbers.forEach(function (rowNumber) {
    var obj = rowsByNumber[rowNumber];
    var localIndex = rowNumber - minRow;
    headerNames.forEach(function (name) {
      if (Object.prototype.hasOwnProperty.call(obj, name)) {
        existing[localIndex][headerMap[name] - 1] = obj[name];
      }
    });
  });

  range.setValues(existing);
}

/**
 * 시트가 없으면 헤더와 함께 생성하고, 있으면 누락된 헤더 열만 뒤에 추가한다(멱등, FR-005).
 * 기존 데이터는 절대 지우거나 덮어쓰지 않는다.
 */
function ensureSheetWithHeaders(ss, sheetName, headers) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return sheet;
  }

  var existingHeaderMap = getHeaderMap(sheet);
  var missing = headers.filter(function (h) {
    return !existingHeaderMap[h];
  });
  if (missing.length > 0) {
    var startColumn = sheet.getLastColumn() + 1;
    sheet.getRange(1, startColumn, 1, missing.length).setValues([missing]);
  }
  sheet.setFrozenRows(1);
  return sheet;
}

/**
 * append-only 탭(예: 변경이력)에 여러 행을 한 번에 추가한다. rows는 헤더 순서에 맞춘 2차원
 * 배열이어야 한다. rows가 비어 있으면 아무 것도 쓰지 않는다(변경 없으면 쓰기도 없음, FR-059).
 */
function appendRowsBatched(sheet, rows) {
  if (!rows || rows.length === 0) {
    return;
  }
  var startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);
}

if (typeof module !== 'undefined') {
  module.exports = {
    getBoundSpreadsheet: getBoundSpreadsheet,
    getSheetOrThrow: getSheetOrThrow,
    getHeaderMap: getHeaderMap,
    getColumnIndexByHeader: getColumnIndexByHeader,
    readRowsAsObjects: readRowsAsObjects,
    writeRowObjectsBatched: writeRowObjectsBatched,
    ensureSheetWithHeaders: ensureSheetWithHeaders,
    appendRowsBatched: appendRowsBatched,
    columnToLetter: columnToLetter,
  };
}
