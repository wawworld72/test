"""
호서대 LMS 요청 진입점 - task별로 알맞은 scripts/hoseo/tasks/*.py 모듈을 호출한다.

새 요청을 추가하려면:
    1) scripts/hoseo/tasks/ 밑에 아래 세 함수를 가진 모듈을 추가한다 (attendance.py,
       forum_export.py를 참고):
         - fetch(session, **params) -> dict|None
         - write_csv(result, out_path) -> None
         - print_summary(result) -> None
    2) 아래 TASKS 딕셔너리에 한 줄 추가한다.
session.py(로그인 유지)나 parsing.py(표 파싱)는 건드릴 필요 없다. 각 task는
자기 결과 모양(dict shape)에 맞는 write_csv/print_summary만 책임지므로 이
진입점은 task별 데이터 구조를 몰라도 된다.

환경변수: HOSEO_USERNAME, HOSEO_PASSWORD
"""

import argparse
import os
import sys
from pathlib import Path

from hoseo.session import HoseoLoginError, HoseoSession
from hoseo.tasks import attendance, forum_export

OUTPUT_DIR = Path(__file__).parent.parent / "attendance_output"

TASKS = {
    "attendance": attendance,
    "forum_export": forum_export,
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--task", required=True, choices=sorted(TASKS))
    parser.add_argument("--report-url", default="", help="attendance task용 출석부 리포트 URL")
    parser.add_argument("--course-url", default="", help="forum_export task용 과목 페이지 URL")
    args = parser.parse_args()

    username = os.environ.get("HOSEO_USERNAME")
    password = os.environ.get("HOSEO_PASSWORD")
    if not username or not password:
        print("HOSEO_USERNAME / HOSEO_PASSWORD 환경변수가 설정되지 않았습니다.", file=sys.stderr)
        sys.exit(1)

    session = HoseoSession(username, password)
    try:
        session.login()
    except HoseoLoginError as exc:
        print(f"로그인 실패: {exc}", file=sys.stderr)
        sys.exit(1)

    print("로그인 성공")

    task_module = TASKS[args.task]
    kwargs = {}
    if args.report_url:
        kwargs["report_url"] = args.report_url
    if args.course_url:
        kwargs["course_url"] = args.course_url

    result = task_module.fetch(session, **kwargs)
    if result is None:
        print("결과를 찾지 못했습니다.", file=sys.stderr)
        sys.exit(1)

    task_module.print_summary(result)

    OUTPUT_DIR.mkdir(exist_ok=True)
    out_path = OUTPUT_DIR / f"{args.task}_long.csv"
    task_module.write_csv(result, out_path)
    print(f"저장됨: {out_path}")


if __name__ == "__main__":
    main()
