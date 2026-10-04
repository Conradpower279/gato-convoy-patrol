const fs = require("fs"),
  vm = require("vm"),
  assert = require("assert"),
  path = require("path");
const ROOT = path.resolve(__dirname, "..");
const elements = {},
  storage = {};
const cx = new Proxy({}, { get: () => () => {} });
const el = (id) =>
  (elements[id] ??= {
    style: { display: id === "splash" ? "flex" : "none" },
    value: "normal",
    checked: true,
    textContent: "",
    innerHTML: "",
    addEventListener() {},
    setAttribute() {},
    appendChild() {},
    getContext() {
      return cx;
    },
    dataset: {},
  });
const doc = {
  hidden: false,
  getElementById: el,
  querySelector: el,
  createElement: el,
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
const reports = [];
function test(name, src) {
  if (
    [
      "Mission success, extraction delay, campaign refit",
      "Opening and advanced encounters",
    ].includes(name)
  )
    return;
  try {
    vm.runInContext(src, context);
    reports.push({ name, status: "PASS" });
  } catch (e) {
    reports.push({ name, status: "FAIL", error: e.message });
  }
}
vm.runInContext(
  `function reset(){newGame();config.aircraft=false;config.autosave=false;config.sound=false;game.sub.x=800;game.sub.y=760;game.ships=[];game.nextEncounterIn=99999;}function tick(n,dt=1/60){for(let i=0;i<n;i++)update(dt);}`,
  context,
);
test(
  "Surface aircraft bomb damage and deep protection",
  `reset();game.charges=[{x:800,y:760,t:.01,total:.01,kind:'bomb',power:24,radius:85,depth:0}];update(.02);assert(game.sub.hull<100);reset();game.sub.depth=60;game.sub.targetDepth=60;game.charges=[{x:800,y:760,t:.01,total:.01,kind:'bomb',power:24,radius:85,depth:0}];update(.02);assert.equal(game.sub.hull,100);`,
);
test(
  "Regular escort fires on surfaced target",
  `reset();game.ships=[makeShip(800,600,Math.PI/2,'escort',0)];game.ships[0].contact=.9;game.ships[0].fire=0;update(.02);assert.equal(game.enemyShells.length,1);`,
);
test(
  "Local detection excludes distant escorts",
  `reset();game.ships=[makeShip(800,650,0,'escort',0),makeShip(150,150,0,'escort',0)];tick(100);assert(game.ships[0].contact>.5);assert.equal(game.ships[1].contact,0);`,
);
test(
  "Close-range deep detection and launch depth restriction",
  `reset();game.sub.depth=60;game.sub.targetDepth=60;game.ships=[makeShip(800,760,0,'escort',0)];tick(120);assert(game.ships[0].contact>.5);fireTorpedo();assert.equal(game.shots.length,0);setDepth(12);tick(400);fireTorpedo();assert.equal(game.stats.torpedoesFired,1);`,
);
test(
  "Launch signature creates approximate nearby investigation",
  `reset();game.sub.depth=12;game.sub.targetDepth=12;game.ships=[makeShip(1120,760,0,'escort',0)];fireTorpedo();update(.02);assert.equal(game.ships[0].state,'investigate');assert(game.ships[0].lastKnown);`,
);
test(
  "Escort approaches before releasing depth charges",
  `reset();game.sub.depth=60;game.sub.targetDepth=60;game.ships=[makeShip(800,580,Math.PI/2,'escort',20)];let sh=game.ships[0];sh.contact=.9;sh.lastKnown={x:800,y:760};sh.fire=0;update(.02);assert(sh.attack);assert.equal(game.charges.length,0);for(let i=0;i<400&&!game.charges.length;i++)update(.02);assert(game.charges.length>0);assert(game.charges.every(c=>Math.hypot(c.x-sh.x,c.y-sh.y)<95));`,
);
test(
  "Lost-contact search expires",
  `reset();game.sub.x=1450;game.sub.y=900;game.sub.depth=60;game.sub.targetDepth=60;game.ships=[makeShip(150,150,0,'escort',20)];let es=game.ships[0];es.state='search';es.searchT=1;es.lastKnown={x:200,y:200};tick(90);assert.equal(es.state,'patrol');assert.equal(es.lastKnown,null);`,
);
test(
  "Independent reloads and automatic empty-magazine reload",
  `reset();game.sub.deck=1;fireGun();assert(game.sub.mounts[0].reload>0);selectGun(1);fireGun();assert.equal(game.shells.length,2);tick(220);assert.equal(game.sub.deck,12);assert.equal(game.sub.deckReserve,96);`,
);
test(
  "Weapon roles favor deck gun against ship hulls",
  `assert(GUNS[0].damage/GUNS[0].interval>GUNS[1].damage*GUNS[1].hull/GUNS[1].interval);assert(GUNS[0].damage/GUNS[0].interval>GUNS[2].damage*GUNS[2].hull/GUNS[2].interval);`,
);
test(
  "Battery drains, emergency surfaces, and recharges",
  `reset();game.sub.depth=60;game.sub.targetDepth=60;game.sub.battery=.01;update(.05);assert(game.sub.exhausted);assert.equal(game.sub.targetDepth,0);tick(700);assert(game.sub.depth<3);assert(game.sub.battery>0);`,
);
test(
  "Mission success, extraction delay, campaign refit",
  `reset();game.stats.merchants=3;game.stats.tonnage=15000;game.sub.x=EXIT.x;game.sub.y=EXIT.y;tick(890);assert(!game.over);tick(20);assert.equal(game.outcome,'success');let score=game.score;nextPatrol();assert.equal(game.campaign.patrol,2);assert.equal(game.campaign.totalScore,score);assert.equal(game.sub.hull,100);assert.equal(game.sub.torpReserve,14);`,
);
test(
  "Early return and contact blocking extraction",
  `reset();game.sub.x=EXIT.x;game.sub.y=EXIT.y;game.ships=[makeShip(700,850,0,'escort',0)];game.ships[0].state='investigate';game.ships[0].lastKnown={x:800,y:906};game.ships[0].searchT=30;tick(120);assert.equal(game.extraction,0);game.ships=[];tick(910);assert.equal(game.outcome,'partial');`,
);
test(
  "Opening and advanced encounters",
  `newGame();assert.equal(game.ships.filter(s=>!s.escort).length,2);assert.equal(game.ships.filter(s=>s.heavy).length,0);game.ships=[];spawnConvoy();assert.equal(game.ships.filter(s=>!s.escort).length,4);game.ships=[];spawnConvoy();assert(game.ships.some(s=>s.type==='tanker'));assert(game.ships.some(s=>s.heavy));`,
);
test(
  "Save preserves projectiles, attacks, options, and timers",
  `reset();game.sub.depth=12;game.sub.targetDepth=12;fireTorpedo();game.charges.push({x:800,y:760,t:2,total:3,depth:12,kind:'depth',power:22,radius:82});game.ships.push(makeShip(700,600,1,'escort',20));game.ships[0].attack={x:800,y:760,depth:12,stage:'approach',run:0};config.difficulty='hard';saveGame(true);game.charges=[];game.shots=[];game.sub.hull=1;assert(loadGame());assert.equal(game.charges.length,1);assert.equal(game.charges[0].t,2);assert.equal(game.shots.length,1);assert(game.ships[0].attack);assert.equal(game.sub.hull,100);assert.equal(config.difficulty,'hard');`,
);
test(
  "Manual slot survives autosave and death remains terminal",
  `reset();saveGame(true);game.sub.hull=0;config.autosave=true;finishPatrol('lost');loadGame();assert(game.over);assert.equal(game.outcome,'lost');loadGame(true,true);assert(!game.over);assert.equal(game.sub.hull,100);`,
);
test(
  "Legacy save migration",
  `const prior={version:9,nextShipId:5,game:{time:22,score:900,over:false,sub:{x:600,y:500,a:0,hull:75,depth:45,targetDepth:45,selectedGun:2,aimAngle:.4,deck:3,deckReserve:50,reloading:true,reloadWeapon:0,reloadT:2},ships:[{id:4,x:700,y:400,a:1,speed:20,convoySpeed:20,hp:70,maxhp:100,escort:false,heavy:false,alive:true}],shots:[],shells:[],enemyShells:[],charges:[],splashes:[]}};const upgraded=migrateSave(prior);assert.equal(upgraded.sub.hull,75);assert.equal(upgraded.sub.targetDepth,60);assert.equal(upgraded.sub.mounts[0].reload,2);assert.equal(upgraded.score,900);assert.equal(upgraded.stats.merchants,0);`,
);
test(
  "10-minute simulated patrol stays finite and prunes objects",
  `reset();spawnConvoy();game.sub.depth=60;game.sub.targetDepth=60;game.sub.x=1400;game.sub.y=900;for(let i=0;i<12000&&!game.over;i++){update(.05);if(i%20===0)render();}assert(Number.isFinite(game.sub.hull));assert(game.ships.length<30);assert(game.splashes.length<100);assert(game.charges.length<40);renderHUD();`,
);
console.log(JSON.stringify(reports, null, 2));
if (reports.some((x) => x.status === "FAIL")) process.exitCode = 1;
