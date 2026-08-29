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
 * 워크플로 입력에 target_env(class-01/class-02)를 얹는다. 워크플로 YAML은 이 값으로
 * 어느 GitHub Environment(같은 이름의 class-01/class-02)에서 GAS_WEBAPP_URL/GAS_API_TOKEN을
 * 꺼낼지 정하므로, 반이 다른 스프레드시트에 바인딩된 GAS 프로젝트마다 스크립트 속성
 * GITHUB_TARGET_ENV를 각자 다르게 설정해두면 같은 워크플로 파일로 두 반이 동시에 자동화된다.
 * (입력 키 이름 target_env/GITHUB_TARGET_ENV는 이미 운영 중인 다른 GAS 프로젝트의
 * 명명과 맞춰, 두 쪽이 같은 워크플로를 그대로 호출할 수 있게 한 것이다.)
 */
function withTargetEnvInput(inputs, targetEnv) {
  if (!targetEnv) {
    throw new Error('GITHUB_TARGET_ENV 스크립트 속성이 설정되어 있지 않습니다 (class-01 또는 class-02)');
  }

  var merged = {};
  var source = inputs || {};
  for (var key in source) {
    merged[key] = source[key];
  }
  merged.target_env = targetEnv;
  return merged;
}

if (typeof module !== 'undefined') {
  module.exports = { buildDispatchRequest: buildDispatchRequest, withTargetEnvInput: withTargetEnvInput };
}
