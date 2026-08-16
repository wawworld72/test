"""
호서대 LMS 주차별 출석 현황 조회 - 요청별(task) 처리 모듈, HTTP 기반.

session.py(공유 로그인 세션)와 parsing.py(공유 표 파싱)만 사용하고, 이 URL과
'모두 보기' 재요청은 이 모듈만 안다. 새 요청을 추가할 때 참고할 샘플이기도 하다.

Playwright 버전(hoseo_attendance_scraper.py)을 대체한다 - network_diagnose_lib.py로
실제 로그인/조회 요청을 캡처해서 평문 폼 로그인 + 서버 렌더링 HTML임을 확인했다.
"""

from .. import parsing

DEFAULT_URL = "https://learn.hoseo.ac.kr/local/ubonattend/report.php?id=40069"


def fetch(session, report_url: str = DEFAULT_URL):
    resp = session.get(report_url)
    resp.raise_for_status()
    html = resp.text

    show_all = parsing.find_show_all_submission(html, resp.url)
    if show_all:
        method, action, payload = show_all
        if method == "post":
            resp2 = session.post(action, data=payload)
        else:
            resp2 = session.get(action, params=payload)
        resp2.raise_for_status()
        html = resp2.text

    return parsing.parse_report_table(html)
