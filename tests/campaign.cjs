const fs = require("fs"),
  vm = require("vm"),
  assert = require("assert"),
  path = require("path");
const ROOT = path.resolve(__dirname, "..");
const elements = {},
  storage = {};
const cx = new Proxy({}, { get: () => () => {} });
function createEl() {
  return {
    style: { display: "none" },
    value: "normal",
    checked: true,
    textContent: "",
    innerHTML: "",
    dataset: {},
    children: [],
    events: {},
    addEventListener(k, fn) {
      this.events[k] = fn;
    },
    setAttribute() {},
    appendChild(x) {
      this.children.push(x);
    },
    getContext() {
      return cx;
    },
  };
}
const el = (id) => (elements[id] ??= createEl());
el("splash").style.display = "flex";
const doc = {
  hidden: false,
  getElementById: el,
  querySelector: el,
  createElement: createEl,
  addEventListener() {},
};
const math = Object.create(Math);
let seed = 12345;
math.random = () => {
  seed = (1664525 * seed + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
const context = vm.createContext({
  document: doc,
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
  Math: math,
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
  `function resetCampaign(p=1,upgrades={}){newGame(normalizeCampaign({patrol:p,upgrades}));config.aircraft=false;config.autosave=false;config.sound=false;game.sub.x=800;game.sub.y=760;game.nextEncounterIn=9999;}function tick(n,dt=1/60){for(let i=0;i<n;i++)update(dt);}function extract(){game.ships=[];game.plane=null;game.sub.x=EXIT.x;game.sub.y=EXIT.y;game.sub.speed=0;tick(920);}`,
  context,
);
const reports = [];
function test(name, src) {
  try {
    vm.runInContext("{" + src + "}", context);
    reports.push({ name, status: "PASS" });
  } catch (e) {
    reports.push({ name, status: "FAIL", error: e.stack });
  }
}
test(
  "New campaign opens port; depart creates mission 1",
  `newCampaign();assert.equal(game.phase,'port');assert.equal(game.campaign.points,0);let time=game.time;tick(100);assert.equal(game.time,time);departPort();assert.equal(game.phase,'patrol');assert.equal(game.mission.id,1);assert.equal(game.ships.filter(s=>!s.escort).length,2);`,
);
test(
  "Patrol 1 two merchants, extraction, award once",
  `resetCampaign();game.ships.filter(s=>!s.escort).forEach(sink);assert(objectiveComplete());extract();assert.equal(game.outcome,'success');assert.equal(game.campaign.points,1);finishPatrol('success');awardMission();assert.equal(game.campaign.points,1);nextPatrol();assert.equal(game.phase,'port');assert.equal(game.portMission,2);`,
);
test(
  "Upgrade purchase cost, cap, and no spending at sea",
  `game.campaign.points=3;assert(buyUpgrade('reload'));assert.equal(game.campaign.points,2);assert(buyUpgrade('reload'));assert.equal(upgradeLevel('reload'),2);assert(!buyUpgrade('reload'));assert.equal(game.campaign.points,1);departPort();assert(!buyUpgrade('battery'));assert.equal(upgradeLevel('reload'),2);`,
);
test(
  "Patrol 2 requires designated tanker, bonus needs extra merchant",
  `resetCampaign(2);const other=makeShip(600,300,0,'tanker',0);game.ships.push(other);sink(other);assert(!objectiveComplete());sink(game.ships.find(s=>s.id===game.mission.targetId));assert(objectiveComplete());extract();assert.equal(game.campaign.points,2);assert(game.mission.bonusEarned);`,
);
test(
  "Escaped target cannot be replaced by unrelated sink",
  `resetCampaign(2);const t=game.ships.find(s=>s.id===game.mission.targetId);t.x=-300;update(.02);assert(game.mission.failed);assert(!objectiveComplete());extract();assert.equal(game.outcome,'partial');assert.equal(game.campaign.points,0);nextPatrol();assert.equal(game.portMission,2);departPort();assert(!game.mission.failed);assert(game.ships.some(s=>s.id===game.mission.targetId));`,
);
test(
  "Rescue requires slow surfaced dwell; interrupted dwell resets",
  `resetCampaign(3);game.ships=[];const s=game.sub;s.x=game.mission.rescueX;s.y=game.mission.rescueY;s.depth=12;s.targetDepth=12;tick(60);assert.equal(game.mission.rescueProgress,0);s.depth=0;s.targetDepth=0;s.speed=20;tick(15);assert.equal(game.mission.rescueProgress,0);s.x=game.mission.rescueX;s.y=game.mission.rescueY;s.speed=0;tick(300);assert(game.mission.rescueProgress>4);s.depth=12;s.targetDepth=12;update(.02);assert.equal(game.mission.rescueProgress,0);s.depth=0;s.targetDepth=0;tick(730);assert(game.mission.rescued);extract();assert.equal(game.outcome,'success');assert.equal(game.campaign.points,2);`,
);
test(
  "Transport deadline and interception bonus",
  `resetCampaign(4);let target=game.ships.find(s=>s.id===game.mission.targetId);assert.equal(target.type,'transport');assert(game.mission.deadline>90);sink(target);assert(bonusComplete());extract();assert.equal(game.campaign.points,2);resetCampaign(4);target=game.ships.find(s=>s.id===game.mission.targetId);target.x=1511;updateMission(.01);assert(game.mission.failed);`,
);
test(
  "Patrol 5 tonnage and finite campaign ending",
  `resetCampaign(5);assert(game.ships.some(s=>s.heavy));game.stats.tonnage=23999;assert(!objectiveComplete());game.stats.tonnage=24000;assert(objectiveComplete());extract();assert(game.campaign.ended);assert.equal(document.getElementById('resultTitle').textContent,'CAMPAIGN COMPLETE');const phase=game.phase;nextPatrol();assert.equal(game.phase,phase);`,
);
test(
  "Reload upgrade actually reduces time",
  `resetCampaign(2,{reload:2});game.sub.fwdTubes=0;reloadTorpedoes();assert.equal(game.sub.torpReloadT,6.08);`,
);
test(
  "Battery upgrade reduces depletion",
  `resetCampaign(2);game.ships=[];game.sub.depth=60;game.sub.targetDepth=60;tick(300);const used=100-game.sub.battery;resetCampaign(2,{battery:2});game.ships=[];game.sub.depth=60;game.sub.targetDepth=60;tick(300);assert(Math.abs((100-game.sub.battery)-used/1.3)<1e-8);`,
);
test(
  "Quiet machinery reduces acoustic acquisition",
  `resetCampaign(2);game.ships=[];game.sub.depth=60;game.sub.speed=29;const a=makeShip(1000,760,0,'escort',0);a.sonarT=99;updateEscort(a,1);const base=a.contact;game.campaign.upgrades.quiet=2;const b=makeShip(1000,760,0,'escort',0);b.sonarT=99;updateEscort(b,1);assert(b.contact<base);assert(base>0);`,
);
test(
  "Sonar training extends fixes",
  `resetCampaign(2,{sonar:2});game.ships=[makeShip(800,500,0,'merchant',0)];game.sub.depth=12;activeSonar();assert.equal(game.sub.sonarMarks[0].ttl,6.5);`,
);
test(
  "Damage control repairs once and blocks weapons during repair",
  `resetCampaign(2,{repair:2});game.ships=[];game.sub.hull=50;emergencyRepair();fireTorpedo();assert.equal(game.shots.length,0);tick(610);assert.equal(game.sub.hull,75);assert.equal(game.sub.repairCharges,0);emergencyRepair();assert.equal(game.sub.repairT,0);`,
);
test(
  "Port save round-trip preserves points, upgrades and next mission",
  `resetCampaign(2,{battery:1});game.mission.targetSunk=true;game.stats.merchants=1;extract();nextPatrol();assert.equal(game.portMission,3);buyUpgrade('quiet');saveGame(true);const p=game.campaign.points;newCampaign();assert(loadGame(true,true));assert.equal(game.phase,'port');assert.equal(game.portMission,3);assert.equal(upgradeLevel('battery'),1);assert.equal(upgradeLevel('quiet'),1);assert.equal(game.campaign.points,p);departPort();assert.equal(game.mission.id,3);`,
);
test(
  "Rescue progress and incoming attacks survive save/load",
  `resetCampaign(3);game.mission.rescueProgress=7;game.charges.push({x:800,y:760,t:2,total:3,depth:12,kind:'depth',power:22,radius:82});saveGame(true);game.mission.rescueProgress=0;game.charges=[];assert(loadGame());assert.equal(game.mission.rescueProgress,7);assert.equal(game.charges.length,1);`,
);
test(
  "Version 11 migration preserves active state and starts campaign safely",
  `resetCampaign(4);const old=JSON.parse(JSON.stringify(game));delete old.mission;delete old.phase;old.campaign={patrol:8,totalScore:1234,totalTonnage:5678};old.sub.hull=64;const g=migrateSave({version:11,game:old});assert.equal(g.campaign.patrol,1);assert.equal(g.campaign.totalScore,1234);assert.equal(g.sub.hull,64);assert.equal(g.mission.id,1);assert.equal(g.phase,'patrol');assert.equal(g.campaign.points,0);`,
);
test(
  "Paused port resumes without bypassing departure",
  `newCampaign();openSplash();closeSplash();assert.equal(game.phase,'port');assert.equal(document.getElementById('port').style.display,'flex');const time=game.time;tick(100);assert.equal(game.time,time);`,
);
test(
  "Early return credits no campaign score or tonnage",
  `resetCampaign();const first=game.ships.find(s=>!s.escort);game.score=0;sink(first);const patrolScore=game.score;assert(patrolScore>0);assert(!objectiveComplete());extract();assert.equal(game.outcome,'partial');assert(game.score>=patrolScore);assert.equal(game.campaign.totalScore,0);assert.equal(game.campaign.totalTonnage,0);`,
);
test(
  "Repeated early returns cannot farm campaign total",
  `resetCampaign();for(let n=0;n<3;n++){const m=game.ships.find(s=>!s.escort);if(m)sink(m);extract();assert.equal(game.outcome,'partial');assert.equal(game.campaign.totalScore,0);assert.equal(game.campaign.totalTonnage,0);nextPatrol();assert.equal(game.portMission,1);departPort();assert.equal(game.mission.id,1);}`,
);
test(
  "Successful patrol still credits campaign score and tonnage",
  `resetCampaign();game.ships.filter(s=>!s.escort).forEach(sink);assert(objectiveComplete());const tons=game.stats.tonnage;assert(tons>0);extract();assert.equal(game.outcome,'success');assert(game.campaign.totalScore>0);assert.equal(game.campaign.totalTonnage,tons);`,
);
test(
  "Full five-mission campaign earns and spends points without skipping",
  `newCampaign();for(let n=1;n<=5;n++){departPort();config.aircraft=false;config.autosave=false;assert.equal(game.mission.id,n);if(n===1)game.stats.merchants=2;if(n===2||n===4){game.mission.targetSunk=true;game.mission.targetKillTime=0;game.stats.merchants=1;}if(n===3)game.mission.rescued=true;if(n===5)game.stats.tonnage=24000;extract();assert.equal(game.outcome,'success');assert(game.campaign.completed.includes(n));if(n<5){nextPatrol();const u=UPGRADES.find(x=>upgradeLevel(x.id)<2);assert(buyUpgrade(u.id));}}assert(game.campaign.ended);assert.equal(game.campaign.completed.length,5);assert.equal(game.campaign.log.length,5);render();renderHUD();`,
);
console.log(JSON.stringify(reports, null, 2));
if (reports.some((x) => x.status === "FAIL")) process.exitCode = 1;
