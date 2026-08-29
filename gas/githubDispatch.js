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

/**
 * 워크플로 입력에 class_name(class-01/class-02)을 얹는다. 워크플로 YAML은 이 값으로
 * 어느 GitHub Environment(같은 이름의 class-01/class-02)에서 GAS_WEBAPP_URL/GAS_API_TOKEN을
 * 꺼낼지 정하므로, 반이 다른 스프레드시트에 바인딩된 GAS 프로젝트마다 스크립트 속성
 * GITHUB_TARGET_ENV를 각자 다르게 설정해두면 같은 워크플로 파일로 두 반이 동시에 자동화된다.
 * (실제로 운영 중인 연동_출결수집.gs가 GITHUB_TARGET_ENV 값을 읽어 class_name이라는
 * 입력 이름으로 보내도록 이미 짜여 있어, 그 명명을 그대로 따른 것이다 — 이름이 안 맞으면
 * GitHub가 "Unexpected inputs provided" 422로 거부한다.)
 */
function withClassInput(inputs, className) {
  if (!className) {
    throw new Error('GITHUB_TARGET_ENV 스크립트 속성이 설정되어 있지 않습니다 (class-01 또는 class-02)');
  }

  var merged = {};
  var source = inputs || {};
  for (var key in source) {
    merged[key] = source[key];
  }
  merged.class_name = className;
  return merged;
}

if (typeof module !== 'undefined') {
  module.exports = { buildDispatchRequest: buildDispatchRequest, withClassInput: withClassInput };
}
