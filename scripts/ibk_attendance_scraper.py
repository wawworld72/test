"""
campus.ibk.co.kr (i-on캠퍼스, 호서대학교) 주차별 출석부 조회 스크래퍼 - GitHub Actions용 headless 버전

주의: 은행(IBK) 계열 시스템은 이상거래탐지(FDS)가 걸려있을 수 있어, 낯선
클라우드 IP에서의 자동 로그인이 보안 경고나 계정 잠금으로 이어질 위험이
있다. 정기 실행으로 전환하기 전에 반드시 수동 트리거로 먼저 테스트하고
계정에 이상이 없는지 확인할 것.

환경변수:
    IBK_CAMPUS_USER, IBK_CAMPUS_PASS - 로그인 정보 (GitHub Secrets에서 주입)
    IBK_SEMESTER   - 년도/학기 (예: "2026년도 1학기"). 생략하면 화면에 이미
                     선택된 학기를 그대로 사용.
    IBK_COURSE_NAME - 조회할 교과목명 (필수, 부분 일치도 가능)
    IBK_SECTION     - 분반 (예: "01"). 같은 과목이 여러 분반이면 지정해서
                      특정 분반을 선택. 생략하면 검색 결과 중 첫 번째 사용.

동작:
    1) https://campus.ibk.co.kr/admin/ 으로 이동, 로그인
    2) 좌측 메뉴(전자출결관리 > 전자출결 > 주차별 출석부 조회)로 이동
    3) 년도/학기 선택 (지정한 경우) 후, 교과목명으로 검색해 '조회' 클릭
    4) 검색된 과목 목록(IBSheet 그리드)에서 대상 과목을 클릭해 상세
       출석부('주차별 출석부 상세')로 이동
    5) 상세 출석부는 일반 <table>이라 attendance_lib의 colspan/rowspan
       파서를 그대로 재사용해 학번/이름/주차/교시/출결상태 long-format
       CSV로 저장 (읽기 전용, 다른 액션은 수행하지 않음)
"""

import os
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError

import attendance_lib as lib

ATTENDANCE_MENU_TEXT = "주차별 출석부 조회"

TARGET_URL = "https://campus.ibk.co.kr/admin/"
USERNAME = os.environ.get("IBK_CAMPUS_USER")
PASSWORD = os.environ.get("IBK_CAMPUS_PASS")
SEMESTER = os.environ.get("IBK_SEMESTER")
COURSE_NAME = os.environ.get("IBK_COURSE_NAME")
SECTION = os.environ.get("IBK_SECTION")
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


def navigate_to_course_list(page) -> bool:
    """좌측 메뉴(전자출결관리 > 전자출결 > 주차별 출석부 조회)를 통해 과목 검색 화면으로 이동"""
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


def select_semester(page, semester_label: str) -> bool:
    """검색 영역의 '년도/학기' 드롭다운에서 지정한 학기를 선택"""
    semester_select = page.locator(".sc_table .n_select").nth(0)
    if semester_select.count() == 0:
        print("년도/학기 선택 영역을 찾지 못했습니다.")
        return False

    # 화면 전환 직후에는 드롭다운 옵션이 아직 채워지기 전일 수 있어 잠깐 대기
    try:
        semester_select.locator("li").first.wait_for(state="attached", timeout=5000)
    except PlaywrightTimeoutError:
        pass

    options = semester_select.locator("li")
    labels = [options.nth(i).get_attribute("data-label") for i in range(options.count())]
    print(f"[select_semester] 현재 선택값: {semester_select.locator('button.selectBox').inner_text().strip()!r}, 옵션 목록: {labels}")

    option = semester_select.locator(f'li[data-label="{semester_label}"]')
    if option.count() == 0:
        print(f"학기 목록에서 '{semester_label}'를 찾지 못했습니다.")
        return False

    if "active" in (option.first.get_attribute("class") or ""):
        return True

    semester_select.locator("button.selectBox").click()
    option.first.click()
    page.wait_for_timeout(200)
    return True


def search_course(page, course_name: str) -> None:
    """'구분'을 교과목명으로 두고 검색어를 입력한 뒤 '조회' 클릭"""
    search_input = page.locator('.sc_table input[placeholder="내용을 넣어주세요"]')
    search_input.fill(course_name)
    print(f"[search_course] 검색창 입력값: {search_input.input_value()!r}")

    page.locator("button.conm", has_text="조회").click()
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(500)

    try:
        page.locator(".IBDataRow").first.wait_for(state="visible", timeout=8000)
    except PlaywrightTimeoutError:
        pass  # 검색 결과가 없을 수도 있음 - 아래에서 total_area로 확인

    total_text = page.locator(".total_area .total")
    if total_text.count() > 0:
        print(f"[search_course] 총 건수 표시: {total_text.first.inner_text().strip()}")

    semester_select = page.locator(".sc_table .n_select").nth(0)
    if semester_select.count() > 0:
        print(f"[search_course] 적용된 학기: {semester_select.locator('button.selectBox').inner_text().strip()!r}")


def open_course_detail(page, course_name: str, section: str | None) -> bool:
    """검색된 과목 목록에서 대상 과목을 클릭해 상세 출석부로 이동"""
    rows = page.locator(".IBDataRow")
    row_count = rows.count()

    # 이름이 일치하는 모든 행을 먼저 모아서, 분반 지정 없이 여러 개가 걸리면
    # 아무거나 하나를 조용히 골라버리지 않고 사용자가 분반을 지정하게 한다
    matches = []
    for i in range(row_count):
        row = rows.nth(i)
        name_cell = row.locator('td[class*="HideCol"][class*="stdNm"]')
        if name_cell.count() == 0 or course_name not in name_cell.first.inner_text():
            continue
        section_cell = row.locator('td[class*="HideCol"][class*="pruvPrusClgpNm"]')
        row_section = section_cell.first.inner_text().strip() if section_cell.count() > 0 else ""
        matches.append((row, row_section))

    if not matches:
        print(f"검색 결과에서 '{course_name}'를 찾지 못했습니다.")
        return False

    if section:
        filtered = [(r, s) for r, s in matches if s == section]
        if not filtered:
            available = ", ".join(s for _, s in matches)
            print(f"'{course_name}'의 분반 '{section}'을 찾지 못했습니다. 존재하는 분반: {available}")
            return False
        target_row = filtered[0][0]
    elif len(matches) > 1:
        available = ", ".join(s for _, s in matches)
        print(
            f"'{course_name}'로 검색된 분반이 {len(matches)}개입니다 ({available}). "
            "IBK_SECTION(section) 값을 지정해서 다시 실행해주세요."
        )
        return False
    else:
        target_row = matches[0][0]

    link_cell = target_row.locator('td[class*="HideCol"][class*="stdNm"]').first
    link_cell.click()
    page.wait_for_timeout(500)

    # IBSheet 셀은 단일 클릭으로는 선택만 되고, 실제 상세화면 이동에는
    # 더블클릭이 필요한 경우가 있어 진입 여부를 확인 후 필요하면 재시도한다
    if page.locator("table.line_table").count() == 0:
        link_cell.dblclick()
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(500)

    return page.locator("table.line_table").count() > 0


def main():
    if not COURSE_NAME:
        print("IBK_COURSE_NAME 환경변수가 설정되지 않았습니다.", file=sys.stderr)
        sys.exit(1)

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

        if not navigate_to_course_list(page):
            OUTPUT_DIR.mkdir(exist_ok=True)
            debug_path = OUTPUT_DIR / "nav_debug.html"
            debug_path.write_text(page.content(), encoding="utf-8")
            print(f"메뉴 이동에 실패해 디버깅용 페이지를 '{debug_path}'에 저장했습니다.")
            browser.close()
            sys.exit(1)

        if SEMESTER:
            select_semester(page, SEMESTER)

        search_course(page, COURSE_NAME)

        if not open_course_detail(page, COURSE_NAME, SECTION):
            OUTPUT_DIR.mkdir(exist_ok=True)
            debug_path = OUTPUT_DIR / "course_list_debug.html"
            debug_path.write_text(page.content(), encoding="utf-8")
            print(f"과목 상세로 진입하지 못해 디버깅용 페이지를 '{debug_path}'에 저장했습니다.")
            browser.close()
            sys.exit(1)

        print(f"과목 상세 진입 성공 (url={page.url})")

        result = lib.parse_report_table(page)
        if result is None:
            OUTPUT_DIR.mkdir(exist_ok=True)
            debug_path = OUTPUT_DIR / "detail_debug.html"
            debug_path.write_text(page.content(), encoding="utf-8")
            print(f"출석 표를 찾지 못해 디버깅용 페이지를 '{debug_path}'에 저장했습니다.")
            browser.close()
            sys.exit(1)

        long_rows = result["long_rows"]
        meta_labels = result["meta_labels"]

        print(f"학생 수(데이터 행): {result['student_count']}")
        print(f"주차 수: {len(result['weeks'])}, 주차별 항목 수: {result['items_per_week']}")

        OUTPUT_DIR.mkdir(exist_ok=True)
        long_path = OUTPUT_DIR / "attendance_long.csv"
        lib.write_long_csv(long_rows, meta_labels, long_path)
        print(f"저장됨: {long_path} ({len(long_rows)}행, long format)")

        fieldnames = meta_labels + ["주차", "항목순번", "출결상태"]
        print(f"\n=== ATTENDANCE_LONG ({len(long_rows)} rows) ===")
        print(",".join(fieldnames))
        for row in long_rows:
            print(",".join(str(row.get(f, "")) for f in fieldnames))
        print("=== END ATTENDANCE_LONG ===")

        browser.close()


if __name__ == "__main__":
    main()
