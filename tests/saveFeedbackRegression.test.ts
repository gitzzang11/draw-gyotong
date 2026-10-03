import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const mainText = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
const mainAst = ts.createSourceFile("main.ts", mainText, ts.ScriptTarget.Latest, true);
const quickSaveListener = mainAst.statements.find((statement) => statement.getText(mainAst).startsWith("menuQuickSaveButton?.addEventListener"));
if (!quickSaveListener) throw new Error("Missing quick save button listener in main.ts");
const listenerCode = ts.transpileModule(quickSaveListener.getText(mainAst), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function quickSave() {
  let finishSave!: (success: boolean) => void;
  let failSave!: (error: Error) => void;
  const save = new Promise<boolean>((resolve, reject) => { finishSave = resolve; failSave = reject; });
  const readout = { textContent: "현재 슬롯에 진행 상황을 저장합니다" };
  const toasts: string[] = [];
  const errors: string[] = [];
  let saveCalls = 0;
  let click!: () => unknown;
  const button = { disabled: false, addEventListener: (_event: string, handler: () => unknown) => { click = handler; } };
  const context = createContext({
    Date,
    menuQuickSaveButton: button,
    menuSaveStatusReadout: readout,
    saveCurrentSlot: () => { saveCalls += 1; return save; },
    showToast: (message: string) => toasts.push(message),
    showError: (message: string) => errors.push(message),
  });
  runInContext(listenerCode, context);
  return { click, finishSave, failSave, readout, toasts, errors, button, saveCalls: () => saveCalls };
}

describe("quick save feedback", () => {
  it("reports a rejected save as failure and re-enables the button without a success toast", async () => {
    const { click, failSave, readout, toasts, errors, button } = quickSave();
    const action = click();
    failSave(new Error("storage unavailable"));

    await action;

    expect(readout.textContent).toContain("저장 실패");
    expect(toasts).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(button.disabled).toBe(false);
  });

  it("keeps the button disabled during saving and prevents concurrent clicks from starting another save", async () => {
    const { click, finishSave, toasts, button, saveCalls } = quickSave();
    const first = click();
    try {
      expect(button.disabled).toBe(true);
      const second = click();
      expect(saveCalls()).toBe(1);
      expect(toasts).toEqual([]);
      await second;
      expect(button.disabled).toBe(true);
    } finally {
      finishSave(true);
      await first;
    }

    expect(button.disabled).toBe(false);
    expect(toasts).toHaveLength(1);
  });

  it("does not claim completion before the storage promise resolves", async () => {
    const { click, finishSave, readout, toasts } = quickSave();
    const action = click();

    try {
      expect(readout.textContent).not.toContain("저장 완료");
      expect(toasts).toEqual([]);
    } finally {
      finishSave(true);
      await action;
    }
  });

  it("does not report success when saveCurrentSlot returns false", async () => {
    const { click, finishSave, readout, toasts } = quickSave();
    const action = click();
    finishSave(false);

    await action;

    expect(readout.textContent).not.toContain("저장 완료");
    expect(toasts.some((message) => message.includes("저장했습니다"))).toBe(false);
  });

  it("reports success after saveCurrentSlot resolves true", async () => {
    const { click, finishSave, readout, toasts } = quickSave();
    const action = click();
    finishSave(true);

    await action;

    expect(readout.textContent).toContain("저장 완료");
    expect(toasts.filter((message) => message.includes("저장했습니다"))).toHaveLength(1);
  });
});
