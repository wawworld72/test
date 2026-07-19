"""
호서대 LMS(local/ubonattend report) 출석 테이블 파싱 공용 로직.

핵심 문제: 리포트 테이블의 헤더가 여러 행에 걸쳐 colspan/rowspan으로
병합되어 있어서(예: "1주차"가 여러 개의 세부 출석 항목 열을 colspan으로
묶고 있음), 단순히 행 단위로 <td>를 나열하면 주차와 데이터 열이 어긋난다.
브라우저에서 rowSpan/colSpan을 반영한 grid를 만든 뒤, 헤더 행에서 "N주차"
패턴을 찾아 각 데이터 열이 몇 주차의 몇 번째 항목인지 계산한다.
"""

import csv
import re
from pathlib import Path

WEEK_RE = re.compile(r"(\d+)\s*주차")

SHOW_ALL_LABELS = ("모두", "전체", "All", "전체보기", "전체 보기")

GRID_JS = r"""
(table) => {
    const rows = Array.from(table.rows);
    const numRows = rows.length;
    const grid = Array.from({length: numRows}, () => []);
    for (let r = 0; r < numRows; r++) {
        let c = 0;
        const cells = Array.from(rows[r].cells);
        for (const cell of cells) {
            while (grid[r][c] !== undefined) c++;
            const rowspan = cell.rowSpan || 1;
            const colspan = cell.colSpan || 1;
            const text = cell.innerText.replace(/\s+/g, ' ').trim();
            const isHeader = cell.tagName === 'TH';
            for (let rr = 0; rr < rowspan && (r + rr) < numRows; rr++) {
                if (!grid[r + rr]) grid[r + rr] = [];
                for (let cc = 0; cc < colspan; cc++) {
                    grid[r + rr][c + cc] = {text, isHeader};
                }
            }
            c += colspan;
        }
    }
    const isHeaderRow = rows.map((row) => {
        const inThead = row.closest('thead') !== null;
        const cells = Array.from(row.cells);
        const allTh = cells.length > 0 && cells.every((c) => c.tagName === 'TH');
        return inThead || allTh;
    });
    return {grid, isHeaderRow};
}
"""


def select_show_all(page) -> bool:
    """'목록수' 등 페이지당 표시 개수 드롭다운/링크에서 '모두'를 선택해 전체 학생을 한 페이지에 표시"""
    selects = page.locator("select")
    for i in range(selects.count()):
        sel = selects.nth(i)
        options = sel.locator("option")
        for j in range(options.count()):
            opt = options.nth(j)
            text = opt.inner_text().strip()
            if text in SHOW_ALL_LABELS:
                value = opt.get_attribute("value")
                sel.select_option(value=value)
                page.wait_for_load_state("networkidle")
                page.wait_for_timeout(500)
                return True

    for text in SHOW_ALL_LABELS:
        link = page.get_by_text(text, exact=True)
        if link.count() > 0:
            link.first.click()
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(500)
            return True

    return False


def get_main_table(page):
    tables = page.locator("table")
    count = tables.count()
    best_idx, best_rows = None, -1
    for i in range(count):
        rows = tables.nth(i).locator("tr").count()
        if rows > best_rows:
            best_rows = rows
            best_idx = i
    if best_idx is None:
        return None
    return tables.nth(best_idx)


def extract_grid(table_locator):
    handle = table_locator.element_handle()
    result = handle.evaluate(GRID_JS)
    return result["grid"], result["isHeaderRow"]


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
            sub_label = ""
            for text in reversed(header_texts):
                if text and not WEEK_RE.search(text):
                    sub_label = text
                    break
            columns.append({
                "kind": "week",
                "week": week_num,
                "item_index": week_item_counters[week_num],
                "sub_label": sub_label,
            })
        else:
            label = ""
            for text in reversed(header_texts):
                if text:
                    label = text
                    break
            columns.append({"kind": "meta", "label": label or f"col_{c}"})

    return columns, data_rows


def build_long_rows(grid, columns, data_rows):
    """학번/이름 등 메타데이터 + 주차 + 항목순번 + 출결상태로 이루어진 tidy/long 포맷 생성"""
    meta_labels = [c["label"] for c in columns if c["kind"] == "meta"]
    long_rows = []

    for r in data_rows:
        row = grid[r] if r < len(grid) else []
        meta = {}
        for c_idx, col in enumerate(columns):
            if col["kind"] != "meta":
                continue
            cell = row[c_idx] if c_idx < len(row) else None
            meta[col["label"]] = cell["text"] if cell else ""

        if not any(v.strip() for v in meta.values()):
            continue

        for c_idx, col in enumerate(columns):
            if col["kind"] != "week":
                continue
            cell = row[c_idx] if c_idx < len(row) else None
            entry = dict(meta)
            entry["주차"] = col["week"]
            entry["항목순번"] = col["item_index"]
            entry["항목라벨"] = col["sub_label"]
            entry["출결상태"] = cell["text"] if cell else ""
            long_rows.append(entry)

    return long_rows, meta_labels


def parse_report_table(page):
    """현재 페이지에서 출석 테이블을 찾아 long-format 행 리스트와 메타 필드 목록을 반환"""
    table = get_main_table(page)
    if table is None:
        return None

    grid, is_header_row = extract_grid(table)
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
    fieldnames = meta_labels + ["주차", "항목순번", "항목라벨", "출결상태"]
    with out_path.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(long_rows)
