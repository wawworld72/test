"""
호서대 LMS(learn.hoseo.ac.kr) 주차별 출석 현황 스크래퍼 - GitHub Actions용 headless 버전

환경변수:
    HOSEO_USERNAME, HOSEO_PASSWORD - LMS 로그인 정보 (GitHub Secrets에서 주입)
    ATTENDANCE_URL                - 조회할 리포트 URL (기본값: 아래 DEFAULT_URL)

동작:
    1) 대상 URL로 이동
    2) 로그인 페이지로 리다이렉트되면 아이디/비밀번호를 자동 입력해 로그인
       (Moodle 표준 로그인 폼 셀렉터를 사용하며, 커스터마이징된 경우 실패할 수 있음)
    3) '목록수'를 '모두'로 바꿔 페이지네이션 없이 전체 학생이 한 화면에 나오게 함
    4) colspan/rowspan을 반영해 테이블을 파싱하고, 학번/이름/주차/항목순번/출결상태로
       이루어진 long-format CSV로 저장. 내용을 stdout에도 출력해 GitHub Actions
       로그에서 바로 확인 가능하게 함
"""

import os
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

import attendance_lib as lib

DEFAULT_URL = "https://learn.hoseo.ac.kr/local/ubonattend/report.php?id=40069"
TARGET_URL = os.environ.get("ATTENDANCE_URL", DEFAULT_URL)
USERNAME = os.environ.get("HOSEO_USERNAME")
PASSWORD = os.environ.get("HOSEO_PASSWORD")
OUTPUT_DIR = Path(__file__).parent.parent / "attendance_output"


def looks_logged_in(page) -> bool:
    return "/login/" not in page.url


def try_login(page) -> None:
    if not USERNAME or not PASSWORD:
        print("HOSEO_USERNAME / HOSEO_PASSWORD 환경변수가 설정되지 않았습니다.", file=sys.stderr)
        sys.exit(1)

    candidates = [
        ("#username", "#password", "#loginbtn"),
        ('input[name="username"]', 'input[name="password"]', 'button[type="submit"]'),
    ]

    for user_sel, pass_sel, submit_sel in candidates:
        user_field = page.locator(user_sel)
        if user_field.count() > 0:
            user_field.first.fill(USERNAME)
            page.locator(pass_sel).first.fill(PASSWORD)
            page.locator(submit_sel).first.click()
            page.wait_for_load_state("networkidle")
            return

    OUTPUT_DIR.mkdir(exist_ok=True)
    debug_path = OUTPUT_DIR / "login_page_debug.html"
    debug_path.write_text(page.content(), encoding="utf-8")
    print(f"로그인 폼을 찾지 못했습니다. 페이지 구조를 '{debug_path}'에 저장했습니다.", file=sys.stderr)
    sys.exit(1)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        page.goto(TARGET_URL)
        page.wait_for_load_state("networkidle")

        if not looks_logged_in(page):
            try_login(page)
            page.goto(TARGET_URL)
            page.wait_for_load_state("networkidle")

        if not looks_logged_in(page):
            print("로그인 후에도 리포트 페이지에 접근하지 못했습니다.", file=sys.stderr)
            sys.exit(1)

        found_all = lib.select_show_all(page, TARGET_URL)
        print(f"'모두 보기' 옵션 적용 여부: {found_all}")

        OUTPUT_DIR.mkdir(exist_ok=True)
        result = lib.parse_report_table(page)

        if result is None:
            print(f"페이지에서 <table>을 찾지 못했습니다 (url={page.url}, title={page.title()!r}).")
            debug_path = OUTPUT_DIR / "report_page_debug.html"
            debug_path.write_text(page.content(), encoding="utf-8")
            print(f"디버깅용 페이지를 '{debug_path}'에 저장했습니다.")
            print("=== PAGE_TEXT_PREVIEW ===")
            print(page.inner_text("body")[:3000])
            print("=== END PAGE_TEXT_PREVIEW ===")
            browser.close()
            return

        long_rows = result["long_rows"]
        meta_labels = result["meta_labels"]

        print(f"학생 수(데이터 행): {result['student_count']}")
        print(f"주차 수: {len(result['weeks'])}, 주차별 항목 수: {result['items_per_week']}")

        long_path = OUTPUT_DIR / "attendance_long.csv"
        lib.write_long_csv(long_rows, meta_labels, long_path)
        print(f"저장됨: {long_path} ({len(long_rows)}행, long format)")

        fieldnames = meta_labels + ["주차", "항목순번", "항목라벨", "출결상태"]
        print(f"\n=== ATTENDANCE_LONG ({len(long_rows)} rows) ===")
        print(",".join(fieldnames))
        for row in long_rows:
            print(",".join(str(row.get(f, "")) for f in fieldnames))
        print("=== END ATTENDANCE_LONG ===")

        browser.close()


if __name__ == "__main__":
    main()
