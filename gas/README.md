# 출결 결과 → Google 스프레드시트 (Apps Script 웹앱)

`scripts/hoseo_attendance_scraper.py`, `scripts/ibk_attendance_scraper.py`가 만든
`attendance_long.csv`를 `scripts/push_to_sheet.py`가 이 웹앱의 `/exec` URL로 POST하면,
`doPost`가 지정한 시트 탭 전체를 새 데이터로 덮어쓴다.

스프레드시트를 열면 "출결 갱신" 메뉴에서 Hoseo/IBK 버튼을 눌러 GitHub Actions의
`workflow_dispatch` API를 직접 호출할 수도 있다. 즉 시트 → GitHub Action 실행 → 시트 갱신까지
전부 시트 안에서 끝낼 수 있다.

이 폴더의 파일들은 **출결 수집 자동화를 위한 참고 구현/순수 로직 테스트베드**다. 실제 강의용
스프레드시트는 별도의, 훨씬 큰 Apps Script 프로젝트(채점엔진·성적공개 등 다른 모듈과 함께)를
쓰고, 그 프로젝트의 출결 수집 모듈(`연동_출결수집.gs` 등)은 이 폴더의 아키텍처를 참고해 **사람이
직접 옮겨 적은 것**이다. 이 저장소는 그 프로젝트에 코드를 자동으로 밀어 넣지 않는다 — CI가
Apps Script에 자동으로 `clasp push`/`deploy`하는 기능은 없다(아래 "GAS 자동 배포는 하지 않음"
참고).

- `Code.js` — `doPost`/`doGet` 핸들러, 시트 쓰기, `onOpen` 메뉴, GitHub Action 트리거 함수들,
  로그 적재/조회(`appendLog`/`readRecentLogs`), `setupApiToken` 설정용 함수
- `attendanceCore.js` — 요청 검증/정규화 순수 로직 (Jest로 테스트, `attendanceCore.test.js`)
- `githubDispatch.js` — `workflow_dispatch` 요청 URL/payload 조립 순수 로직 (Jest로 테스트, `githubDispatch.test.js`)
- `logging.js` — "Logs" 탭에 쓸 행 포맷/트림 계산 순수 로직 (Jest로 테스트, `logging.test.js`)
- `appsscript.json` — 매니페스트 예시 (웹앱을 "실행: 나", "액세스 권한: 익명 사용자 포함 모두"로 배포)

## GAS 자동 배포는 하지 않음

과거에는 `gas/**` 변경분이 main에 push되면 `gas-deploy.yml`이 `clasp push --force` +
`clasp deploy`로 이 저장소의 `gas/.clasp.json`이 가리키는 Apps Script 프로젝트에 코드를
자동 반영했다. 이 워크플로는 삭제했다 — 더 이상 GAS 코드를 어딘가에 자동으로 쓰는 기능은
필요 없고, 각 반의 실제 스프레드시트는 이미 자체 Apps Script 프로젝트에 코드를 직접
포팅해서 운영 중이기 때문이다. 이 저장소가 하는 일은 GitHub Actions 워크플로(스크레이핑 +
`workflow_dispatch`)를 제공하는 것까지고, 그 워크플로를 호출하는 GAS 코드를 어느 프로젝트에
어떻게 반영할지는 각 반이 알아서 관리한다.

이 폴더의 `Code.js`/`.clasp.json`/`.claspignore`/`appsscript.json`은 필요하면 사람이 직접
`clasp push`/`clasp deploy`를 실행해 이 저장소 전용 데모 프로젝트에 반영하는 용도로만 남아
있다(자동화 없음). 순수 로직 파일(`attendanceCore.js`/`githubDispatch.js`/`logging.js`)은
계속 `npm test`로 검증되며, 각 반의 실제 Apps Script 프로젝트가 참고/이식할 아키텍처
기준으로 쓰인다.

## GitHub Secrets 등록

`GAS_WEBAPP_URL`/`GAS_API_TOKEN`은 반마다 다른 스프레드시트를 가리켜야 하므로 Repository
secrets가 아니라 **GitHub Environment secrets**로 등록한다 (아래 "여러 반 동시 자동화" 참고).

## 여러 반(스프레드시트)을 같은 저장소로 동시에 자동화하기

`attendance-scrape.yml`/`ibk-attendance-scrape.yml`/`hoseo-task.yml`은 실행할 때
`class_name`(예: `class-01`, `class-02`)를 고르게 돼 있고, 각 잡에
`environment: ${{ github.event.inputs.class_name }}`이 걸려 있다. GitHub Actions는 이
`environment:`에 지정된 이름의 **Environment**에 등록된 시크릿을 그 잡의 `secrets.*`로
꺼내 쓰므로, 반마다 다른 스프레드시트의 `GAS_WEBAPP_URL`/`GAS_API_TOKEN`을 같은 워크플로
파일 하나로 동시에 쓸 수 있다.

(입력 이름을 `class_name`/`GITHUB_TARGET_ENV`로 정한 건 이미 별도로 운영 중인 다른 GAS
프로젝트의 명명과 맞춘 것이다 — 두 쪽이 이름만 다르면 같은 워크플로를 놓고 "Unexpected
inputs provided" 422가 난다.)

`class-01`/`class-02`는 실제 스프레드시트나 수업과는 무관한, 저장소 안에서만 쓰는 이름표다 -
"이번 실행이 어느 쪽 시크릿 세트를 꺼내 쓸지" 구분하는 라벨일 뿐이다. `class_name` 입력은
고정된 목록(`type: choice`)이 아니라 자유 입력 문자열이다 - 반이 몇 개든 워크플로 YAML은
그대로 두고 Environment만 추가하면 되므로, 개수가 둘에서 셋, 넷으로 늘어나도 이 저장소를
고칠 필요가 없다. (`type: choice`로 고정하면 반이 늘 때마다 이 파일을 고쳐야 해서, "저장소는
몇 개 테넌트가 있는지 몰라도 된다"는 원래 의도와 어긋난다.) 대신 오타를 내면 존재하지 않는
Environment를 참조해 잡이 바로 실패하므로, `class_name` 값은 항상 등록해둔 Environment
이름과 정확히 같아야 한다.

1. GitHub 저장소 Settings > Environments에서 `class-01`, `class-02` 두 개를 만든다 (반이
   늘어나면 그만큼 더 만들면 된다 - 워크플로 파일은 고칠 필요 없음).
2. 각 Environment에 그 반 스프레드시트에 맞는 `GAS_WEBAPP_URL`/`GAS_API_TOKEN`을
   Environment secret로 등록한다 (반마다 별도로 `clasp create`한 스프레드시트 + 배포 필요).
3. 워크플로를 수동 실행할 때 `class_name`를 `class-01`/`class-02` 중 골라서 실행하면
   해당 Environment의 값이 쓰인다.
4. 시트 메뉴("출결 갱신")나 `fetchCourseDataAndLog`로 GAS가 워크플로를 대신 트리거해줄
   때는 사람이 매번 고를 필요 없이, 그 스프레드시트에 바인딩된 GAS 프로젝트의 스크립트
   속성 `GITHUB_TARGET_ENV`를 한 번 설정해두면 `dispatchWorkflow`가 자동으로 `class_name`
   입력에 실어 보낸다 (`gas/githubDispatch.js`의 `withClassInput`). 즉 1반 스프레드시트의
   GAS 프로젝트에는 `GITHUB_TARGET_ENV=class-01`, 2반에는 `GITHUB_TARGET_ENV=class-02`를
   설정한다.

Environment secret 등록 후에는 각 반의 Apps Script 프로젝트에 `GITHUB_TARGET_ENV` 스크립트
속성만 설정해두면 된다(위 4번). 이 저장소는 그 프로젝트에 코드를 자동으로 배포하지 않으므로
(위 "GAS 자동 배포는 하지 않음" 참고), 반이 늘어나도 이 저장소 쪽에서 할 일은 Environment
추가뿐이고, 각 반 Apps Script 프로젝트의 실제 코드 반영은 각자 관리한다. Hoseo/IBK 출석
스크레이핑 워크플로가 끝나면 `scripts/push_to_sheet.py`가 CSV를 웹앱에 전송해 같은
스프레드시트의 `Hoseo` / `IBK` 탭을 갱신한다.

## 시트 메뉴에서 GitHub Action 트리거하기 (선택)

이건 GitHub Secret이 아니라 **Apps Script 자체의 Script Property**로 저장한다 (레포에는 절대 커밋하지 않음).

1. GitHub에서 Fine-grained personal access token 발급 (Settings > Developer settings):
   - Repository access: `wawworld72/test` 저장소만 선택
   - Permissions: **Actions: Read and write**
2. Apps Script 편집기(`clasp open`) > 왼쪽 톱니바퀴(프로젝트 설정) > "스크립트 속성"에 추가:
   - `GITHUB_TOKEN` = 위에서 발급한 토큰
   - `GITHUB_REF` (선택) = 워크플로 파일이 있는 브랜치명. main에 아직 병합 전이면
     `claude/google-apps-script-github-4ksesx`처럼 현재 브랜치명을 넣어야 하고,
     병합 후에는 지우거나 `main`으로 바꾼다 (비워두면 기본값 `main` 사용).
   - `GITHUB_TARGET_ENV` = 이 스프레드시트가 어느 반인지 (`class-01` 또는 `class-02`). 워크플로가
     이 값으로 어느 GitHub Environment의 `GAS_WEBAPP_URL`/`GAS_API_TOKEN`을 쓸지 정하므로,
     반마다 다른 스프레드시트에 바인딩된 GAS 프로젝트에는 반드시 서로 다른 값을 넣어야 한다
     (자세한 내용은 위 "여러 반 동시 자동화" 참고).
3. `cd gas && clasp push --force`로 최신 `Code.js`(메뉴 포함)를 반영한 뒤 스프레드시트를
   새로고침하면 "출결 갱신" 메뉴가 보인다.
4. 메뉴에서 "Hoseo 출결 갱신 요청" / "IBK 출결 갱신 요청"을 클릭하면 해당 GitHub Actions
   워크플로가 실행되고, 끝나면 자동으로 같은 스프레드시트의 Hoseo/IBK 탭이 갱신된다.
   (IBK는 필수 입력값인 교과목명을 클릭 시 팝업으로 물어본다.)

## 실행 로그 확인 (Claude가 직접 조회)

Apps Script 실행 로그는 금방 사라지고, Cloud Logging은 별도 GCP 프로젝트 연결/API 활성화가
있어야 조회할 수 있어 번거롭다. 대신 `doPost`/`dispatchWorkflow`가 실행될 때마다 같은
스프레드시트의 "Logs" 탭(시간/레벨/출처/메시지/상세, 최근 `MAX_LOG_ROWS`(500)건 유지)에
기록을 남기고, 같은 웹앱의 `doGet`이 그걸 JSON으로 돌려준다:

```
curl "https://script.google.com/macros/s/xxx/exec?token=<GAS_API_TOKEN>&limit=20"
```

웹앱 URL과 `GAS_API_TOKEN`을 알려주시면 이후 세션에서 이 명령으로 직접 로그를 조회해 문제를
진단할 수 있다 (Drive 공유나 GCP 설정 불필요).

**주의**: 이 엔드포인트는 익명 접근이 가능한 웹앱이라 토큰만 알면 누구나 로그를 읽을 수 있다.
토큰은 `setupApiToken`이 만드는 무작위 UUID이므로 추측은 어렵지만, URL을 남에게 공유하거나
공개 저장소 등에 노출하지 않도록 주의한다.

## 테스트

```
npm ci
npm test        # attendanceCore.js / githubDispatch.js / logging.js 순수 로직 테스트 (Jest)
```
