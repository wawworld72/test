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
SORT_LINK_RE = re.compile(r"\s*정렬\s+\S+\s+(오름차순|내림차순)\s*")

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


def select_show_all(page, original_url: str) -> bool:
    """'목록수' 등 페이지당 표시 개수 드롭다운/링크에서 '모두'를 선택해 전체 학생을 한 페이지에 표시

    클릭 대상이 리포트 테이블과 무관한 요소일 수 있으므로, 클릭 전후로
    페이지 URL과 메인 테이블 행 수를 비교해 실제로 반영됐는지 검증한다.
    검증에 실패하면 원래 URL로 되돌아간다.
    """
    before_table = get_main_table(page)
    before_rows = before_table.locator("tr").count() if before_table else 0

    debug_lines = []
    applied = False

    selects = page.locator("select")
    for i in range(selects.count()):
        sel = selects.nth(i)
        sel_id = sel.get_attribute("id") or sel.get_attribute("name") or f"select#{i}"
        options = sel.locator("option")
        option_texts = [options.nth(j).inner_text().strip() for j in range(options.count())]
        debug_lines.append(f"{sel_id}: options={option_texts}")
        for j, text in enumerate(option_texts):
            if text in SHOW_ALL_LABELS:
                value = options.nth(j).get_attribute("value")
                sel.select_option(value=value)
                page.wait_for_load_state("networkidle")
                page.wait_for_timeout(500)
                applied = True
                debug_lines.append(f"selected '{text}' (value={value}) from {sel_id}")
                break
        if applied:
            break

    if not applied:
        for text in SHOW_ALL_LABELS:
            link = page.locator("a, button").filter(has_text=text)
            link_count = link.count()
            if link_count > 0:
                debug_lines.append(f"clickable a/button matching '{text}': count={link_count}")
                link.first.click()
                page.wait_for_load_state("networkidle")
                page.wait_for_timeout(500)
                applied = True
                break

    for line in debug_lines:
        print(f"[select_show_all] {line}")

    if applied and "report.php" not in page.url:
        print(f"[select_show_all] 클릭 후 리포트 페이지를 벗어남 (url={page.url}); 원래 URL로 복귀")
        page.goto(original_url)
        page.wait_for_load_state("networkidle")
        applied = False

    # 표가 AJAX로 다시 그려지는 경우 즉시 조회하면 행 수가 일시적으로 0으로 보일 수 있어 짧게 재확인한다
    after_rows = 0
    for _ in range(5):
        after_table = get_main_table(page)
        after_rows = after_table.locator("tr").count() if after_table else 0
        if after_rows >= before_rows:
            break
        page.wait_for_timeout(300)

    print(f"[select_show_all] rows before={before_rows}, after={after_rows}, applied={applied}, url={page.url}")

    return applied and after_rows >= before_rows


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
            columns.append({
                "kind": "week",
                "week": week_num,
                "item_index": week_item_counters[week_num],
            })
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
    fieldnames = meta_labels + ["주차", "항목순번", "출결상태"]
    with out_path.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(long_rows)
