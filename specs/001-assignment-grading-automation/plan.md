# Implementation Plan: 과제 운영·평가·성적 환류 자동화

**Branch**: `001-assignment-grading-automation` | **Date**: 2026-07-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-assignment-grading-automation/spec.md`

## Summary

교수자 1인이 운영하는 대학 강의 한 분반의 과제 생애주기(폼 생성 → Classroom 게시 → 수집 개시/종료 →
채점 → 성적 반환 → 통지)를 사람 개입 없이 자동으로 진행하는, 단일 스프레드시트에 바인딩된 Google
Apps Script 프로젝트를 구축한다. 배점·등급구간·일정 규칙은 코드가 아닌 시트에서 정의되고, 시간 기반
트리거가 일정을 스스로 재예약하며, 성적을 실제로 바꾼 건만 별도 변경이력 탭에 기록한다.

## Technical Context

**Language/Version**: Google Apps Script (V8 런타임, ES2019+ 문법)

**Primary Dependencies**: Apps Script 내장 서비스만 사용 — `SpreadsheetApp`, `FormApp`, `Classroom`
(Advanced Service), `MailApp`, `DriveApp`, `PropertiesService`, `LockService`, `ScriptApp`(트리거),
`UrlFetchApp`(Dynalist 연동). 런타임에 설치되는 외부 npm 패키지는 없다(헌법 VIII: 신규 외부 의존
금지).

**Storage**: 이 기능이 바인딩되는 단일 Google 스프레드시트(강좌설정·역량과제정의·수강생·주차·Forms·
역량과제·변경이력 탭)와 각 과제의 응답 시트. 실행 간 상태(다음 처리 시각, 진행 중 처리 지점 등)는
`PropertiesService`에만 둔다(헌법 VI: 전역 가변 상태 금지).

**Testing**: 자체 assert 헬퍼(`test/assert.js`)로 작성한 Node 실행 스크립트. 외부 테스트
프레임워크(Jest 등)는 도입하지 않는다(헌법 V). 순수 함수로 추출된 4개 영역(점수 산정/등급구간 판정,
학번 정규화, 진행상태·게시상태 전이 판정, 성적 전송 여부(멱등) 판정)만 분기 커버리지 100%를
요구하고, 그 외 코드는 테스트를 요구하지 않는다.

**Target Platform**: Google Apps Script(Sheets 컨테이너 바인딩 스크립트). 별도 웹앱 배포는 이
기능에서 필요하지 않다(외부 HTTP 호출자가 없음 — 트리거와 스프레드시트 메뉴로만 구동).

**Project Type**: 단일 Apps Script 프로젝트(스크립트/자동화형). 프론트엔드 없음.

**Performance Goals**: 실행 1회 4분 이내(초과 예상 시 처리 지점 저장 후 자기 재예약), 학생 80명
기준 성적 전송 1회 90초 이내, 변경 없는 재실행은 외부 API·시트 쓰기 0회.

**Constraints**: 학생 1명당 외부 API 쓰기 2회 이하, 명단·제출물 조회 실행당 1회 캐시, 시간 기반
트리거 8개 이하, Apps Script 6분 실행 한도, Classroom 성적 API는 과제를 생성한 것과 동일한 OAuth
클라이언트만 채점 가능(수동 생성 과제 자동 채점 불가).

**Scale/Scope**: 분반 1개 = 스프레드시트 1개 = Classroom 코스 1개. 학생 규모 최대 ~80명, 주차 최대
~16주, 역량과제 유형 수는 교사가 정의(고정 개수 아님). 여러 분반 통합 운영은 이번 기능 범위 밖(설정
값으로만 분반 의존성을 격리해 이후 확장 여지만 남겨둠).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | 원칙 | 판정 | 근거 |
|---|------|------|------|
| I | 단순성 | PASS | 3계층(진입점/로직/게이트웨이) 이상의 추상화를 두지 않음. 새 설정 항목은 이번 기능이 실제로 쓰는 것만 강좌설정에 추가 |
| II | 개입 최소화 | PASS | 정상 경로는 트리거만으로 완주(User Story 2~5). 메뉴는 UC-00 초기 설정·UC-07 과제 행 생성·예외 복구(US6)에만 사용 |
| III | 성적 안전 | PASS | 변경이력 탭(append-only, 실행 종료 시 일괄 기록), 드라이런 토글, 반환 완료건 재전송 스킵(멱등)으로 충족 |
| IV | 코드 품질 | PASS | 메뉴/트리거 함수는 후행 밑줄 없음, 열은 헤더명으로 조회하는 공용 헬퍼로만 접근, 범위 단위 배치 읽기/쓰기, catch에서 로그 후 격리/재던짐, 학번은 정규화 함수 통과 후 비교, 등급구간 판정 로직은 `logic/scoring.js` 한 곳에만 존재 |
| V | 테스트 | PASS | 점수 산정/학번 정규화/상태 전이/전송 판정 4개 순수 함수 모듈만 자체 assert로 100% 분기 커버리지. 그 외 미요구 |
| VI | 계층 구조 | PASS | entrypoints(메뉴·트리거) → logic(순수+오케스트레이션) → gateway(Google 서비스 호출 전담) 단방향. logic/gateway에서 `getUi`/`alert` 호출 금지 |
| VII | 성능 | PASS | 트리거 3개(다음 이벤트 동적 재예약 1개, 일일 요약 고정 시각 1개, onEdit 재계산 1개)로 8개 한도 내. 명단/제출물은 실행당 1회 캐시, 학생당 쓰기 2회 이하(성적 반환 1회 + 변경이력 1행) |
| VIII | 기술 거버넌스 | PASS | 이 기능 전용 clasp 프로젝트로 Git+`clasp push`/`clasp deploy`만으로 배포(편집기 직접 수정 없음). 외부 의존은 Google Workspace + Dynalist로 한정. Classroom 과제는 이 시스템만 생성 |

위반 없음 — Complexity Tracking 불필요.

**Post-Design 재확인** (Phase 1 완료 후): `data-model.md`의 진행상태 상태 전이도, `research.md`의
잠금/트리거/수식 위임 결정을 반영해도 위 판정은 변하지 않는다. 새로 확정된 변경이력 탭(엔티티)과
게시상태/진행상태 분리도 헌법 III·IV·VI과 충돌하지 않는다. 외부 노출 인터페이스(웹앱/API)가 없어
`/contracts/` 산출물은 생성하지 않는다(계획 문서 내 "Key rules"의 "purely internal 시 skip" 조건에
해당 — 이 프로젝트는 트리거·메뉴로만 구동되고 다른 시스템에 인터페이스를 노출하지 않는다).

## Project Structure

### Documentation (this feature)

```text
specs/001-assignment-grading-automation/
├── plan.md              # 이 파일 (/speckit-plan 출력)
├── research.md          # Phase 0 출력
├── data-model.md         # Phase 1 출력
├── quickstart.md         # Phase 1 출력
└── tasks.md              # Phase 2 출력 (/speckit-tasks — 이 명령이 만들지 않음)
```

### Source Code (repository root)

이 저장소에는 이미 별도 목적(출결 스크래핑)의 Apps Script 프로젝트가 `gas/`에 있다. 이 기능은 전혀
다른 스프레드시트에 바인딩되는 독립 프로젝트이므로 새 디렉터리를 둔다.

```text
assignment-automation/
├── appsscript.json              # 매니페스트: Classroom Advanced Service 활성화, 시간대, 스코프
├── .clasp.json                  # clasp 프로젝트 포인터 (scriptId는 최초 수동 설정 시 채움)
├── .claspignore                 # test/ 등 배포 제외 목록
├── src/
│   ├── entrypoints/
│   │   ├── Menu.js              # onOpen 메뉴: 초기 설정, 과제 행 생성, 예외 복구
│   │   └── Triggers.js          # 시간 기반/onEdit 트리거가 호출하는 얇은 진입점
│   ├── logic/
│   │   ├── scoring.js           # 원점수→등급구간 판정 (순수함수, 테스트 대상)
│   │   ├── studentId.js         # 학번 정규화 (순수함수, 테스트 대상)
│   │   ├── stateTransition.js   # 게시상태·진행상태 전이 판정 (순수함수, 테스트 대상)
│   │   ├── gradeSendPolicy.js   # 성적 전송 여부(멱등) 판정 (순수함수, 테스트 대상)
│   │   ├── validation.js        # 설정 정합성 검증 (UC-06)
│   │   ├── scheduling.js        # 다음 처리 시각 계산
│   │   ├── assignmentSetup.js   # 과제 행 생성, 폼/Classroom 준비 오케스트레이션
│   │   ├── evaluationCollection.js # 평가 수집·팀 대표 행 판단
│   │   ├── quizGeneration.js    # 연계 과제 문항 생성
│   │   └── itemAnalysis.js      # 문항 분석 지표 산출
│   └── gateway/
│       ├── sheetsGateway.js     # SpreadsheetApp 호출 전담, 헤더명 기반 조회 헬퍼
│       ├── formsGateway.js      # FormApp/DriveApp 복사·연결
│       ├── classroomGateway.js  # Classroom 과제 생성·성적 반환
│       ├── mailGateway.js       # MailApp 통지
│       └── dynalistGateway.js   # UrlFetchApp 기반 외부 문서 전송
└── test/
    ├── assert.js                 # 자체 assert 헬퍼 (외부 프레임워크 없음)
    ├── run.js                    # `node test/run.js`로 전체 실행
    ├── scoring.test.js
    ├── studentId.test.js
    ├── stateTransition.test.js
    └── gradeSendPolicy.test.js
```

**Structure Decision**: 기존 `gas/`(출결 자동화, 별도 스프레드시트/웹앱)와 완전히 분리된
`assignment-automation/`을 새로 만든다. 3계층(entrypoints/logic/gateway)은 헌법 VI를 그대로
디렉터리로 옮긴 것이고, `test/`는 헌법 V가 요구하는 4개 순수 함수 모듈만을 대상으로 한다. Apps
Script는 프로젝트 내 모든 파일을 하나의 전역 스코프로 합치므로 `src/` 하위 폴더 구분은 clasp
push 시 그대로 유지되는 파일 경로 표시일 뿐, 실제 모듈 격리를 의미하지는 않는다 — 계층 규율은
런타임이 아니라 코드 리뷰(및 이후 정적 점검)로 지켜야 한다.

## Complexity Tracking

*(Constitution Check 위반 없음 — 해당 없음)*
