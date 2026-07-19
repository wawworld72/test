"""
호서대 LMS(learn.hoseo.ac.kr) 주차별 출석 현황 스크래퍼 - 로컬 대화형(수동 로그인) 버전

사용법:
    1) pip install playwright
    2) playwright install chromium
    3) python scripts/hoseo_attendance_scraper_local.py

동작 방식:
    - Chromium 창이 열리고 대상 URL로 이동합니다.
    - 로그인이 안 되어 있으면 Moodle 로그인 페이지로 자동 리다이렉트됩니다.
      브라우저 창에서 아이디/비밀번호를 직접 입력해 로그인하세요.
      (이 스크립트는 로그인 정보를 저장하거나 전송하지 않습니다.)
    - 로그인 후 터미널에서 Enter 키를 누르면, 해당 리포트 페이지에서
      테이블(주차별 출석 현황)을 찾아 CSV로 저장합니다.
    - 다음 실행부터는 로그인 세션을 재사용해 자동으로 진행됩니다
      (state.json에 세션 저장, 같은 폴더에 보관 - 유출 주의).
"""

import csv
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

TARGET_URL = "https://learn.hoseo.ac.kr/local/ubonattend/report.php?id=40069"
STATE_FILE = Path(__file__).parent / "state.json"
OUTPUT_DIR = Path(__file__).parent.parent / "attendance_output"


def looks_logged_in(page) -> bool:
    return "/login/" not in page.url


def dump_tables_to_csv(page, output_dir: Path) -> list[Path]:
    output_dir.mkdir(exist_ok=True)
    tables = page.locator("table")
    count = tables.count()
    if count == 0:
        print("페이지에서 <table>을 찾지 못했습니다. 페이지가 아직 로딩 중일 수 있습니다.")
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
        print(f"저장됨: {out_path} ({len(data)}행)")

    return saved_files


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context_kwargs = {}
        if STATE_FILE.exists():
            context_kwargs["storage_state"] = str(STATE_FILE)
        context = browser.new_context(**context_kwargs)
        page = context.new_page()

        page.goto(TARGET_URL)
        page.wait_for_load_state("networkidle")

        if not looks_logged_in(page):
            print("\n로그인이 필요합니다. 열린 브라우저 창에서 로그인을 완료한 뒤,")
            input("이 터미널로 돌아와 Enter 키를 누르세요...")
            page.goto(TARGET_URL)
            page.wait_for_load_state("networkidle")

        if not looks_logged_in(page):
            print("여전히 로그인 페이지입니다. 로그인 후 다시 실행해주세요.")
            sys.exit(1)

        context.storage_state(path=str(STATE_FILE))

        saved = dump_tables_to_csv(page, OUTPUT_DIR)
        if saved:
            print(f"\n총 {len(saved)}개 테이블을 '{OUTPUT_DIR}'에 저장했습니다.")
        else:
            print("\n저장할 테이블 데이터가 없습니다. 페이지 구조를 확인해주세요.")
            debug_path = OUTPUT_DIR / "page_debug.html"
            OUTPUT_DIR.mkdir(exist_ok=True)
            debug_path.write_text(page.content(), encoding="utf-8")
            print(f"디버깅용 페이지 HTML을 '{debug_path}'에 저장했습니다.")

        browser.close()


if __name__ == "__main__":
    main()
