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
    4) 좌측 메뉴(전자출결관리 > 전자출결 > 주차별 출석부 조회)로 이동해
       담당 과목 목록을 조회
    5) 목록은 IBSheet 그리드 위젯(일반 <table>이 아님)이라, 각 셀의
       class에 박혀 있는 'HideCol0<필드명>'으로 필드를 식별해 추출.
       CSV로 저장하고 stdout에도 출력 (읽기 전용, 다른 액션은 수행하지 않음)
"""

import csv
import os
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError

ATTENDANCE_MENU_TEXT = "주차별 출석부 조회"

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

    # 제출 후 대시보드로 넘어가기 전에 "i-o-n-e-캠-퍼-스" 글자 애니메이션이 있는
    # 로딩 화면이 뜨는데, 이게 끝나기 전에 확인하면 아직 로그인 폼이 DOM에
    # 남아있어 실패로 오판할 수 있다. 로그인 폼이 실제로 사라질 때까지 기다린다.
    try:
        page.locator("#unvrUserId").wait_for(state="detached", timeout=8000)
    except PlaywrightTimeoutError:
        pass  # 폼이 그대로면 아래 networkidle 대기 후 최종 판정

    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(500)
    return not looks_like_login_page(page)


def navigate_to_attendance_list(page) -> bool:
    """좌측 메뉴(전자출결관리 > 전자출결 > 주차별 출석부 조회)를 통해 과목 목록 화면으로 이동"""
    target_btn = page.get_by_text(ATTENDANCE_MENU_TEXT, exact=True)
    if target_btn.count() == 0:
        print(f"메뉴에서 '{ATTENDANCE_MENU_TEXT}'를 찾지 못했습니다.")
        return False

    if not target_btn.first.is_visible():
        top_menu = page.locator("button.menu_wrap.menu01")
        if top_menu.count() > 0 and top_menu.first.is_visible():
            top_menu.first.click()
            page.wait_for_timeout(300)

        sub_menu = page.get_by_text("전자출결", exact=True)
        if sub_menu.count() > 0 and sub_menu.first.is_visible():
            sub_menu.first.click()
            page.wait_for_timeout(300)

    target_btn.first.click()
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(800)
    return True


def extract_ibsheet_rows(page) -> list[dict]:
    """IBSheet 그리드에서 실제 데이터 행(.IBDataRow)만 추출.
    각 셀의 class에 'HideCol0<필드명>'이 그대로 박혀 있어 필드명 매핑에 사용."""
    data_rows = page.locator(".IBDataRow")
    row_count = data_rows.count()
    results = []
    for i in range(row_count):
        row = data_rows.nth(i)
        cells = row.locator('td[class*="HideCol0"]')
        cell_count = cells.count()
        row_data = {}
        for c in range(cell_count):
            cell = cells.nth(c)
            cls = cell.get_attribute("class") or ""
            m = re.search(r"HideCol0(\S+)", cls)
            field = m.group(1) if m else f"col_{c}"
            row_data[field] = cell.inner_text().strip()
        if row_data:
            results.append(row_data)
    return results


def dump_ibsheet_rows(rows: list[dict], output_dir: Path, name: str) -> Path | None:
    if not rows:
        return None

    output_dir.mkdir(exist_ok=True)
    fieldnames = list(rows[0].keys())
    out_path = output_dir / f"{name}.csv"
    with out_path.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"\n=== {name.upper()} ({len(rows)} rows) ===")
    print(",".join(fieldnames))
    for row in rows:
        print(",".join(str(row.get(k, "")) for k in fieldnames))
    print(f"=== END {name.upper()} ===")

    return out_path


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

        if not navigate_to_attendance_list(page):
            OUTPUT_DIR.mkdir(exist_ok=True)
            debug_path = OUTPUT_DIR / "nav_debug.html"
            debug_path.write_text(page.content(), encoding="utf-8")
            print(f"메뉴 이동에 실패해 디버깅용 페이지를 '{debug_path}'에 저장했습니다.")
            browser.close()
            sys.exit(1)

        courses = extract_ibsheet_rows(page)
        saved = dump_ibsheet_rows(courses, OUTPUT_DIR, "course_list")
        if not saved:
            OUTPUT_DIR.mkdir(exist_ok=True)
            debug_path = OUTPUT_DIR / "page_debug.html"
            debug_path.write_text(page.content(), encoding="utf-8")
            print(f"과목 목록을 찾지 못해 디버깅용 페이지를 '{debug_path}'에 저장했습니다.")

        browser.close()


if __name__ == "__main__":
    main()
