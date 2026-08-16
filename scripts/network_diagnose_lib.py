"""
로그인/출결 조회 요청이 DevTools Network 탭에서 어떻게 보일지를 Playwright의
request/response 이벤트로 자동 캡처하는 공용 로직.

목적: "HTTP 요청만으로 대체 가능한가(A안) vs Playwright를 유지해야 하는가"를
판단하기 위해, 사람이 직접 DevTools를 열어 확인할 3가지를 자동화한다.
    1) 로그인 POST의 비밀번호 필드가 평문인지 암호화됐는지
    2) 숨은 필드(csrf_token 등)가 있는지
    3) 로그인 응답이 302+Set-Cookie인지, JSON 토큰인지, SSO 리다이렉트 체인인지
    4) 출결 조회가 XHR/JSON으로 오는지, 문서 전체 렌더링인지

비밀번호 원문은 로그에 남기지 않는다 - 캡처된 요청 본문에서 실제 비밀번호
문자열이 정확히 발견되는지만 검사해 "평문으로 보임" 여부만 기록한다.
"""

import re

HEX_OR_BASE64_RE = re.compile(r"[A-Za-z0-9+/_=-]{40,}")


class NetworkLog:
    """요청/응답 이벤트를 필터링해서 모아두는 로거.

    method가 POST이거나 resource_type이 xhr/fetch이거나 url에 키워드가
    포함된 경우만 기록한다 (이미지/폰트/css 등 노이즈 제외).
    """

    def __init__(self, secrets_to_redact=None):
        self.events = []
        self._secrets = [s for s in (secrets_to_redact or []) if s]

    def _redact(self, text):
        if text is None:
            return None
        redacted = text
        for secret in self._secrets:
            redacted = redacted.replace(secret, "***REDACTED***")
        return redacted

    def _should_capture(self, url: str, method: str, resource_type: str) -> bool:
        if method == "POST":
            return True
        if resource_type in ("xhr", "fetch"):
            return True
        return False

    def attach(self, page) -> None:
        def on_request(request):
            if not self._should_capture(request.url, request.method, request.resource_type):
                return
            try:
                post_data = request.post_data
            except Exception:
                post_data = None
            self.events.append(
                {
                    "kind": "request",
                    "method": request.method,
                    "url": request.url,
                    "resource_type": request.resource_type,
                    "post_data_redacted": self._redact(post_data),
                    "post_data_raw_for_classification": post_data,
                }
            )

        def on_response(response):
            request = response.request
            if not self._should_capture(request.url, request.method, request.resource_type):
                return
            try:
                content_type = response.header_value("content-type")
            except Exception:
                content_type = None
            self.events.append(
                {
                    "kind": "response",
                    "status": response.status,
                    "url": response.url,
                    "resource_type": request.resource_type,
                    "content_type": content_type,
                }
            )

        page.on("request", on_request)
        page.on("response", on_response)

    def print_all(self, label: str) -> None:
        print(f"--- [{label}] 캡처된 요청/응답 ({len(self.events)}건) ---")
        for e in self.events:
            if e["kind"] == "request":
                print(
                    f"  [REQ] {e['method']} {e['url']} (type={e['resource_type']}) "
                    f"post_data={e['post_data_redacted']!r}"
                )
            else:
                print(
                    f"  [RES] {e['status']} {e['url']} (type={e['resource_type']}) "
                    f"content-type={e['content_type']!r}"
                )


def classify_secret_field(post_data: str, secret_value: str) -> str:
    """로그인 POST 본문에서 비밀번호 필드가 평문인지 인코딩/암호화됐는지 추정"""
    if not post_data:
        return "판별 불가 (본문 없음)"
    if secret_value and secret_value in post_data:
        return "PLAINTEXT로 추정 (요청 본문에 입력한 비밀번호 값이 그대로 발견됨)"
    tokens = HEX_OR_BASE64_RE.findall(post_data)
    if tokens:
        sample = tokens[0][:24] + "..." if len(tokens[0]) > 24 else tokens[0]
        return f"ENCODED/HASHED로 추정 (긴 hex/base64 유사 토큰 {len(tokens)}개 발견, 예: {sample})"
    return "판별 불가 (평문도 긴 인코딩 토큰도 본문에서 발견되지 않음)"


def snapshot_cookies(context) -> dict:
    """쿠키 이름 -> {domain, httpOnly, secure} 매핑 (값은 저장하지 않음)"""
    return {
        c["name"]: {
            "domain": c.get("domain"),
            "httpOnly": c.get("httpOnly"),
            "secure": c.get("secure"),
        }
        for c in context.cookies()
    }


def diff_new_cookies(before: dict, after: dict) -> list:
    return [name for name in after if name not in before]


def get_hidden_fields(page) -> list:
    """현재 페이지의 <input type="hidden"> name 목록 (CSRF 토큰 등 탐지용)"""
    hidden = page.locator('input[type="hidden"]')
    names = []
    for i in range(hidden.count()):
        name = hidden.nth(i).get_attribute("name")
        if name:
            names.append(name)
    return names
