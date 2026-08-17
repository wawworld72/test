"""
호서대 LMS 주차별 출석 현황 조회 - 요청별(task) 처리 모듈, HTTP 기반.

session.py(공유 로그인 세션)와 parsing.py(공유 표 파싱)만 사용하고, 이 URL은 이 모듈만
안다. 새 요청을 추가할 때 참고할 샘플이기도 하다.

report.php의 '모두 보기' select만으로는 대형 강좌의 전체 인원이 다 안 나오는 걸 실사이트로
확인했다(forum_export의 학번 매핑에서 겪은 문제와 동일) - listsize/page 쿼리 파라미터로
직접 페이지를 순회하는 parsing.fetch_full_attendance_report를 쓴다.

Playwright 버전(hoseo_attendance_scraper.py)을 대체한다 - network_diagnose_lib.py로
실제 로그인/조회 요청을 캡처해서 평문 폼 로그인 + 서버 렌더링 HTML임을 확인했다.
"""

from pathlib import Path

from .. import parsing

DEFAULT_URL = "https://learn.hoseo.ac.kr/local/ubonattend/report.php?id=40069"
SHEET_NAME = "Hoseo"


def fetch(session, report_url: str = DEFAULT_URL):
    result = parsing.fetch_full_attendance_report(session, report_url)
    if result is None:
        print("[attendance] 리포트 표를 찾지 못했습니다.")
        return None

    print(f"[attendance] 페이지 순회로 확보한 학생 수: {result['student_count']}")
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
