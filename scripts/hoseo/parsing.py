"""
호서대 LMS 리포트 페이지의 HTML을 파싱하는 공유 로직 (requests 기반).

attendance_lib.py의 파싱 로직(Playwright의 page.evaluate로 브라우저에서
rowSpan/colSpan을 펼치던 방식)을 정적 HTML(BeautifulSoup)에서도 동일하게
동작하도록 이식했다. 출석부뿐 아니라 같은 스타일의 colspan/rowspan 표를 쓰는
다른 리포트 페이지(성적, 공지 등)에도 그대로 재사용할 수 있다.
"""

import csv
import re
from pathlib import Path

from bs4 import BeautifulSoup

WEEK_RE = re.compile(r"(\d+)\s*주(?:차)?")
SORT_LINK_RE = re.compile(r"\s*정렬\s+\S+\s+(오름차순|내림차순)\s*")

COURSE_ID_RE = re.compile(r"[?&]id=(\d+)")
MY_STATUS_USERID_RE = re.compile(r"[?&]userid=(\d+)")
STUDENT_ID_RE = re.compile(r"^\d{5,10}$")


def _cell_text(cell) -> str:
    return " ".join(cell.get_text().split())


def build_grid(table):
    """<table> BeautifulSoup 태그를 rowSpan/colSpan이 반영된 2차원 grid로 변환
    (attendance_lib.py의 GRID_JS와 동일한 로직의 순수 Python 버전)"""
    rows = table.find_all("tr")
    num_rows = len(rows)
    grid = [[] for _ in range(num_rows)]

    def set_cell(r, c, value):
        row = grid[r]
        while len(row) <= c:
            row.append(None)
        row[c] = value

    for r, tr in enumerate(rows):
        c = 0
        for cell in tr.find_all(["td", "th"], recursive=False):
            while c < len(grid[r]) and grid[r][c] is not None:
                c += 1
            rowspan_attr = cell.get("rowspan")
            colspan_attr = cell.get("colspan")
            rowspan = int(rowspan_attr) if rowspan_attr and rowspan_attr.isdigit() else 1
            colspan = int(colspan_attr) if colspan_attr and colspan_attr.isdigit() else 1
            rowspan = rowspan or 1
            colspan = colspan or 1
            text = _cell_text(cell)
            is_header = cell.name == "th"
            for rr in range(rowspan):
                if r + rr >= num_rows:
                    break
                for cc in range(colspan):
                    set_cell(r + rr, c + cc, {"text": text, "isHeader": is_header})
            c += colspan

    is_header_row = []
    for tr in rows:
        in_thead = tr.find_parent("thead") is not None
        cells = tr.find_all(["td", "th"], recursive=False)
        all_th = len(cells) > 0 and all(c.name == "th" for c in cells)
        is_header_row.append(in_thead or all_th)

    return grid, is_header_row


def get_main_table(soup, prefer_selector=None):
    """정적 HTML에서 표를 고른다. prefer_selector가 있으면 그 셀렉터에 해당하는
    요소 중 행이 가장 많은 것을, 없으면 전체 <table> 중 행이 가장 많은 것을
    사용한다 (Playwright 버전과 달리 '보이는지'는 판단할 수 없어 행 수만 비교)."""
    candidates = soup.select(prefer_selector) if prefer_selector else soup.find_all("table")
    best_table, best_rows = None, -1
    for table in candidates:
        rows = len(table.find_all("tr"))
        if rows > best_rows:
            best_rows = rows
            best_table = table
    return best_table


def build_columns(grid, is_header_row):
    """각 열이 메타데이터(학번/이름 등)인지, 몇 주차의 몇 번째 항목인지 판별"""
    header_rows = [r for r, h in enumerate(is_header_row) if h]
    data_rows = [r for r, h in enumerate(is_header_row) if not h]
    num_cols = max((len(row) for row in grid), default=0)

    columns = []
    week_item_counters = {}

    for c in range(num_cols):
        header_texts = []
        for r in header_rows:
            cell = grid[r][c] if c < len(grid[r]) else None
            header_texts.append(cell["text"] if cell else "")

        week_num = None
        for text in header_texts:
            m = WEEK_RE.search(text)
            if m:
                week_num = int(m.group(1))
                break

        if week_num is not None:
            week_item_counters[week_num] = week_item_counters.get(week_num, 0) + 1
            columns.append(
                {
                    "kind": "week",
                    "week": week_num,
                    "item_index": week_item_counters[week_num],
                }
            )
        else:
            label = ""
            for text in reversed(header_texts):
                if text:
                    label = text
                    break
            label = SORT_LINK_RE.sub("", label).strip()
            columns.append({"kind": "meta", "label": label or f"col_{c}"})

    return columns, data_rows


def build_long_rows(grid, columns, data_rows):
    """학번/이름 등 메타데이터 + 주차 + 항목순번 + 출결상태로 이루어진 tidy/long 포맷 생성.

    메타 열 중 데이터 행 전체에서 값이 다른 메타 열과 완전히 똑같이 반복되는
    열은 실제 데이터가 아니라 병합 셀(colspan) 때문에 옆 열의 값이 그대로
    흘러들어온 유령 열로 보고 제외한다 (attendance_lib.py에서 IBK 표를
    파싱하며 확인했던 문제와 동일한 클래스의 방어 로직).
    """
    meta_indices = [c_idx for c_idx, col in enumerate(columns) if col["kind"] == "meta"]

    col_values = {}
    for c_idx in meta_indices:
        values = []
        for r in data_rows:
            row = grid[r] if r < len(grid) else []
            cell = row[c_idx] if c_idx < len(row) else None
            values.append(cell["text"] if cell else "")
        col_values[c_idx] = values

    seen_values = []
    kept_indices = []
    for c_idx in meta_indices:
        values = col_values[c_idx]
        if values in seen_values:
            continue
        seen_values.append(values)
        kept_indices.append(c_idx)

    meta_labels = [columns[c_idx]["label"] for c_idx in kept_indices]
    long_rows = []

    for row_pos, r in enumerate(data_rows):
        row = grid[r] if r < len(grid) else []
        meta = {}
        for c_idx in kept_indices:
            meta[columns[c_idx]["label"]] = col_values[c_idx][row_pos]

        if not any(v.strip() for v in meta.values()):
            continue

        for c_idx, col in enumerate(columns):
            if col["kind"] != "week":
                continue
            cell = row[c_idx] if c_idx < len(row) else None
            entry = dict(meta)
            entry["주차"] = col["week"]
            entry["항목순번"] = col["item_index"]
            entry["출결상태"] = cell["text"] if cell else ""
            long_rows.append(entry)

    return long_rows, meta_labels


def parse_report_table(html: str, prefer_selector=None):
    """HTML 문자열에서 리포트 표를 찾아 long-format 결과를 반환"""
    soup = BeautifulSoup(html, "html.parser")
    table = get_main_table(soup, prefer_selector=prefer_selector)
    if table is None:
        return None

    grid, is_header_row = build_grid(table)
    columns, data_rows = build_columns(grid, is_header_row)
    long_rows, meta_labels = build_long_rows(grid, columns, data_rows)

    week_columns = [c for c in columns if c["kind"] == "week"]
    weeks = sorted(set(c["week"] for c in week_columns))
    items_per_week = {w: sum(1 for c in week_columns if c["week"] == w) for w in weeks}

    return {
        "long_rows": long_rows,
        "meta_labels": meta_labels,
        "student_count": len(data_rows),
        "weeks": weeks,
        "items_per_week": items_per_week,
    }


def write_long_csv(long_rows, meta_labels, out_path: Path) -> None:
    fieldnames = meta_labels + ["주차", "항목순번", "출결상태"]
    with out_path.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(long_rows)


def report_url_from_course_url(course_url: str):
    """course/view.php?id=N의 id가 local/ubonattend/report.php?id=N과 같은 과목 id임을
    실사이트로 확인했으므로, 과목 링크 하나로 출결 리포트 URL을 스스로 만든다."""
    m = COURSE_ID_RE.search(course_url)
    if not m:
        return None
    return f"https://learn.hoseo.ac.kr/local/ubonattend/report.php?id={m.group(1)}"


def fetch_full_attendance_report(session, report_url: str, max_pages: int = 20, page_size: int = 100):
    """report.php의 '모두 보기' select만으로는 대형 강좌의 전체 인원이 다 안 나오는 걸
    확인했으므로(fetch_full_userid_studentid_map과 동일한 문제), listsize/page로 직접
    페이지를 순회하며 parse_report_table 결과를 병합한다. 표를 못 찾거나 첫 페이지부터
    학생 데이터가 없으면 None(parse_report_table의 '표 없음' 규약과 동일).

    dedup은 (메타값 튜플, 주차, 항목순번) 단위로 한다 - student_count만 distinct로
    세고 long_rows는 그대로 이어붙이면, 페이지 경계에 같은 학생이 걸쳐 나올 때 그
    학생의 행이 CSV/시트에 중복으로 쌓이는 걸 못 잡아낸다.
    """
    sep = "&" if "?" in report_url else "?"
    merged_long_rows = []
    seen_row_keys = set()
    seen_students = set()
    meta_labels = weeks = items_per_week = None

    for page in range(max_pages):
        url = f"{report_url}{sep}listsize={page_size}&page={page}"
        resp = session.get(url)
        resp.raise_for_status()

        page_result = parse_report_table(resp.text)
        if page_result is None or not page_result["long_rows"]:
            break

        if meta_labels is None:
            meta_labels = page_result["meta_labels"]
            weeks = page_result["weeks"]
            items_per_week = page_result["items_per_week"]

        for row in page_result["long_rows"]:
            meta_key = tuple(row.get(label, "") for label in meta_labels)
            row_key = (meta_key, row["주차"], row["항목순번"])
            if row_key in seen_row_keys:
                continue
            seen_row_keys.add(row_key)
            seen_students.add(meta_key)
            merged_long_rows.append(row)

    if meta_labels is None:
        return None

    return {
        "long_rows": merged_long_rows,
        "meta_labels": meta_labels,
        "student_count": len(seen_students),
        "weeks": weeks,
        "items_per_week": items_per_week,
    }


def build_userid_studentid_map(html: str):
    """local/ubonattend/report.php 페이지에서 my_status.php 링크가 있는 행마다, 그 행의
    셀 중 5~10자리 숫자만 있는 셀을 학번으로 보고 {userid: studentId} 매핑을 만든다."""
    soup = BeautifulSoup(html, "html.parser")
    mapping = {}

    for row in soup.find_all("tr"):
        link = row.find("a", href=lambda h: h and "my_status.php" in h)
        if link is None:
            continue

        m = MY_STATUS_USERID_RE.search(link["href"])
        if not m:
            continue
        userid = m.group(1)

        student_id = ""
        for cell in row.find_all(["td", "th"]):
            text = cell.get_text(strip=True)
            if STUDENT_ID_RE.match(text):
                student_id = text
                break

        mapping[userid] = student_id

    return mapping


def fetch_full_userid_studentid_map(session, report_url: str, max_pages: int = 20, page_size: int = 100):
    """report.php의 '모두 보기' select는 대형 강좌에서 실제 전체 인원을 다 안 돌려줄 수 있음을
    실사이트로 확인했다(예: 46명 중 15명만). 참고 스크립트(moodle_forum_crawler.js)의
    buildUseridMap처럼 listsize/page 쿼리 파라미터로 직접 페이지를 순회하며 병합하고,
    한 페이지에서 my_status.php 링크가 하나도 안 나오면 멈춘다."""
    sep = "&" if "?" in report_url else "?"
    mapping = {}

    for page in range(max_pages):
        url = f"{report_url}{sep}listsize={page_size}&page={page}"
        resp = session.get(url)
        resp.raise_for_status()

        page_map = build_userid_studentid_map(resp.text)
        if not page_map:
            break

        mapping.update(page_map)

    return mapping
