"""
호서대 LMS 주차별 출석 현황 조회 - 요청별(task) 처리 모듈, HTTP 기반.

session.py(공유 로그인 세션)와 parsing.py(공유 표 파싱)만 사용하고, 이 URL과
'모두 보기' 재요청은 이 모듈만 안다. 새 요청을 추가할 때 참고할 샘플이기도 하다.

Playwright 버전(hoseo_attendance_scraper.py)을 대체한다 - network_diagnose_lib.py로
실제 로그인/조회 요청을 캡처해서 평문 폼 로그인 + 서버 렌더링 HTML임을 확인했다.
"""

from pathlib import Path

from .. import parsing

DEFAULT_URL = "https://learn.hoseo.ac.kr/local/ubonattend/report.php?id=40069"
SHEET_NAME = "Hoseo"


def fetch(session, report_url: str = DEFAULT_URL):
    _, result, info = parsing.fetch_full_report_html(session, report_url)

    if not info["show_all_found"]:
        print("[attendance] '모두 보기' 컨트롤을 찾지 못했습니다 - 기본 페이지 그대로 사용합니다.")
        print(f"[attendance] 기본 페이지 학생 수: {info['before_count']}")
        return result

    print(
        f"[attendance] '모두 보기' 컨트롤 발견 "
        f"({info['method'].upper()} {info['action']}, payload={info['payload']}) - 재요청합니다."
    )
    print(f"[attendance] 재요청 전 학생 수: {info['before_count']}, 재요청 후 학생 수: {info['after_count']}")

    if not info["used_after"]:
        print("[attendance] 재요청 후 학생 수가 줄어들거나 표를 못 찾아 기본 페이지 결과를 사용합니다.")

    return result


def write_csv(result, out_dir):
    """out_dir 밑에 CSV를 쓰고, (csv_path, 시트이름) 목록을 돌려준다 - course.py처럼
    여러 task를 조합해 호출하는 쪽이 어디에 몇 개를 썼는지 알 수 있게."""
    out_path = Path(out_dir) / "attendance_long.csv"
    parsing.write_long_csv(result["long_rows"], result["meta_labels"], out_path)
    return [(out_path, SHEET_NAME)]


def print_summary(result):
    print(f"학생 수(데이터 행): {result['student_count']}")
    print(f"주차 수: {len(result['weeks'])}, 주차별 항목 수: {result['items_per_week']}")

    fieldnames = result["meta_labels"] + ["주차", "항목순번", "출결상태"]
    print(f"\n=== ATTENDANCE_LONG ({len(result['long_rows'])} rows) ===")
    print(",".join(fieldnames))
    for row in result["long_rows"]:
        print(",".join(str(row.get(f, "")) for f in fieldnames))
    print("=== END ATTENDANCE_LONG ===")
