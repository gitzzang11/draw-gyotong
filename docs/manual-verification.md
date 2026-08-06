# 수동 플레이 흐름 검증 절차

이 문서는 구조 리팩터링 이후의 연장·연결·분기·공사 완료·저장 복원 흐름을 브라우저에서 확인하기 위한 절차다. 이번 작업은 게임 규칙, 저장 스키마, TransitRouter, 경제 공식, UI 구조를 바꾸지 않는다.

## 테스트 상태 준비

개발 모드에서만 `window.__drawGyotongManualVerification` 훅이 설치된다. 일반 세이브에는 노출되지 않는다.

1. 개발 서버를 별도 수동 검증 세션에서 실행하고 앱을 연다. 이 작업에서는 개발 서버를 실행하지 않았다.
2. 브라우저 DevTools Console에서 다음을 실행한다.

   ```js
   await window.__drawGyotongManualVerification.seed()
   ```

3. 시드가 적용되면 다음으로 현재 상태와 업데이트 trace를 확인한다.

   ```js
   const { state, updateTrace } = window.__drawGyotongManualVerification.inspect()
   console.table(state.routes.map(({ id, name, coordinates, branches }) => ({ id, name, points: coordinates.length, branches: branches?.length ?? 0 })))
   console.log({ stationCount: state.stations.length, depotCount: state.depots.length, fleetCount: state.trainFleets.length, cash: state.economy.cash, updateTrace })
   ```

4. 지도에서 `Manual Main`, `Manual Cross` 두 운영 노선과 각 3개 역, 열차 아이콘, `Manual Main Depot`을 확인한다. `Main Transfer`와 `Cross Transfer`는 환승 후보이며, `Main East`와 `Cross East`는 물리 연결 후보 종점이다.
5. 공사 기간을 빠르게 보려면 시뮬레이션 속도를 `x100`으로 두고, 노선에 강·산악 장애물을 추가하지 않는다. 시드는 `career` + `easy` + 현금 `500,000`으로 생성되므로 커리어 규칙과 공사 타임라인을 유지하면서 비용 부족을 피한다.
6. 각 시나리오 시작 전에 같은 `seed()`를 다시 실행한다. 슬롯 ID는 `manual-verification`으로 고정되므로 테스트 슬롯만 덮어쓰며 다른 일반 세이브는 수정하지 않는다.

시드의 주요 고정 ID는 `manual-main-line`, `manual-branch-line`, `manual-main-depot`, `manual-main-transfer`, `manual-branch-transfer`, `manual-main-east`, `manual-branch-east`다.

## 공통 확인 방법

- 화면: workspace 탭은 `관리`, `계획`, `공사`를 사용한다. 도구는 `연장`, `연결`, `분기`, `환승`, `기지`, `실행 취소`, `다시 실행`을 사용한다.
- 저장: 게임 메뉴의 저장 탭에서 현재 슬롯을 수동 저장한다. 새로고침 뒤 시작 화면의 `Manual Verification` 슬롯을 다시 연다.
- 데이터: `window.__drawGyotongManualVerification.inspect().state`에서 `routes`, `stations`, `transfers`, `depots`, `plans`, `constructionProjects`, `trainFleets`, `passengerGroups`를 확인한다.
- 업데이트: 각 작업 직전에 `inspect().updateTrace`를 복사하고 직후 다시 조회한다. 시나리오에서 명시한 허용 범위를 벗어난 unrelated domain이 증가하지 않아야 한다.
- 콘솔: `[integrity]`, `duplicate`, `orphan`, `missing`, `unhandledrejection`, `TransitRouter`, `state recovery` 관련 오류가 없어야 한다. 저장·복원 중 `console.error`가 새로 발생하면 실패로 기록한다.

## A. 3단 연속 연장

### 준비 상태

시드를 다시 적용한다. `manual-main-line`을 완공 노선으로 사용하고 `Manual Main`의 동쪽 끝점에서 시작한다. 계획은 빈 상태여야 한다.

### 사용 도구와 정확한 조작 순서

1. `계획` workspace를 선택하고 `연장` 도구를 연다.
2. `Manual Main`의 `Main East` 끝점에서 새 종점까지 드래그하고 건설 미리보기에서 확정한다.
3. 계획에 생긴 1차 계획 끝점에서 다시 `연장`을 시작해 2차 종점까지 드래그하고 확정한다.
4. 2차 계획 끝점에서 다시 같은 방식으로 3차 연장을 확정한다. 각 단계 사이에 계획 목록에서 이전 계획 route가 유지되는지 확인한다.
5. 1차·2차·3차가 모두 보이는 상태에서 계획을 저장한다. 새로고침 후 `Manual Verification` 슬롯을 열고 계획을 다시 확인한다.
6. `실제 건설 전환`을 열고 세 연장 route의 모든 segment를 선택해 공사 프로젝트로 전환한다.
7. `공사 현황`에서 부모 프로젝트부터 `노선 개통`한다. 자식 프로젝트가 먼저 개통되지 않는지 확인한 뒤, 부모 → 2차 → 3차 순서로 완료한다.

### 화면에서 보여야 하는 결과

- 계획 미리보기는 같은 색상과 노선 이름으로 한 줄의 연속된 연장처럼 보인다.
- 1차 프로젝트가 개통되기 전에는 2차가 선행 공사 미완료로 열리지 않는다.
- 세 번째 개통 후 지도에서 최종 종점까지 한 노선의 선로와 운행 경로가 이어진다.

### 데이터적으로 확인할 결과

- 새로고침 전 계획 route의 `rootLineId === targetLineId`가 세 route 모두 참이다.
- `parentBlueprintId`는 2차가 1차를, 3차가 2차를 가리키며 root는 모두 최초 노선과 같다.
- `state.routes`에 `manual-main-line` 외의 새 `TransportLine`이 생기지 않는다.
- 최초 노선의 `name`, `color`, `id`, 기존 `trainFleets[].routeId`, `depots[].connectedRouteIds`가 유지된다.
- 최종 route의 `coordinates`, `nodes`, `segments`가 최초 저장 시점보다 늘고 `manual-main-line`을 포함한 경로 탐색이 가능하다.

### 저장 후 기대 결과

새로고침 뒤 계획의 부모/자식 순서, 공사 상태, 노선 ID, 열차/기지 참조가 동일해야 한다. 최종 개통 뒤에도 노선 수가 2개로 유지되어야 한다.

### 발생하면 안 되는 update domain

계획 작성 중 `map-blueprints`, `workflow`, `storage`는 허용한다. 공사 완료 때 네트워크·노선·수요·용량·혼잡·선로/역/열차 지도와 HUD 갱신은 허용한다. 연장만으로 `map-depots`, `map-lod`, unrelated full flush가 추가되면 안 된다.

### 발생하면 안 되는 콘솔 오류

`Extension target route missing`, `Parent extension ... must be converted first`, `extension-line-identity`, duplicate route/segment ID, orphan train/depot, router rebuild failure.

## B. 환승 연결

### 준비 상태

시드를 다시 적용한다. `transfers`가 빈 배열이고 `Main Transfer`와 `Cross Transfer` 두 운영 역이 지도에 보이는지 확인한다.

### 사용 도구와 정확한 조작 순서

1. `계획` workspace에서 `환승` 도구를 선택한다.
2. `Main Transfer`와 `Cross Transfer`를 차례로 클릭한다. 계획 카드에 예정 환승 연결이 1개 생기는지 확인한다.
3. 이 시점에 저장하고 `plan.transfers`와 `state.transfers`를 비교한다. 전자는 예정 1개, 후자는 여전히 0개여야 한다.
4. 계획 목록에서 `실제 건설 전환`을 열고 환승 항목만 선택해 확정한다. 현재 구현에서는 실제 역 2개를 연결하는 계획 환승이 전환 확정 시 runtime transfer로 적용된다. 별도 환승 전용 `ConstructionProject`가 생기지 않는 것은 이 경로의 현재 규칙이다.
5. 두 역 패널을 각각 열어 환승역 표시, 연결 노선 목록, 환승 시간, 환승 저항을 확인한다.
6. 시뮬레이션을 `x2` 이상으로 한 게임일 진행하고 승객 경로/운영 분석에서 두 노선 간 경로를 확인한다.
7. 저장 후 새로고침하고 두 역 패널과 승객 경로를 다시 확인한다.

### 화면에서 보여야 하는 결과

환승 전에는 두 역이 일반 역이고, 전환 후에는 하나의 환승 관계로 표시된다. 패널에는 양쪽 노선이 보이며 환승 시간과 저항 값이 0이 아닌 계산값으로 표시된다. 승객 경로에는 환승 1회가 표시된다.

### 데이터적으로 확인할 결과

- `transfers`에 유효한 항목 하나만 있고 `stationIds`는 두 역을 양방향으로 포함한다.
- 두 station의 `transferGroupId`가 같은 transfer ID다.
- 두 station의 `connectedRouteIds`와 transfer의 연결 노선 목록이 일치한다.
- 동일 역쌍을 다시 선택해도 transfer가 추가되지 않는다.
- `passengerGroups[].journey.transferStationIds`, `transferCount`, `transferTimeMin`, `routeIds`가 실제 경로와 일치한다.

### 저장 후 기대 결과

새로고침 뒤 transfer ID, 양쪽 station의 `transferGroupId`, 시간/저항, 승객 journey가 유지된다. transfer가 2개로 늘거나 역이 복제되면 실패다.

### 발생하면 안 되는 update domain

환승은 route geometry를 바꾸지 않으므로 `map-depots`, `map-trains`, `map-lod`, `map-construction`의 unrelated 증가가 없어야 한다. 환승 적용에 따른 `network`, `demand`, `capacity`, `congestion`, `map-stations`, `active-panel`, `storage`는 허용한다.

### 발생하면 안 되는 콘솔 오류

`Duplicate transfer`, `transfer-group` 중복, station missing, `orphan-passenger-path`, `orphan transfer member`, journey 생성 예외.

## C. 물리 선로 연결

### 준비 상태

시드를 다시 적용하고 `plans.connections`가 비어 있는지 확인한다. `Main East`와 `Cross East`가 서로 가까운 두 종점이며 각각 실제 역을 가지고 있는지 확인한다.

### 사용 도구와 정확한 조작 순서

1. `계획` workspace에서 각 실제 종점에서 짧은 `연장`을 하나씩 만들어 두 개의 계획 endpoint를 만든다. 두 계획 endpoint가 지도에서 충분히 가까워야 한다.
2. `연결` 도구로 첫 번째 계획 endpoint에서 두 번째 계획 endpoint까지 드래그한다.
3. 연결 방식에서 `physical-track`을 선택하고 연결 계획을 확정한다. 계획 카드에 물리 연결 항목이 1개 생겨야 한다.
4. 저장한 뒤 계획 상태를 확인한다. 이 시점에는 실제 선로와 TransitRouter가 아직 바뀌지 않아야 한다.
5. 두 연장 segment와 physical-track 연결을 함께 `실제 건설 전환`한다.
6. `공사 현황`에서 선행 연장 공사를 완료한 다음 physical-track 연결 공사를 완료·개통한다.
7. 지도 선로, 노선 패널, 승객 경로에서 양방향 연결을 확인한다.
8. 저장 후 새로고침하고 같은 경로를 다시 조회한다.

### 화면에서 보여야 하는 결과

공사 전에는 점선 계획만 보이고 실제 선로가 추가되지 않는다. 완료 후에는 실제 선로와 연결 branch/segment가 지도에 한 번만 나타나고, 양방향으로 경로가 검색된다.

### 데이터적으로 확인할 결과

- `plans.connections`의 항목이 `status: "completed"`, 양수 `appliedAt`, 비어 있지 않은 `actualEntityIds`를 가진다.
- `connectionType`이 `physical-track`이고 source/target station·line ID가 모두 실제 entity를 가리킨다.
- 실제 `RouteSegment`가 생성되고 연결 segment ID가 중복되지 않는다.
- `inspect().state`의 route graph와 TransitRouter의 양방향 journey 결과가 일치한다.

### 저장 후 기대 결과

새로고침 뒤 같은 연결 blueprint가 다시 적용되지 않고, `actualEntityIds`와 `appliedAt`가 보존된다. 연결 segment와 branch 수가 증가하지 않아야 한다.

### 발생하면 안 되는 update domain

공사 전 계획 단계에는 `map-blueprints`, `workflow`, `storage`만 확인한다. 완료 단계에는 network/route/demand/capacity/congestion/map-lines/map-stations/map-trains가 허용되며 `map-depots`, `map-lod`는 unrelated다. 물리 연결 하나 때문에 `map-stations`가 중복으로 생성되면 안 된다.

### 발생하면 안 되는 콘솔 오류

`Physical connection endpoints are incomplete`, `Physical connection source endpoint is missing`, duplicate connection segment, `connection ... has no applied runtime result`, router direction mismatch.

## D. 차량기지 연결

### 준비 상태

시드의 `Manual Main Depot`은 `manual-main-line`에만 연결되어 있고 `manual-branch-line`에는 연결되지 않는다. 두 노선 모두 기존 열차 1편성이 있으므로 branch 노선의 추가 구매/배정으로 capacity guard를 확인한다.

### 사용 도구와 정확한 조작 순서

1. branch 노선 패널에서 열차 관리 화면을 연다.
2. 연결 공사 전 열차 추가 구매 또는 배정 수량 증가를 시도한다. 차량기지 용량 부족/연결 없음으로 차단되어야 한다.
3. 계획/건설 화면에서 branch에 대한 차량기지 연결 계획을 만든다. 현재 UI에서 `depot-access` blueprint 선택지가 노출되지 않으면 그 사실을 기록하고, 이 시나리오는 저장 데이터 경로의 브라우저 검증 보류로 표시한다. 이 작업 범위에서는 해당 UI 경로를 새로 만들지 않는다.
4. 연결 공사가 제공되는 환경에서는 공사 전 상태를 저장하고, 공사를 완료·개통한 뒤 branch 노선 패널로 돌아온다.
5. 열차 구매·배정을 다시 시도하고 차량기지 패널과 노선 패널을 비교한다.

### 화면에서 보여야 하는 결과

공사 전에는 branch 노선이 연결 차량기지 0개이고 신규 편성 버튼이 차단된다. 공사 후에는 연결 차량기지 이름/용량이 보이고 구매·배정이 가능해진다.

### 데이터적으로 확인할 결과

- 공사 전 `manual-main-depot.connectedRouteIds`에 branch ID가 없다.
- 공사 후 depot의 `connectedRouteIds`에 branch ID가 정확히 한 번 추가된다.
- depot-access 완료 blueprint의 `appliedAt`, `actualEntityIds`가 유지되고 depot access segment가 중복되지 않는다.
- fleet의 `routeId`, depot capacity, line panel의 연결 depot 정보가 일치한다.

### 저장 후 기대 결과

새로고침 후 branch의 depot 연결과 구매한 fleet가 유지된다. depot 패널과 line panel의 노선 목록이 서로 달라지면 실패다.

### 발생하면 안 되는 update domain

공사 전 구매 차단 시 `storage`, `active-panel`, `hud-status` 외에 네트워크 구조 갱신이 발생하면 안 된다. 공사 완료 후에는 `network`, `capacity`, `finance`, `map-depots`, `map-trains`, `active-panel`, `storage`가 허용되며 `map-blueprints`만 반복해서 남으면 안 된다.

### 발생하면 안 되는 콘솔 오류

`Depot access target is missing`, `Depot access route is missing`, `orphan fleet`, depot capacity NaN, duplicate depot-access segment.

## E. Junction 분기

### 준비 상태

시드를 다시 적용한다. `Manual Main`의 가운데 segment와 `Main Transfer` 주변을 사용한다. 해당 route에는 branch가 0개여야 한다.

### 사용 도구와 정확한 조작 순서

1. `관리` 또는 계획/공사에서 `분기` 도구를 선택한다.
2. `Manual Main` 가운데 본선 segment를 클릭한다. junction 생성 확인 창에서 확정한다.
3. 표시된 junction point에서 지선 종점까지 드래그하고 건설 미리보기에서 확정한다.
4. 공사 타임라인이 표시되면 `공사 현황`에서 지선 프로젝트를 완료하고 개통한다.
5. 본선의 양쪽 기존 station 간 경로와 지선 junction→terminal 경로를 각각 조회한다.
6. 저장 후 새로고침하고 지도/노선 패널/경로를 다시 확인한다.

### 화면에서 보여야 하는 결과

기존 본선은 끊기지 않고, junction에서 지선이 갈라져 별도 terminal까지 연결된다. 노선 목록에는 원본 line 하나만 남는다.

### 데이터적으로 확인할 결과

- 완료 전 원본 segment ID가 아직 남아 있고 junction blueprint가 `under-construction`이다.
- 완료 후 원본 segment는 제거되고 `source:a:junctionId`, `source:b:junctionId` 형태의 앞·뒤 segment가 생긴다.
- 본선의 기존 `lineId`와 기존 station/fleet/depot 참조가 유지된다.
- route에 branch와 branch segment가 1개 추가되고, 별도 `RouteLine`/`TransportLine`은 생성되지 않는다.
- 본선 양끝 및 본선→지선 경로가 모두 TransitRouter에서 검색된다.

### 저장 후 기대 결과

새로고침 후 원본 segment가 다시 살아나지 않고, junction/branch ID와 split segment ID가 동일하다. 중복 branch가 없어야 한다.

### 발생하면 안 되는 update domain

분기 완료는 `network`, `routes`, `demand`, `capacity`, `congestion`, `map-lines`, `map-stations`, `map-trains`, `active-panel`, `storage`가 허용된다. `map-depots`와 `map-lod`는 변경 대상이 아니며, `network` 없이 `map-lines`만 바뀌거나 반대로 갱신이 누락되면 안 된다.

### 발생하면 안 되는 콘솔 오류

`Junction source segment is missing`, `Junction branch geometry is invalid`, duplicate branch ID, duplicate segment ID, main path unreachable, router graph rebuild error.

## F. 비연결 교차

### 준비 상태

시드를 다시 적용한다. 두 노선은 중앙부에서 교차하지만 `transfers`와 `plans.connections`는 비어 있다.

### 사용 도구와 정확한 조작 순서

1. 두 노선 중앙부가 화면에 같이 보이도록 확대한다.
2. `연결` 도구로 연결 후보를 만든 뒤 연결 방식에서 `crossing-only`/`연결하지 않고 교차`를 선택해 확정한다. 현재 관리 모드의 선택지는 `교차`로 표시될 수 있다.
3. 계획/공사 화면에서 crossing-only blueprint가 완료된 것으로 표시되는지 확인한다.
4. 교차 전과 같은 두 station pair의 승객 경로를 비교한다.
5. 저장 후 새로고침하고 `transfers`, `junctions`, physical link를 다시 확인한다.

### 화면에서 보여야 하는 결과

두 선은 시각적으로 교차하지만 transfer 아이콘, junction 분기점, 물리 선로 branch는 없다. 승객 경로와 노선 운행 결과는 교차 전과 같다.

### 데이터적으로 확인할 결과

- crossing blueprint만 완료되고 `connectionType`은 `crossing-only`다.
- `graphVersion`과 실제 RouteSegment 수가 변하지 않는다.
- `transfers`에 새 항목이 없고 route의 `branches`가 증가하지 않는다.
- passenger journey의 `routeIds`, `transferCount`, `totalTimeMin`이 교차 전과 같다.

### 저장 후 기대 결과

새로고침 후 crossing 기록과 `appliedAt`/`actualEntityIds`가 필요한 경우 보존되지만, 실제 network graph와 router 결과는 변하지 않는다.

### 발생하면 안 되는 update domain

crossing-only 완료는 `network`, `routes`, `demand`, `capacity`, `congestion`, `map-lines`, `map-stations`, `map-trains`, `map-depots`를 발생시키면 안 된다. blueprint/공사 표시와 `storage`, 필요한 `active-panel`만 허용한다.

### 발생하면 안 되는 콘솔 오류

`Duplicate crossing`, physical connection 생성 로그, junction split 로그, transfer duplicate, router graph version 증가 오류.

## G. 저장·Undo·Redo

### 준비 상태

각 시나리오를 실행하기 전후에 사용할 수 있도록 seed 슬롯을 기준점으로 둔다. 브라우저 DevTools의 Preserve log를 켠다.

### 사용 도구와 정확한 조작 순서

1. A~F 중 하나의 작업을 최소 1개 수행하고, 계획 저장 또는 게임 메뉴의 빠른 저장을 실행한다.
2. 즉시 새로고침하고 `Manual Verification` 슬롯을 열어 지도·패널·공사 목록을 비교한다.
3. 설계 상태에서 가능한 작업을 하나 추가한 뒤 `실행 취소`를 누르고 계획/지도/패널을 확인한다.
4. `다시 실행`을 누르고 같은 작업이 한 번만 복원되는지 확인한다.
5. 같은 작업에서 Undo/Redo 버튼을 여러 번 빠르게 눌러도 중복 시설·중복 segment·중복 project가 생기지 않는지 확인한다.
6. 다시 저장·새로고침하고 최종 상태를 확인한다.

### 화면에서 보여야 하는 결과

Undo는 직전 설계만 제거하고 Redo는 같은 설계를 한 번만 복원한다. 새로고침 후 지도, 패널, 공사 상태, 승객 경로가 같은 상태를 가리킨다.

### 데이터적으로 확인할 결과

- 저장 전후 entity ID가 유지되고, 동일 ID의 duplicate가 없다.
- 완료된 connection은 `appliedAt`과 `actualEntityIds`를 유지한다.
- route/station/depot/fleet/project 참조가 모두 현재 entity를 가리킨다.
- 저장·복원 후 TransitRouter가 stale cache를 사용하지 않고 현재 route graph로 양방향 경로를 반환한다.

### 저장 후 기대 결과

새로고침 후 Undo/Redo stack 자체를 복원할 필요는 없지만, 저장된 현재 세계 상태는 마지막 flush와 같아야 한다. 현재 슬롯 외 일반 슬롯의 route/station 수는 변하지 않아야 한다.

### 발생하면 안 되는 update domain

설계 Undo/Redo는 `network-structure`와 저장/패널 갱신이 허용된다. `map-lod`, unrelated `map-depots`, 임의의 `hud-clock`, 매 작업마다 `full`만 반복하는 갱신은 없어야 한다. 새로고침은 초기 reconcile에 따른 full update 1회를 허용한다.

### 발생하면 안 되는 콘솔 오류

`The root game state is not serializable`, `Completed connection ... has no applied runtime result`, `non-finite`, `duplicate-id`, `orphan-*`, unhandled rejection, state recovery rollback error.

## 자동 테스트와 브라우저 필수 검증의 경계

자동 테스트로 확인되는 항목은 다음과 같다.

- blueprint lifecycle, extension dependency, transfer duplicate 방지, physical/depot/crossing lifecycle
- junction 완료 시 원본 segment split 및 branch 생성 규칙
- network reference 정리, 양방향 transfer membership, orphan fleet/passenger 제거
- TransitRouter의 transfer/physical link 양방향 경로와 캐시 무결성
- JSON/IndexedDB/local recovery 저장 직렬화와 ID 보존
- 이번 테스트 시드의 2노선·역·열차·기지·후보 종점·환승 후보·커리어 자금 조건

반드시 브라우저에서 확인해야 하는 항목은 다음과 같다.

- 실제 지도 pointer gesture와 endpoint/segment snap
- 계획/공사/관리 workspace 전환과 패널 표시
- 공사 기간, 부모 프로젝트 dependency, `노선 개통` 활성 조건
- 지도 선로와 station/depot/train 렌더링의 중복 여부
- 저장 후 실제 새로고침 및 IndexedDB 슬롯 복원
- 실제 승객 경로와 패널 수치의 동기화
- Console의 무결성 오류 및 update trace의 unrelated domain

### 차량기지 연결 경로 메모

현재 코드에는 `depot-access` blueprint lifecycle과 runtime 적용 로직은 있지만, 일반 UI에서 해당 blueprint를 생성하는 선택 경로가 보이지 않을 수 있다. 이 경우 D는 실패로 단정하지 말고 “브라우저 UI 생성 경로 부재로 보류”로 기록한다. 이번 범위에서는 이를 새 UI나 공사 규칙으로 보완하지 않는다.
