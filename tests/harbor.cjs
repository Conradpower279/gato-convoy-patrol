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

function check(name, code) {
  test(name, code);
}
check(
  "Crew limited to three, freely removable at port, locked at sea",
  `
newCampaign();assert(toggleCrew('captain'));assert(toggleCrew('engineer'));assert(toggleCrew('chief'));assert(!toggleCrew('sonarman'));assert.equal(game.campaign.crew.length,3);assert(toggleCrew('chief'));assert(toggleCrew('sonarman'));departPort();assert(!toggleCrew('captain'));assert.equal(game.campaign.crew.length,3);`,
);
check(
  "Crew IDs normalize without duplicates or unknown perks",
  `
const c=normalizeCampaign({crew:['captain','captain','bogus','engineer','sonarman','chief']});assert.equal(c.crew.join(','),'captain,engineer,sonarman');`,
);
check(
  "Captain trades faster contact decay for slower deck reload only",
  `
newGame({crew:['captain']});config.sound=false;game.sub.deck=0;beginReload(0);assert(Math.abs(game.sub.mounts[0].reload-3.85)<1e-8);game.sub.bofors=0;beginReload(1);assert.equal(game.sub.mounts[1].reload,2.5);const e=makeShip(50,50,0,'escort',0);e.contact=.5;updateEscort(e,1);assert(Math.abs(e.contact-(.5-.055*1.1))<1e-8);`,
);
check(
  "Engineer battery endurance and movement noise both change",
  `
newGame();config.aircraft=false;game.ships=[];game.sub.depth=60;game.sub.targetDepth=60;update(1);const drain=100-game.sub.battery;
newGame({crew:['engineer']});config.aircraft=false;game.ships=[];game.sub.depth=60;game.sub.targetDepth=60;update(1);assert(Math.abs((100-game.sub.battery)*1.1-drain)<1e-8);game.sub.speed=30;const e=makeShip(game.sub.x+250,game.sub.y,0,'escort',0);e.sonarT=99;updateEscort(e,.1);const noisy=e.contact;game.campaign.crew=[];const other=makeShip(game.sub.x+250,game.sub.y,0,'escort',0);other.sonarT=99;updateEscort(other,.1);assert(Math.abs(noisy-other.contact*1.05)<1e-8);`,
);
check(
  "Chief gives usable 20-hull repair and 12-second drawback; upgrade stacks",
  `
newGame({crew:['chief']});config.aircraft=false;game.ships=[];game.sub.hull=60;emergencyRepair();assert.equal(game.sub.repairT,12);tick(721);assert.equal(game.sub.hull,80);assert.equal(game.sub.repairCharges,0);newGame({crew:['chief'],upgrades:{repair:2}});game.ships=[];config.aircraft=false;game.sub.hull=60;emergencyRepair();tick(721);assert.equal(game.sub.hull,90);`,
);
check(
  "Torpedoman reserve cost, reload buff, and no repeated load penalty",
  `
newGame({crew:['torpedoman']});assert.equal(game.sub.torpReserve,12);game.sub.fwdTubes=0;reloadTorpedoes();assert.equal(game.sub.torpReloadT,7.2);const payload=JSON.stringify({version:14,nextShipId,game});const restored=parsePortableSave(payload).restored;assert.equal(restored.sub.torpReserve,12);assert.equal(restored.campaign.crew[0],'torpedoman');`,
);
check(
  "Sonarman longer fixes and larger ping alert radius",
  `
newGame({crew:['sonarman']});game.sub.depth=12;game.ships=[makeShip(game.sub.x,game.sub.y-100,0,'merchant',0)];activeSonar();assert.equal(game.sub.sonarMarks[0].ttl,5.75);assert(Math.abs(game.signals.find(s=>s.type==='ping').radius-748)<1e-8);`,
);
check(
  "Raid starts at PD at night with two moored ships and one patrol",
  `
newGame({patrol:3},'harbor');assert.equal(game.sub.depth,12);assert.equal(game.sub.targetDepth,12);assert(game.weather.night);assert(!game.weather.rough);assert.equal(game.campaign.patrol,3);assert.equal(game.mission.id,6);assert.equal(game.ships.filter(s=>s.moored).length,2);assert.equal(game.ships.filter(s=>s.escort).length,1);const xs=game.ships.filter(s=>s.moored).map(s=>s.x);tick(120);assert.equal(game.ships.filter(s=>s.moored).map(s=>s.x).join(','),xs.join(','));`,
);
check(
  "Ships need real torpedo hits; shore tank takes four deck shells; all required",
  `
newGame({},'harbor');game.ships=game.ships.filter(s=>s.moored);config.sound=false;for(const sh of [...game.ships]){for(let i=0;i<2;i++){game.shots.push({x:sh.x,y:sh.y+50,a:-Math.PI/2,speed:220,life:7,damage:85});for(let j=0;j<30;j++)updateProjectiles(.025);}}assert.equal(game.harbor.sunk.length,2);assert(!objectiveComplete());for(let i=0;i<4;i++){game.shells.push({x:940,y:180,a:-Math.PI/2,speed:440,life:1.8,damage:28,weapon:0});for(let j=0;j<10;j++)updateProjectiles(.025);}assert.equal(game.harbor.fuelHP,0);assert(objectiveComplete());`,
);
check(
  "Shoreline blocks torpedoes but tank is reachable by deck shells",
  `
newGame({},'harbor');const b={x:940,y:100,life:7,damage:85};assert(harborProjectile(b,940,200,true));assert.equal(b.life,0);assert.equal(game.harbor.fuelHP,112);game.sub.x=480;game.sub.y=500;game.sub.a=Math.PI;game.sub.speed=30;update(.025);assert(game.sub.x>=472);game.sub.x=470;game.sub.y=500;harborCollision(game.sub,{x:490,y:500},22);assert.equal(game.sub.x,490);assert.equal(game.sub.speed,0);`,
);
check(
  "Alarm creates at most two reinforcements; raid does not spawn convoys or planes",
  `
newGame({},'harbor');raiseHarborAlarm({x:700,y:500});assert.equal(game.harbor.alarmAt,0);game.time=19;updateHarbor();assert.equal(game.harbor.reinforcements,1);game.time=39;updateHarbor();assert.equal(game.harbor.reinforcements,2);game.time=1000;updateHarbor();const count=game.ships.length;spawnConvoy();assert.equal(game.ships.length,count);game.planeTimer=0;update(.025);assert.equal(game.plane,null);assert.equal(game.harbor.reinforcements,2);`,
);
check(
  "Raid save restores weather, targets, alarm, damage, crew and port selection",
  `
newGame({patrol:3,crew:['captain','engineer','chief']},'harbor');raiseHarborAlarm({x:700,y:500});game.harbor.fuelHP=56;hitShip(game.ships[0],200,'torpedo');const restored=parsePortableSave(JSON.stringify({version:14,nextShipId,game})).restored;assert.equal(restored.harbor.fuelHP,56);assert.equal(restored.harbor.sunk.length,1);assert.equal(restored.harbor.alarmAt,0);assert(restored.weather.night);assert(!restored.weather.rough);assert.equal(restored.campaign.crew.length,3);assert.equal(restored.plannedSortie,'harbor');assert.equal(restored.campaign.patrol,3);`,
);
check(
  "Invalid harbor save rejected without changing live state",
  `
newGame({},'harbor');const current=game;const payload={version:14,game:JSON.parse(JSON.stringify(game))};payload.game.harbor.targets=[1,1];assert.throws(()=>parsePortableSave(JSON.stringify(payload)));assert.equal(game,current);`,
);
check(
  "Extraction success rewards raid once without skipping campaign",
  `
newGame({patrol:3},'harbor');for(const sh of [...game.ships].filter(s=>s.moored))sink(sh);game.harbor.fuelHP=0;extract();assert.equal(game.outcome,'success');assert.equal(game.campaign.points,1);assert(game.campaign.raidCompleted);assert.equal(game.campaign.completed.length,0);nextPatrol();assert.equal(game.portMission,3);assert.equal(game.plannedSortie,'harbor');departPort();for(const sh of [...game.ships].filter(s=>s.moored))sink(sh);game.harbor.fuelHP=0;extract();assert.equal(game.campaign.points,1);assert.equal(game.campaign.patrol,3);`,
);
check(
  "Early harbor return refits same raid and earns no upgrade point",
  `
newGame({},'harbor');extract();assert.equal(game.outcome,'partial');assert.equal(game.campaign.points,0);nextPatrol();departPort();assert.equal(game.mission.id,6);assert.equal(game.harbor.fuelHP,112);assert.equal(game.harbor.sunk.length,0);`,
);
check(
  "Version 13 campaign migrates with standard crew and no harbor",
  `
newGame({patrol:4});const payload={version:13,game:JSON.parse(JSON.stringify(game))};delete payload.game.campaign.crew;const g=parsePortableSave(JSON.stringify(payload)).restored;assert.equal(g.campaign.crew.length,0);assert.equal(g.harbor,null);assert.equal(g.mission.id,4);`,
);
seed = 12345;
check(
  "Complete scripted raid survives normal enemy AI using decoy and silent withdrawal",
  `newGame({crew:['captain','chief','torpedoman']},'harbor'); config.sound=false;config.autosave=false;
const step=(n)=>{for(let i=0;i<n&&!game.over;i++)update(1/60);};
for(const target of game.ships.filter(s=>s.moored)){
 game.sub.aimAngle=norm(Math.atan2(target.y-game.sub.y,target.x-game.sub.x)-game.sub.a);
 fireTorpedo();step(54);fireTorpedo();step(125);
}
setDepth(0);step(110);
game.sub.aimAngle=norm(Math.atan2(HARBOR_FUEL.y-game.sub.y,HARBOR_FUEL.x-game.sub.x)-game.sub.a);
for(let i=0;i<4;i++){fireGun();step(42);}step(120);
setDepth(60);
function navigate(x,y){
 for(let i=0;i<7200&&!game.over;i++){
 const s=game.sub,d=Math.hypot(x-s.x,y-s.y),err=norm(Math.atan2(y-s.y,x-s.x)-s.a);
 for(const k of ['KeyW','KeyS','KeyA','KeyD'])delete keys[k];
 if(d<35){if(s.speed>1){keys.KeyS=true;update(1/60);continue;}break;}
 if(err>.035)keys.KeyD=true;else if(err<-.035)keys.KeyA=true;
 if(Math.abs(err)<.45&&d>45)keys.KeyW=true;else if(s.speed>3)keys.KeyS=true;
 if(s.depth>3&&s.decoyCount&&s.decoyCD===0&&game.ships.some(e=>e.escort&&e.state!=='patrol'&&dist(e,s)>140&&dist(e,s)<310))deployDecoy();
 update(1/60);
 }
 clearInput();
}
navigate(200,790);toggleSilent();step(2100);navigate(200,940);navigate(800,906);
step(6000);
assert.equal(game.outcome,'success');assert(game.sub.hull>0);assert.equal(game.harbor.sunk.length,2);assert.equal(game.harbor.fuelHP,0);assert.equal(game.harbor.reinforcements,2);`,
);
console.log(JSON.stringify(reports, null, 2));
if (reports.some((r) => r.status === "FAIL")) process.exitCode = 1;
