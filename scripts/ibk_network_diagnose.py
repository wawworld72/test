"""
campus.ibk.co.kr(i-on캠퍼스, 호서대 교수용) 로그인/출결 조회 요청을 관찰해
A안(HTTP 직접 호출) 채택 가능 여부를 판단하기 위한 진단 스크립트.

기존 ibk_attendance_scraper.py의 로그인/화면 이동 로직을 그대로 재사용하고,
network_diagnose_lib.NetworkLog로 요청/응답만 옆에서 캡처한다. 확인 항목은
hoseo_network_diagnose.py와 동일: 비밀번호 평문 여부, 숨은 필드, 로그인 응답의
쿠키/리다이렉트, 출결 조회가 XHR/JSON인지 여부.

환경변수: IBK_CAMPUS_USER, IBK_CAMPUS_PASS, IBK_SEMESTER, IBK_COURSE_NAME, IBK_SECTION
(ibk_attendance_scraper.py와 동일 - 실제 과목 진입까지 재현해야 "출결 조회"
요청이 발생하기 때문에 COURSE_NAME이 여전히 필요하다)
"""

import sys

from playwright.sync_api import sync_playwright

import network_diagnose_lib as diag
import ibk_attendance_scraper as ibk


def main():
    if not ibk.USERNAME or not ibk.PASSWORD:
        print("IBK_CAMPUS_USER / IBK_CAMPUS_PASS 환경변수가 설정되지 않았습니다.", file=sys.stderr)
        sys.exit(1)
    if not ibk.COURSE_NAME:
        print(
            "IBK_COURSE_NAME 환경변수가 설정되지 않았습니다 "
            "(과목 상세까지 들어가야 '출결 조회' 요청을 관찰할 수 있습니다).",
            file=sys.stderr,
        )
        sys.exit(1)

    log = diag.NetworkLog(secrets_to_redact=[ibk.PASSWORD])

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        log.attach(page)

        page.goto(ibk.TARGET_URL)
        page.wait_for_load_state("networkidle")
        print(f"[1] 초기 이동 후 URL: {page.url}")

        if ibk.looks_like_login_page(page):
            hidden_fields = diag.get_hidden_fields(page)
            print(f"[2] 로그인 페이지 숨은 필드(input[type=hidden]): {hidden_fields}")

            before_cookies = diag.snapshot_cookies(context)

        login_ok = ibk.try_login(page)
        print(f"[3] 로그인 결과: {login_ok}, 로그인 후 URL: {page.url}")
        if not login_ok:
            print("로그인에 실패했습니다.", file=sys.stderr)
            log.print_all("전체 캡처")
            browser.close()
            sys.exit(1)

        after_cookies = diag.snapshot_cookies(context)
        try:
            new_cookies = diag.diff_new_cookies(before_cookies, after_cookies)
            print(f"[4] 로그인 후 새로 생긴 쿠키: {new_cookies}")
        except NameError:
            print("[4] 이미 로그인된 세션이라 쿠키 diff를 비교할 기준(before)이 없습니다.")

        login_requests = [
            e for e in log.events
            if e["kind"] == "request" and e["method"] == "POST"
        ]
        for req in login_requests:
            classification = diag.classify_secret_field(
                req["post_data_raw_for_classification"], ibk.PASSWORD
            )
            print(f"[5] 로그인 POST 후보: {req['url']}")
            print(f"    본문(가림 처리됨): {req['post_data_redacted']!r}")
            print(f"    비밀번호 필드 판정: {classification}")

        if not login_requests:
            print("[5] POST 방식 로그인 요청이 캡처되지 않았습니다 (JS 기반 로그인일 가능성 - fetch/XHR로 아래 목록 확인).")

        if not ibk.navigate_to_course_list(page):
            print("메뉴 이동에 실패했습니다.", file=sys.stderr)
            log.print_all("전체 캡처")
            browser.close()
            sys.exit(1)

        if ibk.SEMESTER:
            ibk.select_semester(page, ibk.SEMESTER)

        before_list_events = len(log.events)
        ibk.load_course_list(page)
        list_events = log.events[before_list_events:]
        print(f"[6] '조회'(과목 목록) 클릭 후 캡처된 요청/응답 {len(list_events)}건")

        before_detail_events = len(log.events)
        detail_ok = ibk.open_course_detail(page, ibk.COURSE_NAME, ibk.SECTION)
        detail_events = log.events[before_detail_events:]
        print(f"[7] 과목 상세 진입 결과: {detail_ok}, 캡처된 요청/응답 {len(detail_events)}건")

        if not detail_ok:
            print("과목 상세 진입에 실패했습니다 (아래 전체 캡처로 원인 확인).", file=sys.stderr)

        xhr_events = [e for e in log.events if e.get("resource_type") in ("xhr", "fetch")]
        print(f"[8] 전체 과정에서 캡처된 XHR/fetch 요청 수: {len(xhr_events)}")
        for e in xhr_events:
            if e["kind"] == "response":
                print(f"    XHR 응답: {e['status']} {e['url']} content-type={e['content_type']!r}")

        log.print_all("전체 캡처")

        browser.close()


if __name__ == "__main__":
    main()
