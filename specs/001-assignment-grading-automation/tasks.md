---
description: "Task list for 과제 운영·평가·성적 환류 자동화"
---

# Tasks: 과제 운영·평가·성적 환류 자동화

**Input**: Design documents from `/specs/001-assignment-grading-automation/`
**Prerequisites**: plan.md, spec.md, data-model.md, research.md, quickstart.md (모두 존재)

**Tests**: 헌법 V가 4개 순수 함수 모듈(점수 산정, 학번 정규화, 상태 전이, 성적 전송 판정)에 대해
구현 전 실패하는 테스트 작성 + 분기 커버리지 100%를 명시적으로 요구하므로, 그 4개에 한해 테스트
작성 작업을 포함한다. 그 외 모듈에는 테스트 작업을 만들지 않는다(헌법: "그 외 코드에는 테스트를
요구하지 않는다").

**Organization**: User Story별로 그룹화. 각 Story는 spec.md의 우선순위(P1/P2/P3)를 따른다.

## Path Conventions

이 저장소에는 이미 별도 프로젝트 `gas/`(출결 자동화)가 있다. 이 기능은 완전히 새로운 Apps Script
프로젝트 `assignment-automation/`으로 만든다 — 아래 모든 경로는 그 안에서의 상대 경로다.

- 진입점: `assignment-automation/src/entrypoints/`
- 로직(순수 함수 + 오케스트레이션): `assignment-automation/src/logic/`
- 게이트웨이(Google 서비스 호출 전담): `assignment-automation/src/gateway/`
- 테스트: `assignment-automation/test/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Apps Script 프로젝트 골격 준비

- [X] T001 `assignment-automation/`에 `src/entrypoints/`, `src/logic/`, `src/gateway/`, `test/`
  디렉터리 구조를 plan.md대로 생성
- [X] T002 [P] `assignment-automation/appsscript.json` 매니페스트 작성 (V8 런타임, timeZone
  Asia/Seoul, Classroom Advanced Service 활성화, Sheets/Forms/Gmail/Drive 스코프)
- [X] T003 [P] `assignment-automation/.clasp.json` 플레이스홀더와 `assignment-automation/.claspignore`
  작성 (`test/**` 배포 제외, `src/**`·`appsscript.json`만 허용)
- [X] T004 [P] `assignment-automation/test/assert.js`(자체 assert 헬퍼: assertEqual, assertThrows,
  assertDeepEqual 등)와 `assignment-automation/test/run.js`(테스트 파일 전체를 순회 실행하는
  러너, 외부 프레임워크 없음) 작성

**Checkpoint**: 빈 프로젝트 골격이 clasp push 가능한 상태.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 거의 모든 User Story가 재사용하는 공용 인프라. 이 단계 없이는 어떤 Story도 안전하게
동작하지 않는다.

**⚠️ CRITICAL**: 이 단계 완료 전에는 User Story 작업을 시작하지 않는다.

- [X] T005 `assignment-automation/src/gateway/sheetsGateway.js`: 헤더 이름 기반 열 조회/범위 단위
  읽기·쓰기 공용 헬퍼(`getColumnIndexByHeader`, `readRowsAsObjects`, `writeRowsBatched` 등) 구현.
  이후 모든 게이트웨이·로직 모듈이 시트에 접근하는 유일한 경로(헌법 IV·VI)
- [X] T006 [P] `assignment-automation/src/gateway/lockGateway.js`: `LockService.getScriptLock().
  tryLock(0)` 기반 실행 잠금 래퍼, try/finally로 항상 해제 (FR-061) — 모든 트리거/메뉴 진입점이
  최상단에서 호출
- [X] T007 [P] `assignment-automation/src/gateway/stateStore.js`: `PropertiesService` 기반 실행
  상태 저장 헬퍼(다음 처리 시각, 처리 재개 지점) (FR-017, FR-021) — 전역 가변 상태 대신 이곳에만
  상태를 둔다(헌법 VI)

**Checkpoint**: 공용 게이트웨이가 준비되어 이후 모든 User Story 구현이 이 위에서 진행 가능.

---

## Phase 3: User Story 1 - 학기 준비와 정합성 검증 (Priority: P1) 🎯 MVP 시작점

**Goal**: 구성 시트를 한 번의 실행으로 만들고, 설정값이 채워진 뒤 정합성 검증을 통과해야만 이후
단계가 시작되게 한다.

**Independent Test**: 빈 스프레드시트에서 초기 설정을 실행해 6+1(변경이력 포함) 개 시트가 정해진
구조로 생성되는지, 의도적으로 잘못된 값을 넣었을 때 검증이 구체적 사유와 함께 막는지 확인한다.

### Implementation for User Story 1

- [X] T008 [US1] `assignment-automation/src/logic/configBootstrap.js`: 강좌설정·역량과제정의·
  수강생·주차·Forms·역량과제·변경이력 7개 시트 생성, 헤더 메모, 구역별 서식/보호/드롭다운, 예시
  유형 값 채움, 멱등 재실행(기존 데이터 보존, 누락 열만 추가) (FR-001~005)
- [X] T009 [US1] `assignment-automation/src/logic/validation.js`: 필수 시트/열 누락, 유형 첫 행
  속성 누락, 유형 그룹 내 불일치, 배점 합 0, 항목명 중복, 참조 열 충돌, 미해결 수식 참조, 다른
  시트 참조 수식, 연계 유형명 부재, 활성 행 주제 누락, 시작/종료 공백, 등급구간(내림차순/마지막0/
  중복/최댓값) 검증 (FR-006, FR-007, FR-008)
- [X] T010 [US1] `assignment-automation/src/logic/validation.js`에 판정수식 표본 미리보기 검증
  추가: 표본 데이터에 적용한 결과 미리보기, 미해결 참조 식별 (FR-009)
- [X] T011 [US1] `assignment-automation/src/entrypoints/Menu.js`: "초기 설정" 메뉴 항목
  (`configBootstrap` 호출, lockGateway 적용)
- [X] T012 [US1] `assignment-automation/src/entrypoints/Menu.js`: "정합성 검증" 메뉴 항목
  (`validation` 호출, 결과를 `getUi().alert()`로 표시 — 이 진입점 계층에서만 UI 호출 허용)

**Checkpoint**: 빈 스프레드시트에서 초기 설정 → 값 입력 → 정합성 검증까지 독립적으로 동작.

---

## Phase 4: User Story 2 - 주차 등록만으로 과제 생성과 게시 자동 진행 (Priority: P1)

**Goal**: 주차 하나를 지정해 과제 행 생성을 실행하면, 이후 사람 개입 없이 생성 Form·응답 시트·
Classroom 과제·역량과제 대장이 모두 채워진다.

**Independent Test**: 정합성 검증을 통과한 설정에서 주차 하나로 과제 행 생성을 실행한 뒤, 추가
조작 없이 모든 산출물이 채워지는지 확인한다.

### Implementation for User Story 2

- [X] T013 [P] [US2] `assignment-automation/src/logic/studentId.js`: 학번 정규화 순수 함수
  (공백/구분자 제거, 자리수 통일 등 표기가 달라도 동일 학생으로 인식)
- [X] T014 [US2] `assignment-automation/test/studentId.test.js`: T013 구현 전에 실패하는 테스트
  먼저 작성, 분기 100% 커버리지 (표기가 다른 동일 학번, 공백/특수문자 포함, 빈 값)
- [X] T015 [US2] `assignment-automation/src/logic/assignmentSetup.js`: 과제 행 생성(유형별 Forms
  행 생성, 수업일+유형 오프셋/기간으로 시작·종료 자동 계산, override 우선) (FR-010, FR-011,
  FR-012)
- [X] T016 [US2] `assignment-automation/src/gateway/formsGateway.js`: 템플릿 Form 복사로 생성
  Form 만들기(제목 조립, 주제 선택지 고정, 응답 목적지 연결, 재실행 시 중복 생성 방지) (FR-013)
- [X] T017 [US2] `assignment-automation/src/gateway/formsGateway.js`: 응답 시트 이름 정리·숨김·
  링크 기록, 지연 시 재시도 한도 내 이어서 재시도 (FR-014)
- [X] T018 [US2] `assignment-automation/src/gateway/classroomGateway.js`: Classroom 과제 게시
  (게시예약=시작, 마감=종료, 배점 지정), 과제 식별자 기록, 실패 행 재시도 (FR-015)
- [X] T019 [US2] `assignment-automation/src/logic/assignmentSetup.js`: 활성 과제×수강생 교차로
  역량과제 대장 행 생성, 기존 조합 유지 (FR-016)
- [X] T020 [US2] `assignment-automation/src/entrypoints/Menu.js`: "과제 행 생성" 메뉴 항목
  (교사가 주차 지정, lockGateway 적용)
- [X] T021 [US2] `assignment-automation/src/entrypoints/Triggers.js`: 과제 준비 자동화 진입점
  (생성Form→응답시트→Classroom게시→대장생성 순차 호출)

**Checkpoint**: 과제 행 생성 한 번으로 US1 산출물 위에 폼·Classroom 과제·대장까지 자동 완성.

---

## Phase 5: User Story 3 - 수집 기간 자동 개시·종료 (Priority: P1)

**Goal**: 각 과제의 시작·종료 시각에 맞춰 사람 개입 없이 수집이 열리고 닫힌다.

**Independent Test**: 과거 시각으로 설정한 과제로 스케줄 실행을 트리거해 게시상태·진행상태가
자동으로 전환되고 제출/미제출이 집계되는지 확인한다.

### Implementation for User Story 3

- [X] T022 [P] [US3] `assignment-automation/src/logic/stateTransition.js`: 게시상태(대기/게시/
  오류)·진행상태(대기/수집중/채점중/평가완료/반환완료/오류) 전이 판정 순수 함수
  (data-model.md 상태 전이도 기준)
- [X] T023 [US3] `assignment-automation/test/stateTransition.test.js`: T022 구현 전에 실패하는
  테스트 먼저 작성, 분기 100% 커버리지(정상 전이 전부 + 오류 전이 + 잘못된 전이 거부)
- [X] T024 [US3] `assignment-automation/src/logic/scheduling.js`: 아직 처리되지 않은 모든 시작·
  종료 시각 중 가장 가까운 미래 시각 하나만 다음 실행으로 계산 (FR-017)
- [X] T025 [US3] `assignment-automation/src/entrypoints/Triggers.js`: `onEdit` 설치형 트리거로
  일정/진행상태 수정 시 다음 처리 시각 재계산 (FR-018)
- [X] T026 [US3] `assignment-automation/src/entrypoints/Triggers.js`: 시작 시각 처리(설문 게시,
  stateTransition으로 상태 전이, 반복 실패 시 오류 전환) (FR-019)
- [X] T027 [US3] `assignment-automation/src/entrypoints/Triggers.js`: 종료 시각 처리(응답 중단,
  제출/미제출 집계, 상태 전이, 유형별 후속 처리 자동 호출) (FR-020)
- [X] T028 [US3] `assignment-automation/src/logic/scheduling.js`에 4분 체크포인트/자기 재예약
  추가, `stateStore.js` 재사용 (FR-021)

**Checkpoint**: US2가 만든 과제가 시작·종료 시각에 맞춰 사람 없이 상태 전환.

---

## Phase 6: User Story 4 - 평가 입력부터 성적 반환·통지까지 자동 환류 (Priority: P1)

**Goal**: 채점 완료 후 평가 입력만으로 점수 산정·성적 반환·통지가 자동 완료된다.

**Independent Test**: 평가 항목이 채워진 응답 시트로 평가 수집→점수 산정→성적 전송(드라이런)까지
실행해 값 일치·재실행 시 무변경(멱등)을 확인한다.

### Implementation for User Story 4

- [X] T029 [P] [US4] `assignment-automation/src/logic/scoring.js`: 원점수→등급구간 판정 순수
  함수(`scoreToGrade`, 하한 내림차순 평가, 최고 하한 초과 시 최고 구간 적용)
- [X] T030 [US4] `assignment-automation/test/scoring.test.js`: T029 구현 전에 실패하는 테스트
  먼저 작성, 분기 100% 커버리지(각 구간 경계값, 최고 하한 초과, 원점수 0)
- [X] T031 [P] [US4] `assignment-automation/src/logic/gradeSendPolicy.js`: 성적 전송 여부(멱등)
  판정 순수 함수(이미 같은 점수로 반환됐으면 전송 대상 아님)
- [X] T032 [US4] `assignment-automation/test/gradeSendPolicy.test.js`: T031 구현 전에 실패하는
  테스트 먼저 작성, 분기 100% 커버리지(값 동일/변경/최초 전송)
- [X] T033 [US4] `assignment-automation/src/logic/evaluationCollection.js`: 평가 항목 열 준비
  (선택지→드롭다운, 판정수식→셀 수식 이식, 팀 대표 행 최초 1회 고정 기록) (FR-022, FR-023,
  FR-024)
- [X] T034 [US4] `assignment-automation/src/logic/evaluationCollection.js`: 평가 수집(수집상태
  대기 대장 행만 대상, 제출 없음→원점수 0 확정, 미채점은 대기 유지) (FR-025, FR-026, FR-027)
- [X] T035 [US4] `assignment-automation/src/gateway/classroomGateway.js`: `scoring.js` +
  `gradeSendPolicy.js` 결과로 Classroom 제출물에 점수 반영, 드라이런 토글 지원 (FR-028, FR-029,
  FR-030)
- [X] T036 [US4] `assignment-automation/src/gateway/sheetsGateway.js`에 변경이력 탭 일괄 append
  기능 추가(실행 중 메모리에 모은 변경 건만 종료 시 한 번에 기록) (FR-031)
- [X] T037 [US4] `assignment-automation/src/gateway/classroomGateway.js`에 성적 전송 실패 학생
  단위 격리·재시도 추가 (FR-032)
- [X] T038 [US4] `assignment-automation/src/gateway/mailGateway.js`: 개인 피드백 통지(항목별
  판정+피드백), 발송 한도 시 지점 저장 후 이어 보내기 (FR-033)
- [X] T039 [US4] `assignment-automation/src/logic/evaluationCollection.js`에 미제출 처리 추가
  (코스 구성원 대조, 원점수 0, 동일한 점수 산정·전송 절차 적용) (FR-034)
- [X] T040 [US4] `assignment-automation/src/entrypoints/Triggers.js`: 채점중 이후 체인(평가 열
  준비→평가 수집→점수 산정→성적 전송→통지) 연결

**Checkpoint**: 교사가 평가만 입력하면 성적 반환·통지까지 끝나는, 이 기능의 핵심 가치 완성.

---

## Phase 7: User Story 5 - 퀴즈 자동 채점과 문항 분석 (Priority: P2)

**Goal**: 연계된 문제 만들기 과제로 퀴즈를 자동 구성하고, 채점과 함께 문항 품질 지표를 산출한다.

**Independent Test**: 문제 만들기 과제의 제출 데이터만으로 퀴즈 폼이 구성되고, 채점 후 문항별
지표·분류가 출제자별로 기록되는지 확인한다.

### Implementation for User Story 5

- [X] T041 [US5] `assignment-automation/src/logic/quizGeneration.js`: 문항 생성(학생별 변형
  선택, 출처 식별 표시, 페이지 분할) (FR-035)
- [X] T042 [US5] `assignment-automation/src/logic/quizGeneration.js`에 손상 셀 복구 추가(원본
  문자열 보관 열 기반 재파싱, 유효 문항 0개 시 실패 처리) (FR-036)
- [X] T043 [US5] `assignment-automation/src/logic/itemAnalysis.js`: 자동 채점 + 문항 지표(정답률/
  변별력/총점 상관/신뢰도/오답 분포/상위-하위 정답률) 산출, 분류(오류 의심/오개념/함정/폐기
  검토/우수), 정답 불일치 식별 (FR-037, FR-038)
- [X] T044 [US5] `assignment-automation/src/logic/itemAnalysis.js`에 연계 없는 퀴즈(시험) 예외
  처리 추가(문항 생성·분석 스킵, 자동 채점 환산만, 실패 아님) (FR-039)
- [X] T045 [US5] `assignment-automation/src/logic/quizGeneration.js`(또는 별도 연동 지점)에서
  `stateTransition.js`를 재사용해 연계 문제 만들기 과제를 채점 완료 시 진행상태 평가완료로 전환
  (FR-040)
- [X] T046 [US5] `assignment-automation/src/entrypoints/Triggers.js`: 퀴즈 유형 후속 처리 연결
  (문항 생성→자동 채점/분석→연계 완료 처리)

**Checkpoint**: 문제 만들기→퀴즈 풀기 연계 파이프라인이 US3 종료 이벤트 위에서 독립 동작.

---

## Phase 8: User Story 6 - 운영 현황 확인과 예외 복구 (Priority: P2)

**Goal**: 교사가 진행 상태를 한눈에 보고, 실패를 하루 1회로 요약받으며, 오류를 복구한다.

**Independent Test**: 의도적 실패 상태가 섞인 데이터에서 현황·요약 메일에 실패가 누락 없이
나타나고, 복구 조작으로 다시 처리 대상이 되는지 확인한다.

### Implementation for User Story 6

- [X] T047 [US6] `assignment-automation/src/logic/dashboard.js`: 주차·유형별 게시상태·진행상태,
  제출/미제출, 대기 중인 처리, 실패 항목 집계 (FR-041)
- [X] T048 [US6] `assignment-automation/src/gateway/mailGateway.js`에 일일 요약 메일 추가(강좌
  설정의 교사 이메일, 고정 시각 트리거) (FR-042)
- [X] T049 [US6] `assignment-automation/src/entrypoints/Menu.js`: 예외 복구 메뉴(오류 과제
  재진행, 이의신청 재전송, 정의 변경 후 소급 재계산) (FR-043, FR-044, FR-045)
- [X] T050 [US6] `gradeSendPolicy.js`/`stateTransition.js` 재사용을 통해 예외 복구 동작이
  멱등임을 보장(재실행 안전) (FR-046)

**Checkpoint**: 교사가 시트 밖에서 아무것도 안 해도 실패를 놓치지 않고 직접 복구 가능.

---

## Phase 9: User Story 7 - 문항 개선 자료 전송과 학기 성적 집계 (Priority: P3)

**Goal**: 문항 분석 결과를 외부 문서로 보내고, 학기 말 누적 성적을 집계한다.

**Independent Test**: 분류된 문항 표본 전송이 실패해도 다른 기능이 멈추지 않는지, 여러 주차·과제
반영값으로 최종 성적과 근거를 추적할 수 있는지 확인한다.

### Implementation for User Story 7

- [ ] T051 [US7] `assignment-automation/src/gateway/dynalistGateway.js`: `UrlFetchApp` 기반
  문항 개선 자료 전송, 실패를 이 안에서 흡수해 상위 흐름에 전파하지 않음 (FR-047)
- [ ] T052 [US7] `assignment-automation/src/logic/gradeAggregation.js`: 학생별 여러 주차·과제
  반영값 가중 집계, 최종 성적과 산출 근거 제공, 등급구간 자체는 변경하지 않음 (FR-048)
- [ ] T053 [US7] `assignment-automation/src/entrypoints/Menu.js`: "누적 성적 집계" 메뉴 항목

**Checkpoint**: 부가 기능이 핵심 파이프라인과 독립적으로 추가·제거 가능.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: 여러 Story에 걸친 마무리 작업

- [ ] T054 [P] `assignment-automation/README.md` 작성: 최초 clasp 설정(신규 스프레드시트/스크립트
  생성, GitHub Secrets/Script Properties) 안내 — `gas/README.md`에서 검증된 패턴 재사용
- [ ] T055 [P] `assignment-automation/test/run.js` 전체 실행, 4개 순수 함수 모듈(studentId,
  stateTransition, scoring, gradeSendPolicy) 분기 커버리지 100% 확인
- [ ] T056 quickstart.md 시나리오 1~5를 실제 스프레드시트에서 수동 검증

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 의존 없음, 즉시 시작
- **Foundational (Phase 2)**: Setup 완료 후 — 모든 User Story를 막는 단계
- **User Story 1~4 (P1, Phase 3~6)**: 겉보기엔 spec.md에서 "독립적으로 테스트 가능"하다고
  설명하지만, 실제 운영 흐름에서는 **순차 의존**한다 — US2는 US1이 만든 유효한 설정과 시트
  구조가 있어야 하고, US3은 US2가 만든 Forms 행이 있어야 하며, US4는 US3이 만든 "채점중" 상태가
  있어야 한다. 즉 P1 4개는 이 순서(US1→US2→US3→US4)로 구현해야 한다.
- **User Story 5 (P2)**: Foundational + US1~US3 완료 후 시작 가능 (US3의 "수집 종료" 이벤트가
  필요). US4와는 독립적으로 병행 개발 가능(같은 `stateTransition.js`를 재사용만 함)
- **User Story 6 (P2)**: Foundational + US1 완료 후 시작 가능하지만, 복구할 대상(성적 전송 실패
  등)이 있으려면 US4까지 있어야 실질적 검증이 된다
- **User Story 7 (P3)**: US4(반영값)와 US5(문항 분석 결과)가 있어야 의미 있는 산출물이 나온다
- **Polish (Phase 10)**: 배포하고자 하는 Story들이 모두 끝난 뒤

### Within Each User Story

- 순수 함수(테스트 대상)는 그 함수를 쓰는 오케스트레이션/게이트웨이 작업보다 먼저
- 테스트는 구현 전에 작성해 실패를 먼저 확인(FR 대상 4개 모듈만)
- 게이트웨이 구현 전에 그 게이트웨이가 감싸는 Google 서비스 호출 대상이 정해져 있어야 함
- 진입점(Menu/Triggers) 배선은 그 진입점이 호출하는 로직/게이트웨이가 끝난 뒤

### Parallel Opportunities

- Setup: T002, T003, T004는 서로 다른 파일이라 병렬 가능
- Foundational: T006, T007은 서로 다른 파일이며 T005 완료 후 병렬 가능
- US2: T013(studentId.js)은 다른 US2 작업과 파일이 겹치지 않아 조기 병렬 가능
- US3: T022(stateTransition.js)은 US2 작업들과 파일이 겹치지 않아 US2 진행 중에도 병렬 착수 가능
- US4: T029(scoring.js)와 T031(gradeSendPolicy.js)은 서로 다른 파일이라 병렬 가능
- US5와 US6은 각각 Foundational + 선행 Story만 끝나면 서로 다른 개발자가 병행 가능
- Polish: T054, T055는 서로 다른 산출물이라 병렬 가능

---

## Parallel Example: User Story 4

```bash
# scoring.js와 gradeSendPolicy.js는 서로 의존하지 않는 별개 순수 함수이므로 함께 진행 가능
Task: "Implement assignment-automation/src/logic/scoring.js"
Task: "Implement assignment-automation/src/logic/gradeSendPolicy.js"

# 각각의 테스트도 서로 독립적으로 함께 작성 가능
Task: "Write failing tests in assignment-automation/test/scoring.test.js"
Task: "Write failing tests in assignment-automation/test/gradeSendPolicy.test.js"
```

---

## Implementation Strategy

### MVP 범위 재정의 (일반적인 "User Story 1만" 템플릿과 다름)

이 기능은 P1 스토리 4개(US1~US4)가 하나의 선형 파이프라인이라, US1만으로는 눈에 보이는 가치가
없다. **실질적 MVP는 US1+US2+US3+US4 전체**다 — "주차 하나 등록 → 과제 생성·게시 → 수집 개시·
종료 → 채점·성적 반환"이 끝까지 이어져야 이 기능의 핵심 가치(SC-001, SC-005)가 증명된다.

1. Setup + Foundational 완료
2. US1 → US2 → US3 → US4 순서로 구현 (순차 의존, 각 Checkpoint에서 quickstart.md 시나리오
   1~3으로 검증)
3. **STOP and VALIDATE**: 실제 테스트 학생·테스트 Classroom 코스로 시나리오 1~4(quickstart.md)
   전부 통과 확인 → 여기까지가 MVP
4. US5(퀴즈 자동 채점)와 US6(운영 현황·복구)는 이후 병행 추가
5. US7(문항 개선 자료 전송·성적 집계)은 학기 중 언제든 마지막에 추가해도 무방(가장 낮은 의존성)

### Incremental Delivery

1. Setup+Foundational → 배포 가능한 최소 골격
2. US1 → 초기 설정·검증만으로도 교사가 시트를 바로 쓸 수 있는 상태
3. US2 추가 → 과제 준비까지 자동화 (Demo 가능)
4. US3 추가 → 수집 개폐까지 자동화
5. US4 추가 → 성적 반환까지 완주 (MVP 완성, Demo/실전 투입 가능)
6. US5, US6 → 품질/운영 기능 추가
7. US7 → 부가 기능 마무리

---

## Notes

- [P] 작업 = 다른 파일, 의존성 없음
- [Story] 라벨은 해당 작업을 특정 User Story에 대응시켜 추적성 확보
- 각 User Story는 Checkpoint에서 독립적으로 완료·테스트 가능해야 함(단, 위 Dependencies에서
  설명한 순차성은 예외)
- 구현 전 테스트가 실패하는지 반드시 확인(T014, T023, T030, T032)
- 논리적 작업 묶음 완료마다 커밋
- Checkpoint마다 멈춰서 해당 Story를 독립적으로 검증
- 피할 것: 모호한 작업, 같은 파일 동시 수정 충돌, Story 간 독립성을 깨는 교차 의존
