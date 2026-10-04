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
      acceptDownloads: true,
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      globalThis.virtualPad = {
        index: 0,
        id: "Xbox standard test pad",
        mapping: "standard",
        connected: true,
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 18 }, () => ({
          pressed: false,
          value: 0,
        })),
      };
      Object.defineProperty(navigator, "getGamepads", {
        value: () => (virtualPad.connected ? [virtualPad] : []),
      });
    });
    await page.goto(pathToFileURL(path.join(root, "index.html")).href);
    async function press(i, ms = 65) {
      await page.evaluate((i) => {
        virtualPad.buttons[i].pressed = true;
        virtualPad.buttons[i].value = 1;
      }, i);
      await page.waitForTimeout(ms);
      await page.evaluate((i) => {
        virtualPad.buttons[i].pressed = false;
        virtualPad.buttons[i].value = 0;
      }, i);
      await page.waitForTimeout(65);
    }
    async function focus(selector) {
      for (let i = 0; i < 50; i++) {
        const state = await page.evaluate(
          (selector) => ({
            selected: document.activeElement?.matches(selector),
            available: menuItems(interfaceScreen()).some((e) =>
              e.matches(selector),
            ),
          }),
          selector,
        );
        assert(state.available, "Unavailable menu control " + selector);
        if (state.selected) return;
        await press(13);
      }
      throw Error("Could not navigate to " + selector);
    }
    async function choose(selector) {
      await focus(selector);
      await press(0);
    }
    // First controller button operates the opening screen without any mouse click.
    await press(0);
    assert.equal(await page.evaluate(() => game.phase), "port");
    await press(1);
    assert.equal(await page.evaluate(() => interfaceScreen().id), "splash");
    await focus("#difficulty");
    const old = await page.inputValue("#difficulty");
    await press(15);
    assert.notEqual(await page.inputValue("#difficulty"), old);
    assert.equal(
      await page.evaluate(() => config.difficulty),
      await page.inputValue("#difficulty"),
    );
    await press(14);
    assert.equal(await page.inputValue("#difficulty"), old);
    for (const id of [
      "cfgAircraft",
      "cfgHeavy",
      "cfgAutosave",
      "cfgSonarPenalty",
      "cfgSound",
    ]) {
      await focus("#" + id);
      const before = await page.isChecked("#" + id);
      await press(0);
      assert.equal(await page.isChecked("#" + id), !before);
      await press(0);
    }
    await press(3);
    assert.equal(
      await page.evaluate(() => interfaceScreen().id),
      "helpOverlay",
    );
    const helpBefore = await page.evaluate(
      () => document.getElementById("fieldGuideText").scrollTop,
    );
    await page.evaluate(() => (virtualPad.axes[3] = 1));
    await page.waitForTimeout(250);
    await page.evaluate(() => (virtualPad.axes[3] = 0));
    assert(
      (await page.evaluate(
        () => document.getElementById("fieldGuideText").scrollTop,
      )) >= helpBefore,
    );
    await press(1);
    assert.equal(await page.evaluate(() => interfaceScreen().id), "splash");
    await choose("#resumeBtn");
    await choose("#sailor-engineer");
    assert.equal(
      await page.evaluate(() => document.activeElement.id),
      "assignCrewBtn",
    );
    await press(0);
    assert.equal(await page.evaluate(() => game.campaign.crew[0]), "engineer");
    await press(1);
    assert.equal(
      await page.evaluate(() => document.activeElement.id),
      "sailor-engineer",
    );
    await choose("#sailor-chief");
    await press(0);
    await press(1);
    await choose("#sailor-torpedoman");
    await press(0);
    await press(1);
    assert.equal(await page.evaluate(() => game.campaign.crew.length), 3);
    await choose("#sailor-sonarman");
    assert(await page.locator("#assignCrewBtn").isDisabled());
    // A held direction repeats at menu rate rather than simulation rate.
    await press(12, 600);
    assert(
      await page.evaluate(
        () => !!document.activeElement?.classList.contains("padFocus"),
      ),
    );
    await choose("#campaignSortieBtn");
    await choose("#approachChoices button:nth-child(3)");
    assert.equal(await page.evaluate(() => game.plannedApproach), "aggressive");
    await page.evaluate(() => {
      game.campaign.points = 1;
      renderPort();
    });
    await choose('[data-upgrade="battery"]');
    assert.equal(await page.evaluate(() => game.campaign.upgrades.battery), 1);
    assert.equal(await page.evaluate(() => game.campaign.points), 0);
    await choose("#harborSortieBtn");
    fs.mkdirSync(path.join(root, "artifacts"), { recursive: true });
    await page
      .locator(".crewStation")
      .screenshot({ path: path.join(root, "artifacts/v15-crew.png") });
    await focus("#departBtn");
    await page.evaluate(() => {
      virtualPad.buttons[0].pressed = true;
    });
    await page.waitForTimeout(60);
    await page.evaluate(() => {
      virtualPad.buttons[7].pressed = true;
      virtualPad.axes[1] = -1;
    });
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => game.phase), "patrol");
    assert.equal(await page.evaluate(() => game.time), 0);
    assert.equal(await page.evaluate(() => game.sub.sonarCD), 0);
    assert.equal(await page.evaluate(() => game.sub.deck), 12);
    await page.evaluate(() => {
      virtualPad.buttons[0].pressed = false;
      virtualPad.buttons[7].pressed = false;
      virtualPad.axes[1] = 0;
    });
    await page.waitForTimeout(100);
    assert((await page.evaluate(() => game.time)) > 0);
    assert.equal(await page.evaluate(() => game.sub.sonarCD), 0);
    await press(6);
    assert.equal(await page.evaluate(() => game.sub.fwdTubes), 5);
    await press(1);
    assert.equal(await page.evaluate(() => game.sub.targetDepth), 60);
    await press(3);
    assert(
      await page.evaluate(() => !!localStorage.getItem(SAVE_KEY + "_manual")),
    );
    await press(9);
    assert.equal(await page.evaluate(() => interfaceScreen().id), "splash");
    await page.screenshot({ path: path.join(root, "artifacts/v15-menu.png") });
    await press(2);
    assert.equal(await page.evaluate(() => interfaceScreen().id), "logOverlay");
    const time = await page.evaluate(() => game.time);
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => game.time), time);
    await press(1);
    assert.equal(await page.evaluate(() => interfaceScreen().id), "splash");
    await choose("#loadManualBtn");
    assert.equal(await page.evaluate(() => game.phase), "patrol");
    await press(9);
    await focus("#exportBtn");
    const download = page.waitForEvent("download");
    await press(0);
    const downloaded = await download;
    await downloaded.saveAs(
      path.join(root, "artifacts/v15-controller-save.json"),
    );
    await choose("#loadPatrolBtn");
    assert.equal(await page.evaluate(() => game.phase), "patrol");
    await page.screenshot({
      path: path.join(root, "artifacts/v15-patrol.png"),
    });
    // Disconnect pauses the boat; reconnect leaves menus usable.
    await page.evaluate(() => (virtualPad.connected = false));
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => interfaceScreen().id), "splash");
    await page.evaluate(() => (virtualPad.connected = true));
    await press(1);
    assert.equal(await page.evaluate(() => game.phase), "patrol");
    // Synthetic result fixture isolates menu flow; gameplay completion is covered by logic tests.
    await page.evaluate(() => finishPatrol("partial"));
    await page.waitForTimeout(80);
    assert.equal(await page.evaluate(() => interfaceScreen().id), "death");
    await page.screenshot({
      path: path.join(root, "artifacts/v15-report.png"),
    });
    await press(1);
    assert.equal(await page.evaluate(() => interfaceScreen().id), "splash");
    assert.equal(await page.evaluate(() => death.style.display), "none");
    await choose("#resumeBtn");
    assert.equal(await page.evaluate(() => interfaceScreen().id), "death");
    await choose("#nextPatrolBtn");
    assert.equal(await page.evaluate(() => game.phase), "port");
    await page.setViewportSize({ width: 1024, height: 768 });
    await choose("#sailor-chief");
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    const box = await page.locator("#assignCrewBtn").boundingBox();
    assert(
      box.y >= 0 && box.y + box.height < 768,
      "Focused assignment visible on laptop",
    );
    await page.screenshot({
      path: path.join(root, "artifacts/v15-laptop.png"),
    });
    await press(1);
    await press(1);
    await choose("#newPatrolBtn");
    assert.equal(await page.evaluate(() => game.campaign.crew.length), 0);
    // Native import remains the original browser file picker; exercise its existing file input.
    await press(1);
    await page.setInputFiles(
      "#importFile",
      path.join(root, "artifacts/v15-controller-save.json"),
    );
    await page.waitForFunction(
      () =>
        document.getElementById("transferStatus").textContent ===
        "Campaign imported successfully.",
    );
    assert.equal(await page.evaluate(() => game.campaign.crew.length), 3);
    // Standalone can also be started and launched with nothing but controller input.
    await page.goto(
      pathToFileURL(path.join(root, "dist/gato_convoy_patrol_v15.html")).href,
    );
    await press(0);
    assert.equal(await page.evaluate(() => game.phase), "port");
    await choose("#departBtn");
    assert.equal(await page.evaluate(() => game.phase), "patrol");
    assert.deepEqual(errors, []);
    console.log(
      "PASS: controller-only opening, config/select/checkboxes, crew assignment/back/cap, approaches, upgrades, scrolling, departure release gate, existing combat bindings, save/load/export, log/help, disconnect/reconnect, results/return, laptop focus, import compatibility and standalone launch. Native OS picker is outside controller navigation.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
