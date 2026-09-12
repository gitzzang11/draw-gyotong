# Architecture audit

Date: 2026-09-06

## Scope and baseline

This audit records the live TypeScript/Web/Capacitor implementation before the
first mechanical extraction. It is deliberately an inventory, not a proposal to
change game rules, save data, or the UI.

| Check | Result |
| --- | --- |
| Typecheck | `npm run typecheck` passed |
| Tests | `npm run test:run` passed: 34 files, 232 tests |
| Production build | `npm run build` passed |
| Save schema | `CURRENT_SAVE_SCHEMA_VERSION` is 5 |
| Migrations | v1→v2→v3→v4→v5 chain retained in `src/storage/migrations.ts` |
| Main entry point | `src/main.ts`, 16,174 lines |

`docs/manual-verification.md` defines the A–G browser scenarios for extension,
transfer, physical connection, depot access, junctions, crossings, save/restore,
and undo/redo. No browser session was started during this baseline audit.

## Current architecture

The application is currently a hybrid architecture. `main.ts` owns the runtime
composition and also still contains many domain types, gameplay state variables,
Leaflet setup and interactions, tool drafts, rendering view-model construction,
DOM event handlers, storage orchestration, and simulation adapters.

Several important seams already exist and should be extended rather than
replaced:

```text
main.ts
 ├─ runtime/     BootstrapController, GameLoopController, SimulationCoordinator
 ├─ storage/     SaveSlotService, SaveRepository, serialization, migrations
 ├─ map/         LayerManager plus entity-specific Leaflet renderers
 ├─ ui/          HUD, panels, dialogs, listener registries
 ├─ simulation/  settlement, finance, passenger assignment, express services
 ├─ routing/     network invalidation; transit routing module
 ├─ construction/ ConstructionCoordinator
 └─ events/      event coordinator, runtime adapter, news service
```

The existing renderer classes own their Leaflet layer caches, while `main.ts`
adapts mutable game arrays into renderer entities. This is already the intended
`game data → renderer → Leaflet` direction for the entities covered by the
renderers. The remaining problem is that their adapter functions, map event
handlers, and the authoritative arrays still live together in `main.ts`.

## `main.ts` responsibility map

| Area | Primary locations | Assessment |
| --- | --- | --- |
| Domain types, constants, save-state shape | 173–848 | Persistent/runtime/UI types are colocated with app entry code. |
| Static shell and DOM lookup | 849–2418 | UI markup injection and DOM references remain entry-point owned. |
| Leaflet setup and layers | 1767–1892 | Leaflet map initialization is centralized; renderer instances are modular. |
| Authoritative gameplay data | 2474–2500 | Arrays and economy/meta are module globals. |
| Transient tool, selection, UI state | 2501–2601 | Gameplay drafts, map gestures, panel choices, timers, and UI controls are mixed. |
| Runtime composition | 2603–2681 | Controllers are created with callbacks into global state. |
| Map input and tools | 3115–4669, 12361–15030 | Pointer handlers can directly mutate drafts, selection, maps, domain arrays, and UI. |
| Construction and plans | 4670–8412 | Construction lifecycle is partly delegated but application mutations remain local. |
| Update/render orchestration | 8413–8497, 9082–9223 | Scheduler is modular; state-to-view mapping remains in main. |
| Save/load and recovery | 8498–9056, 15167–15383 | Repository/service boundaries exist; capture/apply state remains tied to UI/runtime. |
| Operations, simulation adapters, finance | 9230–12283 | Pure services exist but legacy and adapter logic remain in main. |
| Panels, dialogs, HUD and managers | 9770–13288 | Reusable panels exist; page-specific presenter/controller logic remains local. |
| Network integrity and routing adapters | 11310–11990, 14280–14576 | Router is independent, but state extraction/reconciliation remains coupled. |
| Map overlays, platform, settings, feedback | 15385–16172 | Map-network I/O, local settings, and presentation utilities share the entry module. |

## Mutable-state ownership inventory

This table groups variables with one ownership policy. Line numbers refer to
the baseline `main.ts`.

| State | Defined at | Type / initial state | Current readers and writers | Serialized | Classification | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| Routes, stations, transfers, depots | 2474–2477 | domain arrays, empty | construction, routing, map, panels, storage, simulation | Yes | authoritative persistent gameplay | Critical |
| Plans and construction projects | 2478, 2482 | domain arrays, empty | planning tools, construction, UI, storage | Yes | authoritative persistent gameplay | Critical |
| Fleets, services, express config, passenger groups | 2484–2487 | domain arrays, empty | operations, simulation, renderers, storage | Yes | authoritative persistent gameplay | Critical |
| Economy, loans, meta, statistics, analysis, news | 2480–2499 | value/object state | finance, simulation, HUD, storage | Yes | authoritative persistent gameplay | High |
| Demand zones/state and congestion/router signatures | 2488–2496 | arrays, router, strings | demand and routing adapters | zones/state: yes; caches: no | gameplay data plus derived runtime cache | High |
| Undo/redo | 2504–2505 | `SaveState[]` stacks | mutation paths, keyboard/UI actions | No | runtime gameplay history | Critical |
| Active tool/workspace and route-planning session | 2519–2545 | mode values and draft/session objects | tool input, dialogs, HUD | No | runtime gameplay state | High |
| Drawing/edit/connection/deletion/construction drafts | 2523–2555 | Leaflet points, draft objects, previews | map handlers, construction UI | No | transient tool and map state | High |
| Current selection and panel-manager ids | 2509–2515, 2542–2562 | nullable ids and editor values | renderers, panels, interaction | No | UI/runtime selection state | Medium |
| Leaflet map, layers and renderers | 1767–1881 | `L.Map`, layer manager, renderers | map render reconciliation and input | No | map-owned rendering state | High |
| Preview Leaflet layers | 2525–2526 | `L.Polyline` / `L.Polygon` | drawing input and preview rendering | No | map-owned transient rendering state | High |
| Map hit targets / gesture pointers | 2599–2601 | `Map`, `Set`, gesture object | map interaction handlers | No | map interaction state | Medium |
| Save slot UI/session controls | 168, 2500–2508 | service, summaries, requests, abort controller | startup, storage UI, autosave | summaries: no; game: yes | storage/UI runtime state | High |
| Settings, sound, hints, toasts, loading, tile errors | 2568–2575, 16065 | local values/timers | settings UI and platform feedback | settings: local storage; rest: no | UI/platform state | Low–Medium |
| Update scheduler and runtime controllers | 169–171, 2603–2681, 8417–8418 | services/controllers/frame id | all mutating systems | No | application/runtime coordination | High |

## Dependency clusters and coupling hotspots

| Coupling | Evidence | Risk | Required direction |
| --- | --- | --- | --- |
| Persistent state ↔ UI/map/storage | `main.ts` arrays are read directly by render, UI, save/load, tools, and simulation adapter functions | Critical | Keep one authoritative state boundary; derive UI/map view models from it. |
| Map input ↔ domain mutation | pointer handlers in the 3300–4600 range select, draft, render, and commit directly | Critical | Leaflet event → interaction adapter → tool/controller → mutation. |
| Tool draft ↔ Leaflet preview | `L.Point`/preview layers and construction draft logic are interleaved | High | Keep Leaflet objects in map interaction/rendering; pass geographic/value input to game rules. |
| Simulation ↔ application presentation | runtime controllers are pure, but their callback adapters in main request HUD/map/UI updates | High | Preserve tick order; move adapters behind explicit runtime/application boundary. |
| Storage ↔ runtime/UI | save slot service is separated, while `captureGameState`/`applyState` coordinate UI and current session | High | Retain schema and migration; later isolate an app-level SaveService facade. |
| Construction/routing ↔ globals | local coordinator helpers reference routes, stations, plans, projects and finance arrays | High | Extract behavior-tested domain operations without changing their transaction boundaries. |
| Render cache ↔ game state | modular renderers cache only Leaflet objects; main passes derived entities | Medium | Preserve this ownership and complete entity adapters one at a time. |
| Pure UI transformations ↔ entry point | colour conversion and string formatting helpers are local despite no game/map dependencies | Low | Safest initial extraction candidates. |

No direct simulation-module import of `document` or Leaflet was found in the
existing `runtime/` coordinator and loop classes. The main application adapter
is still responsible for connecting simulation results to render updates.

## State duplication observed

The following forms of duplication are intentional but must be kept explicit:

| Authoritative value | Derived/parallel value | Current safeguard |
| --- | --- | --- |
| route/station/depot arrays | Leaflet renderer cache | entity renderers reconcile by ID |
| game time (`simMinutes`) | loop runtime time and HUD clock | `SimulationCoordinator` result drives dirty HUD domain |
| selected IDs | panel manager open state and selection outlines | update scheduler/render reconciliation |
| save state | undo/redo snapshots and recovery record | snapshot restore/apply pathways |
| route network | `TransitRouter` plus signatures | network invalidation/signature rebuild logic |

These are recorded for later work; this change set does not remove or merge any
of them.

## Recommended extraction order

1. Extract and test side-effect-free UI/value helpers from `main.ts`.
2. Continue extracting existing pure geometry, formatting, deterministic
   validation, and view-model builders only after characterization tests.
3. Move state-to-renderer entity mapping into map adapter modules while retaining
   renderer-owned Leaflet caches.
4. Put save/load capture/apply behind an application-level facade without
   changing the v5 payload or migration chain.
5. Separate one tool lifecycle at a time from map pointer handlers, keeping
   drafts transient and commits in existing construction transactions.
6. Establish narrower state ownership/application services only after save,
   undo/redo, simulation ordering, and construction characterization coverage
   has increased.
7. Move remaining page-specific UI presenters and bootstrap wiring last.

## Rollback strategy

Every extraction must be a small, import-only mechanical change with a focused
test. It can be reverted as one file addition plus its `main.ts` import/call
site. Persistent state shapes, serialization, migrations, IDs, tick ordering,
and Leaflet layer behavior must remain untouched until their dedicated safety
net exists. No tests are to be removed or skipped.
