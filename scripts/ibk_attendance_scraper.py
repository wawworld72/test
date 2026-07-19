"""
campus.ibk.co.kr (i-on캠퍼스, 호서대학교) 출석 현황 조회 스크래퍼 - GitHub Actions용 headless 버전

주의: 은행(IBK) 계열 시스템은 이상거래탐지(FDS)가 걸려있을 수 있어, 낯선
클라우드 IP에서의 자동 로그인이 보안 경고나 계정 잠금으로 이어질 위험이
있다. 정기 실행으로 전환하기 전에 반드시 수동 트리거로 먼저 테스트하고
계정에 이상이 없는지 확인할 것.

환경변수:
    IBK_CAMPUS_USER, IBK_CAMPUS_PASS - 로그인 정보 (GitHub Secrets에서 주입)

동작:
    1) https://campus.ibk.co.kr/admin/ 으로 이동
    2) 학교선택 드롭다운에서 '호서대학교'(data-value=HOSEO)를 선택 (기본값이
       'IBK대학교'인 경우가 있어 명시적으로 선택해야 함)
    3) 아이디/비밀번호 입력 후 로그인
    4) 현재 페이지의 모든 <table>을 CSV로 저장하고 stdout에도 출력 (읽기 전용,
       다른 액션은 수행하지 않음)
"""

import csv
import os
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

TARGET_URL = "https://campus.ibk.co.kr/admin/"
USERNAME = os.environ.get("IBK_CAMPUS_USER")
PASSWORD = os.environ.get("IBK_CAMPUS_PASS")
OUTPUT_DIR = Path(__file__).parent.parent / "ibk_attendance_output"


def looks_like_login_page(page) -> bool:
    return page.locator("#unvrUserId").count() > 0


def select_school(page, school_value: str = "HOSEO") -> None:
    selected = page.locator(f'li[data-value="{school_value}"]')
    if selected.count() == 0:
        print(f"학교선택 목록에서 '{school_value}'를 찾지 못했습니다.")
        return

    if "active" in (selected.first.get_attribute("class") or ""):
        return

    page.locator('.n_select[name="학교선택"] button.selectBox').click()
    selected.first.click()
    page.wait_for_timeout(200)


def try_login(page) -> bool:
    if not looks_like_login_page(page):
        return True

    if not USERNAME or not PASSWORD:
        print("IBK_CAMPUS_USER / IBK_CAMPUS_PASS 환경변수가 설정되지 않았습니다.", file=sys.stderr)
        sys.exit(1)

    select_school(page, "HOSEO")
    page.locator("#unvrUserId").fill(USERNAME)
    page.locator("#scaPwd").fill(PASSWORD)
    page.locator("button.btn-lg--primary[type=submit]").click()
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(500)
    return not looks_like_login_page(page)


def dump_all_tables(page, output_dir: Path) -> list[Path]:
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

        if not try_login(page):
            print(f"로그인에 실패했습니다 (url={page.url}, title={page.title()!r}).", file=sys.stderr)
            OUTPUT_DIR.mkdir(exist_ok=True)
            debug_path = OUTPUT_DIR / "login_debug.html"
            debug_path.write_text(page.content(), encoding="utf-8")
            print(f"디버깅용 페이지를 '{debug_path}'에 저장했습니다.")
            browser.close()
            sys.exit(1)

        print(f"로그인 성공 (url={page.url})")

        saved = dump_all_tables(page, OUTPUT_DIR)
        if not saved:
            OUTPUT_DIR.mkdir(exist_ok=True)
            debug_path = OUTPUT_DIR / "page_debug.html"
            debug_path.write_text(page.content(), encoding="utf-8")
            print(f"저장할 표가 없어 디버깅용 페이지를 '{debug_path}'에 저장했습니다.")

        browser.close()


if __name__ == "__main__":
    main()
