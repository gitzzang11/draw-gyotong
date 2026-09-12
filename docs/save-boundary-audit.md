# Save boundary audit

Date: 2026-09-06

## Contract

The persistent save contract remains schema v5. This boundary does not rename
fields, generate IDs, transform game rules, or own application UI state.
`src/storage/saveFacade.ts` only composes existing `SaveRepository` scheduling
with existing `SaveSlotService` slot operations.

```text
Application runtime state
  → cloneState / captureGameState
  → SaveFacade
  → SaveRepository (normal or immediate debounce policy)
  → SaveSlotService
  → toSaveData / migrateSaveStateRecord
  → IndexedDbRepository
  → IndexedDB + localStorage fallback
```

## Call paths

| Trigger | Caller | Runtime conversion | Persistence path | Result handling |
| --- | --- | --- | --- | --- |
| Manual save | `saveCurrentSlot` | `cloneState` via `SaveFacade.flush` capture | update existing slot; create for a new game | refresh summaries, set status, show existing error UI |
| Autosave | `startAutoSave` → `saveCurrentSlot` | same as manual save | same existing update path | status/error handling unchanged |
| Debounced game mutation | `requestStateSave` | `synchronizeGraphReferences`, then `cloneState` at repository flush | `SaveFacade.request` / `requestImmediate` | existing logger only for debounced failures |
| Background | `visibilitychange` while hidden → `saveCurrentSlot` | same as manual save | existing update path | existing status/error handling |
| Load | `loadSlot` → `readSaveSlot` | migration occurs inside existing repository/service path; `applyState` restores runtime arrays | IndexedDB preferred with local fallback freshness check | reset slot-scoped surfaces, restart autosave, reconcile/render, retain rollback behavior |
| Save metadata edit | `saveEditedSlot` | existing slot record with only metadata replacement | `SaveFacade.update` | refresh summaries/UI and active meta |
| Delete | `deleteSaveSlot` | none | `SaveFacade.remove` | existing active-slot reset and UI refresh |
| Development manual hook | `__drawGyotongManualVerification.save` | `cloneState` | existing load/update-or-create behavior through facade | existing map/UI reconciliation |
| Legacy recovery | `loadSavedState` | local recovery store deserializes then `migrateGameSave` | localStorage recovery path | `applyState`, unchanged |

## Ownership

| Component | Owns |
| --- | --- |
| `main.ts` | authoritative runtime arrays, `cloneState`, `applyState`, UI status, active-session rules, autosave timer |
| `SaveFacade` | delegation boundary for current-session writes and slot CRUD |
| `SaveRepository` | debounce, in-flight write coalescing, error callback |
| `SaveSlotService` | slot existence rules and serializable slot writes |
| `IndexedDbRepository` | IndexedDB operation plus local fallback consistency/rollback |
| `serialization.ts` | finite/serializable data conversion; excludes DOM and Leaflet-like objects |
| `migrations.ts` | schema v1–v5 compatibility and stable legacy IDs |

## Evidence

- Existing migration tests continue to cover v1–v3 migration/idempotence and
  preserved references.
- `saveFacade.test.ts` adds a representative v5 slot round-trip through the
  facade/service boundary, preserving IDs, route/station/depot/fleet/service
  references, construction state, finance, and game day.
- Browser verification is tracked separately and remains required for full
  save/load flow confirmation.

## Initialization and UI completion semantics

`SaveFacade` must be constructed before `map.whenReady()` can start bootstrap,
because startup enumeration calls `SaveFacade.list()` while the module may still
be evaluating. A Phase 3 characterization test protects this ordering after a
regression caused the startup error to be caught as an empty slot list.

The quick-save menu currently displays its toast and `저장 완료` text immediately
after starting `saveCurrentSlot`; it does not await the returned Promise. Those
messages mean save requested. `saveCurrentSlot` updates the compact save status
only after the backend write and refreshed slot enumeration resolve, which means
save persisted. This existing UI behavior remains unchanged.
