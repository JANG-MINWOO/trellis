# ADR-0020: 편집기는 처음 열 때 한 번 묻는다

- 상태: 채택
- 날짜: 2026-10-09
- 결정한 사람: 에이전트 (미누 피드백: VS Code가 자동으로 열리는데 VS Code가 고장 나 있음)

## 결정
설정 기본값을 "처음 열 때 묻기"로 하고, 이 컴퓨터에서 찾은 편집기(VS Code, Cursor, Windsurf, Zed, Sublime, IntelliJ IDEA, WebStorm, PyCharm, Android Studio, Notepad++, TextEdit)와 "기본 앱으로 열기", "Finder/탐색기에서 보기" 중에서 고르게 한다. 고른 편집기가 사라지면 다시 묻는다. JetBrains IDE에는 폴더를 넘기지 않고 파일만 연다.

## 이유
"자동(VS Code 우선)"은 VS Code가 설치돼 있지만 망가진 경우를 알 수 없다(실행은 성공한 것으로 보인다). 어떤 편집기를 쓰는지는 사람이 정할 일이다. JetBrains IDE는 폴더를 열면 `.idea`를 만들어 대상 저장소를 건드린다(무수정 원칙).

## 대안
자동 감지 순서만 바꾸기: 같은 문제가 다른 편집기로 옮겨갈 뿐이다.

## 결과와 대가
0.1.0 설정의 `auto`·`vscode`·`cursor`는 각각 "묻기"와 해당 앱으로 옮긴다.
