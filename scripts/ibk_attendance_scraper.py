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
    3) 년도/학기 선택 (지정한 경우) 후 '조회' 클릭해 그 학기의 전체 과목
       목록을 불러옴 (교과목명으로 다시 검색하지 않음 - 그 경로는 총 0건이
       나오는 문제가 있었음)
    4) 불러온 과목 목록(IBSheet 그리드)에서 IBK_COURSE_NAME과 일치하는
       행을 찾아 클릭해 상세 출석부('주차별 출석부 상세')로 이동
    5) 상세 화면의 <table>을 attendance_lib의 colspan/rowspan 파서로 읽어
       학번/이름/주차/항목순번/출결상태 long-format CSV로 저장 (읽기 전용,
       다른 액션은 수행하지 않음)

    참고: '엑셀다운' 버튼으로 xls를 받아 파싱하는 방식도 시도했으나, 클릭
    자체는 되어도 사이트 쪽에서 다운로드를 취소시켰다(은행 계열 시스템
    특성상 대량 내보내기에 자동화 탐지가 걸려있을 가능성). 이를 우회하려는
    시도는 하지 않고 화면 스크래핑으로 되돌렸다.
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

    # 화면 전환 직후에는 "선택해주세요" 플레이스홀더 <li> 하나만 DOM에 있고,
    # 실제 연도/학기 옵션은 비동기로 나중에 채워진다. 플레이스홀더는 data-value가
    # 없으므로, li가 "존재"하는지가 아니라 data-value를 가진 실제 옵션이
    # 나타날 때까지 폴링해야 한다 (그렇지 않으면 옵션 목록이 비어있는 상태를
    # '학기를 찾지 못함'으로 오판하게 된다).
    options = semester_select.locator("li[data-value]")
    populated = False
    for _ in range(20):
        if options.count() > 0:
            populated = True
            break
        page.wait_for_timeout(300)

    labels = [options.nth(i).get_attribute("data-label") for i in range(options.count())]
    print(
        f"[select_semester] populated={populated}, "
        f"현재 선택값: {semester_select.locator('button.selectBox').inner_text().strip()!r}, "
        f"옵션 목록: {labels}"
    )

    option = semester_select.locator(f'li[data-label="{semester_label}"]')
    if option.count() == 0:
        print(f"학기 목록에서 '{semester_label}'를 찾지 못했습니다.")
        return False

    if "active" in (option.first.get_attribute("class") or ""):
        return True

    semester_select.locator("button.selectBox").click()
    option.first.click()

    # 학기를 바꾸면 화면이 내부적으로 과목 목록을 다시 조회하는 것으로 보인다.
    # 이 백그라운드 요청이 끝나기 전에 검색어를 입력하고 '조회'를 누르면, 학기
    # 변경으로 트리거된 요청과 우리가 누른 조회 요청이 뒤섞여 검색어가 적용되지
    # 않은(또는 응답 순서가 꼬인) 결과를 받을 수 있어 완전히 안정될 때까지 기다린다.
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(500)

    total_text = page.locator(".total_area .total")
    if total_text.count() > 0:
        print(f"[select_semester] 학기 변경 직후 총 건수 표시: {total_text.first.inner_text().strip()}")

    return True


def load_course_list(page) -> None:
    """선택된 학기의 교과목 목록을 불러온다.

    화면은 학기만으로 조회하면 그 학기에 개설된 과목이 모두 나열되고,
    이후 그 목록에서 원하는 과목을 클릭해 들어가는 방식이다. 교과목명으로
    다시 검색할 필요가 없다(오히려 그 경로에서 총 0건이 나오는 문제가 있었다).
    """
    page.locator("button.conm", has_text="조회").click()
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(500)

    try:
        page.locator(".IBDataRow").first.wait_for(state="visible", timeout=8000)
    except PlaywrightTimeoutError:
        pass  # 결과가 없을 수도 있음 - 아래에서 total_area로 확인

    total_text = page.locator(".total_area .total")
    if total_text.count() > 0:
        print(f"[load_course_list] 총 건수 표시: {total_text.first.inner_text().strip()}")

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

    def line_table_visible() -> bool:
        table = page.locator("table.line_table")
        return table.count() > 0 and table.first.is_visible()

    # 단일 클릭만으로 상세화면으로 이동하는 경우가 있는데, 전환에 500ms보다
    # 오래 걸릴 때도 있어 고정 대기 대신 짧게 폴링한다. count()>0만으로는
    # 부족하다 - 테이블이 DOM에 붙은 직후에도 display:none -> block 전환이
    # 끝나기 전이라 is_visible()이 아직 false일 수 있고, 이 상태로 바로
    # 리턴하면 parse_report_table의 prefer_selector가 '보이는 테이블 없음'으로
    # 판단해 엉뚱한 테이블로 폴백해버린다.
    for _ in range(15):
        if line_table_visible():
            break
        page.wait_for_timeout(300)

    if not line_table_visible():
        # 단일 클릭으로 이동하지 않았다면 더블클릭을 시도한다. 다만 첫 클릭이
        # 이미 화면 전환을 시작해 이 행이 사라지는 중일 수 있어, dblclick이
        # 기본 30초 타임아웃으로 스크립트 전체를 죽이지 않도록 짧게 감싼다.
        try:
            link_cell.dblclick(timeout=5000)
            page.wait_for_load_state("networkidle")
            for _ in range(15):
                if line_table_visible():
                    break
                page.wait_for_timeout(300)
        except PlaywrightTimeoutError:
            pass

    return line_table_visible()


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

        load_course_list(page)

        if not open_course_detail(page, COURSE_NAME, SECTION):
            OUTPUT_DIR.mkdir(exist_ok=True)
            debug_path = OUTPUT_DIR / "course_list_debug.html"
            debug_path.write_text(page.content(), encoding="utf-8")
            print(f"과목 상세로 진입하지 못해 디버깅용 페이지를 '{debug_path}'에 저장했습니다.")
            browser.close()
            sys.exit(1)

        print(f"과목 상세 진입 성공 (url={page.url})")

        # '엑셀다운' 파일 다운로드는 사이트 측에서 취소시키는 것으로 확인됐다
        # (은행 계열 시스템 특성상 대량 내보내기에 자동화 탐지가 걸려있을 수
        # 있음). 우회를 시도하는 대신, 다운로드가 필요 없는 화면 스크래핑으로
        # 되돌린다. "보이는 테이블만" 고르는 것만으로는 화면에 달력 등 출석표보다
        # 행이 많은 다른 보이는 테이블이 있어 여전히 잘못 고를 수 있었기에,
        # 이 화면의 출석표 클래스명을 정확히 지정해 확실하게 집어낸다.
        result = lib.parse_report_table(page, prefer_selector="table.line_table")
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
