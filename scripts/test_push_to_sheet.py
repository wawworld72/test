import csv
import tempfile
import unittest
from pathlib import Path

from push_to_sheet import build_rows


class BuildRowsTest(unittest.TestCase):
    def test_reads_header_and_data_rows(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "sample.csv"
            with path.open("w", newline="", encoding="utf-8-sig") as f:
                writer = csv.writer(f)
                writer.writerow(["학번", "이름", "주차", "항목순번", "출결상태"])
                writer.writerow(["2021001", "홍길동", "1", "1", "출석"])

            rows = build_rows(path)

        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0], ["학번", "이름", "주차", "항목순번", "출결상태"])
        self.assertEqual(rows[1], ["2021001", "홍길동", "1", "1", "출석"])


if __name__ == "__main__":
    unittest.main()
