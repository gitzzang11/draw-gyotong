const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

async function verify(width, height) {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.PLAYWRIGHT_BROWSER ? { executablePath: process.env.PLAYWRIGHT_BROWSER } : {}) });
  const page = await browser.newPage({ viewport: { width, height }, hasTouch: true });
  const errors = [];
  const checks = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.audioStarts = [];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      window.audioStarts.push({ rate: this.playbackRate.value, duration: this.buffer?.duration });
      return start.apply(this, args);
    };
  });
  const state = () => page.evaluate(() => window.__drawGyotongManualVerification.inspect().state);
  async function edit(selector, value, { composing = false, muted = false, rate = 1.35 } = {}) {
    const input = page.locator(selector);
    const details = page.locator("details").filter({ has: input }).first();
    if (await details.count() && !(await details.evaluate((element) => element.open))) {
      await details.locator("summary").first().click();
    }
    await input.fill(value);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("native-keyboard", {
      detail: { visible: true, height: 180 },
    })));
    await page.locator(".game-ime-preview:not([hidden])").waitFor();
    await page.waitForTimeout(250);
    await page.evaluate(() => { window.audioStarts = []; });
    if (composing) {
      await input.evaluate((field) => {
        field.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
        field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true, cancelable: true }));
      });
      assert(await input.evaluate((field) => document.activeElement === field), "composition dismissed too early");
      assert.deepEqual(await page.evaluate(() => window.audioStarts), []);
      await input.evaluate((field) => field.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true })));
    } else {
      await page.keyboard.press("Enter");
    }
    await page.waitForTimeout(250);
    assert(await input.isVisible(), `${selector}: inspector closed`);
    assert.equal(await input.inputValue(), value);
    assert.equal(await input.evaluate((field) => document.activeElement === field), false);
    assert.equal(await page.locator(".game-ime-preview").getAttribute("hidden"), "");
    const sounds = await page.evaluate(() => window.audioStarts);
    assert.equal(sounds.length, muted ? 0 : 1, `${selector}: missing or duplicate completion cue ${JSON.stringify(sounds)}`);
    if (!muted) assert(Math.abs(sounds[0].rate - rate) < 0.001);
    checks.push({ selector, value, composing, muted, sounds });
  }
  try {
    await page.goto(process.env.GAME_URL || "http://127.0.0.1:5174");
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => window.__drawGyotongManualVerification.seed());
    await page.locator("#manageLineTool").click();
    await page.locator("[data-route-id=manual-main-line]").click();
    await edit("#lineNameInput", "새 노선 이름");
    assert.equal((await state()).routes.find((r) => r.id === "manual-main-line").name, "새 노선 이름");
    await edit("#lineNameInput", "한글 조합 노선", { composing: true });
    assert.equal((await state()).routes.find((r) => r.id === "manual-main-line").name, "한글 조합 노선");
    await page.locator("[data-operating-service-id]").first().click();
    await edit("#operatingServiceNameInput", "새 운행 계통 이름");
    assert((await state()).operatingServices.some((s) => s.name === "새 운행 계통 이름"));
    await page.locator("#closeLineManagerButton").click();
    await page.locator("#manageOperationsTool").click();
    await edit("#networkTitleInput", "새 철도망 제목");
    assert.equal((await state()).meta.networkTitle, "새 철도망 제목");
    await page.locator("[data-statistics-tab=stations]").click();
    await page.locator("[data-stat-station=manual-main-transfer]").click();
    await page.locator("[data-focus-station=manual-main-transfer]").click();
    await page.waitForTimeout(1500);
    await page.mouse.click(width / 2, height / 2);
    if (await page.locator("#routeChoiceDialog").isVisible()) {
      await page.locator("[data-map-target-index]").filter({ hasText: "Main Transfer" }).first().click();
    }
    await edit("#stationManagerName", "새 환승역");
    assert((await state()).stations.some((s) => s.name === "새 환승역"));
    await edit("#stationManagerName", "한글 조합 역", { composing: true });
    assert((await state()).stations.some((s) => s.name === "한글 조합 역"));
    await page.locator("#closeStationManagerButton").click();
    await page.locator("#railModeNowButton").click();
    await page.locator("[data-workspace-mode=planning]").click();
    await page.locator("#planOverviewButton").click();
    await edit("#planNameInput", "새 기획안 이름", { rate: 1 });
    assert((await state()).plans.some((p) => p.name === "새 기획안 이름"));
    await page.locator("#closePlanningButton").click();
    await page.locator("#routeTool").click();
    await edit("#draftRouteNameInput", "새 초안 노선");
    await page.mouse.move(width * 0.55, height * 0.62);
    await page.mouse.down();
    await page.mouse.move(width * 0.84, height * 0.72, { steps: 20 });
    await page.mouse.up();
    await page.locator("#constructionPreviewPanel").waitFor({ state: "visible" });
    await page.locator("#confirmConstructionButton").click();
    assert((await state()).plans.some((p) => p.routes.some((r) => r.name === "새 초안 노선")));
    await page.locator("#menuButton").click();
    await page.locator("#menuOpenSettingsButton").click();
    await page.locator("#soundToggle").uncheck();
    await page.locator("#closeSettingsButton").click();
    await page.locator("#planOverviewButton").click();
    await edit("#planNameInput", "무음 기획안", { muted: true });
    assert((await state()).plans.some((p) => p.name === "무음 기획안"));
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ viewport: `${width}x${height}`, checks: checks.length, errors }));
    return { viewport: `${width}x${height}`, checks, errors };
  } catch (error) {
    await page.screenshot({ path: path.resolve(`output/name-input-${width}-failure.png`) });
    throw error;
  } finally {
    await browser.close();
  }
}

(async () => {
  fs.mkdirSync("output", { recursive: true });
  const results = [];
  for (const [width, height] of [[844, 390], [640, 360]]) results.push(await verify(width, height));
  fs.writeFileSync("output/name-input-check.json", JSON.stringify(results, null, 2));
})().catch((error) => { console.error(error); process.exitCode = 1; });
