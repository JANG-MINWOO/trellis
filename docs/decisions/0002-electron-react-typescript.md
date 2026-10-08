# ADR-0002: Electron + React + TypeScript

- 상태: 채택
- 날짜: 2026-10-09
- 결정한 사람: 에이전트 제안 → 미누 승인

## 결정
데스크톱 앱은 Electron + React + TypeScript로 만든다. 빌드는 electron-vite, 패키징은 electron-builder, 터미널은 xterm.js + node-pty, UI는 Tailwind CSS + Radix 기반 자체 부품.

## 이유
VS Code의 내장 터미널과 같은 조합(xterm.js + node-pty)이라 macOS·Windows 터미널 내장이 가장 검증된 길이다. 오픈소스·교육용으로 퍼뜨릴 때 기여자가 가장 많이 아는 스택이다.

## 대안
- Tauri: 가볍지만 백엔드가 Rust이고 터미널 내장 사례가 적어 초기 시행착오가 크다.
- 로컬 웹앱 + 기존 터미널: 빠르지만 한 창에 합치는 경험을 포기한다.

## 결과와 대가
앱 용량이 크다(100MB+). node-pty가 네이티브 모듈이라 OS별로 빌드해야 한다(CI 매트릭스).
