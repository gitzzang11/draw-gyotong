import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { selectAutomaticStationName, type StationNameMatch } from "../src/stationNaming";
import type { ConstructionPlan, PlannedStation } from "../src/domain/constructionTypes";
import type { Station } from "../src/domain/networkTypes";

const sourceText = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
const sourceFile = ts.createSourceFile("main.ts", sourceText, ts.ScriptTarget.Latest, true);
const declarations = new Map(sourceFile.statements.filter(ts.isFunctionDeclaration)
  .filter((node) => node.name).map((node) => [node.name!.text, node.getText(sourceFile)]));
const noop = () => {};
const position: [number, number] = [35, 127];
const nearestStation = { lat: 35, lon: 127, tags: { railway: "station", name: "가까운역" } };
const fallbackPark = { lat: 35, lon: 127, tags: { leisure: "park", name: "공원" } };

function applicationContext(names: string[], globals: Record<string, unknown> = {}) {
  const context = createContext({
    // 국비 보조 없음(보조금은 tests/constructionSubsidy.test.ts에서 따로 검사)
    subsidizedCost: (cost: number) => cost, constructionSubsidyRate: () => 0, constructionSubsidy: () => 0,
    structuredClone, console, Date, Error, AbortController, DOMException, URLSearchParams,
    window: { setTimeout, clearTimeout },
    metaState: { current: { cityId: "seoul", slotId: "slot-a", mode: "sandbox" }, patch: noop },
    settings: { autoStationNaming: true },
    stationNameLookupCache: new Map(), pendingStationNameTargets: new Map(), planConversionsInFlight: new Set(), selectAutomaticStationName,
    overpassEndpoints: ["https://primary.test/api/interpreter", "https://secondary.test/api/interpreter"],
    requestStateSave: noop, reconcileMapStations: noop, updateHud: noop,
    reconcileBlueprints: noop, renderPlanningDialog: noop,
    makeUniqueStationName: (name: string) => name,
    L: { latLng: (lat: number, lng: number) => ({ lat, lng }) },
    facilityReadout: {}, setText: noop,
    ...globals,
  });
  const functions = names.map((name) => {
    const declaration = declarations.get(name);
    if (!declaration) throw new Error(`Missing main.ts function: ${name}`);
    return declaration;
  }).join("\n");
  runInContext(ts.transpileModule(functions, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context;
}

function response(value: unknown) {
  return { ok: true, status: 200, json: async () => value };
}

describe("automatic station naming handles Overpass errors", () => {
  it("tries the next server when HTTP 200 contains a runtime timeout instead of accepting fallback names", async () => {
    const requests: Array<{ endpoint: string; query: string }> = [];
    const context = applicationContext(["fetchOverpass", "findNearbyOsmStationName"], {
      fetch: async (endpoint: string, options: { body: URLSearchParams }) => {
        const query = options.body.get("data")!;
        requests.push({ endpoint, query });
        if (endpoint.includes("primary") && query.includes('["railway"')) return response({ remark: "runtime error: Query timed out", elements: [] });
        return response({ elements: query.includes('["railway"') ? [nearestStation] : [fallbackPark] });
      },
    });

    const match = await context.findNearbyOsmStationName(position);

    expect(match?.name).toBe("가까운");
    expect(match?.source).toBe("railway");
    expect(requests).toHaveLength(2);
    expect(requests[1].endpoint).toContain("secondary");
    expect(requests.every((request) => request.query.includes('["railway"'))).toBe(true);
  });

  it("does not retain failed lookups in the name cache and retries the same location", async () => {
    let fail = true;
    let requests = 0;
    const context = applicationContext(["fetchOverpass", "findNearbyOsmStationName"], {
      fetch: async () => {
        requests += 1;
        return response(fail ? { remark: "runtime error: Query ran out of memory", elements: [] } : { elements: [nearestStation] });
      },
    });

    expect(await context.findNearbyOsmStationName(position)).toBeNull();
    expect(context.stationNameLookupCache.size).toBe(0);
    expect(requests).toBe(2);
    fail = false;
    expect((await context.findNearbyOsmStationName(position))?.source).toBe("railway");
    expect(requests).toBe(3);
  });

  it("caches a legitimate empty railway lookup followed by a successful lower priority place", async () => {
    const requests: string[] = [];
    const context = applicationContext(["fetchOverpass", "findNearbyOsmStationName"], {
      fetch: async (_endpoint: string, options: { body: URLSearchParams }) => {
        const query = options.body.get("data")!;
        requests.push(query);
        return response({ elements: query.includes('["railway"') ? [] : [fallbackPark] });
      },
    });

    expect((await context.findNearbyOsmStationName(position))?.name).toBe("공원");
    expect((await context.findNearbyOsmStationName(position))?.name).toBe("공원");
    expect(requests).toHaveLength(2);
    expect(context.stationNameLookupCache.size).toBe(1);
  });

  it.each([
    { remark: "runtime error: Query timed out", elements: [nearestStation] },
    { remark: "runtime error: incomplete result", elements: [] },
    { elements: "invalid collection" },
    {},
    null,
  ])("rejects incomplete or malformed HTTP 200 data and obtains a complete secondary response: %j", async (invalid) => {
    let requests = 0;
    const context = applicationContext(["fetchOverpass"], {
      fetch: async () => response(++requests === 1 ? invalid : { elements: [nearestStation] }),
    });

    const result = await context.fetchOverpass("railway query", new AbortController().signal, 10000);

    expect(result).toEqual({ elements: [nearestStation] });
    expect(requests).toBe(2);
  });

  it("preserves an external cancellation instead of trying another server", async () => {
    let requests = 0;
    const controller = new AbortController();
    const context = applicationContext(["fetchOverpass"], {
      fetch: async () => {
        requests += 1;
        controller.abort();
        throw new DOMException("aborted", "AbortError");
      },
    });

    await expect(context.fetchOverpass("query", controller.signal, 10000)).rejects.toHaveProperty("name", "AbortError");
    expect(requests).toBe(1);
  });
});

function plannedStation(id = "planned-station"): PlannedStation {
  return { id, name: "임시 이름", position: [...position], plannedRouteIds: [], actualRouteIds: [], expectedDemand: 0, completed: false };
}

function plan(stations: PlannedStation[]): ConstructionPlan {
  return {
    id: "plan", name: "계획", cityId: "seoul", routes: [], stations, depots: [], transfers: [],
    expectedTotalCost: 180, remainingCost: 180, expectedConstructionDays: 0,
    expectedDemand: 0, expectedRevenue: 0, terrainDifficulty: 0, transferEffect: 0,
    createdAt: 0, priority: "normal", notes: "", status: "draft",
  };
}

function conversionContext(retainPlan = false, initialName = "임시 이름") {
  let completeName!: (match: StationNameMatch | null) => void;
  const nameLookup = new Promise<StationNameMatch | null>((resolve) => { completeName = resolve; });
  const constructionState = {
    plans: [plan(retainPlan ? [plannedStation(), plannedStation("unbuilt-station")] : [plannedStation()])],
    projects: [],
    replacePlans(values: ConstructionPlan[]) { this.plans = values; },
  };
  constructionState.plans[0].stations[0].name = initialName;
  const networkState: { stations: Station[]; routes: []; depots: [] } = { stations: [], routes: [], depots: [] };
  const errors: string[] = [];
  const context = applicationContext(["refineAutomaticStationName", "confirmPlanConversion", "isPlanFullyConverted", "planHasActiveConstruction", "pruneFinishedPlans"], {
    networkState, constructionState,
    findNearbyOsmStationName: () => nameLookup,
    getActivePlan: () => constructionState.plans[0],
    getPlanConversionSelection: () => [{ kind: "station", routeId: "", assetId: "planned-station" }],
    calculatePlanConversionCost: () => 180,
    cloneState: () => structuredClone({ plans: constructionState.plans, stations: networkState.stations }),
    financeState: { economy: { cash: 1000, constructionSpent: 0 } },
    createId: () => "actual-station", usesConstructionTimeline: () => false,
    findRoutesNearLatLng: () => [], findNearestGraphNodeId: () => undefined,
    updatePlan: (id: string, updater: (value: ConstructionPlan) => ConstructionPlan) => {
      constructionState.plans = constructionState.plans.map((value) => value.id === id ? updater(value) : value);
    },
    recalculatePlan: (value: ConstructionPlan) => value,
    synchronizeGraphReferences: noop, flushStateSave: async () => {},
    undoStack: [], redoStack: [], maxHistory: 30, activePlanId: "plan",
    closePlanConversionDialog: noop, requestUpdate: noop, showToast: noop, playFeedback: noop,
    showError: (message: string) => errors.push(message), stateRecoveryCoordinator: { recover: noop },
  });
  const refinements: Promise<void>[] = [];
  const originalRefine = context.refineAutomaticStationName;
  context.refineAutomaticStationName = (...args: unknown[]) => {
    const refinement = originalRefine(...args);
    refinements.push(refinement);
    return refinement;
  };
  context.refineAutomaticStationName({ kind: "planned", id: "planned-station", planId: "plan", initialName });
  const finishLookup = async () => {
    completeName({ name: "공항", source: "railway", distanceMeters: 10 });
    await Promise.all(refinements);
  };
  return { context, constructionState, networkState, errors, finishLookup };
}

describe("pending planned station name lookup during construction", () => {
  it("follows the actual station after its legacy planned name prefix is stripped", async () => {
    const { context, networkState, errors, finishLookup } = conversionContext(false, "계획 임시 이름");
    await context.confirmPlanConversion();
    expect(errors).toEqual([]);
    expect(networkState.stations[0].name).toBe("임시 이름");

    await finishLookup();

    expect(networkState.stations[0].name).toBe("공항");
    expect(context.pendingStationNameTargets.size).toBe(0);
  });

  it("returns a pending name to the restored blueprint when saving the conversion fails", async () => {
    const { context, constructionState, networkState, errors, finishLookup } = conversionContext();
    context.console = { error: noop };
    let saveAttempts = 0;
    context.flushStateSave = async () => {
      if (++saveAttempts === 1) throw new Error("disk full");
    };
    context.stateRecoveryCoordinator = {
      recover(snapshot: { plans: ConstructionPlan[]; stations: Station[] }) {
        constructionState.replacePlans(structuredClone(snapshot.plans));
        networkState.stations = structuredClone(snapshot.stations);
      },
    };
    await context.confirmPlanConversion();
    expect(errors).toHaveLength(1);
    expect(networkState.stations).toHaveLength(0);
    expect(constructionState.plans[0].stations[0].completed).toBe(false);

    await finishLookup();

    expect(constructionState.plans[0].stations[0].name).toBe("공항");
    expect(networkState.stations).toHaveLength(0);
    expect(context.pendingStationNameTargets.size).toBe(0);
  });

  it("still transfers a shared lookup after duplicate refinement requests and clears pending records", async () => {
    const { context, networkState, errors, finishLookup } = conversionContext();
    context.refineAutomaticStationName({ kind: "planned", id: "planned-station", planId: "plan", initialName: "임시 이름" });
    await context.confirmPlanConversion();
    expect(errors).toEqual([]);

    await finishLookup();

    expect(networkState.stations[0].name).toBe("공항");
    expect(context.pendingStationNameTargets.size).toBe(0);
  });

  it.each([false, true])("applies the pending result to the actual station when the source plan remains: %s", async (retainPlan) => {
    const { context, constructionState, networkState, errors, finishLookup } = conversionContext(retainPlan);

    await context.confirmPlanConversion();
    expect(errors).toEqual([]);
    expect(constructionState.plans).toHaveLength(retainPlan ? 1 : 0);
    expect(networkState.stations[0].name).toBe("임시 이름");
    await finishLookup();

    expect(networkState.stations[0].name).toBe("공항");
    if (retainPlan) expect(constructionState.plans[0].stations[0].name).toBe("공항");
  });

  it.each([false, true])("preserves a manual actual station rename after conversion when the source plan remains: %s", async (retainPlan) => {
    const { context, networkState, errors, finishLookup } = conversionContext(retainPlan);
    await context.confirmPlanConversion();
    expect(errors).toEqual([]);
    networkState.stations[0] = { ...networkState.stations[0], name: "사용자 역명" };

    await finishLookup();

    expect(networkState.stations[0].name).toBe("사용자 역명");
  });

  it("preserves a manually named blueprint when the same lookup completes after conversion", async () => {
    const { context, constructionState, networkState, errors, finishLookup } = conversionContext(true);
    constructionState.plans[0].stations[0].name = "사용자 계획명";
    await context.confirmPlanConversion();
    expect(errors).toEqual([]);

    await finishLookup();

    expect(networkState.stations[0].name).toBe("사용자 계획명");
    expect(constructionState.plans[0].stations[0].name).toBe("사용자 계획명");
  });

  it("does not resurrect a deleted actual station when a pending result arrives", async () => {
    const { context, networkState, errors, finishLookup } = conversionContext();
    await context.confirmPlanConversion();
    expect(errors).toEqual([]);
    networkState.stations = [];

    await finishLookup();

    expect(networkState.stations).toEqual([]);
  });

  it.each(["slotId", "cityId"])("does not rename a station in a different game after %s changes", async (key) => {
    const { context, networkState, errors, finishLookup } = conversionContext();
    await context.confirmPlanConversion();
    expect(errors).toEqual([]);
    context.metaState.current[key] = key === "slotId" ? "slot-b" : "busan";

    await finishLookup();

    expect(networkState.stations[0].name).toBe("임시 이름");
  });

  it("does not apply an old position's lookup after the actual station moves", async () => {
    const { context, networkState, errors, finishLookup } = conversionContext();
    await context.confirmPlanConversion();
    expect(errors).toEqual([]);
    networkState.stations[0] = { ...networkState.stations[0], position: [36, 128] };

    await finishLookup();

    expect(networkState.stations[0].name).toBe("임시 이름");
  });

  it("preserves the converted name when automatic naming is disabled during the lookup", async () => {
    const { context, networkState, errors, finishLookup } = conversionContext();
    await context.confirmPlanConversion();
    expect(errors).toEqual([]);
    context.settings.autoStationNaming = false;

    await finishLookup();

    expect(networkState.stations[0].name).toBe("임시 이름");
    expect(context.pendingStationNameTargets.size).toBe(0);
  });
});
