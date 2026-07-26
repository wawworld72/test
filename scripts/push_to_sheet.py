"""
attendance_lib.write_long_csv가 만든 attendance_long.csv를 읽어
Google Apps Script 웹앱(gas/Code.js의 doPost)으로 POST해서 스프레드시트에 반영한다.

환경변수:
    GAS_WEBAPP_URL - Apps Script 웹앱 배포 URL (.../exec)
    GAS_API_TOKEN  - 웹앱 doPost가 요구하는 인증 토큰 (gas/Code.js의 setupApiToken()으로 생성)

사용법:
    python scripts/push_to_sheet.py <csv_path> <sheet_name>
"""

import csv
import json
import os
import sys
import urllib.request


def build_rows(csv_path):
    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        return [row for row in csv.reader(f)]


def push(rows, sheet_name, webapp_url, token):
    payload = json.dumps({"token": token, "sheetName": sheet_name, "rows": rows}).encode("utf-8")
    request = urllib.request.Request(
        webapp_url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main():
    if len(sys.argv) != 3:
        print("사용법: python scripts/push_to_sheet.py <csv_path> <sheet_name>", file=sys.stderr)
        sys.exit(1)

    csv_path, sheet_name = sys.argv[1], sys.argv[2]
    webapp_url = os.environ.get("GAS_WEBAPP_URL")
    token = os.environ.get("GAS_API_TOKEN")

    if not webapp_url or not token:
        print("GAS_WEBAPP_URL / GAS_API_TOKEN 환경변수가 설정되지 않았습니다.", file=sys.stderr)
        sys.exit(1)

    rows = build_rows(csv_path)
    print(f"{csv_path}에서 {len(rows)}행을 읽었습니다 (헤더 포함).")

    result = push(rows, sheet_name, webapp_url, token)
    if not result.get("ok"):
        print(f"웹앱 오류: {result.get('error')}", file=sys.stderr)
        sys.exit(1)

    print(f"스프레드시트 '{result.get('sheetName')}' 시트에 {result.get('rowCount')}행 반영 완료")


if __name__ == "__main__":
    main()
