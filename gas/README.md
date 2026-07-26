# 출결 결과 → Google 스프레드시트 (Apps Script 웹앱)

`scripts/hoseo_attendance_scraper.py`, `scripts/ibk_attendance_scraper.py`가 만든
`attendance_long.csv`를 `scripts/push_to_sheet.py`가 이 웹앱의 `/exec` URL로 POST하면,
`doPost`가 지정한 시트 탭 전체를 새 데이터로 덮어쓴다.

스프레드시트를 열면 "출결 갱신" 메뉴에서 Hoseo/IBK 버튼을 눌러 GitHub Actions의
`workflow_dispatch` API를 직접 호출할 수도 있다. 즉 시트 → GitHub Action 실행 → 시트 갱신까지
전부 시트 안에서 끝낼 수 있다.

- `Code.js` — `doPost` 핸들러, 시트 쓰기, `onOpen` 메뉴, GitHub Action 트리거 함수들, `setupApiToken` 설정용 함수
- `attendanceCore.js` — 요청 검증/정규화 순수 로직 (Jest로 테스트, `attendanceCore.test.js`)
- `githubDispatch.js` — `workflow_dispatch` 요청 URL/payload 조립 순수 로직 (Jest로 테스트, `githubDispatch.test.js`)
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

## GitHub Secrets 등록

| Secret | 값 |
| --- | --- |
| `CLASP_CREDENTIALS` | 로컬 `~/.clasprc.json` 파일 전체 내용 |
| `GAS_WEBAPP_URL` | 배포된 웹앱 `/exec` URL |
| `GAS_API_TOKEN` | `setupApiToken` 실행 로그에 출력된 토큰 |

등록 후에는:
- `gas/**` 변경분을 main에 push하면 `.github/workflows/gas-deploy.yml`이 테스트 후 `clasp push`로 자동 배포한다.
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
3. `cd gas && clasp push --force`로 최신 `Code.js`(메뉴 포함)를 반영한 뒤 스프레드시트를
   새로고침하면 "출결 갱신" 메뉴가 보인다.
4. 메뉴에서 "Hoseo 출결 갱신 요청" / "IBK 출결 갱신 요청"을 클릭하면 해당 GitHub Actions
   워크플로가 실행되고, 끝나면 자동으로 같은 스프레드시트의 Hoseo/IBK 탭이 갱신된다.
   (IBK는 필수 입력값인 교과목명을 클릭 시 팝업으로 물어본다.)

## 테스트

```
npm ci
npm test        # attendanceCore.js 순수 로직 테스트 (Jest)
```
