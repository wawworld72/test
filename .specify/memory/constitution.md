<!--
Sync Impact Report
==================
Version change: (template) → 1.0.0
Rationale: Initial ratification — first concrete constitution replacing template
placeholders. Treated as MAJOR-equivalent initial adoption, so version starts at 1.0.0.

Modified principles: none renamed (first concrete definition of all principles)
Added principles:
  - I. 단순성 (Simplicity First)
  - II. 개입 최소화 (Zero-Touch Operation)
  - III. 성적 안전 (Grade Safety Net)
  - IV. 코드 품질 (Code Quality Discipline)
  - V. 테스트 (Targeted Test-First)
  - VI. 계층 구조 (Layered, One-Way Dependencies)
  - VII. 성능 예산 (Performance Budgets)
  - VIII. 기술 거버넌스 (Technical Governance)
Removed sections: generic [SECTION_2_NAME]/[SECTION_3_NAME] template slots — all
content already organized under the 8 principles above; no leftover generic
section was needed for this project.

Templates requiring updates:
  - .specify/templates/plan-template.md — ✅ no change needed (Constitution Check
    gate is filled dynamically from this file at /speckit-plan time)
  - .specify/templates/spec-template.md — ✅ no change needed (generic, no
    principle-name references)
  - .specify/templates/tasks-template.md — ✅ no change needed (generic, already
    treats tests as optional, matching Principle V)
  - .claude/skills/speckit-*/SKILL.md — ✅ no change needed (already agent-generic,
    no outdated references found)

Follow-up TODOs: none — ratification date known (today), no deferred placeholders.
-->

# 교내 강의 운영 자동화 시스템 Constitution

혼자 운영하는 교내 강의 운영 자동화 시스템이다. Google Sheets가 조작 화면, Google
Classroom이 학생 접점이며, 단일 스프레드시트에 바인딩된 Apps Script 프로젝트다.
별도 프론트엔드는 없다. 사용자는 교수자 1명이므로, 협업 규모를 전제한 절차나
방어 장치는 도입하지 않는다.

## Core Principles

### I. 단순성 (Simplicity First)

항상 가장 단순한 해법을 택한다. 추상화·계층·설정 항목은 실제로 두 번째
사용처가 생겼을 때만 도입한다. 미래 확장을 위한 코드를 미리 작성하지 않는다.

**Rationale**: 단일 사용자가 직접 운영·유지보수하므로, 협업 규모를 전제한
절차·사전 일반화는 유지비용만 늘릴 뿐 가치가 없다.

### II. 개입 최소화 (Zero-Touch Operation)

정상 경로는 사람 개입 0회로 완주한다: 과제 마스터 시트에 행 하나를 추가하면
폼 생성부터 성적 반환까지 자동으로 진행된다. 메뉴는 비상 복구·최초 실행용이며,
정상 운영에서 메뉴 클릭이 필요한 기능은 반드시 트리거화한다. 사람이 반드시
판단해야 하는 입력(팀 단위 루브릭 평가 등)만 수동으로 남기고, 그 입력 지점은
과제 마스터·평가 대장 두 시트로 한정한다. 실패는 조용히 넘어가지 않되, 통지는
건별이 아닌 하루 1회 요약 메일로 묶는다.

**Rationale**: 운영자가 1명뿐이므로 매 실행마다 사람이 지켜보거나 클릭할
필요가 있는 설계는 곧 방치로 이어진다. 반대로 알림이 건별로 오면 무시하게 되므로
하루 1회 요약으로 신호 대 잡음비를 지킨다.

### III. 성적 안전 (Grade Safety Net)

- 성적을 변경한 건만 기록한다. 기록 항목은 시각, 대상(과제·학번), 이전값,
  이후값 네 개다. 건너뛴 건과 조회는 기록하지 않는다.
- 로그는 실행 중 메모리에 모아 종료 시 한 번에 쓴다. 반복문 안에서 로그를 쓰지
  않는다. 변경이 없으면 쓰기도 없다.
- 로그에 서술형 피드백 본문과 이메일 주소는 기록하지 않는다.
- 성적을 외부로 쓰는 기능은 드라이런 토글을 제공한다. 신규 기능 첫 배포 시
  1회 드라이런으로 검증한 뒤 실전송한다. 이후 상시 강제하지 않는다.
- 재실행 시 값이 동일하면 외부 쓰기를 수행하지 않는다(멱등).

**Rationale**: 성적은 되돌리기 어려운 유일한 고위험 데이터다. 최소한의
감사 추적과 멱등성만으로 사고 발생 시 원인 추적과 안전한 재실행을 보장한다.

### IV. 코드 품질 (Code Quality Discipline)

- 메뉴·트리거가 호출하는 함수에 후행 밑줄(_)을 붙이지 않는다. 후행 밑줄은
  내부 헬퍼 전용이다.
- 열은 헤더 이름으로 조회한다. 열 위치나 항목 인덱스의 하드코딩을 금지한다.
- 반복문 안에서 getValue/setValue를 호출하지 않는다. 범위 단위로 읽고,
  JavaScript에서 처리하고, 한 번에 쓴다.
- catch 블록은 로그를 남긴 뒤 격리하거나 재던진다. 예외를 조용히 삼키지 않는다.
- 학번은 정규화 함수를 통과한 문자열로만 비교한다.
- 동일 로직을 두 곳에 정의하지 않는다. 점수 산정 규칙은 단 하나의 파일에만
  존재한다.

**Rationale**: Apps Script 특유의 함정(시트 열 순서 변경, 반복 API 호출로 인한
지연/쿼터 소진, 조용한 예외)은 실제 장애로 직결된다. 규칙은 그 함정을 코드
리뷰 없이도 기계적으로 막기 위한 것이다.

### V. 테스트 (Targeted Test-First)

점수 산정, 학번 정규화, 상태 전이 판정, 성적 전송 판정은 순수 함수로 추출하고
구현 전에 실패하는 테스트를 먼저 작성한다. 이 함수들이 분기 커버리지 100%를
충족하지 못하면 병합하지 않는다. 그 외 코드에는 테스트를 요구하지 않으며,
전체 커버리지 수치 목표를 두지 않는다. 테스트는 프로젝트 내 자체 assert
헬퍼로 작성하고, 외부 테스트 프레임워크를 도입하지 않는다.

**Rationale**: 성적·상태 판정 로직만이 틀렸을 때 되돌리기 어려운 결과를
낳는다. 그 외 코드(트리거 배선, UI 문구 등)까지 같은 엄격도로 테스트하는
것은 단순성 원칙과 충돌한다.

### VI. 계층 구조 (Layered, One-Way Dependencies)

3계층 단방향: 진입점(메뉴·트리거) → 로직 → 게이트웨이(외부 서비스 접근).
역방향 의존을 금지한다. Google 전역 서비스(SpreadsheetApp, FormApp, Classroom,
MailApp, DriveApp)는 게이트웨이 파일에서만 호출한다. 신규·수정 파일에
적용하고, 기존 파일은 손댈 때 준수시킨다. 로직·게이트웨이 계층에서 UI 호출
(getUi, alert)을 금지한다 — 트리거 실행 시 예외가 발생한다. 과제 진행 상태의
전이는 스케줄러만 수행하며, 다른 모듈이 상태 열을 직접 쓰지 않는다. 전역
가변 상태를 금지한다. 실행 간 상태는 PropertiesService 또는 시트에만 둔다.

**Rationale**: 트리거로 실행되는 코드는 UI가 없는 컨텍스트에서 돈다. 계층을
단방향으로 강제하면 "메뉴에서는 되는데 트리거에서는 깨지는" 클래스의 버그를
설계 단계에서 원천 차단한다.

### VII. 성능 예산 (Performance Budgets)

- 1회 실행은 4분 안에 끝낸다. 초과가 예상되면 처리 지점을 저장하고 스스로
  재예약한다. 6분 강제 종료를 설계로 허용하지 않는다.
- 학생 80명 기준 성적 전송 1회는 90초 이내에 완료한다.
- 학생 1명당 외부 API 쓰기는 2회 이하, 명단·제출물 조회는 실행당 1회로
  캐시한다.
- 시간 기반 트리거는 8개 이하로 유지한다.
- 변경 사항이 없는 재실행은 외부 API 쓰기 0회, 시트 쓰기 0회로 끝낸다.

**Rationale**: Apps Script의 6분 실행 제한과 Google API 일일 쿼터는 협상
불가능한 플랫폼 제약이다. 여유(4분/6분, 2회/학생)를 미리 확보해야 클래스
규모가 조금만 늘어나도 깨지는 설계를 피한다.

### VIII. 기술 거버넌스 (Technical Governance)

- 모든 변경은 Git으로 관리하고 clasp push로만 배포한다. Apps Script
  편집기에서 직접 수정하지 않는다.
- 외부 의존은 Google Workspace와 Dynalist로 한정한다. 신규 외부 의존과 외부
  라이브러리를 도입하지 않는다.
- Dynalist 연동은 부가 기능이다. 실패해도 채점·성적 전송을 중단시키지 않는다.
- Classroom 과제는 반드시 이 스크립트가 생성한다. 성적 API는 과제를 생성한
  것과 동일한 OAuth 클라이언트만 채점을 허용하므로, 수동 생성 과제는 자동
  채점 대상이 아니다.
- 연결된 Google Cloud 프로젝트는 학기 중 변경하지 않는다. 변경하면 기존
  과제의 성적 입력 권한을 잃는다.
- 배점, 임계값, 코스 식별자, 기능 토글은 설정 시트 또는 Properties에서만
  관리한다. 코드에 하드코딩하지 않는다.

**Rationale**: Git+clasp를 유일한 배포 경로로 강제해야 "편집기에서 직접
고친 코드가 다음 배포에 사라지는" 사고를 막는다. Classroom/OAuth 제약과
GCP 프로젝트 고정은 되돌릴 수 없는 플랫폼 규칙이므로 명시적으로 금지한다.

## Governance

이 헌법은 이 프로젝트의 다른 모든 관행과 문서보다 우선한다. 원칙과 실제
코드가 어긋나면 코드를 고친다.

**개정**: 소유자(교수자 1인)가 직접 이 파일을 수정하고 버전을 올린다. 별도
승인자나 리뷰 절차는 두지 않는다 — 이 자체가 단순성·개입 최소화 원칙의
적용이다.

**버전 정책**: 시맨틱 버저닝(MAJOR.MINOR.PATCH)을 따른다. 기존 원칙의 삭제나
양립 불가능한 재정의는 MAJOR, 원칙 추가나 범위의 실질적 확장은 MINOR, 표현
수정·오탈자·비의미적 보완은 PATCH로 올린다.

**준수 확인**: 별도 PR 리뷰 절차가 없으므로, `/speckit-plan` 실행 시
Constitution Check 단계에서 원칙 위반 여부를 스스로 점검한다. 성적 안전(III)과
계층 구조(VI) 위반은 배포 전 반드시 해소해야 하며, 다른 원칙 위반은 Complexity
Tracking에 근거를 남기고 진행할 수 있다.

**Version**: 1.0.0 | **Ratified**: 2026-07-27 | **Last Amended**: 2026-07-27
