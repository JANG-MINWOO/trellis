# ADR-0004: AI 분석은 `claude -p` 헤드리스

- 상태: 채택
- 날짜: 2026-10-09
- 결정한 사람: 미누

## 결정
결정 감지·동작 diff 같은 AI 분석은 `claude -p --output-format json --json-schema <스키마> --tools "" --no-session-persistence`로 호출한다.

## 이유
이미 로그인된 Claude Code를 쓰므로 별도 API 키·과금 설정이 없다. 개인 도구 단계에 맞다. 도구를 끄고 스키마를 지정하면 결과 형식이 안정적이다.

## 대안
- Anthropic API 키 직접 호출: 제품화할 때 필요하다. 그때 어댑터를 추가한다.
- 규칙 기반만: 결정 감지가 너무 약하다.

## 결과와 대가
구독 사용량을 같이 쓴다 → 변경이 있을 때만 호출하고, 끌 수 있게 하고, 횟수를 보여준다.

## 덧붙임 (2026-10-10)
실제 인자는 ADR-0023에서 바뀌었다: `-p --restricted --strict-mcp-config --tools "" --no-session-persistence --output-format json --json-schema <스키마> --model <모델>`, 임시 폴더에서 실행. `--restricted`·`--strict-mcp-config`는 사용자의 훅과 MCP 서버가 분석 호출에서 돌지 않게 한다. 인자는 `src/main/features/agents/claude-code/adapter.ts`의 `headlessArgs`에 있다.
