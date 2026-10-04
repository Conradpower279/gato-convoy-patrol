const { chromium } = require("playwright");
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { pathToFileURL } = require("node:url");
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
      viewport: { width: 1440, height: 1000 },
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(pathToFileURL(path.join(root, "index.html")).href);
    await page.click("#newPatrolBtn");
    await page.click("#harborSortieBtn");
    for (const id of ["captain", "engineer", "torpedoman"]) {
      await page.click("#sailor-" + id);
      await page.click("#assignCrewBtn");
      assert((await page.textContent("#crewQuote")).includes("—"));
    }
    await page.click("#sailor-sonarman");
    assert(await page.locator("#assignCrewBtn").isDisabled());
    assert.equal(await page.textContent("#crewCount"), "3 / 3 assigned");
    await page.click("#sailor-captain");
    await page.click("#assignCrewBtn");
    await page.click("#sailor-sonarman");
    await page.click("#assignCrewBtn");
    assert(
      (await page.textContent("#crewQuote")).includes("The ocean’s talking."),
    );
    await page.waitForTimeout(1900);
    fs.mkdirSync(path.join(root, "artifacts"), { recursive: true });
    await page
      .locator(".crewStation")
      .screenshot({ path: path.join(root, "artifacts/crew-pier.png") });
    await page.screenshot({
      path: path.join(root, "artifacts/harbor-port.png"),
    });
    await page.click("#departBtn");
    assert.equal(await page.evaluate(() => game.mission.id), 6);
    assert.equal(await page.evaluate(() => game.sub.targetDepth), 12);
    assert.equal(await page.evaluate(() => game.sub.torpReserve), 12);
    assert.equal(await page.evaluate(() => game.campaign.crew.length), 3);
    await page.screenshot({
      path: path.join(root, "artifacts/harbor-raid.png"),
    });
    await page.keyboard.press("f");
    assert.equal(await page.evaluate(() => game.sub.deck), 12);
    await page.keyboard.press("Space");
    await page.waitForFunction(() => game.sub.fwdTubes === 5);
    // Round-trip an in-progress raid with a partial objective using the same public import path.
    const saved = await page.evaluate(() => {
      game.harbor.fuelHP = 84;
      return JSON.stringify({ version: 14, nextShipId, config, game });
    });
    await page.keyboard.press("Escape");
    await page.setInputFiles("#importFile", {
      name: "raid.json",
      mimeType: "application/json",
      buffer: Buffer.from(saved),
    });
    await page.waitForFunction(
      () =>
        document.getElementById("transferStatus").textContent ===
        "Campaign imported successfully.",
    );
    assert.equal(await page.evaluate(() => game.harbor.fuelHP), 84);
    assert.equal(await page.evaluate(() => game.weather.night), true);
    assert.equal(await page.evaluate(() => game.campaign.crew.length), 3);
    await page.keyboard.press("Escape");
    await page.click("#newPatrolBtn");
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.click("#sailor-chief");
    await page.click("#assignCrewBtn");
    assert.equal(await page.evaluate(() => game.campaign.crew[0]), "chief");
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({ path: path.join(root, "artifacts/crew-1024.png") });
    // Standalone needs no server, assets or external scripts.
    const standalone = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    standalone.on("pageerror", (e) => errors.push(e.message));
    await standalone.goto(
      pathToFileURL(path.join(root, "dist/gato_convoy_patrol_v15.html")).href,
    );
    await standalone.click("#newPatrolBtn");
    await standalone.click("#sailor-chief");
    await standalone.click("#assignCrewBtn");
    await standalone.click("#harborSortieBtn");
    await standalone.click("#departBtn");
    assert.equal(await standalone.evaluate(() => game.mission.id), 6);
    assert.equal(await standalone.evaluate(() => game.sub.repairCharges), 1);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: crew inspection, assignment, three-slot cap, removal, quote, boarding, raid departure, PD weapon restriction, torpedo key, raid import, 1024px layout, and standalone harbor/crew. No page errors.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
