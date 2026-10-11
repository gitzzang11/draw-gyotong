import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
const ast = ts.createSourceFile("main.ts", source, ts.ScriptTarget.Latest, true);
const submit = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "submitNameInput");
if (!submit) throw new Error("Missing name input submission");
const code = ts.transpileModule(submit.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function fixture(target: string | null | (() => void)) {
  const sounds: string[] = [];
  const events: string[] = [];
  const button = { disabled: false, hidden: false, click: () => {
    events.push("saved");
    sounds.push("plan");
  } };
  const input = {
    id: "name", readOnly: false, disabled: false,
    blur: () => events.push("blurred"),
    closest: () => ({ querySelector: () => button }),
  };
  const context = createContext({
    enterSaveTargets: { name: target },
    document: { querySelector: () => button },
    playFeedback: (kind: string) => sounds.push(kind),
  });
  runInContext(code, context);
  return { input, button, events, sounds, submit: () => context.submitNameInput(input) };
}

describe("name input Enter completion", () => {
  it("dismisses the keyboard for a line name without closing its inspector", () => {
    let saves = 0;
    const h = fixture(() => { saves += 1; });
    h.submit();
    expect(saves).toBe(1);
    expect(h.events).toEqual(["blurred"]);
  });

  it("finishes immediately applied station and draft names with an audible cue", () => {
    const h = fixture(null);
    h.submit();
    expect(h.events).toEqual(["blurred"]);
    expect(h.sounds).toEqual(["confirm"]);
  });

  it("saves through the button, dismisses the keyboard and retains its action cue", () => {
    const h = fixture("#save");
    h.submit();
    expect(h.events).toEqual(["saved", "blurred"]);
    expect(h.sounds).toEqual(["plan"]);
  });

  it.each(["readOnly", "disabled"] as const)("ignores %s inputs", (state) => {
    const h = fixture(null);
    h.input[state] = true;
    h.submit();
    expect(h.events).toEqual([]);
    expect(h.sounds).toEqual([]);
  });

  it("does not claim completion when the save control is disabled", () => {
    const h = fixture("#save");
    h.button.disabled = true;
    h.submit();
    expect(h.events).toEqual([]);
    expect(h.sounds).toEqual([]);
  });
});
