"""
호서대 LMS(learn.hoseo.ac.kr) 로그인/출결 조회 요청을 관찰해 A안(HTTP 직접
호출) 채택 가능 여부를 판단하기 위한 진단 스크립트.

DevTools를 직접 열 수 없는 환경에서, 사람이 Network 탭으로 확인할 항목을
Playwright의 request/response 이벤트로 대신 캡처한다:
    1) 로그인 POST의 비밀번호 필드가 평문인지 인코딩됐는지
    2) 로그인 페이지에 숨은 필드(csrf_token 등)가 있는지
    3) 로그인 응답이 어디로 리다이렉트되는지, 세션 쿠키가 새로 생기는지
    4) 출결 조회 시 XHR/JSON으로 오는지 문서 전체 렌더링인지

비밀번호 원문은 절대 로그에 남기지 않는다 (network_diagnose_lib.NetworkLog가
알려진 비밀번호 문자열만 정확히 치환해서 가림).

환경변수: HOSEO_USERNAME, HOSEO_PASSWORD, ATTENDANCE_URL (hoseo_attendance_scraper.py와 동일)
"""

import os
import sys

from playwright.sync_api import sync_playwright

import network_diagnose_lib as diag

DEFAULT_URL = "https://learn.hoseo.ac.kr/local/ubonattend/report.php?id=40069"
TARGET_URL = os.environ.get("ATTENDANCE_URL", DEFAULT_URL)
USERNAME = os.environ.get("HOSEO_USERNAME")
PASSWORD = os.environ.get("HOSEO_PASSWORD")


def looks_logged_in(page) -> bool:
    return "/login/" not in page.url


def main():
    if not USERNAME or not PASSWORD:
        print("HOSEO_USERNAME / HOSEO_PASSWORD 환경변수가 설정되지 않았습니다.", file=sys.stderr)
        sys.exit(1)

    log = diag.NetworkLog(secrets_to_redact=[PASSWORD])

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        log.attach(page)

        page.goto(TARGET_URL)
        page.wait_for_load_state("networkidle")
        print(f"[1] 초기 이동 후 URL: {page.url}")

        if looks_logged_in(page):
            print("이미 로그인된 세션입니다 (저장된 상태가 있었나 확인 필요). 진단을 계속합니다.")
        else:
            hidden_fields = diag.get_hidden_fields(page)
            print(f"[2] 로그인 페이지 숨은 필드(input[type=hidden]): {hidden_fields}")

            before_cookies = diag.snapshot_cookies(context)

            candidates = [
                ("#username", "#password", "#loginbtn"),
                ('input[name="username"]', 'input[name="password"]', 'button[type="submit"]'),
            ]
            submitted = False
            for user_sel, pass_sel, submit_sel in candidates:
                user_field = page.locator(user_sel)
                if user_field.count() > 0:
                    user_field.first.fill(USERNAME)
                    page.locator(pass_sel).first.fill(PASSWORD)
                    page.locator(submit_sel).first.click()
                    page.wait_for_load_state("networkidle")
                    submitted = True
                    break

            if not submitted:
                print("로그인 폼을 찾지 못했습니다.", file=sys.stderr)
                browser.close()
                sys.exit(1)

            print(f"[3] 로그인 제출 후 URL: {page.url}")

            after_cookies = diag.snapshot_cookies(context)
            new_cookies = diag.diff_new_cookies(before_cookies, after_cookies)
            print(f"[4] 로그인 후 새로 생긴 쿠키: {new_cookies}")

            login_requests = [
                e for e in log.events
                if e["kind"] == "request" and e["method"] == "POST"
            ]
            for req in login_requests:
                classification = diag.classify_secret_field(
                    req["post_data_raw_for_classification"], PASSWORD
                )
                print(f"[5] 로그인 POST 후보: {req['url']}")
                print(f"    본문(가림 처리됨): {req['post_data_redacted']!r}")
                print(f"    비밀번호 필드 판정: {classification}")

        if not looks_logged_in(page):
            page.goto(TARGET_URL)
            page.wait_for_load_state("networkidle")

        if not looks_logged_in(page):
            print("로그인 후에도 리포트 페이지에 접근하지 못했습니다.", file=sys.stderr)
            log.print_all("전체 캡처")
            browser.close()
            sys.exit(1)

        print(f"[6] 최종 리포트 페이지 URL: {page.url}, title={page.title()!r}")

        xhr_events = [e for e in log.events if e.get("resource_type") in ("xhr", "fetch")]
        print(f"[7] 출결 조회 과정에서 캡처된 XHR/fetch 요청 수: {len(xhr_events)}")
        for e in xhr_events:
            if e["kind"] == "response":
                print(f"    XHR 응답: {e['status']} {e['url']} content-type={e['content_type']!r}")

        log.print_all("전체 캡처")

        browser.close()


if __name__ == "__main__":
    main()
