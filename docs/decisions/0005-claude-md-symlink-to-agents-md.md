# ADR-0005: `CLAUDE.md`는 `AGENTS.md`의 심볼릭 링크

- 상태: 채택
- 날짜: 2026-10-09
- 결정한 사람: 미누

## 결정
에이전트 규칙의 원본은 `AGENTS.md` 하나다. `CLAUDE.md`는 그 파일을 가리키는 심볼릭 링크로 둬서 두 파일이 항상 같다.

## 이유
Claude Code와 GPT 계열 에이전트를 번갈아 쓸 수 있다. 두 파일을 따로 두면 어긋난다(두 벌 금지). Claude Code는 `CLAUDE.md`가 있으면 그것을 읽으므로 링크로 같은 내용을 보게 한다.

## 대안
- `CLAUDE.md`에 `@AGENTS.md` import 한 줄: 내용이 달라 보이고 도구마다 해석이 다르다.
- `CLAUDE.md` 없이 `AGENTS.md`만: 최신 Claude Code는 읽지만 구버전·다른 도구와 명시성이 떨어진다.

## 결과와 대가
Windows에서 git 심볼릭 링크는 `core.symlinks`가 꺼져 있으면 텍스트 파일로 풀린다. 그 경우 `CLAUDE.md`를 열면 `AGENTS.md`라는 한 줄만 보인다 — Windows에서 개발할 때 확인한다.
