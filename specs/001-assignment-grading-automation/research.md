# Phase 0 Research: 과제 운영·평가·성적 환류 자동화

기술 컨텍스트에 `NEEDS CLARIFICATION`으로 남은 항목은 없다(`/speckit-clarify`에서 데이터 모델·
동시성·로그 위치·알림 정책을 이미 확정함). 이 문서는 그 결정을 실제로 구현할 때 필요한 기술적
선택지를 조사하고 근거를 남긴다.

## 1. Google Classroom 연동 방식

- **Decision**: Apps Script의 Classroom Advanced Service(`Classroom.Courses.CourseWork`,
  `Classroom.Courses.CourseWork.StudentSubmissions`)를 사용한다.
- **Rationale**: `appsscript.json`에 서비스만 활성화하면 OAuth 스코프·재시도·직렬화를 Apps Script가
  대신 처리해준다. 별도 서비스 계정이나 수동 OAuth 플로우가 필요 없어 "단독 운영자, 신규 외부 의존
  금지" 원칙과 맞는다.
- **Alternatives considered**: `UrlFetchApp`으로 `classroom.googleapis.com`을 직접 호출 — 헤더·
  토큰 관리를 직접 해야 해서 더 복잡하고, Advanced Service가 이미 존재하는 상황에서 이점이 없어 기각.

## 2. 생성 Form 만들기 (템플릿 복사)

- **Decision**: `DriveApp.getFileById(templateFormId).makeCopy(title, destinationFolder)` 로
  파일을 복사한 뒤 `FormApp.openById(copiedId)`로 열어 제목·주제 선택 문항 선택지·응답 목적지
  (스프레드시트)를 설정한다.
- **Rationale**: Forms에는 "복제" 전용 API가 없고, Drive 파일 복사가 Google이 문서화한 표준
  패턴이다. 복사 직후 응답 시트가 비동기로 생성되므로(UC-09), 존재 확인 실패 시 한도 내 재시도가
  필요하다(FR-014).
- **Alternatives considered**: 매 과제마다 새 폼을 처음부터 코드로 생성 — 문항 구성이 유형마다
  달라 유지보수 부담이 커지고 "템플릿 Form" 개념 자체와 맞지 않아 기각.

## 3. 일정 예약과 트리거 관리

- **Decision**: 단일 "다음 이벤트" 시간 기반 트리거를 매 실행 종료 시 삭제 후 다음 가장 가까운
  시작/종료 시각으로 재생성한다(FR-017). 이와 별도로 (a) 일일 요약 메일 전용 고정 시각 트리거
  1개, (b) 교사가 일정/진행상태를 수정했을 때 재계산을 유발하는 `onEdit` 설치형 트리거 1개를 둔다.
  총 시간 기반 트리거는 2개(동적 이벤트 + 일일 요약)이며 `onEdit`은 시간 기반이 아니므로 헌법의
  "8개 이하" 한도에 여유가 크다.
- **Rationale**: "항상 다음 처리 시각 하나만 예약되어 있다"(FR-017)를 그대로 구현하는 가장 단순한
  방법이다. 트리거를 여러 개 걸어두는 대신 하나를 계속 재생성하면 트리거 개수 한도 관리가 쉬워진다.
- **Alternatives considered**: 짧은 간격(예: 5분)으로 도는 폴링 트리거 1개 — 항상 켜져 있어
  "변경 없는 재실행은 쓰기 0회"는 지킬 수 있지만 실행 자체는 계속 발생해 불필요한 실행 로그가
  쌓이고, "다음 처리 시각 하나만 예약"이라는 스펙 문구와도 맞지 않아 기각.

## 4. 동시 실행 방지 (FR-061)

- **Decision**: 모든 트리거·메뉴 진입점의 최상단에서 `LockService.getScriptLock().tryLock(0)`을
  호출한다. 즉시 획득하지 못하면(이미 다른 실행이 진행 중) 아무 작업도 하지 않고 조용히 종료한다.
- **Rationale**: `tryLock(0)`은 대기하지 않고 즉시 성공/실패를 반환해 "뒤이은 실행은 대기하지
  않고 즉시 종료한다"(FR-061)를 정확히 만족한다. `finally` 블록에서 항상 `releaseLock()`을
  호출해 잠금이 남지 않게 한다.
- **Alternatives considered**: `lock.waitLock(ms)`로 잠시 대기 — 대기하는 순간 다음 트리거의
  6분 한도를 함께 깎아먹고, 두 실행이 순차적으로 겹쳐 실행되면서 오히려 예상 못한 상태 전이가
  생길 수 있어 기각.

## 5. 판정수식 실행 방식 (FR-009, FR-024, FR-051)

- **Decision**: 역량과제정의에 문자열로 저장된 판정수식을 응답 시트의 실제 셀에 스프레드시트
  수식으로 그대로 심는다(`Range.setFormula`). 계산은 Google Sheets 수식 엔진이 수행하고, 시스템은
  계산된 값만 읽는다. 코드 안에서 수식 문자열을 직접 파싱하거나 `eval`하지 않는다.
- **Rationale**: "같은 응답 시트 안의 열만 참조한다"는 제약(FR-051)은 실제로 셀 수식으로 심었을 때
  다른 시트를 참조하는 문법(`'시트명'!`, `IMPORTRANGE` 등)이 있는지 문자열 검사로 걸러내는 방식과
  자연스럽게 맞아떨어진다. 별도 수식 파서/평가기를 만드는 것은 이번 기능 규모에 비해 과한 복잡도이며
  "동일 로직을 두 곳에 정의하지 않는다" 원칙에도 오히려 위배(스프레드시트 엔진과 코드 양쪽에 계산
  로직이 생김)된다.
- **Alternatives considered**: 코드 내 소규모 수식 파서 구현 — 유지보수 대상이 하나 늘고, 스프레드시트
  네이티브 수식과 미묘하게 다른 동작(예: 오차, 함수 지원 범위)이 생길 위험이 있어 기각.

## 6. 손상된 셀 복구 (FR-036, UC-15)

- **Decision**: 출제 데이터가 입력되는 각 열 옆에 시스템이 채우는 "원본" 열을 별도로 두어, 최초
  입력 시점의 원문 문자열을 그대로 보관한다. 파싱에 실패하면 이 원본 열의 문자열로 재시도하고,
  검증 결과 원본 셀 값도 정상화된 값으로 되돌린다.
- **Rationale**: 스프레드시트 자동 서식(숫자/날짜 추정 변환 등)이 원인인 손상은 "원래 사용자가
  타이핑한 문자열"을 알아야만 복구할 수 있다. 원본을 별도 보관하지 않으면 이미 손상된 값에서는
  복구할 근거 자체가 없다.
- **Alternatives considered**: 셀 서식을 텍스트로 고정해 손상을 원천 차단 — 이미 채택된 방어
  (헌법 IV: "학번처럼 표기가 훼손되기 쉬운 열은 손상되지 않는 서식으로 지정")와 같은 종류이지만,
  이미 손상된 기존 데이터나 서식 보호가 우회된 경우까지는 막지 못해 원본 보관을 함께 둔다.

## 7. 알림 메일 발송

- **Decision**: `MailApp.sendEmail`로 일일 요약과 학생 개인 통지를 모두 발송한다.
- **Rationale**: 스레드 회신, 라벨링 등 Gmail 특화 기능이 필요 없는 단순 발송이라 `MailApp`으로
  충분하고, 일일 할당량 소비도 `GmailApp`과 동일하다. 발송 실패/한도 초과는 지점을 저장해 다음
  실행에서 이어 보낸다(FR-033).
- **Alternatives considered**: `GmailApp` — 스레드 관리 기능이 필요 없어 이점 없이 API 표면만
  넓어져 기각.

## 8. 외부 문서(Dynalist) 연동

- **Decision**: `UrlFetchApp`으로 Dynalist REST API를 직접 호출해 문항 개선 자료를 지정된 문서에
  계속 추가한다. 실패는 이 기능 자체 안에서 격리해 예외를 삼키고 로그만 남긴다(호출 실패가 상위
  실행 흐름에 예외를 전파하지 않음).
- **Rationale**: Dynalist는 Apps Script Advanced Service 목록에 없으므로 `UrlFetchApp`이 유일한
  경로다. "실패해도 채점·성적 전송을 중단시키지 않는다"(FR-047)를 만족하려면 이 호출을 감싸는
  코드가 예외를 흡수해야 한다.
- **Alternatives considered**: 없음 — 유일하게 가능한 방식.

## 9. 배포 파이프라인

- **Decision**: 기존 `gas/` 프로젝트와 동일한 관례를 따른다 — clasp로 `assignment-automation/`을
  별도 Apps Script 프로젝트로 관리하고, `clasp push` + `clasp deploy`만으로 배포한다(헌법 VIII).
  구체적인 GitHub Actions 워크플로 파일 추가는 `/speckit-tasks` 이후 구현 단계의 작업 항목이다.
- **Rationale**: 이미 검증된 패턴(이 저장소의 CLAUDE.md에 기록됨)을 재사용하면 새로운 배포 방식을
  또 설계할 필요가 없다(단순성 원칙).
- **Alternatives considered**: Apps Script 편집기 직접 배포 — 헌법 VIII이 명시적으로 금지.
