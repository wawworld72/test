"""
호서대 LMS(learn.hoseo.ac.kr) 주차별 출석 현황 스크래퍼 - GitHub Actions용 headless 버전

환경변수:
    HOSEO_USERNAME, HOSEO_PASSWORD - LMS 로그인 정보 (GitHub Secrets에서 주입)
    ATTENDANCE_URL                - 조회할 리포트 URL (기본값: 아래 DEFAULT_URL)

동작:
    1) 대상 URL로 이동
    2) 로그인 페이지로 리다이렉트되면 아이디/비밀번호를 자동 입력해 로그인
       (Moodle 표준 로그인 폼 셀렉터를 사용하며, 커스터마이징된 경우 실패할 수 있음)
    3) 리포트 페이지의 모든 <table>을 CSV로 저장하고, 내용을 stdout에도 출력
       (stdout 출력은 GitHub Actions 로그에서 바로 확인 가능하도록 하기 위함)
"""

import csv
import os
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

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

    # Moodle 표준 로그인 폼. 학교에서 폼을 커스터마이징했다면 셀렉터를 조정해야 함.
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


def dump_tables(page, output_dir: Path) -> list[Path]:
    output_dir.mkdir(exist_ok=True)
    tables = page.locator("table")
    count = tables.count()
    if count == 0:
        print("페이지에서 <table>을 찾지 못했습니다.")
        return []

    saved_files = []
    for i in range(count):
        table = tables.nth(i)
        rows = table.locator("tr")
        row_count = rows.count()
        data = []
        for r in range(row_count):
            cells = rows.nth(r).locator("th, td")
            cell_count = cells.count()
            row_data = [cells.nth(c).inner_text().strip() for c in range(cell_count)]
            if row_data:
                data.append(row_data)

        if not data:
            continue

        out_path = output_dir / f"table_{i}.csv"
        with out_path.open("w", newline="", encoding="utf-8-sig") as f:
            writer = csv.writer(f)
            writer.writerows(data)
        saved_files.append(out_path)

        # GitHub Actions 로그(job log)에서 바로 결과를 볼 수 있도록 stdout에도 출력
        print(f"\n=== TABLE {i} ({len(data)} rows) ===")
        for row in data:
            print(",".join(row))
        print(f"=== END TABLE {i} ===")

    return saved_files


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

        saved = dump_tables(page, OUTPUT_DIR)
        if not saved:
            OUTPUT_DIR.mkdir(exist_ok=True)
            debug_path = OUTPUT_DIR / "report_page_debug.html"
            debug_path.write_text(page.content(), encoding="utf-8")
            print(f"저장할 테이블이 없어 디버깅용 페이지를 '{debug_path}'에 저장했습니다.")

        browser.close()


if __name__ == "__main__":
    main()
