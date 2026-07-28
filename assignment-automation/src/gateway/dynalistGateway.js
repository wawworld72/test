/**
 * UC-27/FR-047: Dynalist REST API(UrlFetchApp) 호출 전담. Dynalist는 Apps Script Advanced
 * Service 목록에 없어 UrlFetchApp이 유일한 경로다(research.md #8). 실패는 이 안에서 흡수해
 * 예외를 상위로 전파하지 않는다 — 이 전송이 실패해도 채점·성적 전송은 계속돼야 한다.
 */
function sendItemsToDynalist(items, docId, apiToken) {
  if (!docId || !apiToken) {
    Logger.log('sendItemsToDynalist: 외부문서식별자 또는 API 토큰이 없어 전송하지 않음');
    return { ok: false, sent: 0 };
  }
  if (!items || items.length === 0) {
    return { ok: true, sent: 0 };
  }

  try {
    var changes = items.map(function (item, index) {
      return {
        action: 'insert',
        parent_id: 'root',
        index: index,
        content: item.문항 + ' [' + item.분류 + ']' + (item.출제자학번 ? ' (출제자:' + item.출제자학번 + ')' : ''),
        note: '정답률:' + item.정답률 + ' 변별력:' + item.변별력 + ' 정답불일치:' + item.정답불일치,
      };
    });
    var response = UrlFetchApp.fetch('https://dynalist.io/api/v1/doc/edit', {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      payload: JSON.stringify({ token: apiToken, file_id: docId, changes: changes }),
    });
    var body = JSON.parse(response.getContentText());
    if (body._code !== 'Ok') {
      Logger.log('Dynalist 전송 실패: ' + response.getContentText());
      return { ok: false, sent: 0 };
    }
    return { ok: true, sent: items.length };
  } catch (err) {
    Logger.log('Dynalist 전송 중 예외(흡수하고 계속 진행): ' + err.message);
    return { ok: false, sent: 0 };
  }
}
