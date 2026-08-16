"""
호서대 LMS(learn.hoseo.ac.kr) 로그인 세션을 관리하는 공유 루틴.

이 모듈은 "로그인 상태를 유지하는 것"만 책임진다 - 어떤 데이터를 가져올지는
전혀 모른다. 새 요청(성적, 공지 등)을 추가할 때는 이 파일을 건드릴 필요 없이
scripts/hoseo/tasks/ 밑에 파일을 하나 추가하면 된다.

Playwright 대신 requests + BeautifulSoup을 쓰는 이유: network_diagnose_lib.py로
실제 로그인/조회 요청을 캡처해서 확인해보니, 호서대 LMS(Moodle)는 로그인이
평문 폼 POST + 세션 쿠키 방식이고(JS 암호화나 SSO 리다이렉트 체인이 없음),
출석부 조회도 별도 JS 렌더링 없이 서버가 만든 HTML을 그대로 반환한다 - 브라우저
없이 재현 가능하다고 판단한 근거.
"""

from bs4 import BeautifulSoup
import requests

LOGIN_URL = "https://learn.hoseo.ac.kr/login/index.php"


class HoseoLoginError(RuntimeError):
    pass


class HoseoSession:
    """호서대 LMS 로그인 세션. get()/post()로 로그인된 상태를 유지하며 요청한다."""

    def __init__(self, username: str, password: str):
        self._username = username
        self._password = password
        self._session = requests.Session()
        self._session.headers.update(
            {"User-Agent": "Mozilla/5.0 (compatible; hoseo-lms-client/1.0)"}
        )
        self._logged_in = False

    @staticmethod
    def _looks_like_login_page(response: requests.Response) -> bool:
        return "/login/" in response.url

    def login(self) -> None:
        """로그인 페이지를 GET해서 logintoken 등 숨은 필드를 파싱한 뒤 로그인 POST를 보낸다."""
        resp = self._session.get(LOGIN_URL, timeout=30)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        form = soup.find("form", id="login") or soup.find("form")
        if form is None:
            raise HoseoLoginError("로그인 폼을 찾지 못했습니다.")

        payload = {}
        for hidden in form.find_all("input", type="hidden"):
            name = hidden.get("name")
            if name:
                payload[name] = hidden.get("value", "")

        payload["username"] = self._username
        payload["password"] = self._password

        post_resp = self._session.post(LOGIN_URL, data=payload, timeout=30)
        post_resp.raise_for_status()

        if self._looks_like_login_page(post_resp):
            raise HoseoLoginError("로그인에 실패했습니다 (아이디/비밀번호를 확인하세요).")

        self._logged_in = True

    def _ensure_login(self) -> None:
        if not self._logged_in:
            self.login()

    def get(self, url: str, **kwargs) -> requests.Response:
        """로그인 상태를 보장한 뒤 GET. 세션이 만료된 것으로 보이면 한 번 재로그인 후 재시도한다."""
        self._ensure_login()
        resp = self._session.get(url, timeout=30, **kwargs)
        if self._looks_like_login_page(resp):
            self._logged_in = False
            self._ensure_login()
            resp = self._session.get(url, timeout=30, **kwargs)
        return resp

    def post(self, url: str, **kwargs) -> requests.Response:
        """로그인 상태를 보장한 뒤 POST. 세션이 만료된 것으로 보이면 한 번 재로그인 후 재시도한다."""
        self._ensure_login()
        resp = self._session.post(url, timeout=30, **kwargs)
        if self._looks_like_login_page(resp):
            self._logged_in = False
            self._ensure_login()
            resp = self._session.post(url, timeout=30, **kwargs)
        return resp
