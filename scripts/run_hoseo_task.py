"""
호서대 LMS 요청 진입점 - task별로 알맞은 scripts/hoseo/tasks/*.py 모듈을 호출한다.

새 요청을 추가하려면:
    1) scripts/hoseo/tasks/ 밑에 아래 세 함수를 가진 모듈을 추가한다 (attendance.py,
       forum_export.py를 참고):
         - fetch(session, **params) -> dict|None
         - write_csv(result, out_path) -> None
         - print_summary(result) -> None
    2) 아래 TASKS 딕셔너리에 한 줄 추가한다.
매 실행마다 결과는 로그 출력 + CSV 아티팩트에 더해 구글 시트 탭에도 반영된다
(hoseo-task.yml의 "Push to Google Sheet" 스텝이 scripts/push_to_sheet.py로
반영). 어느 탭에 쓸지는 task 모듈의 SHEET_NAME으로 정하고, 안 정해뒀으면
task 이름(예: "attendance")을 탭 이름으로 그대로 쓴다.
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


def _write_github_output(csv_path, sheet_name):
    """GitHub Actions 다음 스텝(시트 반영)이 쓸 수 있게 csv_path/sheet_name을 넘긴다.
    GITHUB_OUTPUT이 없는 로컬 실행에서는 그냥 건너뛴다."""
    github_output = os.environ.get("GITHUB_OUTPUT")
    if not github_output:
        return
    with open(github_output, "a") as f:
        f.write(f"csv_path={csv_path}\n")
        f.write(f"sheet_name={sheet_name}\n")


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

    sheet_name = getattr(task_module, "SHEET_NAME", args.task)
    _write_github_output(out_path, sheet_name)


if __name__ == "__main__":
    main()
