# ADR-0015: 상위 에이전트 세션의 환경 변수는 지운다

- 상태: 채택
- 날짜: 2026-10-09
- 결정한 사람: 에이전트 (실측 버그 수정)

## 결정
Trellis가 띄우는 모든 프로세스(Claude 탭, 셸 탭)에서 상위 Claude Code 세션이 남긴 표시 변수(`CLAUDECODE`, `AI_AGENT`, `CLAUDE_PID`, `CLAUDE_EFFORT`, `CLAUDE_CODE_ENTRYPOINT`, `CLAUDE_CODE_EXECPATH`, `CLAUDE_CODE_SSE_PORT`, `CLAUDE_CODE_SESSION_*`, `CLAUDE_CODE_CHILD_*`, `CLAUDE_CODE_MESSAGING_*`)를 지운다. 목록은 Claude Code 어댑터의 `scrubInheritedEnv`에만 둔다.

## 이유
Trellis를 Claude Code 안에서 실행하면(셀프 호스팅에서는 항상 그렇다) 새 Claude가 `CLAUDE_CODE_CHILD_SESSION`을 물려받아 "Transcript saving is off"로 동작했다. 대화가 저장되지 않으면 "이어서 하기"가 안 된다. 메시징 토큰 같은 값이 다른 프로세스로 새는 것도 막는다.

## 대안
- 환경을 통째로 비우고 필요한 것만 넘기기: 사용자의 PATH·설정 변수까지 잃는다.

## 결과와 대가
`CLAUDE_CONFIG_DIR`, `CLAUDE_CODE_USE_BEDROCK` 같은 사용자 설정은 남긴다. Claude Code가 새 표시 변수를 추가하면 목록을 갱신해야 한다(실제 claude e2e로 감지).
