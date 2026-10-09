# Trellis

Claude Code 옆자리에서, AI가 코드를 짜는 동안 무엇을 왜 바꿨는지 사람이 계속 이해하고 책임질 수 있게 잡아 주는 데스크톱 앱입니다.

*Keep the intent of your project understood while you work with AI agents.*

터미널에서 Claude Code와 대화하는 경험은 그대로 두고, 그 옆에 이번 작업의 의도, 턴별 타임라인, 영역별로 묶인 변경, 결정 기록, 구조 건강을 보여 줍니다. 식물이 격자(trellis)를 타고 자라듯, 구조를 잡아 주면서 사람과 프로젝트가 같이 자라게 하자는 뜻으로 지은 이름입니다.

## 왜 만들었나

AI에게 일을 맡기면 결과물은 빨리 나오지만 이해는 따라오지 않습니다. "그 문제 어떻게 해결했어?"라는 질문에 "클로드가 그러던데요"만 남고, 결정의 이유는 대화창에 묻히고, AI 변경이 쌓이면서 구조도 조금씩 무너집니다.

그렇다고 사람이 diff를 한 줄씩 다시 읽는 방식은 오래 가지 못합니다. Trellis는 둘을 나눕니다. 코드가 맞는지 확인하는 일은 테스트와 자동 검사와 AI에 맡기고, 사람은 무엇을 왜 만들지 정하고 책임지는 일, 즉 의도와 결정에 집중합니다. 사람이 쓰는 시간은 변경량이 아니라 결정 개수에 비례해야 한다는 것이 출발점입니다.

판단 근거는 [docs/BACKGROUND.md](docs/BACKGROUND.md)에 자세히 있습니다.

## 지금 되는 것 (M1)

- 프로젝트 목록: 폴더를 추가하고 Obsidian 볼트처럼 오갑니다. 다른 프로젝트로 옮겨도 터미널 세션은 유지됩니다.
- 내장 터미널: 프로젝트를 열면 실행 카드에서 권한 방식(Claude 설정 따르기, 매번 확인, 수정 자동 허용, 자동 판단, 계획만, 모든 확인 건너뛰기)을 고르고 지난 대화를 이어서 하거나 새 대화를 시작합니다. 한 프로젝트에서 Claude 대화와 셸을 여러 탭으로 열 수 있습니다. 탭을 멈추면 그 자리에서 다시 시작할 수 있습니다.
- 입력창과 이미지: Claude 탭 아래 입력창에서 한글을 완성해 보내고(언어 전환 직후 자모 분리 버그 우회), 클립보드 이미지를 붙여넣으면 Claude 입력칸에 `[Image #N]`으로 첨부됩니다. 터미널에 Cmd+V로 붙여넣어도 같고, 파일은 끌어다 놓으면 경로가 들어갑니다.
- 작업 의도: 이번 작업에서 하려는 것과 하면 안 되는 것을 적어 두고 Claude 입력창에 붙여 넣습니다. 적은 의도는 타임라인에도 남습니다.
- 타임라인: 프롬프트 하나에서 도구 사용, 종료까지를 턴 카드 하나로 보여 주고, 승인을 기다리는 중이면 표시합니다. 턴에서 바뀐 파일은 턴 시작과 끝의 git 스냅샷으로 계산해서, Claude가 Bash로 고친 파일도 빠지지 않습니다. 탭이 여럿이면 탭별로 걸러 볼 수 있습니다.
- 변경: 이번 실행을 시작한 시점(또는 마지막 커밋) 이후 바뀐 파일을 영역별로 묶어 줄 수와 함께 보여 주고, 쓰는 편집기로 엽니다.
- 결정: 프로젝트의 결정 기록 폴더(기본 `docs/decisions/`)에 있는 문서 목록을 보여 줍니다. 지금은 읽기 전용입니다.
- 건강: 파일 수, 큰 파일, 300줄 넘는 파일 수, 파일이 몰린 폴더 같은 기본 지표를 보여 줍니다.
- 편집기: 파일을 처음 열 때 이 컴퓨터에서 찾은 편집기(VS Code, Cursor, Zed, Sublime, IntelliJ 계열 등) 중에서 한 번 고릅니다. 기본 앱으로 열기, Finder/탐색기에서 보기도 고를 수 있습니다.
- 설정: 한국어/영어, 다크/라이트 테마, claude 경로와 추가 인자, 권한 기본값, 프로젝트를 열 때 묻기/바로 시작, 편집기, 터미널 GPU 렌더링, 프로젝트별 결정 폴더와 기록 언어.

Trellis는 IDE가 아닙니다. 파일 내용이나 diff는 직접 보여 주지 않고 편집기로 엽니다.

## 앞으로 할 것

Trellis의 핵심인 "새 결정 감지"는 아직 없습니다. 순서와 완료 기준은 [docs/PLAN.md](docs/PLAN.md) §8에 있습니다.

- M2 결정 감지: 작업이 끝나면 변경과 의도를 분석해 새 결정 후보(새 라이브러리, 인증 흐름 변경, 스키마 변경 등)를 뽑습니다. 사람에게는 diff 대신 "이렇게 결정했는데 맞나요? 이유는?"만 묻고, 답은 결정 기록이 되어 다음 작업의 맥락이 됩니다.
- M3 구조 규칙: 경계, 파일 크기, 중복, 순환 규칙을 작업이 끝날 때 검사합니다. 기존 위반은 기준선으로 얼려 두고 새 위반만 막습니다.
- M4 의도 레이어: 동작 스펙(EARS, Given/When/Then 등)과 동작 diff, 문서와 코드의 어긋남 감지, 작업 전 영향 예측과 작업 후 비교.

## 어떻게 동작하나

- 이벤트: Trellis가 claude를 실행할 때 `--settings`로 HTTP 훅을 붙입니다. 훅은 `127.0.0.1`에서 토큰으로 보호되는 Trellis 서버로 이벤트를 보냅니다. Trellis가 응답하지 않아도 Claude는 멈추지 않습니다. 대상 저장소의 `.claude` 설정은 건드리지 않고, 거기 있던 훅과 함께 돕니다. (ADR-0003)
- 변경: 훅이 아니라 git으로 계산합니다. Claude가 Bash로 만든 파일도 잡힙니다. 기준점은 임시 인덱스로 찍는 스냅샷이라 작업 트리, 인덱스, 브랜치를 건드리지 않습니다. (ADR-0014)
- 터미널 화면을 파싱하지 않습니다. Claude Code 업데이트로 바뀔 수 있는 부분(훅 입력 필드, CLI 플래그)은 `src/main/features/agents/claude-code/` 한 곳에 모았습니다.

## 데이터와 개인정보

- 설정, 프로젝트 목록, 이벤트 기록(프롬프트와 명령 포함)은 앱 데이터 폴더에만 저장하고 외부로 보내지 않습니다. macOS는 `~/Library/Application Support/Trellis`, Windows는 `%APPDATA%\Trellis`이고, 개발 빌드는 `Trellis-dev`를 따로 씁니다.
- 대상 저장소의 파일은 고치지 않습니다. 변경 스냅샷 때문에 `.git/objects`에 참조 없는 객체가 남을 수 있는데, 이는 `git gc`가 정리합니다. git이 아닌 폴더에서 "git 시작하기"를 누르면 그때만 `git init`을 실행합니다.
- M2부터는 사람이 승인한 결정 문서만 프로젝트별로 설정한 위치에 씁니다.

## 상태와 알려진 한계

버전 0.1.0. M1(셀프 호스팅 가능한 첫 버전, 즉 Trellis로 Trellis를 개발할 수 있는 버전) 구현을 마쳤고, 실제 프로젝트에서 써 보는 확인이 남았습니다.

- 코드 서명 전이라 처음 실행할 때 보안 경고가 뜹니다.
- Windows 설치 파일은 CI에서 만들지만 실제 Windows PC에서는 아직 확인하지 않았습니다(키 처리, ConPTY 등).
- 지원하는 에이전트는 Claude Code뿐이고, 2.1.29x에서 확인했습니다.
- 셸 탭에서 직접 실행한 `claude`에는 이벤트 브리지가 붙지 않아 타임라인에 나오지 않습니다. Claude 탭을 쓰세요.
- 같은 폴더에서 Claude 탭 여러 개가 동시에 파일을 고치면, 턴별 변경에 다른 탭의 변경이 섞일 수 있습니다.
- macOS 설치 파일은 Apple Silicon(arm64)용만 만듭니다.

## 설치

아직 릴리스 태그가 없어서, GitHub Actions가 만든 설치 파일을 저장소 Actions 탭의 artifacts에서 받습니다. `v*` 태그를 달면 Releases에도 올라갑니다.

- macOS: `Trellis-<버전>-mac-arm64.dmg`. 서명 전이라 처음에는 Finder에서 앱을 우클릭 → 열기로 실행합니다.
- Windows: `Trellis-Setup-<버전>-win-x64.exe`. SmartScreen이 뜨면 "추가 정보 → 실행"을 누릅니다.

필요한 것: 로그인된 [Claude Code](https://code.claude.com/docs), git. 별도 API 키는 필요 없습니다. macOS에서 Finder로 실행해도 로그인 셸의 PATH를 읽어 claude와 git을 찾습니다.

## 개발

Node 24와 npm 11을 씁니다(CI와 같은 버전).

```bash
npm install          # 의존성 설치, node-pty 실행 권한 복구, 네이티브 모듈 준비
npm run dev          # 개발 빌드. 저장하면 화면은 바로 바뀌고 main은 다시 시작 (데이터 폴더 Trellis-dev)
npm run install:local  # 지금 코드로 /Applications/Trellis.app 교체 (dmg 없이, 실행 중이면 종료할 때 교체)
npm run check        # 타입·린트·포맷·i18n·구조 규칙·단위 테스트 (커밋 전 필수)
npm run e2e          # 빌드 후 가짜 claude로 전 구간 스모크 테스트
npm run dist:mac     # macOS 설치 파일 (Windows 설치 파일은 Windows에서 dist:win)
```

아래 두 테스트는 직접 켜야 돌고, `out/`의 빌드를 쓰므로 먼저 `npm run build`를 합니다. 둘 다 임시 데이터 폴더를 씁니다.

```bash
TRELLIS_REAL_CLAUDE=1 npx playwright test real-claude   # 실제 claude로 전 구간 확인 (구독 사용량 소모)
TRELLIS_BROWSE_PATH=<폴더> npx playwright test browse   # 기존 폴더를 Claude 없이 열어 패널 스크린샷
```

Trellis로 Trellis를 개발할 때는 패키지된 안정 빌드에서 Claude를 실행하고, 그 안에서 `npm run dev`로 개발 빌드를 띄웁니다. 고치는 중인 앱으로 그 앱을 고치지 않기 위해서입니다(ADR-0011). 개발 빌드로 충분히 써 보고 만족하면 `npm run install:local`로 안정 빌드를 교체합니다. 설치 파일(dmg·exe)은 남에게 줄 버전을 찍을 때만 만듭니다(ADR-0021). 지금 실행 중인 빌드는 상태 바 오른쪽(예: `0.1.0+b5f7716`)에서 확인합니다.

코드 구조와 작업 규칙은 [AGENTS.md](AGENTS.md)에 있습니다. 사람과 에이전트(Claude Code, Codex 등)가 같이 따르는 규칙이고, `CLAUDE.md`는 이 파일의 심볼릭 링크입니다.

## 문서

- [docs/PLAN.md](docs/PLAN.md): 작업 기준. 범위, 마일스톤, 체크리스트
- [docs/BACKGROUND.md](docs/BACKGROUND.md): 왜 이런 모양이 되었나
- [docs/decisions/](docs/decisions/): 결정 기록(ADR)
- [docs/worklog/](docs/worklog/): 세션별 작업일지
- [docs/experiment-log.md](docs/experiment-log.md): 효과 검증 실험 기록

## 라이선스

비공개 저장소이고 라이선스는 아직 정하지 않았습니다(PLAN M5에서 결정).
