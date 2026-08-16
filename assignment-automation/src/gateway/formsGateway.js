/**
 * FormApp/DriveApp 호출 전담 (FR-013, FR-014). 템플릿 Form을 복사해 생성 Form을 만들고,
 * 응답 목적지를 스프레드시트로 연결한 뒤 새로 생긴 응답 시트를 찾아 정리한다.
 *
 * 참고: Forms API는 "복제" 전용 메서드가 없어 Drive 파일 복사가 표준 패턴이다(research.md #2).
 * 응답 시트 생성은 비동기라 즉시 보이지 않을 수 있으므로, 호출부(Triggers.js)가 여러 실행에
 * 걸쳐 재시도하는 구조로 설계돼 있다 — 이 파일은 "한 번 시도"만 책임진다.
 */

function createGeneratedForm(templateFormId, title, topic) {
  var copiedFile = DriveApp.getFileById(templateFormId).makeCopy(title);
  var form = FormApp.openById(copiedFile.getId());
  form.setTitle(title);
  lockTopicChoiceItem_(form, topic);
  return form.getId();
}

function lockTopicChoiceItem_(form, topic) {
  var items = form.getItems();
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    if (String(item.getTitle()).indexOf('주제') === -1) {
      continue;
    }
    if (item.getType() === FormApp.ItemType.LIST) {
      item.asListItem().setChoiceValues([topic]);
      return;
    }
    if (item.getType() === FormApp.ItemType.MULTIPLE_CHOICE) {
      item.asMultipleChoiceItem().setChoiceValues([topic]);
      return;
    }
  }
}

/**
 * 응답 목적지를 스프레드시트로 연결하고, 새로 생긴 응답 시트를 찾아 이름을 정리·숨김
 * 처리한 뒤 그 이름을 반환한다. 아직 시트가 생기지 않았으면 null을 반환한다(호출부가 다음
 * 실행에서 재시도).
 */
function linkAndPrepareResponseSheet(formId, spreadsheetId, responseSheetTitle) {
  var form = FormApp.openById(formId);
  var ss = SpreadsheetApp.openById(spreadsheetId);
  var before = ss.getSheets().map(function (s) {
    return s.getName();
  });

  if (form.getDestinationId() !== spreadsheetId) {
    form.setDestination(FormApp.DestinationType.SPREADSHEET, spreadsheetId);
  }

  var after = ss.getSheets().map(function (s) {
    return s.getName();
  });
  var newSheetName = after.filter(function (name) {
    return before.indexOf(name) === -1;
  })[0];

  if (!newSheetName) {
    return null;
  }

  var sheet = ss.getSheetByName(newSheetName);
  sheet.setName(responseSheetTitle);
  sheet.hideSheet();
  return sheet.getName();
}

if (typeof module !== 'undefined') {
  module.exports = {
    createGeneratedForm: createGeneratedForm,
    linkAndPrepareResponseSheet: linkAndPrepareResponseSheet,
  };
}
