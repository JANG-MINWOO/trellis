# Trellis

AI 에이전트(Claude Code)와 일하는 동안 프로젝트의 의도 — 무엇을 왜 하는지, 무엇은 절대 안 되는지, 어떤 결정을 내렸는지 — 를 사람이 이해하고 책임지는 상태로 지켜 주는 데스크톱 앱입니다.

*Keep the intent of your project understood while you work with AI agents.*

터미널에서 Claude Code와 대화하는 경험은 그대로 두고, 그 옆에 작업 의도 · 턴별 타임라인 · 영역별로 묶인 변경 · 결정 기록 · 구조 건강을 보여 줍니다.

- 왜 이렇게 만들었나: [docs/BACKGROUND.md](docs/BACKGROUND.md)
- 작업 기준(범위·마일스톤·체크리스트): [docs/PLAN.md](docs/PLAN.md)
- 결정 기록: [docs/decisions/](docs/decisions/)
- 에이전트 작업 규칙: [AGENTS.md](AGENTS.md) (`CLAUDE.md`는 이 파일의 링크)

## 상태

M1(셀프 호스팅 가능한 첫 버전) 진행 중. macOS·Windows를 함께 지원합니다. 코드 서명 전이라 처음 실행할 때 보안 경고가 뜹니다.

## 설치

GitHub Actions가 만든 설치 파일을 받습니다(저장소 Actions 탭의 artifacts, 또는 `v*` 태그의 Releases).

- macOS: `Trellis-<버전>-mac-arm64.dmg`. 서명 전이라 처음에는 Finder에서 앱을 우클릭 → 열기로 실행합니다.
- Windows: `Trellis-Setup-<버전>-win-x64.exe`. SmartScreen이 뜨면 "추가 정보 → 실행"을 누릅니다.

필요한 것: [Claude Code](https://code.claude.com/docs), git.

## 개발

```bash
npm install          # node-pty 실행 권한 복구와 네이티브 모듈 준비까지
npm run dev          # 개발 빌드 (데이터 폴더 Trellis-dev — 안정 빌드와 분리)
npm run check        # 타입·린트·포맷·i18n·구조 규칙·단위 테스트 (커밋 전 필수)
npm run e2e          # 가짜 claude로 전 구간 스모크 테스트
TRELLIS_REAL_CLAUDE=1 npx playwright test real-claude   # 실제 claude (구독 사용량 소모)
npm run dist:mac     # macOS 설치 파일 (Windows 설치 파일은 Windows에서 dist:win)
```

Trellis로 Trellis를 개발할 때는 패키지된 안정 빌드에서 Claude를 실행하고, 그 안에서 `npm run dev`로 개발 빌드를 띄웁니다(ADR-0011).
