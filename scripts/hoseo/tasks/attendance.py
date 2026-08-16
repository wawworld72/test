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

    before_result = parsing.parse_report_table(html)
    before_count = before_result["student_count"] if before_result else 0

    show_all = parsing.find_show_all_submission(html, resp.url)
    if show_all is None:
        print("[attendance] '모두 보기' 컨트롤을 찾지 못했습니다 - 기본 페이지 그대로 사용합니다.")
        print(f"[attendance] 기본 페이지 학생 수: {before_count}")
        return before_result

    method, action, payload = show_all
    print(f"[attendance] '모두 보기' 컨트롤 발견 ({method.upper()} {action}, payload={payload}) - 재요청합니다.")
    if method == "post":
        resp2 = session.post(action, data=payload)
    else:
        resp2 = session.get(action, params=payload)
    resp2.raise_for_status()

    after_result = parsing.parse_report_table(resp2.text)
    after_count = after_result["student_count"] if after_result else 0
    print(f"[attendance] 재요청 전 학생 수: {before_count}, 재요청 후 학생 수: {after_count}")

    if after_result is None or after_count < before_count:
        print("[attendance] 재요청 후 학생 수가 줄어들거나 표를 못 찾아 기본 페이지 결과를 사용합니다.")
        return before_result

    return after_result


def write_csv(result, out_path):
    parsing.write_long_csv(result["long_rows"], result["meta_labels"], out_path)


def print_summary(result):
    print(f"학생 수(데이터 행): {result['student_count']}")
    print(f"주차 수: {len(result['weeks'])}, 주차별 항목 수: {result['items_per_week']}")

    fieldnames = result["meta_labels"] + ["주차", "항목순번", "출결상태"]
    print(f"\n=== ATTENDANCE_LONG ({len(result['long_rows'])} rows) ===")
    print(",".join(fieldnames))
    for row in result["long_rows"]:
        print(",".join(str(row.get(f, "")) for f in fieldnames))
    print("=== END ATTENDANCE_LONG ===")
