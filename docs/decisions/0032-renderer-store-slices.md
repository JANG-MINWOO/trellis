# ADR-0032: renderer 상태는 store 하나를 slice 파일로 나눠 둔다

- 상태: 채택
- 날짜: 2026-10-16
- 결정한 사람: 에이전트 제안 (0.2.0 고정 점검) → 미누 진행 승인

## 결정
renderer의 Zustand store는 하나로 두고, 관심사별 slice 파일로 나눈다. `state/slices/`에 app(부팅·설정), projects(프로젝트 목록·선택)와 ledger(이벤트 원장·백그라운드 상태), terminals(탭), changes(변경 조회), ui(오른쪽 탭·설정 창·알림·편집기 선택)를 두고, 모양은 `state/types.ts`, 조립은 `state/store.ts`가 맡는다. main이 보내는 갱신을 store에 반영하는 코드는 `state/subscriptions.ts`의 `subscribeToMain()` 하나에 모은다. 가져다 쓰는 쪽은 지금처럼 `useStore`·`useActiveProject`만 쓴다.

## 이유
store.ts가 367줄로 AGENTS.md의 300줄 기준을 넘었고, 여섯 가지 관심사와 IPC 구독이 한 파일에 섞여 있었다. 프로젝트를 고르면 이벤트를 읽고 변경을 새로 고치고 Claude를 띄우는 것처럼 동작이 서로를 부르므로, store를 여러 개로 쪼개면 그 호출이 모두 바깥 조립 코드로 나간다.

## 대안
- store 여러 개: 서로 부르는 동작 때문에 연결 코드가 늘고, 한 번의 변경이 여러 store에 걸친다.
- 그대로 두기: 기능을 더할 때마다 한 파일이 커진다.

## 결과와 대가
slice끼리는 `get()`으로 서로의 동작을 부른다(타입은 `StoreState` 하나라 컴파일러가 확인한다). 타입 파일과 slice 파일 사이의 순환을 피하려고 모든 slice의 모양을 `state/types.ts` 한 곳에 둔다.
