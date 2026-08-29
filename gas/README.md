# 출결 결과 → Google 스프레드시트 (Apps Script 웹앱)

`scripts/hoseo_attendance_scraper.py`, `scripts/ibk_attendance_scraper.py`가 만든
`attendance_long.csv`를 `scripts/push_to_sheet.py`가 이 웹앱의 `/exec` URL로 POST하면,
`doPost`가 지정한 시트 탭 전체를 새 데이터로 덮어쓴다.

스프레드시트를 열면 "출결 갱신" 메뉴에서 Hoseo/IBK 버튼을 눌러 GitHub Actions의
`workflow_dispatch` API를 직접 호출할 수도 있다. 즉 시트 → GitHub Action 실행 → 시트 갱신까지
전부 시트 안에서 끝낼 수 있다.

- `Code.js` — `doPost`/`doGet` 핸들러, 시트 쓰기, `onOpen` 메뉴, GitHub Action 트리거 함수들,
  로그 적재/조회(`appendLog`/`readRecentLogs`), `setupApiToken` 설정용 함수
- `attendanceCore.js` — 요청 검증/정규화 순수 로직 (Jest로 테스트, `attendanceCore.test.js`)
- `githubDispatch.js` — `workflow_dispatch` 요청 URL/payload 조립 순수 로직 (Jest로 테스트, `githubDispatch.test.js`)
- `logging.js` — "Logs" 탭에 쓸 행 포맷/트림 계산 순수 로직 (Jest로 테스트, `logging.test.js`)
- `appsscript.json` — 매니페스트. 웹앱을 "실행: 나", "액세스 권한: 익명 사용자 포함 모두"로 배포

## 최초 1회 수동 설정 (사람이 직접 Google 계정으로 인증해야 하는 부분)

이 저장소를 체크아웃한 로컬 환경에서 진행한다.

1. `npm install -g @google/clasp`
2. `clasp login` — 브라우저가 열리면 사용할 Google 계정으로 로그인
3. 빈 임시 폴더에서 새 스프레드시트 + 바인딩된 Apps Script 프로젝트 생성:
   ```
   mkdir /tmp/gas-init && cd /tmp/gas-init
   clasp create --type sheets --title "출결 결과"
   ```
   생성된 `.clasp.json`의 `scriptId` 값을 복사해 이 저장소의 `gas/.clasp.json`에 붙여넣는다
   (`rootDir`는 `"."`로 유지).
4. 저장소의 `gas/` 디렉터리에서 코드를 업로드:
   ```
   cd gas && clasp push --force
   ```
5. `clasp open`으로 Apps Script 편집기를 열어 `setupApiToken` 함수를 한 번 실행하고
   실행 로그에 출력된 토큰 값을 복사해둔다 (`GAS_API_TOKEN`으로 사용).
6. 편집기에서 배포 > 새 배포 > 웹앱 선택:
   - 실행 계정: 나
   - 액세스 권한: 익명 사용자를 포함한 모든 사용자
   - 배포 후 나오는 웹앱 URL(`.../exec`)을 복사해둔다 (`GAS_WEBAPP_URL`로 사용).
7. `clasp login` 후 생성된 `~/.clasprc.json` 파일 내용을 그대로 복사해둔다 (`CLASP_CREDENTIALS`로 사용,
   CI가 이후 자동으로 `clasp push`를 할 수 있게 하는 자격 증명).
8. `gas` 디렉터리에서 `clasp deployments`를 실행해 방금 만든 웹앱 배포의 ID를 확인하고 복사해둔다
   (`GAS_DEPLOYMENT_ID`로 사용). **이 단계가 없으면 이후 `clasp push`로 코드를 바꿔도 라이브
   웹앱은 그대로다** — `clasp push`는 스크립트의 "HEAD"만 갱신하고, 이미 배포된 웹앱 URL은
   특정 버전에 고정돼 있어서 `clasp deploy -i <deploymentId>`로 그 배포를 새 버전으로 갱신해줘야
   실제 `/exec` 응답이 바뀐다. `gas-deploy.yml`이 push마다 이 작업을 대신 해준다.

## GitHub Secrets 등록

| Secret | 값 |
| --- | --- |
| `CLASP_CREDENTIALS` | 로컬 `~/.clasprc.json` 파일 전체 내용 |
| `GAS_DEPLOYMENT_ID` | `clasp deployments`로 확인한 웹앱 배포 ID |

`CLASP_CREDENTIALS`/`GAS_DEPLOYMENT_ID`는 이 저장소 자체(`gas-deploy.yml`)가 코드를 배포할 때
쓰는 값이라 반과 무관하게 하나만 있으면 된다 (Repository secrets).

`GAS_WEBAPP_URL`/`GAS_API_TOKEN`은 반마다 다른 스프레드시트를 가리켜야 하므로 Repository
secrets가 아니라 **GitHub Environment secrets**로 등록한다 (아래 "여러 반 동시 자동화" 참고).

## 여러 반(스프레드시트)을 같은 저장소로 동시에 자동화하기

`attendance-scrape.yml`/`ibk-attendance-scrape.yml`/`hoseo-task.yml`은 실행할 때
`target_env`(예: `class-01`, `class-02`)를 고르게 돼 있고, 각 잡에
`environment: ${{ github.event.inputs.target_env }}`이 걸려 있다. GitHub Actions는 이
`environment:`에 지정된 이름의 **Environment**에 등록된 시크릿을 그 잡의 `secrets.*`로
꺼내 쓰므로, 반마다 다른 스프레드시트의 `GAS_WEBAPP_URL`/`GAS_API_TOKEN`을 같은 워크플로
파일 하나로 동시에 쓸 수 있다.

(입력 이름을 `target_env`/`GITHUB_TARGET_ENV`로 정한 건 이미 별도로 운영 중인 다른 GAS
프로젝트의 명명과 맞춘 것이다 — 두 쪽이 이름만 다르면 같은 워크플로를 놓고 "Unexpected
inputs provided" 422가 난다.)

`class-01`/`class-02`는 실제 스프레드시트나 수업과는 무관한, 저장소 안에서만 쓰는 이름표다 -
"이번 실행이 어느 쪽 시크릿 세트를 꺼내 쓸지" 구분하는 라벨일 뿐이다.

1. GitHub 저장소 Settings > Environments에서 `class-01`, `class-02` 두 개를 만든다.
2. 각 Environment에 그 반 스프레드시트에 맞는 `GAS_WEBAPP_URL`/`GAS_API_TOKEN`을
   Environment secret로 등록한다 (반마다 별도로 `clasp create`한 스프레드시트 + 배포 필요).
3. 워크플로를 수동 실행할 때 `target_env`를 `class-01`/`class-02` 중 골라서 실행하면
   해당 Environment의 값이 쓰인다.
4. 시트 메뉴("출결 갱신")나 `fetchCourseDataAndLog`로 GAS가 워크플로를 대신 트리거해줄
   때는 사람이 매번 고를 필요 없이, 그 스프레드시트에 바인딩된 GAS 프로젝트의 스크립트
   속성 `GITHUB_TARGET_ENV`를 한 번 설정해두면 `dispatchWorkflow`가 자동으로 `target_env`
   입력에 실어 보낸다 (`gas/githubDispatch.js`의 `withTargetEnvInput`). 즉 1반 스프레드시트의
   GAS 프로젝트에는 `GITHUB_TARGET_ENV=class-01`, 2반에는 `GITHUB_TARGET_ENV=class-02`를
   설정한다.

**⚠️ `gas/` 폴더가 배포하는 대상 확인**: 이 저장소의 `gas-deploy.yml`은 `gas/.clasp.json`의
`scriptId`가 가리키는 Apps Script 프로젝트에 `clasp push --force`를 실행한다. `clasp push`는
Apps Script API의 `updateContent`를 쓰는데, 이건 **그 프로젝트의 파일 목록을 로컬(`gas/`)
것으로 통째로 교체**하는 방식이라 추가/병합이 아니다. 만약 이 `scriptId`가 이미 다른 파일들
(예: 채점엔진, 메뉴, 성적공개 등 이 저장소에 없는 `.gs` 파일들)을 가진 실제 운영 중인
스프레드시트와 같은 프로젝트를 가리킨다면, `clasp push`가 그 파일들을 전부 지워버린다. 게다가
`Code.js`는 `doPost`/`doGet`/`onOpen`을 정의하므로, 같은 프로젝트 안에 이미 그 이름의 함수가
다른 파일에 있다면(Apps Script는 이름이 겹치는 최상위 함수 중 하나만 남기고 나머지는 조용히
무시한다) 하나가 조용히 무시되는 문제가 재발한다. `gas/.clasp.json`의 `scriptId`를 바꾸거나
새로 설정하기 전에, 그 값이 정말 "이 저장소 전용으로 새로 만든" 스프레드시트를 가리키는지
먼저 확인한다.

등록 후에는 **코드를 고치고 main에 push하기만 하면 끝**이다. 복사/붙여넣기나 수동 배포 없이:
- `gas/**` 변경분을 main에 push → `.github/workflows/gas-deploy.yml`이
  1) `npm test`로 `attendanceCore.js`/`githubDispatch.js` 테스트 실행
  2) `clasp push --force`로 코드 반영
  3) `clasp deploy -i $GAS_DEPLOYMENT_ID`로 같은 웹앱 URL을 새 버전으로 갱신
  까지 자동으로 처리한다. 테스트가 실패하면 배포 단계는 아예 실행되지 않는다.
- Hoseo/IBK 출석 스크레이핑 워크플로가 끝나면 `scripts/push_to_sheet.py`가 CSV를 웹앱에 전송해
  같은 스프레드시트의 `Hoseo` / `IBK` 탭을 갱신한다.

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
