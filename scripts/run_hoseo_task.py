"""
호서대 LMS 요청 진입점 - task별로 알맞은 scripts/hoseo/tasks/*.py 모듈을 호출한다.

새 요청을 추가하려면:
    1) scripts/hoseo/tasks/ 밑에 아래 세 함수를 가진 모듈을 추가한다 (attendance.py,
       forum_export.py, course.py를 참고):
         - fetch(session, **params) -> dict|None
         - write_csv(result, out_dir) -> list[(csv_path, sheet_name)]
         - print_summary(result) -> None
    2) 아래 TASKS 딕셔너리에 한 줄 추가한다.
write_csv가 돌려준 (csv_path, sheet_name) 목록은 이 진입점이 그대로 순회하며
scripts/push_to_sheet.py로 각각 구글 시트 탭에 반영한다 - course.py처럼 한 번의
실행에서 여러 탭에 나눠 써야 하는 task도 목록 길이만 다를 뿐 똑같이 처리된다.
GAS_WEBAPP_URL/GAS_API_TOKEN이 없는 로컬 실행에서는 시트 반영만 건너뛴다.

session.py(로그인 유지)나 parsing.py(표 파싱)는 건드릴 필요 없다. 각 task는
자기 결과 모양(dict shape)에 맞는 write_csv/print_summary만 책임지므로 이
진입점은 task별 데이터 구조를 몰라도 된다.

환경변수: HOSEO_USERNAME, HOSEO_PASSWORD, GAS_WEBAPP_URL, GAS_API_TOKEN
"""

import argparse
import os
import sys
from pathlib import Path

from hoseo.session import HoseoLoginError, HoseoSession
from hoseo.tasks import attendance, course, forum_export
from push_to_sheet import build_rows, push

OUTPUT_DIR = Path(__file__).parent.parent / "attendance_output"

TASKS = {
    "attendance": attendance,
    "forum_export": forum_export,
    "course": course,
}


def _push_to_sheet(csv_path, sheet_name):
    webapp_url = os.environ.get("GAS_WEBAPP_URL")
    token = os.environ.get("GAS_API_TOKEN")
    if not webapp_url or not token:
        print(f"GAS_WEBAPP_URL/GAS_API_TOKEN이 없어 '{sheet_name}' 시트 반영을 건너뜁니다.")
        return

    rows = build_rows(csv_path)
    result = push(rows, sheet_name, webapp_url, token)
    if not result.get("ok"):
        print(f"'{sheet_name}' 시트 반영 실패: {result.get('error')}", file=sys.stderr)
        sys.exit(1)
    print(f"스프레드시트 '{result.get('sheetName')}' 시트에 {result.get('rowCount')}행 반영 완료")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--task", required=True, choices=sorted(TASKS))
    parser.add_argument("--report-url", default="", help="attendance task용 출석부 리포트 URL")
    parser.add_argument("--course-url", default="", help="course/forum_export task용 과목 페이지 URL")
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
    outputs = task_module.write_csv(result, OUTPUT_DIR)
    for csv_path, sheet_name in outputs:
        print(f"저장됨: {csv_path}")
        _push_to_sheet(csv_path, sheet_name)


if __name__ == "__main__":
    main()
