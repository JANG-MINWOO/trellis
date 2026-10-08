# ADR-0003: 이벤트 브리지 — `--settings`로 붙이는 HTTP 훅, 대상 저장소 무수정

- 상태: 채택
- 날짜: 2026-10-09
- 결정한 사람: 에이전트 제안 → 미누 승인

## 결정
Trellis가 claude를 실행할 때 `--settings <앱 데이터 폴더의 생성 파일>`로 HTTP 훅(`"type": "http"`)을 붙인다. 훅은 `http://127.0.0.1:<포트>/events`로 이벤트 JSON을 POST하고, 토큰과 프로젝트 ID는 `allowedEnvVars`로 허용한 환경 변수를 헤더에 넣어 보낸다. 대상 저장소의 `.claude` 설정은 수정하지 않는다.

## 이유
- `--settings`로 넣은 훅은 사용자·프로젝트 훅과 병합되어 함께 돈다(공식 문서: 훅은 설정 단계 간 병합). minu-future처럼 훅이 많은 저장소의 기존 체계를 건드리지 않는다.
- HTTP 훅은 셸이 필요 없어 Windows(Git Bash/PowerShell 차이)에서도 같다. 서버가 꺼져 있거나 오류여도 non-blocking이라 Claude가 멈추지 않는다. 2xx 빈 응답은 아무 영향이 없다.
- TUI 화면 파싱은 업데이트마다 깨진다.

## 대안
- 대상 저장소 `.claude/settings.local.json`에 훅 설치: 저장소를 건드리고, 지우는 걸 잊으면 남는다.
- command 훅 + Node 스크립트: Windows에서 셸·Node 경로 문제가 생긴다.
- 화면 출력 파싱: 깨지기 쉽다.

## 결과와 대가
Trellis 밖에서(또는 셸 탭에서 직접) 실행한 claude는 이벤트가 안 잡힌다. 진실은 git에서 계산하므로 변경 패널은 여전히 맞다. 셸 탭 자동 연결은 열린 질문(PLAN §13). Claude Code 2.1.294 기준으로 확인했고, 필드 이름 의존은 `src/main/features/agents/claude-code/`에만 둔다.
