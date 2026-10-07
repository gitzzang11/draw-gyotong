const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const url = process.env.GAME_URL || "http://127.0.0.1:5174";
const output = path.resolve("output/sound-feedback");
fs.mkdirSync(output, { recursive: true });

async function verify(width, height) {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.PLAYWRIGHT_BROWSER ? { executablePath: process.env.PLAYWRIGHT_BROWSER } : {}) });
  const page = await browser.newPage({ viewport: { width, height } });
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
  const clear = () => page.evaluate(() => { window.audioStarts = []; });
  const sounds = async () => {
    await page.waitForTimeout(250);
    return page.evaluate(() => window.audioStarts);
  };
  async function click(selector, expected, { single = false, silent = false } = {}) {
    await clear();
    await page.locator(selector).click();
    const played = await sounds();
    if (silent) assert.equal(played.length, 0, `${selector} should be muted`);
    else assert(played.length > 0, `${selector} is missing audio`);
    if (single) assert.equal(played.length, 1, `${selector} has stacked audio`);
    if (expected) assert(played.some((s) => Math.abs(s.rate - expected.rate) < 0.001 &&
      Math.abs(s.duration - expected.duration) < 0.001), `${selector}: ${JSON.stringify(played)}`);
    checks.push({ control: selector, played });
  }
  const cue = {
    select: { rate: 1, duration: 0.16 }, plan: { rate: 1, duration: 0.52 },
    build: { rate: 1, duration: 0.415 }, demolish: { rate: 1, duration: 0.65 },
  };
  async function mode(name, expected) {
    await click("#railModeNowButton", cue.select, { single: true });
    await click(`[data-workspace-mode=${name}]`, expected, { single: true });
    assert.equal(await page.locator("body").getAttribute("data-workspace-mode"), name);
  }
  try {
    await page.goto(url);
    await page.waitForLoadState("networkidle");
    await click("[data-title-open=new]", cue.select, { single: true });
    await click("#newGameButton");
    await page.locator("#startScreen").waitFor({ state: "hidden" });
    await click("#tutorialSkipButton");
    await mode("planning", { rate: 1.2, duration: 0.52 });
    await click("#routeTool", cue.select, { single: true });
    // Draw in the visible map field, away from HUD and context controls.
    await clear();
    await page.mouse.move(width * 0.55, height * 0.62);
    await page.mouse.down();
    await page.mouse.move(width * 0.84, height * 0.72, { steps: 20 });
    await page.mouse.up();
    assert((await sounds()).length > 0, "completed draft has no audio");
    await page.locator("#constructionPreviewPanel").waitFor({ state: "visible" });
    await click("#confirmConstructionButton", cue.plan, { single: true });
    await click("#planOverviewButton", cue.select);
    await click("#duplicatePlanButton", cue.plan, { single: true });
    await click("#deletePlanButton", cue.select);
    await click("#decisionConfirmButton", cue.demolish, { single: true });
    await click("#convertPlanButton", cue.select);
    await click("#confirmPlanConversionButton", cue.build, { single: true });
    await click("#closePlanningButton", cue.select, { single: true });
    await mode("construction", { rate: 1.15, duration: 0.415 });
    await click("#eraserTool", cue.select, { single: true });
    await clear();
    await page.mouse.move(width * 0.58, height * 0.63);
    await page.mouse.down();
    await page.mouse.move(width * 0.82, height * 0.71, { steps: 20 });
    await page.mouse.up();
    await page.locator("#constructionPreviewPanel").waitFor({ state: "visible" });
    await click("#confirmConstructionButton", cue.demolish, { single: true });
    await click("#undoButton", { rate: 0.75, duration: 0.16 }, { single: true });
    await click("#redoButton", { rate: 1.35, duration: 0.415 }, { single: true });
    await mode("management", { rate: 0.85, duration: 0.16 });
    for (const [open, close] of [
      ["#financeStatusButton", "#closeFinanceButton"],
      ["#newsButton", "#closeNewsButton"],
      ["#manageOperationsTool", "#closeStatisticsButton"],
      ["#manageMapTool", "#closeDiagramButton"],
    ]) {
      await click(open, cue.select, { single: true });
      await click(close, cue.select, { single: true });
    }
    // Native keyboard activation must use the same click path.
    await page.locator("#menuButton").focus();
    await clear();
    await page.keyboard.press("Enter");
    assert.equal((await sounds()).length, 1, "keyboard menu click missing or duplicated");
    await click("#menuOpenSettingsButton", cue.select, { single: true });
    await clear();
    await page.locator("#soundToggle").uncheck();
    assert.equal((await sounds()).length, 0, "muting produces a late sound");
    await click("#closeSettingsButton", null, { silent: true });
    await click("#menuButton", null, { silent: true });
    await click("#menuOpenSettingsButton", null, { silent: true });
    await clear();
    await page.locator("#soundToggle").check();
    assert((await sounds()).length > 0, "unmuting does not restore sound");
    await click("#closeSettingsButton", cue.select, { single: true });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await page.context().setOffline(true);
    const offlineMix = await page.evaluate(async () => {
      const context = new OfflineAudioContext(1, 44100, 44100);
      const output = context.createGain();
      output.gain.value = 0.75;
      output.connect(context.destination);
      const durations = [];
      for (const name of ["ui-click", "plan-pencil", "build-rail", "demolish-debris"]) {
        const response = await fetch(`/audio/${name}.wav`);
        if (!response.ok) throw new Error(`Offline sample missing: ${name}`);
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        durations.push(buffer.duration);
        const source = context.createBufferSource();
        const gain = context.createGain();
        source.buffer = buffer;
        gain.gain.value = 0.36;
        source.connect(gain).connect(output);
        source.start();
      }
      const rendered = await context.startRendering();
      const samples = rendered.getChannelData(0);
      return { durations, peak: samples.reduce((peak, value) => Math.max(peak, Math.abs(value)), 0),
        finite: samples.every(Number.isFinite) };
    });
    assert(offlineMix.finite && offlineMix.peak > 0 && offlineMix.peak < 0.9);
    await page.context().setOffline(false);
    await page.screenshot({ path: path.join(output, `${width}x${height}.png`) });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ viewport: `${width}x${height}`, checks: checks.length, errors }));
    return { viewport: `${width}x${height}`, checks, offlineMix, errors };
  } catch (error) {
    await page.screenshot({ path: path.join(output, `${width}x${height}-failure.png`) });
    console.error(await page.locator("button:visible").evaluateAll((buttons) => buttons.map((b) => ({ id: b.id, text: b.textContent.trim() }))));
    throw error;
  } finally { await browser.close(); }
}

(async () => {
  const results = [];
  for (const [width, height] of [[844, 390], [640, 360]]) results.push(await verify(width, height));
  fs.writeFileSync(path.join(output, "browser-check.json"), JSON.stringify(results, null, 2));
})().catch((error) => { console.error(error); process.exitCode = 1; });
