"""
과목 페이지의 주차별 토론방(포럼) 게시글을 각각 CSV로 내보내 하나로 병합하는
요청별(task) 처리 모듈. 사용자가 제공한 merge_forum_exports.py(수동으로 받은
CSV 병합용)의 자동 수집 버전.

hoseo_forum_diagnose.py로 실제 사이트에서 확인한 동작:
    1) 과목 페이지에서 주차별 섹션(li.section) 안의 mod/forum/view.php 링크를 찾는다
       (섹션 제목이 "N주차 [날짜범위]" 형태라 주차 번호를 바로 인식 가능).
    2) 각 포럼 페이지에서 문자 그대로 'Export' 텍스트를 가진
       mod/forum/export.php?id=<N> 링크를 찾는다 (Moodle 핵심 기능이 아니라
       이 학교 Moodle에 커스텀으로 추가된 기능으로 보임).
    3) export.php를 GET하면 사용자/토론/기간 필터 + format 선택 폼이 나온다.
       discussionids[]/useridsselected[]에 있는 모든 옵션을 선택하고
       format=csv로 POST하면 바로 text/csv 응답이 온다 - Moodle 포트폴리오의
       다단계 확인 절차 없이 한 번의 요청으로 끝난다.
    4) 토론방이 현재 "학생에게 비공개" 상태(교수만 보이는 숨김 상태)일 때만
       export한다. 과목 페이지에서 해당 활동의 li.activity 안에
       <div class="availabilityinfo ishidden">에 "학생에게 비공개" 뱃지가
       있는지로 판별한다 - 아직 학생에게 공개된(진행 중인) 토론방은 건너뛴다.

export.php CSV에는 Moodle 내부 숫자 userid는 있지만 학번은 없다. course_url에서
과목 id를 뽑아 local/ubonattend/report.php의 학생 목록 페이지를 조회하고,
my_status.php 링크가 있는 행마다 그 행의 5~10자리 숫자 셀을 학번으로 보는
{userid: 학번} 매핑을 만들어 userid 바로 뒤에 학번 열을 끼워 넣는다.
매핑에 없는 userid(교수/조교 계정 등)는 빈 문자열.

실사이트로 확인한 것: report.php의 '모두 보기' select 하나만으로는 대형 강좌의
전체 인원이 다 안 나온다(예: 실제 46명 중 15명만) - listsize/page 쿼리 파라미터로
직접 페이지를 순회해야 전체가 나온다(parsing.fetch_full_userid_studentid_map,
참고 스크립트 moodle_forum_crawler.js의 buildUseridMap과 동일한 방식).
"""

import csv
import io
import re
from pathlib import Path

from bs4 import BeautifulSoup

from .. import parsing

DEFAULT_COURSE_URL = "https://learn.hoseo.ac.kr/course/view.php?id=40069"
SHEET_NAME = "ForumExport"
WEEK_RE = re.compile(r"(\d+)\s*주\s*차")


def _is_hidden_from_students(activity_li):
    if activity_li is None:
        return False
    badge = activity_li.select_one(".availabilityinfo.ishidden")
    return bool(badge and "비공개" in badge.get_text())


def list_weekly_forums(session, course_url):
    resp = session.get(course_url)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    forums = []
    for sec in soup.select("li.section"):
        heading = sec.select_one(".sectionname") or sec.select_one("h3")
        heading_text = heading.get_text(strip=True) if heading else ""
        m = WEEK_RE.search(heading_text)
        week_no = int(m.group(1)) if m else None
        for a in sec.select('a[href*="mod/forum/view.php"]'):
            activity_li = a.find_parent("li", class_=lambda c: c and "activity" in c)
            forums.append(
                {
                    "week": week_no,
                    "section": heading_text,
                    "title": a.get_text(strip=True),
                    "view_url": a.get("href"),
                    "hidden_from_students": _is_hidden_from_students(activity_li),
                }
            )
    return forums


def find_export_url(session, forum_view_url):
    resp = session.get(forum_view_url)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")
    for a in soup.find_all("a", href=True):
        if a.get_text(strip=True).lower() == "export" and "mod/forum/export.php" in a["href"]:
            return a["href"]
    return None


def _all_option_values(select_tag):
    if select_tag is None:
        return []
    return [o.get("value") for o in select_tag.find_all("option") if o.get("value")]


def export_forum_csv(session, export_url):
    """export.php 옵션 폼을 GET한 뒤, 모든 토론/사용자를 선택하고 format=csv로 POST해 CSV bytes를 받는다."""
    resp = session.get(export_url)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")
    form = soup.find("form")
    if form is None:
        raise RuntimeError(f"export 폼을 찾지 못했습니다: {export_url}")

    data = []
    for field in form.find_all("input"):
        name = field.get("name")
        if not name or field.get("type") in ("checkbox", "submit"):
            continue
        data.append((name, field.get("value", "")))

    discussion_select = form.find("select", attrs={"name": "discussionids[]"})
    user_select = form.find("select", attrs={"name": "useridsselected[]"})
    for did in _all_option_values(discussion_select):
        data.append(("discussionids[]", did))
    for uid in _all_option_values(user_select):
        data.append(("useridsselected[]", uid))

    data.append(("format", "csv"))
    data.append(("submitbutton", "Export"))

    action = form.get("action") or export_url
    export_resp = session.post(action, data=data)
    export_resp.raise_for_status()
    return export_resp.content


def parse_csv_bytes(csv_bytes):
    text = csv_bytes.decode("utf-8-sig")
    rows = list(csv.reader(io.StringIO(text)))
    if not rows:
        return [], []
    return rows[0], rows[1:]


def fetch(session, course_url=DEFAULT_COURSE_URL):
    forums = list_weekly_forums(session, course_url)
    if not forums:
        return None

    report_url = parsing.report_url_from_course_url(course_url)
    userid_map = {}
    if report_url is None:
        print(f"[forum_export] course_url에서 id를 못 찾아 학번 매핑을 건너뜁니다: {course_url}")
    else:
        userid_map = parsing.fetch_full_userid_studentid_map(session, report_url)
        print(f"[forum_export] 학번-userid 매핑 {len(userid_map)}건 확보 (페이지 순회)")

    fields = None
    userid_idx = None
    userfullname_idx = None
    merged_rows = []
    per_forum = []
    seen_uids = set()
    seen_uid_names = {}

    for f in forums:
        if not f["hidden_from_students"]:
            per_forum.append({**f, "row_count": 0, "note": "학생에게 공개 상태라 건너뜀"})
            continue

        export_url = find_export_url(session, f["view_url"])
        if not export_url:
            per_forum.append({**f, "row_count": 0, "note": "Export 링크 없음"})
            continue

        csv_bytes = export_forum_csv(session, export_url)
        row_fields, rows = parse_csv_bytes(csv_bytes)
        if fields is None and row_fields:
            fields = row_fields
            userid_idx = fields.index("userid") if "userid" in fields else None
            userfullname_idx = fields.index("userfullname") if "userfullname" in fields else None

        week_label = f"{f['week']}주차" if f["week"] is not None else "미분류"
        for row in rows:
            if userid_idx is not None:
                uid = row[userid_idx] if userid_idx < len(row) else ""
                seen_uids.add(uid)
                if uid not in seen_uid_names and userfullname_idx is not None:
                    seen_uid_names[uid] = row[userfullname_idx] if userfullname_idx < len(row) else ""
                student_id = userid_map.get(uid, "")
                row = row[:userid_idx + 1] + [student_id] + row[userid_idx + 1:]
            merged_rows.append([week_label, f["title"]] + row)
        per_forum.append({**f, "row_count": len(rows), "note": None})

    if userid_idx is not None:
        unmapped_uids = sorted(uid for uid in seen_uids if uid and uid not in userid_map)
        unmapped = [(uid, seen_uid_names.get(uid, "")) for uid in unmapped_uids]
        print(
            f"[forum_export] 게시글 작성자 고유 userid {len(seen_uids)}명 중 "
            f"학번 매핑 안 된 userid {len(unmapped_uids)}명: {unmapped}"
        )

    header_fields = list(fields or [])
    if userid_idx is not None:
        header_fields.insert(userid_idx + 1, "학번")
    header = ["주차", "토론방"] + header_fields

    created_col = header.index("created") if "created" in header else None

    def sort_key(row):
        week_no = next((f["week"] for f in forums if f"{f['week']}주차" == row[0]), 99) or 99
        if created_col is not None and created_col < len(row):
            try:
                return (week_no, int(row[created_col]))
            except (TypeError, ValueError):
                return (week_no, 0)
        return (week_no, 0)

    merged_rows.sort(key=sort_key)

    return {
        "header": header,
        "rows": merged_rows,
        "per_forum": per_forum,
    }


def write_csv(result, out_dir):
    """out_dir 밑에 CSV를 쓰고, (csv_path, 시트이름) 목록을 돌려준다 - course.py처럼
    여러 task를 조합해 호출하는 쪽이 어디에 몇 개를 썼는지 알 수 있게."""
    out_path = Path(out_dir) / "forum_export_long.csv"
    with open(out_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)
        writer.writerow(result["header"])
        writer.writerows(result["rows"])
    return [(out_path, SHEET_NAME)]


def print_summary(result):
    print("=== 포럼별 요약 ===")
    for f in result["per_forum"]:
        label = f"{f['week']}주차" if f["week"] is not None else "미분류"
        extra = f" ({f['note']})" if f["note"] else ""
        print(f"  - {label} / {f['title']}: {f['row_count']}행{extra}")

    rows = result["rows"]
    print(f"\n=== FORUM_EXPORT ({len(rows)} rows) ===")
    print(",".join(result["header"]))
    preview_limit = 50
    for row in rows[:preview_limit]:
        print(",".join(str(c) for c in row))
    if len(rows) > preview_limit:
        print(f"... ({len(rows) - preview_limit}행 생략, 전체는 저장된 CSV 참고)")
    print("=== END FORUM_EXPORT ===")
