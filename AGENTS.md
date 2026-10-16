# Trellis — 에이전트 작업 규칙

Claude Code, Codex 등 이 저장소에서 일하는 모든 에이전트와 사람에게 공통으로 적용된다.
`CLAUDE.md`는 이 파일의 심볼릭 링크다(같은 파일). 고칠 때는 `AGENTS.md`를 고친다.

## 1. 먼저 읽을 것 — 매 세션 시작, 그리고 대화 압축 직후에도

1. `docs/PLAN.md` — **작업 기준 문서.** §8에서 현재 마일스톤과 다음 미완료 항목을 확인한다.
2. `docs/worklog/`의 최신 파일 — 지난번에 멈춘 곳, 남은 문제, 다음 할 일.
3. 이번 작업과 관련된 `docs/decisions/` (ADR).

방향(무엇을 왜 만드는가)을 바꾸고 싶어지면 `docs/BACKGROUND.md`를 먼저 읽는다. 거기 적힌 이유를 뒤집을 근거가 없으면 바꾸지 않는다.
대화 기억보다 문서가 우선이다. 대화에서 정한 것이 문서에 없으면 먼저 문서에 적는다.

## 2. 작업 원칙

- `docs/PLAN.md` §7 범위 밖의 일은 미누에게 먼저 묻고, 합의하면 PLAN을 고친 뒤 진행한다.
- 새 결정(라이브러리 추가, 구조 변경, 데이터 형식, 외부 연동, 원칙에 대한 예외)은 `docs/decisions/`에 ADR로 남긴다. 템플릿은 `docs/decisions/README.md`.
- **대상 저장소에 쓰지 않는다.** Trellis 기능을 개발·테스트할 때 hearthwild, `~/minu-future`, `~/llm-wiki-harness` 등 실제 프로젝트의 파일을 만들거나 고치지 않는다. 테스트는 임시 폴더에서 한다.
- 상위 폴더(`minu-personal-dev/`)의 비밀 파일(`*.txt`)은 읽지도 복사하지도 않는다.
- 사람에게 쓰는 글(문서·worklog·커밋 설명·앱의 한국어 문구)은 평범한 존댓말 또는 간결한 서술형으로, 과한 기호와 표 남발 없이 쓴다.

## 3. 명령

| 명령 | 하는 일 |
|---|---|
| `npm install` | 의존성 설치 (node-pty 네이티브 빌드 포함) |
| `npm run dev` | 개발 빌드 실행, 소스가 바뀌면 다시 빌드 (데이터 폴더 `Trellis-dev`, 안정 빌드와 분리) |
| `npm run install:local` | 지금 소스로 안정 빌드(`/Applications/Trellis.app`)를 교체 (macOS). Trellis가 실행 중이면 종료할 때 교체된다 |
| `npm run check` | 타입 검사 + 린트 + 포맷 검사 + i18n 키 동기화 + 의존성 규칙 + 단위 테스트. **커밋 전 필수** (작업 끝 훅은 `npm run check:stop`) |
| `npm test` | 단위 테스트 (Vitest) |
| `npm run build` | 프로덕션 번들 (`out/`) |
| `npm run e2e` | 빌드 뒤 Electron e2e (Playwright, 가짜 claude): smoke·intent·guard. 하나만은 `npx playwright test smoke`. 패키지 앱으로 돌리려면 `TRELLIS_E2E_EXECUTABLE=<앱 실행 파일>`, 화면을 남기려면 `TRELLIS_SCREENSHOTS=<폴더>` |
| `TRELLIS_REAL_CLAUDE=1 npx playwright test real-claude` | 실제 claude로 전 구간 확인 (구독 사용량 소모, 임시 폴더 사용). 먼저 `npm run build` |
| `TRELLIS_BROWSE_PATH=<폴더> npx playwright test browse` | 기존 폴더를 Claude 없이 읽기 전용으로 열어 패널 스크린샷. 먼저 `npm run build` |
| `npx electron scripts/render-icon.mjs` | `build/icon.svg` → `build/icon.png` |
| `npm run dist:mac` / `npm run dist:win` | 설치 파일 생성 (각 OS에서 실행) |
| `npm run format` | Prettier로 포맷 정리 |

## 4. 구조 규칙 — dependency-cruiser가 집행한다 (`.dependency-cruiser.cjs`)

- `src/shared/` — 순수 TypeScript. 앱 계층, Node 내장 모듈, npm 패키지(`electron`, `react` 포함)를 import하지 않는다. main과 renderer가 둘 다 쓴다.
- `src/main/` — renderer·preload를 import하지 않는다. `src/main/lib/`(파일·프로세스 같은 기반 코드)와 `src/main/platform/`(OS별 코드)은 기능이나 앱 연결 코드(`index.ts`, `ipc*.ts`)를 import하지 않는다.
- `src/preload/` — `shared`와 `electron`만 import한다(Node 내장 모듈 금지). 노출 API는 `src/shared/ipc.ts`의 계약을 따른다.
- `src/renderer/` — main·preload·`electron`을 import하지 않고 Node 내장 모듈을 쓰지 않는다(샌드박스). main과는 `window.trellis` API로만 통신한다. `renderer/lib/`와 `renderer/components/`는 기능(`features/`)이나 화면(`app/`)을 import하지 않는다.
- **기능 단위 폴더**: `src/main/features/<기능>/`, `src/renderer/features/<기능>/`. 기능 밖(다른 기능, 앱 연결 코드, `state/` 등)에서는 그 기능의 `index.ts`가 공개한 것만 쓴다.
- 순환 의존 금지.
- 같은 코드가 세 번째로 필요해지면 `shared/`, `main/lib/`, `renderer/lib/`(화면 부품이면 `renderer/components/ui/`)로 옮긴다. 두 번째까지는 중복을 허용한다.
- 파일이 300줄을 넘으면 기능을 더하기 전에 나누는 것부터 제안한다.
- 패턴을 미리 쌓지 않는다. 필요해질 때 추가하고, 추가하면 ADR을 남긴다.

## 5. 크로스 플랫폼 규칙 (macOS·Windows 동시 지원)

`process.platform`과 `exec`/`execSync`는 ESLint가 막는다(`eslint.config.mjs`).

- 경로는 `path` 모듈로만 다룬다. `/`나 `\\`를 하드코딩하지 않는다.
- 셸 명령 문자열을 조립하지 않는다. 외부 프로세스는 `execFile`/`spawn`/node-pty에 argv 배열로 넘긴다. 예외는 사용자가 적은 검사 명령 하나다(사용자의 셸로 실행, ADR-0027).
- 저장소 스크립트는 Node(`scripts/*.mjs`)로 쓴다. bash 전용 스크립트를 만들지 않는다.
- 실행 파일은 `src/main/platform/which.ts`의 `findExecutable`(PATH + PATHEXT)로 찾고, `spawnTarget`으로 실행한다(Windows `.cmd`는 cmd.exe로 감싼다).
- OS별 분기는 `src/main/platform/`에 모은다. 기능 코드에 `process.platform` 분기를 흩뿌리지 않는다.
- 줄바꿈은 LF (`.gitattributes`).

## 6. UI 규칙

- 화면 문자열은 하드코딩하지 않고 i18n 키를 쓴다(`src/shared/locales/ko.json`, `en.json` — main의 메뉴·대화상자도 같은 파일을 쓴다). 키를 추가하면 두 파일 모두에 넣는다.
- 색·간격·글자 크기는 디자인 토큰(`src/renderer/styles/`의 CSS 변수와 Tailwind 테마, 간격은 0.25 단위 눈금)만 쓴다. 예외는 터미널의 ANSI 16색 하나다(`terminal-theme.ts`, 배경·글자·커서·선택 색은 토큰).
- 기본 부품은 `src/renderer/components/ui/`를 재사용한다(파일 행 `PathRow`, 섹션 제목 `SectionLabel`, 빈 안내 `DashedNote` 등). 비슷한 부품을 새로 만들지 않는다. main에서 불러오는 데이터는 `renderer/lib/use-api.ts`의 `useApi`로 받는다.
- Trellis는 IDE가 아니다. 편집기·파일 내용 보기·diff 뷰어를 만들지 않고 외부 편집기로 연다.

## 7. 코드 스타일

- TypeScript strict. 식별자와 주석은 영어. 주석은 "무엇"이 아니라 "왜"가 필요할 때만 쓴다.
- Prettier + ESLint 설정을 따른다.
- `src/shared/`의 순수 로직은 단위 테스트를 같이 쓴다(`*.test.ts`).
- Claude Code에 의존하는 부분(훅 입력 필드, 알림 종류, CLI 플래그, 훅 응답 형식과 대기 시간)은 `src/main/features/agents/claude-code/`에만 둔다. 나머지 코드는 `AgentAdapter`와 정규화된 `TrellisEvent`만 본다. 대표적인 필드·플래그 이름은 ESLint가 막는다.

## 8. 커밋

- Conventional Commits: `type(scope): 한국어 설명`. type은 `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `build`, `ci`, `perf`, `style`.
- 정리(`refactor`)와 기능(`feat`)을 한 커밋에 섞지 않는다.
- 커밋 전에 `npm run check`를 통과시킨다.

## 9. 세션 종료

1. `docs/PLAN.md` §8 체크박스를 갱신한다.
2. `docs/worklog/YYYY-MM-DD.md`에 한 일 / 정한 것 / 문제 / 다음 할 일을 적는다. 다른 에이전트(다른 회사 모델 포함)가 이것만 읽고 이어받을 수 있게 쓴다.
3. 커밋하고, 원격이 있으면 푸시한다.

## 10. 자동 검사

- Claude Code에서는 `.claude/settings.json`의 Stop 훅이 `npm run -s check:stop`을 돌린다. 소스가 바뀌었는데 검사가 실패하면 고칠 때까지 작업이 끝나지 않는다.
- 훅이 없는 에이전트(Codex 등)는 작업을 마칠 때 `npm run check`를 직접 돌린다.

## 11. Trellis로 Trellis를 개발할 때

- 고치는 중인 앱으로 그 앱을 고치지 않는다. 패키지된 안정 빌드에서 Claude를 실행해 `main`을 개발한다.
- `npm run dev`로 띄운 개발 빌드는 데이터 폴더가 따로라 안정 빌드의 프로젝트 목록·이벤트와 섞이지 않는다.
- 앱 변경을 마치면 에이전트가 직접 `npm run install:local`로 안정 빌드를 교체하고, 설치된 빌드 표시(`버전+커밋`)가 HEAD와 맞는지 확인한다. 미누에게 설치 명령을 실행하라고 넘기지 않는다. Trellis가 실행 중이면 종료하는 순간 교체되므로 강제로 끄지 않고 그렇게 알린다.
