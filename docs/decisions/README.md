# 결정 기록 (ADR)

결정 하나에 파일 하나. 짧게 쓴다. 길어지면 결정이 두 개 이상 섞인 것이다.
결정을 뒤집을 때는 원래 파일을 지우지 않고, 새 ADR을 쓰고 원래 파일의 상태를 `대체됨 (ADR-XXXX)`으로 바꾼다.

## 템플릿

```markdown
# ADR-XXXX: 제목

- 상태: 제안 | 채택 | 대체됨 (ADR-YYYY)
- 날짜: YYYY-MM-DD
- 결정한 사람: 미누 / 에이전트 제안 → 미누 승인 등

## 결정
무엇을 하기로 했나 (1~3줄)

## 이유
왜 (1~3줄)

## 대안
검토했지만 고르지 않은 것과 그 이유

## 결과와 대가
이 결정으로 얻는 것, 감수하는 것
```

## 목록

| 번호 | 제목 | 상태 |
|---|---|---|
| [0001](0001-intent-layer-over-code-visualization.md) | 코드 시각화가 아니라 의도 레이어를 지키는 도구 | 채택 |
| [0002](0002-electron-react-typescript.md) | Electron + React + TypeScript | 채택 |
| [0003](0003-event-bridge-http-hooks-via-settings-flag.md) | 이벤트 브리지: `--settings`로 붙이는 HTTP 훅, 대상 저장소 무수정 | 채택 |
| [0004](0004-ai-analysis-via-claude-headless.md) | AI 분석은 `claude -p` 헤드리스 | 채택 |
| [0005](0005-claude-md-symlink-to-agents-md.md) | `CLAUDE.md`는 `AGENTS.md`의 심볼릭 링크 | 채택 |
| [0006](0006-macos-windows-github-actions.md) | macOS·Windows 동시 지원, GitHub Actions 빌드 | 채택 |
| [0007](0007-languages.md) | 언어: 저장소 문서·커밋은 한국어, 코드는 영어, 앱은 ko/en | 채택 |
| [0008](0008-layout-b.md) | 레이아웃 B: 터미널 가운데, 패널 오른쪽 | 채택 |
| [0009](0009-agnostic-core-with-adapters.md) | 스택·에이전트 무관 핵심 + 어댑터 | 채택 |
| [0010](0010-personal-tool-first.md) | 개인 도구로 시작, 검증 후 제품화 결정 | 채택 |
| [0011](0011-stable-build-develops-dev-build.md) | 안정 빌드로 개발 빌드를 고친다 | 채택 |
| [0012](0012-three-layer-intent-single-source.md) | 의도 레이어 3층, 원본 하나 | 채택 |
| [0013](0013-claude-runs-as-pty-process.md) | Claude 탭은 셸 없이 claude를 직접 실행 | 채택 |
| [0014](0014-changes-from-git-snapshots.md) | 변경은 git 임시 인덱스 스냅샷으로 계산한다 | 채택 |
| [0015](0015-scrub-parent-agent-env.md) | 상위 에이전트 세션의 환경 변수는 지운다 | 채택 |
