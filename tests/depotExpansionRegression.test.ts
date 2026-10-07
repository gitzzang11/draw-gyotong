import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import type { Depot } from "../src/domain/networkTypes";
import { getDepotExpansionQuote, maxDepotLevel } from "../src/domain/depotExpansion";

const mainText = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
const mainAst = ts.createSourceFile("main.ts", mainText, ts.ScriptTarget.Latest, true);
const functions = new Map(mainAst.statements.filter(ts.isFunctionDeclaration)
  .filter((node) => node.name).map((node) => [node.name!.text, node.getText(mainAst)]));
const noop = () => {};

function depotContext(options: {
  mode?: "career" | "sandbox"; cash?: number; areaHa?: number; level?: number;
  cityMultiplier?: number; difficultyMultiplier?: number; operational?: boolean;
} = {}) {
  const depot: Depot = {
    id: "depot", name: "Test depot", polygon: [[35, 127], [35.01, 127], [35, 127.01]],
    areaHa: options.areaHa ?? 2, level: options.level ?? 1, capacity: 10,
    maintenanceCost: 610, connectedRouteIds: [], constructionCost: 500,
  };
  const networkState = { depots: [depot] };
  const financeState = { economy: { cash: options.cash ?? 5000, constructionSpent: 50 } };
  const constructionState = { projects: options.operational === false ? [{ depotIds: ["depot"], status: "building" }] : [] };
  const errors: string[] = [];
  const toasts: string[] = [];
  const decisions: Array<{ message: string; warning: string; label: string; confirm: () => unknown }> = [];
  const context = createContext({
    structuredClone, console, Date, Error, networkState, financeState, constructionState,
    hasActiveGameSession: true, getDepotExpansionQuote, maxDepotLevel,
    metaState: { current: { mode: options.mode ?? "career", cityId: "seoul", difficulty: "normal", slotId: "slot-a" } },
    cityConfigs: { seoul: { constructionMultiplier: options.cityMultiplier ?? 1 } },
    difficultyConfigs: { normal: { costMultiplier: options.difficultyMultiplier ?? 1 } },
    selectedDepotManagerId: "depot", selectedDepotId: "depot",
    undoStack: [{ marker: "undo-before" }], redoStack: [{ marker: "redo-before" }], maxHistory: 30,
    depotExpansionsInFlight: new Set<string>(),
    requestStateSave: noop, flushStateSave: async () => {}, requestUpdate: noop, requestUpdateDomains: noop,
    renderDepotManager: noop, closeDepotManager: noop, playFeedback: noop,
    showError: (message: string) => errors.push(message), showToast: (message: string) => toasts.push(message),
    formatCost: (value: number) => `${value}억`,
    openDecisionDialog: (message: string, warning: string, label: string, confirm: () => unknown) => decisions.push({ message, warning, label, confirm }),
  });
  context.cloneState = () => structuredClone({ depots: networkState.depots, economy: financeState.economy });
  context.pushHistory = () => { context.undoStack = [...context.undoStack, context.cloneState()]; };
  context.applyState = (snapshot: { depots: Depot[]; economy: typeof financeState.economy }) => {
    networkState.depots = structuredClone(snapshot.depots);
    financeState.economy = structuredClone(snapshot.economy);
  };
  context.stateRecoveryCoordinator = { recover: (snapshot: Parameters<typeof context.applyState>[0]) => context.applyState(snapshot) };
  const names = ["expandDepot", "handleDepotManagerClick", "calculateDepotCapacity", "calculateDepotMaintenance", "isDepotOperational"];
  for (const optional of ["getCurrentDepotExpansionQuote", "requestDepotExpansion"]) if (functions.has(optional)) names.push(optional);
  const code = ts.transpileModule(names.map((name) => {
    const text = functions.get(name);
    if (!text) throw new Error(`Missing main.ts function: ${name}`);
    return text;
  }).join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  runInContext(code, context);
  const snapshot = () => structuredClone({ depots: networkState.depots, economy: financeState.economy, undo: context.undoStack, redo: context.redoStack });
  const clickExpand = () => context.handleDepotManagerClick({ target: { closest: () => ({ dataset: { depotManagerAction: "expand" } }) } });
  return { context, networkState, financeState, errors, toasts, decisions, snapshot, clickExpand };
}

describe("depot expansion rules", () => {
  it.each([
    { areaHa: 2, level: 1, cityMultiplier: 1, difficultyMultiplier: 1, cost: 544 },
    { areaHa: 2, level: 3, cityMultiplier: 1, difficultyMultiplier: 1, cost: 1632 },
    { areaHa: 2, level: 1, cityMultiplier: 1.25, difficultyMultiplier: 1.2, cost: 816 },
    { areaHa: 0.01, level: 1, cityMultiplier: 1, difficultyMultiplier: 1, cost: 180 },
  ])("charges $cost for the quoted area, current level, city and difficulty", async (input) => {
    const { context, financeState, networkState } = depotContext(input);

    await context.expandDepot("depot");

    expect(financeState.economy.cash).toBe(5000 - input.cost);
    expect(financeState.economy.constructionSpent).toBe(50 + input.cost);
    expect(networkState.depots[0].constructionCost).toBe(500 + input.cost);
    expect(networkState.depots[0].level).toBe(input.level + 1);
  });

  it("increments capacity and maintenance using the existing calculations", async () => {
    const { context, networkState } = depotContext();

    await context.expandDepot("depot");

    expect(networkState.depots[0]).toMatchObject({ level: 2, capacity: 14, maintenanceCost: 1030 });
  });

  it("rejects insufficient career cash without changing the depot, finances or history", async () => {
    const { context, snapshot } = depotContext({ cash: 543 });
    const before = snapshot();

    await context.expandDepot("depot");

    expect(snapshot()).toEqual(before);
  });

  it("allows career cash exactly equal to the quoted cost", async () => {
    const { context, networkState, financeState } = depotContext({ cash: 544 });

    await context.expandDepot("depot");

    expect(networkState.depots[0].level).toBe(2);
    expect(financeState.economy.cash).toBe(0);
  });

  it("charges sandbox cash even when it becomes negative", async () => {
    const { context, financeState } = depotContext({ mode: "sandbox", cash: 100 });

    await context.expandDepot("depot");

    expect(financeState.economy).toMatchObject({ cash: -444, constructionSpent: 594 });
  });

  it.each([5, 6, 99])("refuses expansion at level %i while preserving legacy levels", async (level) => {
    const { context, snapshot } = depotContext({ mode: "sandbox", level });
    const before = snapshot();

    await context.expandDepot("depot");

    expect(snapshot()).toEqual(before);
  });

  it("refuses to expand a depot while its construction project is not operating", async () => {
    const { context, snapshot } = depotContext({ operational: false });
    const before = snapshot();

    await context.expandDepot("depot");

    expect(snapshot()).toEqual(before);
  });
});

describe("depot manager expansion confirmation", () => {
  it("asks for confirmation with the target, level change and cost before mutating state", async () => {
    const { clickExpand, snapshot, decisions } = depotContext();
    const before = snapshot();

    await clickExpand();

    expect(snapshot()).toEqual(before);
    expect(decisions).toHaveLength(1);
    const explanation = `${decisions[0].message} ${decisions[0].warning}`;
    expect(explanation).toContain("Test depot");
    expect(explanation).toContain("544");
    expect(explanation).toContain("1");
    expect(explanation).toContain("2");
  });

  it("leaves the depot and finances unchanged when the confirmation is cancelled", async () => {
    const { clickExpand, snapshot } = depotContext();
    const before = snapshot();

    await clickExpand();

    expect(snapshot()).toEqual(before);
  });

  it("changes the depot and deducts the quoted cost only after confirmation", async () => {
    const { clickExpand, decisions, networkState, financeState } = depotContext();

    await clickExpand();
    expect(decisions).toHaveLength(1);
    await decisions[0].confirm();

    expect(networkState.depots[0].level).toBe(2);
    expect(financeState.economy.cash).toBe(4456);
    expect(financeState.economy.constructionSpent).toBe(594);
  });

  it.each(["level", "cost", "slot"] as const)("refuses an old confirmation when its %s changes", async (change) => {
    const { context, snapshot, networkState } = depotContext();
    const expected = { level: 1, cost: 544, slotId: "slot-a" };
    if (change === "level") networkState.depots[0].level = 2;
    if (change === "cost") networkState.depots[0].areaHa = 3;
    if (change === "slot") context.metaState.current.slotId = "slot-b";
    const afterChange = snapshot();

    await context.expandDepot("depot", expected);

    expect(snapshot()).toEqual(afterChange);
  });
});

describe("depot expansion persistence", () => {
  it("plays the construction result only after a successful save, and stays silent on failure", async () => {
    const { context } = depotContext();
    const sounds: string[] = [];
    context.playFeedback = (kind: string) => sounds.push(kind);
    let finishSave!: () => void;
    context.flushStateSave = () => new Promise<void>((resolve) => { finishSave = resolve; });
    const action = context.expandDepot("depot");
    expect(sounds).toEqual([]);
    finishSave();
    await action;
    expect(sounds).toEqual(["build"]);

    sounds.length = 0;
    context.flushStateSave = async () => { throw new Error("disk full"); };
    await context.expandDepot("depot");
    expect(sounds).toEqual([]);
  });

  it("restores depot fields, cash, spending and history after storage fails", async () => {
    const { context, snapshot, errors, toasts } = depotContext();
    const before = snapshot();
    context.flushStateSave = async () => { throw new Error("disk full"); };

    await context.expandDepot("depot");

    expect(snapshot()).toEqual(before);
    expect(errors.length).toBeGreaterThan(0);
    expect(toasts.some((message) => message.includes("확장했습니다"))).toBe(false);
    expect(context.depotExpansionsInFlight.size).toBe(0);
  });

  it("keeps unrelated simulation and depot changes when undoing a failed expansion", async () => {
    const { context, networkState, financeState } = depotContext();
    let failSave!: (error: Error) => void;
    const saveGate = new Promise<void>((_resolve, reject) => { failSave = reject; });
    let saveAttempts = 0;
    context.flushStateSave = () => ++saveAttempts === 1 ? saveGate : Promise.resolve();
    const expansion = context.expandDepot("depot");
    try {
      expect(saveAttempts).toBe(1);
      financeState.economy.cash -= 25;
      financeState.economy.constructionSpent += 3;
      networkState.depots[0].name = "Renamed during save";
    } finally {
      // Attach a handler even when old code never invokes the save gateway.
      void saveGate.catch(() => {});
      failSave(new Error("disk full"));
      await expansion;
    }

    expect(networkState.depots[0]).toMatchObject({ name: "Renamed during save", level: 1, capacity: 10, maintenanceCost: 610, constructionCost: 500 });
    expect(financeState.economy).toMatchObject({ cash: 4975, constructionSpent: 53 });
    expect(saveAttempts).toBe(2);
  });

  it("applies only one expansion while repeated clicks arrive during the first save", async () => {
    const { context, networkState, financeState } = depotContext();
    let finishSave!: () => void;
    const saveGate = new Promise<void>((resolve) => { finishSave = resolve; });
    context.flushStateSave = () => saveGate;
    const first = context.expandDepot("depot");
    const second = context.expandDepot("depot");
    finishSave();

    await Promise.all([first, second]);

    expect(networkState.depots[0].level).toBe(2);
    expect(financeState.economy).toMatchObject({ cash: 4456, constructionSpent: 594 });
    expect(context.depotExpansionsInFlight.size).toBe(0);
  });
});
