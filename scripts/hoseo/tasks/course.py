"""
과목 페이지 링크(course/view.php?id=N) 하나로 출결(attendance)과 토론방
(forum_export)을 한 번에 수집하는 조합 task.

원래는 출결은 local/ubonattend/report.php?id=N 링크를, 토론방은
course/view.php?id=N 링크를 따로 넘겨야 했다. 실제 사이트에서 두 id가 같은
과목을 가리키는 같은 값임을 확인했으므로(로컬 강좌 부가기능인 ubonattend는
과목 id를 그대로 쓴다), course_url 하나만 받아서 report_url을 스스로 만들어
attendance.fetch와 forum_export.fetch를 둘 다 호출한다.
"""

from .. import parsing
from . import attendance, forum_export

DEFAULT_COURSE_URL = forum_export.DEFAULT_COURSE_URL


def fetch(session, course_url=DEFAULT_COURSE_URL):
    report_url = parsing.report_url_from_course_url(course_url)
    if report_url is None:
        print(f"[course] course_url에서 id를 못 찾았습니다: {course_url}")

    attendance_result = None
    if report_url is not None:
        attendance_result = attendance.fetch(session, report_url=report_url)

    forum_result = forum_export.fetch(session, course_url=course_url)

    if attendance_result is None and forum_result is None:
        return None

    return {"attendance": attendance_result, "forum_export": forum_result}


def write_csv(result, out_dir):
    outputs = []
    if result["attendance"] is not None:
        outputs += attendance.write_csv(result["attendance"], out_dir)
    if result["forum_export"] is not None:
        outputs += forum_export.write_csv(result["forum_export"], out_dir)
    return outputs


def print_summary(result):
    print("=== ATTENDANCE ===")
    if result["attendance"] is not None:
        attendance.print_summary(result["attendance"])
    else:
        print("출결 결과 없음 (report_url을 못 만들었거나 데이터를 못 찾음)")

    print("\n=== FORUM_EXPORT ===")
    if result["forum_export"] is not None:
        forum_export.print_summary(result["forum_export"])
    else:
        print("토론방 결과 없음")
