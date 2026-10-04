const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm"),
  assert = require("node:assert/strict");
const ROOT = path.resolve(__dirname, ".."),
  elements = {},
  storage = {};
const cx = new Proxy({}, { get: () => () => {} });
function elem() {
  return {
    style: { display: "none" },
    value: "normal",
    checked: true,
    dataset: {},
    children: [],
    textContent: "",
    innerHTML: "",
    setAttribute() {},
    addEventListener() {},
    appendChild(x) {
      this.children.push(x);
    },
    getContext() {
      return cx;
    },
  };
}
const el = (id) => (elements[id] ??= elem());
el("splash").style.display = "flex";
const document = {
  getElementById: el,
  querySelector: el,
  createElement: elem,
  addEventListener() {},
  body: elem(),
};
const context = vm.createContext({
  document,
  window: {},
  navigator: {
    getGamepads() {
      return [];
    },
  },
  localStorage: {
    getItem: (k) => storage[k] || null,
    setItem: (k, v) => (storage[k] = v),
  },
  performance: { now: () => 0 },
  requestAnimationFrame() {},
  addEventListener() {},
  Math,
  console,
  assert,
});
vm.runInContext(
  ["interface", "harbor", "tactics", "game"]
    .map((n) => fs.readFileSync(path.join(ROOT, "src", n + ".js"), "utf8"))
    .join("\n"),
  context,
);
vm.runInContext(
  `function reset(){newGame();config.aircraft=false;config.autosave=false;config.sound=false;game.ships=[];game.nextEncounterIn=9999;game.sub.x=800;game.sub.y=700;}function tick(n){for(let i=0;i<n;i++)update(1/60);}function payload(){return JSON.stringify({version:13,nextShipId,config,game});}`,
  context,
);
const reports = [];
async function test(name, code) {
  try {
    await vm.runInContext("(async()=>{" + code + "})()", context);
    reports.push({ name, status: "PASS" });
  } catch (e) {
    reports.push({ name, status: "FAIL", error: e.stack });
  }
}
(async () => {
  await test(
    "Three-shot spread consumes exactly three selected-bank torpedoes",
    `reset();game.sub.spread=1;fireTorpedo();assert.equal(game.shots.length,3);assert.equal(game.sub.fwdTubes,3);assert.equal(game.stats.torpedoesFired,3);assert(game.shots[0].a<game.shots[1].a&&game.shots[1].a<game.shots[2].a);game.sub.torpCD=0;game.sub.fwdTubes=2;fireTorpedo();assert.equal(game.sub.fwdTubes,2);assert.equal(game.shots.length,3);`,
  );
  await test(
    "Silent running limits speed and pauses independent reloads",
    `reset();game.sub.depth=60;game.sub.targetDepth=60;game.sub.fwdTubes=0;reloadTorpedoes();game.sub.deck=0;beginReload();toggleSilent();keys.KeyW=true;tick(180);assert(game.sub.speed<=12);assert.equal(game.sub.torpReloadT,8);assert.equal(game.sub.mounts[0].reload,3.5);delete keys.KeyW;toggleSilent();tick(60);assert(game.sub.torpReloadT<8);`,
  );
  await test(
    "Decoys redirect distant escorts but do not fool close escorts",
    `reset();game.sub.depth=60;game.sub.targetDepth=60;const far=makeShip(1050,700,Math.PI,'escort',20),close=makeShip(850,700,Math.PI,'escort',20);game.ships=[far,close];deployDecoy();assert.equal(game.sub.decoyCount,1);assert.equal(far.state,'decoy');assert.equal(close.decoyId,undefined);assert(updateDecoyEscort(far,.02));game.decoys[0].ttl=0;assert(!updateDecoyEscort(far,.02));assert.equal(far.state,'search');`,
  );
  await test(
    "Analytic lead solution and unreachable target",
    `const sol=interceptSolution({x:0,y:0},{x:220,y:0,vx:0,vy:0});assert.equal(sol.time,1);assert.equal(sol.x,220);assert.equal(interceptSolution({x:0,y:0},{x:5000,y:0,vx:0,vy:0}),null);`,
  );
  await test(
    "Tracking builds with observation and decays after lost contact without using hidden position",
    `reset();const sh=makeShip(800,400,0,'merchant',20);game.ships=[sh];selectTarget();for(let i=0;i<180;i++){game.time+=1/60;sh.x+=20/60;updateTargeting(1/60);}const q=game.targeting.quality;assert(q>.2);game.sub.depth=60;sh.x=1500;sh.y=50;sh.a=2;game.time++;updateTargeting(1);assert(game.targeting.quality<q);assert(game.targeting.estimate.x<1000);`,
  );
  await test(
    "Merchant evasive steering and escort screening roles",
    `reset();game.encounter=2;const m=makeShip(500,300,0,'merchant',20),hunter=makeShip(450,320,0,'escort',20),guard=makeShip(530,400,0,'escort',20);guard.role='guard';game.ships=[m,hunter,guard];alertConvoy(m,{x:800,y:700});assert(m.alertUntil>game.time);game.time=2;merchantCourse(m,1);assert.notEqual(m.a,m.routeA);assert(convoyGuardPoint(guard));assert.equal(hunter.state,'investigate');`,
  );
  await test(
    "Approach selection changes departure position and escort count",
    `newCampaign();game.plannedApproach='aggressive';departPort();assert.equal(game.sub.x,420);assert.equal(game.sub.y,580);assert.equal(game.ships.filter(s=>s.escort).length,2);assert.equal(approachDef(game.approach).reward,1.2);`,
  );
  await test(
    "Weather consistently reduces visual and aircraft exposure and increases dispersion",
    `reset();game.weather=weatherFor(2);assert(visualRange()<1000);game.weather=weatherFor(3);assert(game.weather.gunSpread>1);assert(game.weather.airFactor<1);`,
  );
  await test(
    "Time compression refuses threats and drops to normal as threats approach",
    `reset();game.sub.x=1000;game.sub.y=500;assert(safeToAccelerate());cycleTime();assert.equal(game.timeScale,2);game.ships=[makeShip(1010,500,0,'escort',0)];updateTactics(.02,100);assert.equal(game.timeScale,1);cycleTime();assert.equal(game.timeScale,1);`,
  );
  await test(
    "Log is bounded and log overlay pauses simulation",
    `reset();for(let i=0;i<230;i++)recordEvent('Event '+i);assert.equal(game.log.length,200);toggleLog();const t=game.time;tick(60);assert.equal(game.time,t);toggleLog();update(.02);assert(game.time>t);`,
  );
  await test(
    "Portable v13 data round-trips salvo, decoy, tracking, and reload state",
    `reset();game.sub.depth=12;game.sub.targetDepth=12;game.sub.spread=2;fireTorpedo();deployDecoy();reloadTorpedoes();const loaded=parsePortableSave(payload()).restored;assert.equal(loaded.sub.spread,2);assert.equal(loaded.shots.length,3);assert.equal(loaded.decoys.length,1);assert(loaded.sub.torpReloading);`,
  );
  await test(
    "Corrupt or oversized imports fail without replacing current session",
    `reset();const before=game;assert.equal(await importSaveFile({size:10,text:async()=>'{broken'}),false);assert.equal(game,before);assert.equal(await importSaveFile({size:3000000,text:async()=>payload()}),false);assert.equal(game,before);const bad=JSON.parse(payload());bad.game.sub.mounts[0].reload='oops';assert.equal(await importSaveFile({size:100,text:async()=>JSON.stringify(bad)}),false);assert.equal(game,before);`,
  );
  await test(
    "Imported HUD text is escaped and dangerous object keys are rejected",
    `assert.equal(escapeHTML('<img onerror="x">'),'&lt;img onerror=&quot;x&quot;&gt;');assert.throws(()=>parsePortableSave('{"version":13,"__proto__":{}}'));`,
  );
  await test(
    "Port JSON import preserves selected approach and upgrades",
    `newCampaign();game.campaign.points=2;buyUpgrade('sonar');game.plannedApproach='cautious';const text=payload();newCampaign();assert(await importSaveFile({size:text.length,text:async()=>text}));assert.equal(game.phase,'port');assert.equal(game.plannedApproach,'cautious');assert.equal(upgradeLevel('sonar'),1);`,
  );
  await test(
    "Version 12 campaign save gains tactics without resetting mission or upgrades",
    `reset();game.mission=freshMission(3);game.campaign.patrol=3;game.campaign.upgrades.battery=2;const old=JSON.parse(payload());old.version=12;delete old.game.targeting;delete old.game.weather;delete old.game.decoys;const restored=parsePortableSave(JSON.stringify(old)).restored;assert.equal(restored.mission.id,3);assert.equal(restored.campaign.upgrades.battery,2);assert.equal(restored.sub.decoyCount,2);assert.equal(restored.weather.rough,true);`,
  );
  console.log(JSON.stringify(reports, null, 2));
  if (reports.some((x) => x.status === "FAIL")) process.exitCode = 1;
})();
