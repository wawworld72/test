"""
과목 페이지에서 주차별 토론방(포럼) 목록을 어떻게 찾을 수 있는지, 그리고
포럼 한 곳의 "Export" 기능이 실제로 어떤 링크/요청으로 동작하는지 확인하기
위한 일회성 진단 스크립트.

사용자가 제공한 merge_forum_exports.py는 이미 수동으로 내려받은 CSV 파일들을
병합하는 로직만 있고, 그 CSV들을 어떻게 자동으로 받아올지는 아직 확인 전이라
- 과목 페이지와 포럼 페이지의 실제 HTML을 먼저 관찰한다. Hoseo LMS는 이미
scripts/hoseo/session.py로 로그인 세션만으로 접근 가능함을 확인했으므로
Playwright 없이 requests 세션으로 진행한다.

환경변수: HOSEO_USERNAME, HOSEO_PASSWORD, HOSEO_COURSE_URL(선택)
"""

import os
import sys

from bs4 import BeautifulSoup

from hoseo.session import HoseoLoginError, HoseoSession

COURSE_URL = os.environ.get("HOSEO_COURSE_URL") or "https://learn.hoseo.ac.kr/course/view.php?id=40069"
USERNAME = os.environ.get("HOSEO_USERNAME")
PASSWORD = os.environ.get("HOSEO_PASSWORD")

EXPORT_KEYWORDS = ["export", "csv", "다운로드", "내보내기", "백업", "backup", "portfolio", "download"]


def main():
    if not USERNAME or not PASSWORD:
        print("HOSEO_USERNAME / HOSEO_PASSWORD 환경변수가 설정되지 않았습니다.", file=sys.stderr)
        sys.exit(1)

    session = HoseoSession(USERNAME, PASSWORD)
    try:
        session.login()
    except HoseoLoginError as exc:
        print(f"로그인 실패: {exc}", file=sys.stderr)
        sys.exit(1)
    print("로그인 성공")

    resp = session.get(COURSE_URL)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    print(f"[1] 과목 페이지 title: {soup.title.get_text() if soup.title else None}")

    sections = soup.select("li.section")
    print(f"[2] li.section 개수: {len(sections)}")

    forum_links = []
    for sec in sections:
        heading = sec.select_one(".sectionname") or sec.select_one("h3")
        heading_text = heading.get_text(strip=True) if heading else None
        for a in sec.select('a[href*="mod/forum/view.php"]'):
            forum_links.append(
                {"section": heading_text, "text": a.get_text(strip=True), "href": a.get("href")}
            )

    print(f"[3] 발견된 포럼(토론방) 링크 수: {len(forum_links)}")
    for f in forum_links[:30]:
        print(f"    section={f['section']!r} text={f['text']!r} href={f['href']}")

    if not forum_links:
        print("[경고] mod/forum/view.php 링크를 못 찾았습니다 - 페이지 구조가 다를 수 있습니다. 첫 3000자:")
        print(resp.text[:3000])
        return

    first = forum_links[0]
    forum_resp = session.get(first["href"])
    forum_resp.raise_for_status()
    forum_soup = BeautifulSoup(forum_resp.text, "html.parser")
    print(f"\n[4] 첫 번째 포럼({first['text']!r}) 페이지 title: {forum_soup.title.get_text() if forum_soup.title else None}")

    print("[5] 'export/csv/내보내기' 등 키워드가 포함된 링크:")
    found_any = False
    for a in forum_soup.find_all("a", href=True):
        text = a.get_text(strip=True)
        href = a["href"]
        haystack = (text + " " + href).lower()
        if any(k in haystack for k in EXPORT_KEYWORDS):
            found_any = True
            print(f"    text={text!r} href={href}")
    if not found_any:
        print("    (키워드 매칭되는 링크 없음)")

    print("\n[6] 포럼 페이지 내 <form> 목록 (action/method, 키워드 포함 여부):")
    for form in forum_soup.find_all("form"):
        action = form.get("action") or ""
        method = form.get("method") or "get"
        haystack = action.lower() + " " + form.get_text(" ", strip=True).lower()
        marker = " <-- 키워드 매칭" if any(k in haystack for k in EXPORT_KEYWORDS) else ""
        print(f"    action={action} method={method}{marker}")

    print("\n[7] 페이지 내 '설정'/gear 메뉴로 보이는 action-menu 링크 전체 (id 포함):")
    for a in forum_soup.select(".action-menu a, [data-toggle='dropdown'] ~ .dropdown-menu a, .moodle-actionmenu a"):
        print(f"    text={a.get_text(strip=True)!r} href={a.get('href')}")

    export_link = None
    for a in forum_soup.find_all("a", href=True):
        if a.get_text(strip=True).lower() == "export" and "mod/forum/export.php" in a["href"]:
            export_link = a["href"]
            break

    if not export_link:
        print("\n[8] 'mod/forum/export.php' 링크를 찾지 못해 이후 단계를 건너뜁니다.")
        return

    print(f"\n[8] Export 링크 실제 접속: {export_link}")
    export_resp = session.get(export_link)
    export_resp.raise_for_status()
    content_type = export_resp.headers.get("Content-Type", "")
    print(f"    상태={export_resp.status_code}, Content-Type={content_type!r}, 길이={len(export_resp.text)}자")

    if "csv" in content_type.lower() or "text/plain" in content_type.lower():
        print("    바로 CSV/텍스트로 응답한 것으로 보입니다. 앞부분 500자:")
        print(export_resp.text[:500])
        return

    export_soup = BeautifulSoup(export_resp.text, "html.parser")
    print(f"    HTML 응답으로 보입니다 (title={export_soup.title.get_text() if export_soup.title else None}).")
    print("    [8-1] export 페이지 내 <form> 목록:")
    for form in export_soup.find_all("form"):
        print(f"        action={form.get('action')} method={form.get('method')}")
        for field in form.find_all(["input", "select", "textarea"]):
            print(
                f"            <{field.name} name={field.get('name')!r} type={field.get('type')!r} "
                f"value={field.get('value')!r}>"
            )

    print("\n[9] 나머지 14개 포럼에서도 'Export' 링크가 동일한 패턴으로 나오는지 확인:")
    for f in forum_links[1:]:
        r = session.get(f["href"])
        r.raise_for_status()
        s = BeautifulSoup(r.text, "html.parser")
        link = next(
            (a["href"] for a in s.find_all("a", href=True) if a.get_text(strip=True).lower() == "export"),
            None,
        )
        print(f"    section={f['section']!r} text={f['text']!r} export_href={link}")


if __name__ == "__main__":
    main()
