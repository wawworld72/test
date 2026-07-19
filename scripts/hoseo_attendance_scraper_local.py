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
    - 로그인 후 터미널에서 Enter 키를 누르면, '목록수'를 '모두'로 바꿔 전체 학생을
      한 페이지에 표시한 뒤, 학번/이름/주차/항목순번/출결상태로 이루어진
      long-format CSV로 저장합니다.
    - 다음 실행부터는 로그인 세션을 재사용해 자동으로 진행됩니다
      (state.json에 세션 저장, 같은 폴더에 보관 - 유출 주의).
"""

import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

import attendance_lib as lib

TARGET_URL = "https://learn.hoseo.ac.kr/local/ubonattend/report.php?id=40069"
STATE_FILE = Path(__file__).parent / "state.json"
OUTPUT_DIR = Path(__file__).parent.parent / "attendance_output"


def looks_logged_in(page) -> bool:
    return "/login/" not in page.url


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

        found_all = lib.select_show_all(page)
        print(f"'모두 보기' 옵션 적용 여부: {found_all}")

        OUTPUT_DIR.mkdir(exist_ok=True)
        result = lib.parse_report_table(page)

        if result is None:
            debug_path = OUTPUT_DIR / "page_debug.html"
            debug_path.write_text(page.content(), encoding="utf-8")
            print(f"페이지에서 <table>을 찾지 못했습니다. 디버깅용 페이지를 '{debug_path}'에 저장했습니다.")
        else:
            long_rows = result["long_rows"]
            meta_labels = result["meta_labels"]
            print(f"학생 수(데이터 행): {result['student_count']}")
            print(f"주차 수: {len(result['weeks'])}, 주차별 항목 수: {result['items_per_week']}")

            long_path = OUTPUT_DIR / "attendance_long.csv"
            lib.write_long_csv(long_rows, meta_labels, long_path)
            print(f"저장됨: {long_path} ({len(long_rows)}행, long format)")

        browser.close()


if __name__ == "__main__":
    main()
