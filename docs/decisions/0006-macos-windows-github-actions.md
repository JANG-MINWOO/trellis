# ADR-0006: macOS·Windows 동시 지원, GitHub Actions 빌드

- 상태: 채택 (저장소 공개 여부는 ADR-0030으로 대체)
- 날짜: 2026-10-09
- 결정한 사람: 미누

## 결정
처음부터 macOS와 Windows를 같이 지원한다. 저장소는 미누 개인 계정의 비공개 저장소 `JANG-MINWOO/trellis`이고, GitHub Actions가 macOS·Windows 설치 파일을 만든다.

## 이유
클라이언트에게 빨리 줘야 할 수 있고, 클라이언트는 Windows 사용자가 많다. 처음부터 경로·셸·스크립트를 양쪽 기준으로 짜면 추가 공수가 작고, 나중에 붙이면 크다. node-pty 네이티브 모듈 때문에 Mac에서 Windows 설치 파일을 만들기 어렵다.

## 대안
- Mac에서만 검증하고 Windows PC에서 직접 빌드: 매번 수동이다.
- Mac 먼저, Windows 나중: 나중에 붙이는 공수가 크다.

## 결과와 대가
코드 서명이 없어 처음 실행할 때 macOS Gatekeeper·Windows SmartScreen 경고가 뜬다(서명은 M5에서 비용과 함께 결정). 회사 계정은 쓰지 않는다.
