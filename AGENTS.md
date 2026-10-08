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
| `npm run dev` | 개발 빌드 실행 (데이터 폴더 `Trellis-dev`, 안정 빌드와 분리) |
| `npm run check` | 타입 검사 + 린트 + 포맷 검사 + 단위 테스트 + 의존성 규칙. **커밋 전 필수** |
| `npm test` | 단위 테스트 (Vitest) |
| `npm run build` | 프로덕션 번들 (`out/`) |
| `npm run e2e` | Electron 스모크 테스트 (Playwright, 가짜 claude 사용) |
| `npm run dist:mac` / `npm run dist:win` | 설치 파일 생성 (각 OS에서 실행) |
| `npm run format` | Prettier로 포맷 정리 |

## 4. 구조 규칙 — dependency-cruiser가 집행한다 (`.dependency-cruiser.cjs`)

- `src/shared/` — 순수 TypeScript. `electron`, Node 내장 모듈, `react`를 import하지 않는다. main과 renderer가 둘 다 쓴다.
- `src/main/` — renderer·preload를 import하지 않는다.
- `src/preload/` — `shared`만 import한다. 노출 API는 `src/shared/ipc.ts`의 계약을 따른다.
- `src/renderer/` — main·preload를 import하지 않고 Node 내장 모듈을 쓰지 않는다(샌드박스). main과는 `window.trellis` API로만 통신한다.
- **기능 단위 폴더**: `src/main/features/<기능>/`, `src/renderer/features/<기능>/`. 다른 기능의 내부 파일을 직접 import하지 않는다. 그 기능의 `index.ts`가 공개한 것만 쓴다.
- 순환 의존 금지.
- 같은 코드가 세 번째로 필요해지면 `shared/` 또는 `renderer/lib/`로 옮긴다. 두 번째까지는 중복을 허용한다.
- 파일이 300줄을 넘으면 기능을 더하기 전에 나누는 것부터 제안한다.
- 패턴을 미리 쌓지 않는다. 필요해질 때 추가하고, 추가하면 ADR을 남긴다.

## 5. 크로스 플랫폼 규칙 (macOS·Windows 동시 지원)

- 경로는 `path` 모듈로만 다룬다. `/`나 `\\`를 하드코딩하지 않는다.
- 셸 명령 문자열을 조립하지 않는다. 외부 프로세스는 `execFile`/node-pty에 argv 배열로 넘긴다.
- 저장소 스크립트는 Node(`scripts/*.mjs`)로 쓴다. bash 전용 스크립트를 만들지 않는다.
- 실행 파일은 `src/main/platform/`의 탐색 함수(PATH + PATHEXT)로 찾는다.
- OS별 분기는 `src/main/platform/`에 모은다. 기능 코드에 `process.platform` 분기를 흩뿌리지 않는다.
- 줄바꿈은 LF (`.gitattributes`).

## 6. UI 규칙

- 화면 문자열은 하드코딩하지 않고 i18n 키를 쓴다(`src/renderer/i18n/locales/ko.json`, `en.json`). 키를 추가하면 두 파일 모두에 넣는다.
- 색·간격은 디자인 토큰(`src/renderer/styles/`의 CSS 변수와 Tailwind 테마)만 쓴다.
- 기본 부품은 `src/renderer/components/ui/`를 재사용한다. 비슷한 부품을 새로 만들지 않는다.
- Trellis는 IDE가 아니다. 편집기·파일 내용 보기·diff 뷰어를 만들지 않고 외부 편집기로 연다.

## 7. 코드 스타일

- TypeScript strict. 식별자와 주석은 영어. 주석은 "무엇"이 아니라 "왜"가 필요할 때만 쓴다.
- Prettier + ESLint 설정을 따른다.
- `src/shared/`의 순수 로직은 단위 테스트를 같이 쓴다(`*.test.ts`).
- Claude Code에 의존하는 부분(훅 입력 필드, CLI 플래그)은 `src/main/features/agents/claude-code/`에만 둔다.

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
