# 호서대 LMS 출석·포럼 자동화 현황 — 갱신: 2026-10-26

## 목표와 완료 기준
- 목표: 호서대 LMS(및 IBK) 출석·포럼 데이터를 수집해 구글 시트에 반영한다. 시트 메뉴에서 GitHub Actions를 실행하는 구조.
- 완료 기준: 미정

## 현재 상태와 구성 미완료 항목
- 현재 상태: 수집 스크립트(`scripts/`)와 GAS 참고 구현(`gas/`), 워크플로 7개(`.github/workflows/`)가 동작 구성으로 있음. 포럼 내보내기(`forum_export`)까지 추가됨. 반별 시크릿은 GitHub Environments(`class-01`, `class-02`)로 분리.
- GAS는 참고 구현·순수 로직(Jest) 용도이고, 실제 운영 코드는 별도의 큰 Apps Script 프로젝트에 사람이 옮겨 적어 운영함. CI의 GAS 자동 배포는 제거됨(CLAUDE.md 10절).
- 구성 미완료: 허브 편입 시점에 이 파일과 DECISIONS.md를 새로 만듦. 기존 확정 결정의 DECISIONS.md 이관은 미정.

## 다음 행동
- [ ] 미정 (사용자 지정 필요)

## 미해결 질문과 막힌 점
- 완료 기준과 다음 행동이 정해지지 않음
- CLAUDE.md 10절 등 이미 확정된 결정을 DECISIONS.md에 옮길지 미정

## 최신 결과물
- 별도 결과물 파일 없음. 코드·워크플로가 저장소 자체

## 최근 기록
- 2026-10-26: 허브(AI-Workspace)에 편입. CLAUDE.md에 허브 연동 절(11절) 추가, CONTEXT.md·DECISIONS.md 생성
- 2026-08-30(PR #11): CI 자동 배포 제거, 디스패치 입력 이름을 `class_name`으로 환원
- 2026-08-17(PR #6~#10): forum_export 추가, 단일 강의 URL로 통일, 학번·discuss.php 링크 열 추가, 출석 조회 페이지 처리, IBK 메뉴에 분반 입력
- PR #3(날짜 미확인): Playwright에서 `requests` 기반 HTTP 방식으로 이관
