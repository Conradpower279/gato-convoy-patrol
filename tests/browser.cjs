// Browser integration checks. No game server is needed: the source also works via file://.
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.GATO_TEST_BROWSER
      ? { executablePath: process.env.GATO_TEST_BROWSER }
      : {}),
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      acceptDownloads: true,
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      globalThis.testPad = {
        connected: true,
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 18 }, () => ({
          pressed: false,
          value: 0,
        })),
      };
      Object.defineProperty(navigator, "getGamepads", {
        value: () => [globalThis.testPad],
      });
    });
    await page.goto(pathToFileURL(path.join(root, "index.html")).href);
    await page.click("#newPatrolBtn");
    assert.equal(await page.evaluate(() => game.phase), "port");
    await page.getByRole("button", { name: /Close interception/ }).click();
    assert.equal(await page.evaluate(() => game.plannedApproach), "aggressive");
    await page.getByRole("button", { name: /Central intercept/ }).click();
    const artifacts = path.join(root, "artifacts");
    fs.mkdirSync(artifacts, { recursive: true });
    await page.screenshot({ path: path.join(artifacts, "port.png") });
    await page.click("#departBtn");
    assert.equal(await page.evaluate(() => game.phase), "patrol");
    await page.keyboard.press("v");
    await page.waitForFunction(() => game.sub.spread === 1);
    assert.equal(await page.evaluate(() => game.sub.spread), 1);
    await page.keyboard.press("Space");
    await page.waitForTimeout(60);
    assert.equal(await page.evaluate(() => game.sub.fwdTubes), 3);
    await page.keyboard.press("g");
    await page.waitForFunction(() => game.targeting.id !== null);
    assert.notEqual(await page.evaluate(() => game.targeting.id), null);
    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(100);
    await page.keyboard.up("ArrowRight");
    assert((await page.evaluate(() => game.sub.aimAngle)) > 0);
    await page.keyboard.press("o");
    await page.waitForFunction(() => game.logOpen);
    assert.equal(await page.evaluate(() => game.logOpen), true);
    const stopped = await page.evaluate(() => game.time);
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => game.time), stopped);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !game.logOpen);
    assert.equal(await page.evaluate(() => game.logOpen), false);
    // Fast-forward a prepared scene through the real browser simulation, then use actual keys.
    await page.evaluate(() => {
      game.sub.depth = 60;
      game.sub.targetDepth = 60;
      game.sub.torpCD = 0;
      game.sub.speed = 0;
    });
    await page.keyboard.press("n");
    await page.waitForFunction(() => game.sub.silent);
    assert.equal(await page.evaluate(() => game.sub.silent), true);
    await page.keyboard.press("b");
    await page.waitForFunction(() => game.sub.decoyCount === 1);
    assert.equal(await page.evaluate(() => game.sub.decoyCount), 1);
    await page.evaluate(() => {
      game.sub.depth = 12;
      game.sub.targetDepth = 12;
      game.sub.spread = 0;
      game.sub.torpCD = 0;
      globalThis.testPad.buttons[6].pressed = true;
    });
    await page.waitForTimeout(80);
    await page.evaluate(() => {
      globalThis.testPad.buttons[6].pressed = false;
    });
    assert.equal(await page.evaluate(() => game.sub.fwdTubes), 2);
    await page.screenshot({ path: path.join(artifacts, "patrol.png") });
    await page.keyboard.press("Escape");
    const downloadEvent = page.waitForEvent("download");
    await page.click("#exportBtn");
    const download = await downloadEvent;
    const savePath = path.join(artifacts, "exported-test-save.json");
    await download.saveAs(savePath);
    const exported = JSON.parse(fs.readFileSync(savePath, "utf8"));
    assert.equal(exported.version, 14);
    assert.equal(exported.game.sub.decoyCount, 1);
    await page.evaluate(() => {
      game.campaign.totalScore = 777;
    });
    await page.setInputFiles("#importFile", {
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from("{broken"),
    });
    await page.waitForFunction(() =>
      document
        .getElementById("transferStatus")
        .textContent.startsWith("Import failed"),
    );
    assert.equal(await page.evaluate(() => game.campaign.totalScore), 777);
    await page.setInputFiles("#importFile", savePath);
    await page.waitForFunction(
      () =>
        document.getElementById("transferStatus").textContent ===
        "Campaign imported successfully.",
    );
    assert.equal(
      await page.evaluate(() => game.campaign.totalScore),
      exported.game.campaign.totalScore,
    );
    await page.keyboard.press("Escape");
    await page.click("#newPatrolBtn");
    await page.setViewportSize({ width: 1024, height: 768 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.locator("#departBtn").click();
    assert.equal(await page.evaluate(() => game.phase), "patrol");
    // Exercise the standalone distribution in a fresh page, with no source dependencies.
    const standalone = await browser.newPage();
    standalone.on("pageerror", (e) => errors.push(e.message));
    await standalone.goto(
      pathToFileURL(path.join(root, "dist/gato_convoy_patrol_v15.html")).href,
    );
    await standalone.click("#newPatrolBtn");
    await standalone.click("#departBtn");
    assert.equal(await standalone.evaluate(() => game.phase), "patrol");
    assert.deepEqual(errors, []);
    console.log(
      "PASS: browser menus, approach selection, shared aim, target selection, spread firing, log pause, silent running, decoys, simulated controller LT, JSON export/import and corrupt-file rejection, 1024px layout, and standalone startup. No JavaScript page errors.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
