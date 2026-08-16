"""
호서대 LMS 요청 진입점 - task별로 알맞은 scripts/hoseo/tasks/*.py 모듈을 호출한다.

새 요청을 추가하려면:
    1) scripts/hoseo/tasks/ 밑에 fetch(session, **params) -> dict|None 함수를
       가진 모듈을 추가한다 (attendance.py를 참고).
    2) 아래 TASKS 딕셔너리에 한 줄 추가한다.
session.py(로그인 유지)나 parsing.py(표 파싱)는 건드릴 필요 없다.

환경변수: HOSEO_USERNAME, HOSEO_PASSWORD
"""

import argparse
import os
import sys
from pathlib import Path

from hoseo import parsing
from hoseo.session import HoseoLoginError, HoseoSession
from hoseo.tasks import attendance

OUTPUT_DIR = Path(__file__).parent.parent / "attendance_output"

TASKS = {
    "attendance": attendance,
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--task", required=True, choices=sorted(TASKS))
    parser.add_argument("--report-url", default="")
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

    result = task_module.fetch(session, **kwargs)
    if result is None:
        print("표를 찾지 못했습니다.", file=sys.stderr)
        sys.exit(1)

    print(f"학생 수(데이터 행): {result['student_count']}")
    print(f"주차 수: {len(result['weeks'])}, 주차별 항목 수: {result['items_per_week']}")

    OUTPUT_DIR.mkdir(exist_ok=True)
    out_path = OUTPUT_DIR / f"{args.task}_long.csv"
    parsing.write_long_csv(result["long_rows"], result["meta_labels"], out_path)
    print(f"저장됨: {out_path} ({len(result['long_rows'])}행, long format)")

    fieldnames = result["meta_labels"] + ["주차", "항목순번", "출결상태"]
    print(f"\n=== ATTENDANCE_LONG ({len(result['long_rows'])} rows) ===")
    print(",".join(fieldnames))
    for row in result["long_rows"]:
        print(",".join(str(row.get(f, "")) for f in fieldnames))
    print("=== END ATTENDANCE_LONG ===")


if __name__ == "__main__":
    main()
