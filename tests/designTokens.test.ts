import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), "utf8");

/** DESIGN_SYSTEM.md 토큰 표의 `| \`--token\` | \`#paper\` | \`#ink\` |` 행을 읽는다. */
function documentedTokens() {
  const doc = read("../docs/design/DESIGN_SYSTEM.md");
  const rows = [...doc.matchAll(/^\|\s*`(--[a-z0-9-]+)`\s*\|\s*`(#[0-9A-Fa-f]{6})`\s*\|\s*`(#[0-9A-Fa-f]{6})`\s*\|/gm)];
  return rows.map(([, name, paper, ink]) => ({ name, paper: paper.toUpperCase(), ink: ink.toUpperCase() }));
}

/** tokens.css에서 주어진 선택자 블록의 `--name: #hex;` 선언을 읽는다. */
function cssTokens(blockStart: string) {
  const css = read("../src/design/tokens.css");
  const start = css.indexOf(blockStart);
  expect(start, `${blockStart} block`).toBeGreaterThanOrEqual(0);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  return new Map([...body.matchAll(/(--[a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g)].map(([, n, v]) => [n, v.toUpperCase()]));
}

describe("design tokens", () => {
  const documented = documentedTokens();
  const paper = cssTokens(':root[data-theme="paper"]');
  const ink = cssTokens(':root[data-theme="ink"]');

  it("documents the colour tokens", () => {
    expect(documented.length).toBeGreaterThanOrEqual(20);
  });

  it("matches DESIGN_SYSTEM.md values for both themes", () => {
    for (const token of documented) {
      expect(paper.get(token.name), `${token.name} paper`).toBe(token.paper);
      expect(ink.get(token.name), `${token.name} ink`).toBe(token.ink);
    }
  });

  it("defines the same token set for paper and ink", () => {
    expect([...ink.keys()].sort()).toEqual([...paper.keys()].sort());
  });
});
