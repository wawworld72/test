# 과제 운영·평가·성적 환류 자동화 (Google Apps Script)

혼자 운영하는 교내 강의를 위한 스프레드시트 바인딩 Apps Script 프로젝트. 과제 폼 생성 →
Google Classroom 게시 → 수집 열기/닫기 → 채점(루브릭 또는 퀴즈 자동 채점) → 성적 반영 →
Classroom 반환·학생 통지까지, 교사가 시트 밖에서 아무것도 하지 않아도 이어서 진행된다.
설계 배경과 판단 근거는 `specs/001-assignment-grading-automation/` 문서(spec/plan/research/
data-model/tasks)를 참고.

## 구성

- `src/entrypoints/` — `Menu.js`(비상 복구·최초 실행 전용 메뉴, `getUi`/`alert` 허용은 여기뿐),
  `Triggers.js`(시간 기반/onEdit 트리거가 부르는 얇은 진입점)
- `src/logic/` — 순수 로직 + 오케스트레이션. `studentId.js`/`stateTransition.js`/`scoring.js`/
  `gradeSendPolicy.js` 4개는 헌법이 정한 100% 분기 커버리지 테스트 대상(`test/*.test.js`)
- `src/gateway/` — `SpreadsheetApp`/`FormApp`/Classroom Advanced Service/`MailApp`/
  `UrlFetchApp`/`PropertiesService`/`LockService` 등 Google/외부 서비스 호출 전담
- `appsscript.json` — V8 런타임, Asia/Seoul, Classroom Advanced Service, OAuth 스코프
- `test/run.js` + `test/assert.js` — 외부 프레임워크 없는 자체 테스트 러너(헌법 V)

## 최초 1회 수동 설정 (사람이 직접 Google 계정으로 인증해야 하는 부분)

이 저장소를 체크아웃한 로컬 환경에서 진행한다. `gas/README.md`와 같은 절차를 따르되, 이
프로젝트는 **웹앱이 아니라 메뉴·트리거로만 동작하는 바인딩 스크립트**라 배포 단계가 더
단순하다 — `clasp push`만으로 트리거·메뉴가 항상 최신 코드로 실행된다(별도 `clasp deploy
-i <deploymentId>` 불필요. 이건 `/exec` URL이 특정 버전에 고정되는 웹앱에만 해당하는
제약이며, 바인딩 스크립트의 트리거·메뉴는 항상 스크립트 HEAD를 실행한다).

1. `npm install -g @google/clasp` (아직 없다면)
2. `clasp login` — `gas/` 설정 때 이미 로그인했다면 생략 가능(같은 Google 계정 인증을 여러
   Apps Script 프로젝트에 재사용할 수 있다)
3. 이 자동화가 붙을 실제 강의용 스프레드시트를 새로 만들고, 그 시트에 바인딩된 Apps Script
   프로젝트를 생성:
   ```
   clasp create --type sheets --title "<과목명> 과제 자동화" --rootDir assignment-automation
   ```
   생성된 `.clasp.json`의 `scriptId`가 `assignment-automation/.clasp.json`에 이미 채워져
   있는지 확인(다르면 덮어쓰기).
4. 코드 업로드:
   ```
   cd assignment-automation && clasp push --force
   ```
5. 스프레드시트를 열면 "과제 자동화" 메뉴가 보인다. **초기 설정**을 먼저 클릭 —
   `강좌설정`/`역량과제정의`/`수강생`/`주차`/`Forms`/`역량과제`/`변경이력` 7개 시트를
   만들고(이미 있으면 누락된 열만 보강), onEdit·30분 채점 점검·일일 요약 트리거를 등록한다.
6. `강좌설정` 시트의 빈 값(학기/과목명/코스식별자/교사이메일 등)과 `역량과제정의`
   시트(유형별 템플릿Form/등급구간/평가항목/배점/**누적반영가중치** 등)를 실제 값으로
   채운다. 채운 뒤 메뉴의 **정합성 검증**으로 확인.
7. (선택) Dynalist로 문항 개선 자료를 보내려면 `강좌설정`의 `외부전송`을 TRUE로,
   `외부문서식별자`에 Dynalist 문서 ID를 넣고, Apps Script 편집기(`clasp open`) > 프로젝트
   설정 > 스크립트 속성에 `DYNALIST_API_TOKEN`을 추가한다(레포에는 절대 커밋하지 않음 —
   `gas/`의 `GITHUB_TOKEN`과 같은 관례).
8. `clasp login` 후 생성된 `~/.clasprc.json` 내용을 `CLASP_CREDENTIALS` GitHub Secret으로
   등록한다(이미 `gas/` 배포용으로 등록해뒀다면 그대로 재사용 가능 — clasp 인증은 프로젝트가
   아니라 Google 계정 단위다).

## GitHub Secrets

| Secret | 값 |
| --- | --- |
| `CLASP_CREDENTIALS` | 로컬 `~/.clasprc.json` 파일 전체 내용(`gas/` 배포와 공유 가능) |

등록 후에는 `assignment-automation/**` 변경분을 main에 push하면
`.github/workflows/assignment-automation-deploy.yml`이 `node test/run.js`(4개 순수 로직
모듈 테스트)를 먼저 실행하고, 통과하면 `clasp push --force`로 반영한다. 모든 push/PR에서는
`.github/workflows/tests.yml`도 같은 테스트를 돌려 빠른 피드백을 준다.

## 운영 중 참고

- 정상 운영에서는 메뉴를 누를 일이 거의 없다 — "과제 행 생성"(주차 시작 시 1회)과 예외
  상황(오류 복구/이의신청 재전송/정의 변경 소급 재계산/누적 성적 집계)에서만 사용한다.
- `강좌설정`의 `드라이런`을 TRUE로 두면 Classroom 실제 반영 없이 카운트만 확인할 수 있다 —
  신규 배포 직후 권장.
- 실행 로그는 Apps Script 편집기의 실행 기록에서 확인하거나, "현황" 시트(메뉴의
  "현황 새로고침")에서 주차·유형별 게시상태·진행상태·제출현황·실패 항목을 확인한다.

## 알려진 한계 (투명하게 공개)

- 이 코드는 실제 Google 계정(Classroom/Forms/Sheets/Gmail)에 대해 아직 검증되지 않았다 —
  이 세션(Claude Code 원격 환경)은 `script.google.com`/Classroom API 아웃바운드가 네트워크
  정책상 막혀 있어 직접 실행 검증이 불가능했다. 사용자 로컬 환경에서 최초 설정 후
  `quickstart.md` 시나리오로 수동 검증이 필요하다.
- `/speckit-analyze`에서 확인된 두 가지는 아직 구현되지 않았다:
  - FR-055: Form 생성 이후 Forms 행의 "주제"가 바뀌는 것을 감지·차단하는 장치 없음.
  - SC-002: 80명·90초 성적 반환 성능 목표를 검증하는 테스트/작업 없음.
- Dynalist 연동은 실제 Dynalist 계정으로 검증되지 않았다(REST API 스펙 기반 구현).

## 테스트

```
cd assignment-automation
node test/run.js   # studentId/stateTransition/scoring/gradeSendPolicy 순수 로직, 41개 케이스
```
