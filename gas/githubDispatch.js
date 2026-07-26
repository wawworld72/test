/**
 * GitHub의 workflow_dispatch REST API 호출에 필요한 URL/요청 옵션을 만드는 순수 로직.
 * UrlFetchApp 호출 자체는 Code.js에서 하고, 여기서는 값 조립만 담당해 Node/Jest로 테스트한다.
 */

function buildDispatchRequest(owner, repo, workflowFile, ref, inputs, token) {
  if (!owner || !repo || !workflowFile || !ref || !token) {
    throw new Error('owner, repo, workflowFile, ref, token은 모두 필수입니다');
  }

  var url = 'https://api.github.com/repos/' + owner + '/' + repo +
    '/actions/workflows/' + workflowFile + '/dispatches';

  return {
    url: url,
    options: {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/vnd.github+json'
      },
      payload: JSON.stringify({ ref: ref, inputs: inputs || {} }),
      muteHttpExceptions: true
    }
  };
}

if (typeof module !== 'undefined') {
  module.exports = { buildDispatchRequest: buildDispatchRequest };
}
