# Phase 3 architecture baseline

Date: 2026-09-06

## Quick-save investigation

### Classification

The missing start-screen slot was a regression introduced by the save-facade
extraction, not an IndexedDB transaction failure or an in-app-browser-only
limitation.

`map.whenReady()` can start `BootstrapController.initialize()` while the module
is still being evaluated. Startup then calls `listSaveSlots()`. The extracted
`saveFacade` was declared much later in the module, so this first access hit its
temporal dead zone. `initializeGameShell()` caught that error and replaced the
slot list with `[]`, which also explains why no console error was reported.

Git HEAD before the extraction displayed a newly saved slot after reload in
Chrome. The extracted version reproduced the empty start-screen list in the
same browser. Moving facade construction before `map.whenReady()` restored the
existing behavior. A source-order characterization test protects this bootstrap
constraint.

### Call and completion semantics

```text
menuQuickSaveButton click
  -> saveCurrentSlot("수동 저장") is invoked without awaiting its Promise
  -> current metadata timestamp is replaced
  -> SaveFacade.flush()
  -> SaveRepository cancels an existing debounce timer, captures cloneState(),
     and drains the write immediately
  -> SaveSlotService.update()
  -> toSaveData()
  -> IndexedDbRepository.put()
  -> localStorage fallback write + IndexedDB read/write transaction
  -> IndexedDbRepository waits for transaction.oncomplete
  -> SaveSlotService/SaveFacade/SaveRepository Promise resolves
  -> saveCurrentSlot refreshes slotSummaries through SaveFacade.list()
  -> saveCurrentSlot updates the compact save-status label
```

The menu's `저장 완료` text and toast are currently emitted synchronously by
the click handler after the Promise is started. They mean `SAVE_REQUESTED`, not
`SAVE_PERSISTED`. The compact status label inside `saveCurrentSlot` is updated
after persistence and slot enumeration resolve, and therefore means
`SAVE_PERSISTED`. This is existing UI behavior and was not changed here.

Answers to the investigation questions:

| Question | Finding |
| --- | --- |
| A | The menu success UI does not await persistence. `saveCurrentSlot` itself does await the backend and enumeration. |
| B | Quick-save uses `flush()`, which cancels a pending debounce timer and starts/joins the write immediately. The visible gap is caused by the un-awaited UI handler, not an extra facade debounce. |
| C | A normal pending debounced request is not guaranteed by an unload handler. `visibilitychange` attempts a background `saveCurrentSlot` flush, but there is no synchronous unload guarantee. |
| D | `IndexedDbRepository.withStore()` awaits both the request and `transaction.oncomplete`. |
| E | Current-session refresh and startup enumeration both use `SaveFacade.list()` -> `SaveSlotService.list()` -> `IndexedDbRepository.getAll()`. |
| F | The screen renders the in-memory `slotSummaries`, but startup refreshes it from storage. The observed empty cache came from the swallowed TDZ exception. Other-tab storage changes are not actively synchronized. |
| G | Web storage is origin scoped. Web host/port/scheme changes create separate namespaces. Capacitor config specifies `https` for the Android scheme, so its application origin is distinct from development HTTP origins. |

### Chrome reproduction

Chrome on `http://127.0.0.1:5173` reproduced the regression before the fix:
the current-session load list contained the slot, while the start screen was
empty after reload. Console warnings/errors were empty. Git HEAD served from a
separate local port retained and loaded its slot. After the initialization-order
fix, the extracted build also retained, enumerated, and loaded the original
slot after reload with its sandbox cash and metadata intact.

Direct IndexedDB/localStorage inspection was not performed because the browser
automation page context intentionally does not expose those storage APIs. The
application's backend transaction behavior is covered by repository tests.

## Browser manual baseline

| Scenario | Status | Evidence |
| --- | --- | --- |
| A. Three-step extension | NOT RUN | Requires map-coordinate drag and seeded entities. |
| B. Transfer connection | NOT RUN | Requires seeded stations and map selection. |
| C. Physical connection | NOT RUN | Requires endpoint drag and construction conversion. |
| D. Depot connection | NOT RUN | The documented UI creation path may be absent; not exercised. |
| E. Junction branch | NOT RUN | Requires segment hit testing and drag. |
| F. Non-connected crossing | NOT RUN | Requires connection drag and choice flow. |
| G. Save / Undo / Redo | PARTIAL | Chrome create, quick-save, reload, enumerate, and load passed after the regression fix. No entity mutation was available to exercise Undo/Redo. |
| Tool switching/cancel | PARTIAL | Station tool activation, Escape, and explicit switch back to map navigation were exercised. No live draft existed. |
| Map pan/zoom | PASS | Leaflet keyboard zoom changed tile zoom to 12; ArrowRight changed the map-pane translation to -80px. |
| Selection | NOT RUN | No persisted entity was available in the UI-created test slot. |
| Background/resume | NOT RUN | Browser automation could not preserve an observation of the hidden tab without reactivating it. |

This is not sufficient to authorize persistent-state ownership migration.

## Persistent state inventory

Tracks are stored as route coordinates/segments; junctions are route
nodes/branches and construction blueprints. There is no separate authoritative
`tracks`, `junctions`, or individual runtime `trains` array. `RouteLine` is the
authoritative line/route representation, while train instances are derived from
fleets and operating services.

### Network: routes, tracks, junctions, and lines

- State: `routes` including coordinates, nodes, segments, and branches.
- Type: `RouteLine[]`.
- Current owner / initialized by: module-scoped `main.ts`; empty startup,
  `createNewGame`, legacy recovery, and `applyState`.
- Read by: routing, construction, fares/operations, map render projection,
  panels, integrity synchronization, save capture, simulation forecasts.
- Written by: route/extension/edit/delete/connect/junction construction flows,
  project completion, recovery/load, Undo/Redo restore.
- Serialized / save field / migration: yes / `routes` / every legacy migration
  can affect graph-compatible defaults and stable references.
- Leaflet / UI / tools / simulation: yes / yes / critical / yes.
- Undo/Redo: full snapshot and graph rebuild required.
- Async: construction completion, save capture, and map update scheduling.
- Risk: CRITICAL. Not an initial ownership candidate.

### Stations

- State / type / owner: `stations: Station[]`, module-scoped `main.ts`.
- Initialized by: empty/new game, load/recovery, route/station construction.
- Read by: router inputs, transfers, demand, service paths, construction,
  station renderer/panels, save, integrity cleanup.
- Written by: station placement/edit/delete, junction/connection completion,
  demand mirror synchronization, load/Undo/Redo.
- Serialized / save / migration: yes / `stations` / legacy IDs and route
  memberships are migration-sensitive.
- Leaflet / UI / tools / simulation: yes / yes / critical / demand and journey
  simulation.
- Undo/Redo / async: full snapshot; renderer and router reconciliation after
  replacement; construction/save scheduling.
- Risk: CRITICAL.

### Transfers

- State / type / owner: `transfers: TransferGroup[]`, module-scoped.
- Initialized by: empty/new game and `applyState`.
- Read by: routing graph, station presenter, passenger journeys, integrity/save.
- Written by: transfer planning/application/deletion and recovery.
- Serialized / save / migration: yes / `transfers` / station membership and
  duplicate cleanup are migration-sensitive.
- Leaflet / UI / tools / simulation: station render model / yes / transfer tool
  / passenger routing.
- Undo/Redo / async: full snapshot; network invalidation and scheduled save.
- Risk: CRITICAL because it couples multiple station IDs and routing.

### Depots

- State / type / owner: `depots: Depot[]`, module-scoped.
- Initialized by: empty/new game, construction/load.
- Read by: fleet capacity, maintenance, renderer/panels, route integrity, save.
- Written by: depot construction/edit/delete/access completion and recovery.
- Serialized / save / migration: yes / `depots` / connected route IDs must be
  preserved.
- Leaflet / UI / tools / simulation: yes / yes / depot tool / finance-capacity.
- Undo/Redo / async: full snapshot and targeted renderer update/save.
- Risk: HIGH.

### Plans and construction

- State / type / owner: `plans: ConstructionPlan[]` and
  `constructionProjects: ConstructionProject[]`, module-scoped.
- Initialized by: empty/new game, normalized load, planning/conversion flows.
- Read by: blueprint/construction renderers and panels, dependency checks,
  opening rules, finance, integrity, save.
- Written by: all planning tools, conversion, progress/events, completion,
  deletion, load/Undo/Redo.
- Serialized / save / migration: yes / `plans`, `constructionProjects` /
  blueprint lifecycle and reference defaults are migration-sensitive.
- Leaflet / UI / tools / simulation: yes / yes / critical / daily settlement
  and construction progress.
- Undo/Redo / async: full snapshot; construction timing and save/update queue.
- Risk: CRITICAL.

### Fleets, services, and trains

- State / type / owner: `trainFleets: TrainFleet[]`,
  `operatingServices: OperatingService[]`, `expressConfigs: ExpressConfig[]`;
  individual displayed trains are derived.
- Initialized by: empty/new game, normalized load, legacy service migration.
- Read by: train renderer hit targets, capacity/maintenance/forecast, route and
  depot panels, passenger journey calculation, save.
- Written by: purchase/assignment/service editors, reference cleanup, load.
- Serialized / save / migration: yes / matching fields / legacy fleets may
  receive stable service IDs during load.
- Leaflet / UI / tools / simulation: train render model / yes / operations UI /
  coordinator and settlement forecasts.
- Undo/Redo / async: full snapshot; scheduled renderer/save updates.
- Risk: CRITICAL due to route/service/depot references.

### Passenger and demand simulation state

- State / type / owner: `passengerGroups: PassengerGroup[]`,
  `demandZones: DemandZone[]`, `stationDemandStates: StationDemandState[]`.
- Initialized by: empty/load, demand-zone fetch/generation, daily regeneration.
- Read by: routing, demand/capacity/finance forecasts, analysis UI, save.
- Written by: demand refresh, daily settlement preparation/rollback, integrity
  cleanup, load.
- Serialized / save / migration: yes / corresponding fields / optional legacy
  defaults and orphan-reference cleanup apply.
- Leaflet / UI / tools / simulation: zones may render as overlays / yes / low /
  critical.
- Undo/Redo / async: full snapshot; Overpass/network data and daily tick work.
- Risk: CRITICAL for determinism and reference integrity.

### Finance

- State / type / owner: `economy: EconomyState`, `loans: Loan[]`, and
  `statisticsState: StatisticsState`, module-scoped.
- Initialized by: defaults/new game and normalized load.
- Read by: construction affordability, fares, operations, HUD/panels,
  bankruptcy, settlement, save.
- Written by: construction transactions, fares/loans, daily settlement,
  rollback, load.
- Serialized / save / migration: yes / `economy`, `loans`, `statisticsState` /
  legacy defaults are required.
- Leaflet / UI / tools / simulation: no direct cache / extensive / construction
  actions / daily settlement.
- Undo/Redo / async: full snapshot; settlement commits request immediate save.
- Risk: CRITICAL.

### Game time and metadata

- State / type / owner: `simMinutes`, `simulationRuntimeMinutes`, `simSpeed`,
  and `currentMeta: GameMeta`, module-scoped; speed/runtime accumulator are not
  all serialized separately.
- Initialized by: defaults, settings/runtime startup, and load.
- Read by: loop, HUD, demand period, events, construction, save naming/session.
- Written by: `SimulationCoordinator.setTime`, speed controls, settlement,
  tutorial/career/session flows, load.
- Serialized / save / migration: `currentMeta` and analysis day are saved;
  runtime accumulator/speed are runtime-only. Older metadata defaults migrate.
- Leaflet / UI / tools / simulation: no / yes / tutorial gates / critical.
- Undo/Redo / async: meta participates in snapshots; loop timestamps do not;
  visibility resume resets the frame timestamp.
- Risk: CRITICAL because two clock representations must stay aligned.

### Event and analysis state

- State / type / owner: `newsEvents: NewsEvent[]` and
  `analysisState: OperationAnalysisState`, module-scoped.
- Initialized by: defaults/new game, normalization/load.
- Read by: event multipliers, news/analysis presenters, daily settlement, save.
- Written by: event coordinator/runtime dispatcher, user event actions,
  suggestion generation, settlement, load.
- Serialized / save / migration: yes / `newsEvents`, `analysisState` / legacy
  normalization and day defaults apply.
- Leaflet / UI / tools / simulation: no / yes / indirect / daily settlement.
- Undo/Redo / async: full snapshot; event dispatch and save request are async.
- Risk: HIGH. It has fewer renderer dependencies but remains coupled to daily
  settlement ordering, so it is only a future candidate after browser coverage.

### Diagram layout state

- State / type / owner: `diagramState: MetroDiagramState`, module-scoped.
- Initialized by: defaults/new game and normalized load.
- Read by: metro-diagram layout/render/export and save capture.
- Written by: diagram drag/reset/background/label controls and load.
- Serialized / save / migration: yes / `diagramState` / layout version and
  public-map defaults are normalized during load.
- Leaflet / UI / tools / simulation: no / diagram UI / diagram drag only / no.
- Undo/Redo / async: participates in the full snapshot; drag completion schedules
  a save.
- Risk: MEDIUM. It is persistent presentation state, not authoritative gameplay,
  and must not be combined with gameplay ownership migration.

### Derived congestion and routing caches

- State / type / owner: `segmentCongestion`, `routeCongestionSummaries`,
  `transitRouter`, router/demand signatures; module-scoped derived runtime data.
- Initialized by: empty cache and on-demand rebuilds after network/load changes.
- Read by: route/station/operations presentation and passenger routing.
- Written by: capacity/congestion calculation and network invalidation.
- Serialized / save / migration: no; reconstructed from authoritative state.
- Leaflet / UI / tools / simulation: render projections / yes / indirect network
  invalidation / yes.
- Undo/Redo / async: cleared or rebuilt after full recovery and structural
  changes; stale identity is a correctness risk.
- Risk: HIGH, but these are caches rather than migration candidates.

## Transient state inventory

Transient state is intentionally excluded from persistent ownership migration:

| Group | Current state | Dependencies / risk |
| --- | --- | --- |
| Active tool/workspace | `activeTool`, `workspaceMode`, `planningMode`, `activePlanId` | DOM toolbars, tutorial, map callbacks; HIGH |
| Pointer/draft | `activePointerId`, `rawDrawPoints`, route/repair/branch/merge/connection drafts, `routePlanningSession` | Leaflet points and construction rules; CRITICAL |
| Selection | selected route/station/depot/train/service/statistics IDs | renderer outlines and panels; HIGH |
| Hover/hit testing | `trainHitTargets`, map selection pointers/gesture | Leaflet/container pixels; MEDIUM |
| Preview | preview polyline/polygon, handle coordinates, edit guide layers | Leaflet-owned objects; HIGH and must never enter game state |
| Drag | route handle, diagram drag, operating-service map edit | pointer capture, DOM/map updates; HIGH |
| Modal/UI | pending decision, dialog modes, form drafts, toast/loading/error timers | DOM-only; LOW-MEDIUM |
| Storage/session | slot summaries, edit/load request IDs, autosave timer, active-session flag | async UI coordination; HIGH but not gameplay state |

## Simulation dependency audit

Per-frame order is fixed by `GameLoopController` and `SimulationCoordinator`:

```text
requestAnimationFrame
  -> clamp elapsed to maxFrameDeltaSeconds
  -> skip when paused, speed zero, or a tick is already in progress
  -> SimulationCoordinator.advance(elapsed * speed)
     -> read previous runtime minutes
     -> set runtime/game clock and play-time metadata
     -> report changed fleet IDs
     -> optional passenger update
     -> optional construction update
     -> optional event expiry
     -> calculate day change and targeted update domains
  -> if day changed, settleSimulationDay once for that delivered day
  -> request targeted render domains at the configured render interval
```

The currently wired coordinator only advances the clock and reports all fleet
IDs as changed; passenger/construction/event per-frame callbacks are not wired.
Daily behavior is concentrated in `DailySettlementRuntime`:

1. Reject re-entry or an already-settled day.
2. Snapshot economy, loans, statistics, passenger groups, analysis/meta,
   construction projects, and station demand states.
3. Ensure demand, apply auto fare, regenerate passengers, advance station
   demand, regenerate passengers again, and calculate forecast/maintenance/
   construction costs/network finances.
4. Calculate and validate settlement, then commit economy/loans/statistics.
5. Commit day metadata, career progress, news events, construction events,
   demand snapshot, and analysis suggestions.
6. Dispatch targeted UI/update domains and request an immediate save.
7. On failure, restore the captured state and show the existing error UI.

Simulation reads persistent network, stations, demand/passengers, fleets and
services, construction, economy/loans/statistics, events, analysis, and meta. It
writes clocks/meta, demand/passengers, finance/statistics, construction events,
news/analysis, and career state. UI/render calls remain in the application
adapters (`requestUpdateDomains`, `showToast`, `showError`, HUD mode updates).
Save side effects occur only through `RuntimeResultDispatcher` after a committed
result. Randomness is used by event/content generation and fallback ID creation;
no random call order was changed in this phase.

## Migration decision

No persistent group is migrated in this phase. The required save baseline is
now known, but the drag-based tool, selection, and Undo/Redo browser baselines
are still incomplete. Event/analysis state is the lowest renderer-coupled future
candidate, yet it remains part of daily settlement and should not move before a
deterministic browser/manual fixture can exercise its commit and rollback path.
