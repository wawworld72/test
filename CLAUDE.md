# Google Apps Script ↔ GitHub 연동 — 이 리포에서 확인한 핵심 패턴

유사 환경(GAS + GitHub Actions + Sheets)을 다시 구축할 때 참고용. 세부 구현보다 왜 이렇게
했는지 판단 근거만 정리.

## 1. clasp push ≠ 배포 갱신
`clasp push`는 스크립트의 HEAD(편집기에 보이는 코드)만 바꾼다. 이미 만든 웹앱 배포(`/exec` URL)는
특정 버전에 고정돼 있어서, 코드가 실제 라이브 웹앱에 반영되려면 `clasp deploy -i <deploymentId>`로
그 배포를 새 버전으로 갱신해야 한다. CI에서 push만 하고 deploy를 빼먹으면 "코드는 바뀌었는데
동작은 그대로"인 상태가 된다. (이 리포는 결국 이 자동 배포 자체를 없앴다 — 10번 참고.)

## 2. GAS 코드를 Node/Jest로 테스트하려면 순수 로직을 분리
GAS는 자체 테스트 러너가 없다. `SpreadsheetApp`/`UrlFetchApp` 등 GAS 전용 API를 쓰는 부분과,
값 검증·URL 조립 같은 순수 로직을 파일 단위로 분리하고, 순수 로직 파일 끝에
`if (typeof module !== 'undefined') { module.exports = {...} }`를 붙이면 같은 코드가
GAS(전역 스코프, module 없음)와 Node/Jest(module 있음) 양쪽에서 그대로 동작한다.
GAS는 프로젝트 내 모든 파일을 하나의 전역 스코프로 합치므로 require 없이 함수를 바로 호출 가능.

## 3. 외부(비-Google) 클라이언트가 웹앱을 호출하게 하려면
`appsscript.json`의 `webapp.access`를 `ANYONE_ANONYMOUS`, `executeAs`를 `USER_DEPLOYING`으로 설정하면
Google 로그인 없이 호출 가능하고, 실행 권한은 배포한 사람 것을 쓴다. 대신 앱 레벨에서 자체 토큰
(스크립트 속성에 저장한 무작위 UUID)으로 인증해야 한다 — Google 쪽 인증을 대체하는 최소한의 장치.

## 4. 트리거 방향을 뒤집을 수 있다: GAS → GitHub Actions
GitHub Actions는 `workflow_dispatch` REST API로도 실행 가능하다. GAS에서 `UrlFetchApp`으로
`POST /repos/{owner}/{repo}/actions/workflows/{file}/dispatches`를 호출하면 스프레드시트
메뉴 버튼 클릭만으로 GitHub Action을 실행시킬 수 있다. 필요한 PAT는 GitHub Secret이 아니라
**GAS 스크립트 속성**에 저장한다 (레포에 커밋되는 게 아니라 GAS 쪽 자격 증명이므로).

## 5. Apps Script 로그는 원래 조회가 번거롭다 → 우회 경로를 직접 만든다
실행 로그는 금방 사라지고, Cloud Logging(Stackdriver)은 별도 표준 GCP 프로젝트 연결 + API
활성화가 있어야 조회 가능해서 무겁다. 대신:
- 이벤트를 시트의 별도 탭("Logs")에 직접 적재 (행 수 상한을 두고 오래된 것부터 트림)
- 같은 웹앱에 토큰으로 보호된 `doGet` 하나를 추가해 최근 로그를 JSON으로 반환
- 이러면 AI 세션이든 사람이든 `curl "<webapp>/exec?token=...&limit=20"` 한 줄로 로그를 확인 가능
  (Drive 파일 공유나 GCP 콘솔 접근 불필요)

이 패턴(적재는 이미 쓰는 저장소에, 조회는 이미 있는 웹앱 엔드포인트로)은 GAS뿐 아니라
"실행 환경의 표준 로그 시스템에 접근 권한이 없을 때" 일반적으로 쓸 수 있다.

실제로 curl로 검증하며 겪은 것들:
- Apps Script 웹앱은 실제 응답을 `script.googleusercontent.com`으로 302 리다이렉트한다.
  `curl -L`(리다이렉트 따라가기) 없이 호출하면 JSON 대신 "Moved Temporarily" HTML만 보게 된다.
- `clasp deployments`에는 항상 `@HEAD` 배포가 하나 더 보이는데, 이건 Apps Script가 자동으로
  만드는 테스트용 배포라 "익명 접근 가능한 웹앱"이 아니다. 실제 배포 ID는 버전 번호가 붙은
  쪽(`@1`, `@2`...)이고, 웹앱 URL은 그 ID로 `https://script.google.com/macros/s/<id>/exec`
  형태로 바로 만들 수 있다.
- Claude Code 원격 세션(이 환경)은 네트워크 정책상 `script.google.com` 아웃바운드를 막아서,
  이 웹앱을 curl/WebFetch로 직접 검증하는 건 사용자 로컬 터미널에서만 가능했다 (GitHub Actions
  러너는 이런 제약이 없어 CI 쪽 호출은 정상 동작). 원격 세션에서 "직접 호출해서 확인하겠다"고
  가정하지 말고, 네트워크 정책 때문에 막힐 수 있다는 걸 먼저 확인해야 한다.

## 6. 시크릿은 저장 위치를 용도에 맞게 분리
- **GitHub Environment Secrets** (`GAS_WEBAPP_URL`, `GAS_API_TOKEN`, 이름표는 `class-01`/`class-02`):
  테넌트마다 다른 값이라 저장소 하나에 여러 벌 넣어야 하는 것들. 자세한 이유는 8번 참고.
- **GAS 스크립트 속성** (`API_TOKEN`, `GITHUB_TOKEN`, `GITHUB_REF`, `GITHUB_TARGET_ENV`): GAS
  코드가 실행 중에 참조하는 것들. 레포에는 절대 커밋하지 않고 Apps Script 편집기(Project
  Settings)에서만 설정. `GITHUB_TARGET_ENV`는 이 스프레드시트가 어느 테넌트(반)인지를
  나타내며 8번에서 다룬다.
  (`CLASP_CREDENTIALS`/`GAS_DEPLOYMENT_ID`는 CI 자동 배포용이었으나 10번에서 그 자동화
  자체를 없앴으므로 더 이상 등록할 필요가 없다.)

## 7. CI 워크플로
모든 push/PR에서 도는 가벼운 테스트 워크플로(`npm test`, `python -m unittest`) 하나만
남아 있다 — 빠른 피드백용. `gas/**` 변경분을 감지해 Apps Script에 자동 배포하는 워크플로는
과거에 있었지만 제거했다 (이유는 10번).

## 8. 같은 저장소로 여러 "테넌트"(반)를 동시에 자동화 — GitHub Environments

워크플로가 어느 스프레드시트로 쓸지는 `GAS_WEBAPP_URL`/`GAS_API_TOKEN` 값으로 정해지는데,
Repository secrets는 저장소당 한 값밖에 못 가진다. 반이 둘이면 하나를 넣는 순간 다른 하나가
끊긴다 — 시크릿 저장 공간 자체가 "테넌트 하나"만 가정하고 있어서다.

해법은 시크릿을 여러 벌 담을 수 있는 GitHub **Environments** 기능이다: 저장소 안에
`class-01`, `class-02`처럼 이름표를 만들고 각각에 그 반의 `GAS_WEBAPP_URL`/`GAS_API_TOKEN`을
Environment secret로 넣는다. 이 이름표는 실제 스프레드시트나 수업과 무관하고, "이번 실행이
어느 시크릿 세트를 쓸지"만 가리키는 라벨이다.

워크플로 쪽에서 필요한 건 두 가지뿐:
- `workflow_dispatch.inputs`에 이름표를 받는 입력(`class_name`)을 추가. 반 개수가 고정이
  아니면 `type: choice` + 고정 `options` 목록으로 만들지 않는다 — 그러면 테넌트가 늘 때마다
  워크플로 파일을 고쳐야 해서 "저장소는 몇 개 테넌트가 있는지 몰라도 된다"는 원래 의도가
  깨진다. 그냥 자유 입력 문자열로 두고, 값은 실제 등록된 Environment 이름과 정확히 일치하는지
  호출하는 쪽(GAS 등)이 책임진다 — 틀리면 존재하지 않는 Environment를 참조해 잡이 실패한다.
- 잡에 `environment: ${{ github.event.inputs.class_name }}`을 건다 — 이러면 그 잡의
  `secrets.*`가 그 Environment에 등록된 값으로 해석된다.

사람이 매번 워크플로 실행 화면에서 이름표를 고르지 않아도 되게 하려면, 트리거를 거는 쪽(이
리포는 GAS)이 자기가 어느 테넌트인지 알고 있다가 `workflow_dispatch` 요청의 `inputs`에
같이 실어 보내면 된다 — 즉 "어느 벌을 쓸지"는 저장소가 아니라 호출자가 알고 있는 값이다.
이 입력 이름(`class_name`)은 실제로는 호출하는 GAS 쪽 코드와 반드시 일치해야 한다 — 이름이
안 맞으면 GitHub가 "Unexpected inputs provided" 422로 거부한다. 워크플로 파일과 그걸
호출하는 GAS 코드가 서로 다른 저장소/프로젝트에 있을 때(이 리포처럼, 실제 호출자는 별도의
큰 Apps Script 프로젝트에 사람이 손으로 이식해둔 코드) 두 쪽을 누가 먼저 바꾸느냐에 따라
이름이 계속 어긋날 수 있다 — 실제로 이 리포에서 `target_env`↔`class_name` 사이를 두 번
왔다갔다했다. 이런 경우 "무엇이 지금 실제로 배포되어 있는가"(즉 고치기 어려운 쪽, 보통 사람이
손으로 옮겨 적은 큰 프로젝트)를 기준으로 삼고, 고치기 쉬운 쪽(이 리포의 워크플로/헬퍼)을
거기에 맞추는 게 맞다 — 반대로 하면 매번 실제 운영 코드를 다시 손대야 한다.

## 9. Claude(나) 자신의 접근 권한 한계를 먼저 확인하고 설계
GAS 실행/Cloud Logging API용 커넥터는 없고, Google Drive 커넥터는 파일 읽기 전용,
GitHub 쪽은 리포/Actions에 거의 완전한 접근권이 있다. 이 비대칭 때문에 "GAS 상태를 어떻게
들여다볼까"의 답은 항상 "GitHub Actions 로그로 새어나오게 하거나(push_to_sheet.py의 stdout),
curl로 직접 찌를 수 있는 엔드포인트를 만드는 것"이 됐다 — 새 커넥터 요청보다 기존 접근권 안에서
우회로를 만드는 쪽이 현실적이었다.

## 10. CI가 GAS에 코드를 자동으로 쓰는 기능은 결국 없앴다
`gas/**` push마다 CI가 `clasp push --force`로 Apps Script 프로젝트에 코드를 자동 반영하는
워크플로가 한동안 있었다. 그런데 `clasp push`는 대상 프로젝트의 파일 목록을 로컬 것으로
**통째로 교체**하는 방식이라(추가/병합이 아님), 만약 그 scriptId가 이미 다른 목적(채점엔진·
성적공개 등)으로 쓰이는 실제 운영 중인 프로젝트와 같다면 그 파일들을 통째로 지워버릴 수 있고,
`doPost`/`onOpen`처럼 프로젝트당 하나만 있어야 하는 예약 함수가 다른 파일에 이미 있다면
조용히 무시되는 문제도 재발할 수 있었다.

이 위험은 "scriptId가 안전한지 매번 확인하고 자동 배포를 계속 쓸지" 대신 "애초에 GAS에
코드를 자동으로 쓰는 기능 자체를 없앨지"로 판단이 갈리는 지점이었다 — 실제로 반마다 이미
별도의 큰 Apps Script 프로젝트에 코드를 손으로 이식해 운영 중이었으므로, 자동 배포가 없어도
운영에 지장이 없었다. 그래서 CI 워크플로를 삭제하고, 이 리포의 `gas/` 폴더는 순수 로직
(Jest로 테스트되는) + 참고용 아키텍처로만 남기기로 했다. 일반화하면: "자동화 대상이 내가
전적으로 통제하지 않는, 이미 다른 무언가가 들어있는 공유 자원(다른 사람이 손으로 관리하는
프로젝트, 운영 중인 데이터베이스 등)"일 때는, 안전장치를 계속 추가하는 것보다 애초에 그
자동화 자체를 없애는 편이 더 안전한 경우가 있다.
