"use strict";
// Tactical systems use the shared game state in game.js. Both scripts also bundle
// into the downloadable single-file build; no network services are used by play.
const SPREADS = [
  { name: "Single", count: 1, angle: 0 },
  { name: "Narrow ×3", count: 3, angle: 0.024 },
  { name: "Wide ×3", count: 3, angle: 0.065 },
];
const APPROACHES = [
  {
    id: "cautious",
    name: "Southern approach",
    x: 1100,
    y: 800,
    escorts: -1,
    reward: 1,
    description:
      "Longer transit. One fewer escort, minimum one. Standard sinking rewards.",
  },
  {
    id: "balanced",
    name: "Central intercept",
    x: 800,
    y: 700,
    escorts: 0,
    reward: 1,
    description:
      "Standard opposition and rewards. Intercept the shipping lane from the south.",
  },
  {
    id: "aggressive",
    name: "Close interception",
    x: 420,
    y: 580,
    escorts: 1,
    reward: 1.2,
    description:
      "Closer starting position, one additional escort. +20% sinking points; upgrade-point awards are unchanged.",
  },
];
function approachDef(id) {
  return APPROACHES.find((a) => a.id === id) || APPROACHES[1];
}
function weatherFor(patrol) {
  const night = patrol === 2 || patrol === 4,
    rough = patrol === 3 || patrol === 5;
  return {
    night,
    rough,
    visual: night ? 0.67 : 1,
    gunSpread: rough ? 1.7 : 1,
    airFactor: rough ? 0.72 : 1,
    label: `${night ? "Night" : "Day"} · ${rough ? "rough seas" : "calm seas"}`,
  };
}
function initTactics(g) {
  g.weather = weatherFor(g.campaign.patrol);
  g.approach = approachDef(g.campaign.approach).id;
  g.plannedApproach = g.approach;
  const a = approachDef(g.approach);
  g.sub.x = a.x;
  g.sub.y = a.y;
  g.sub.spread = 0;
  g.sub.silent = false;
  g.sub.decoyCount = 2;
  g.sub.decoyCD = 0;
  g.decoys = [];
  g.targeting = {
    id: null,
    quality: 0,
    estimate: null,
    lastSample: null,
    lastCourse: null,
  };
  g.timeScale = 1;
  g.log = [];
  g.logOpen = false;
  g.pendingDamage = 0;
  g.lastDamageLog = 0;
  g.lastGunLog = -10;
}
function normalizeTactics(g) {
  const s = g.sub;
  g.weather = weatherFor(g.campaign.patrol);
  g.approach = approachDef(g.approach || g.campaign.approach).id;
  g.plannedApproach = approachDef(g.plannedApproach || g.approach).id;
  s.spread = clamp(Math.floor(s.spread || 0), 0, 2);
  s.silent = !!s.silent;
  s.decoyCount = clamp(Math.floor(s.decoyCount ?? 2), 0, 2);
  s.decoyCD = Math.max(0, s.decoyCD || 0);
  g.decoys = Array.isArray(g.decoys) ? g.decoys : [];
  g.targeting = {
    id: null,
    quality: 0,
    estimate: null,
    lastSample: null,
    lastCourse: null,
    ...g.targeting,
  };
  g.targeting.quality = clamp(g.targeting.quality || 0, 0, 1);
  g.timeScale = 1;
  g.log = Array.isArray(g.log) ? g.log.slice(-200) : [];
  g.logOpen = false;
  g.pendingDamage = 0;
  g.lastDamageLog = g.time;
  g.lastGunLog = g.time;
  for (const mark of s.sonarMarks)
    mark.observedAt ??= g.time - Math.max(0, 5 - mark.ttl);
  for (const sh of g.ships) {
    sh.convoyId ??= 0;
    sh.role ??= "hunter";
    sh.alertUntil ??= 0;
  }
}
function recordEvent(text, kind = "event") {
  if (!game?.log) return;
  game.log.push({ t: game.time, kind, text: String(text).slice(0, 500) });
  if (game.log.length > 200) game.log.splice(0, game.log.length - 200);
}
function escapeHTML(value) {
  return String(value).replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ],
  );
}
function cycleSpread() {
  game.sub.spread = (game.sub.spread + 1) % SPREADS.length;
  announce(`TORPEDO SPREAD — ${SPREADS[game.sub.spread].name}`, 2);
}
function toggleSilent() {
  const s = game.sub;
  if (s.depth < 3) {
    announce("Submerge before engaging silent running");
    return;
  }
  s.silent = !s.silent;
  if (s.silent) s.speed = clamp(s.speed, -8, 12);
  announce(
    s.silent
      ? "SILENT RUNNING — 12 u/s limit; reloads paused"
      : "NORMAL OPERATIONS — reloads resumed",
    3,
  );
}
function deployDecoy() {
  const s = game.sub;
  if (s.depth < 3) {
    announce("Decoys require a submerged launch");
    return;
  }
  if (!s.decoyCount) {
    announce("No decoys remaining");
    return;
  }
  if (s.decoyCD > 0) {
    announce("Decoy launcher cooling down");
    return;
  }
  s.decoyCount--;
  s.decoyCD = 12;
  const d = {
    id: Math.round(game.time * 1000) + s.decoyCount,
    x: s.x - Math.cos(s.a) * 35,
    y: s.y - Math.sin(s.a) * 35,
    ttl: 20,
  };
  game.decoys.push(d);
  for (const sh of game.ships) {
    if (sh.alive && sh.escort && dist(sh, d) < 340 && dist(sh, s) > 130) {
      sh.decoyId = d.id;
      sh.attack = null;
      sh.state = "decoy";
      sh.lastKnown = { x: d.x, y: d.y };
      sh.contact = Math.min(sh.contact, 0.35);
    }
  }
  announce("DECOY AWAY — change course and separate from the noise", 4);
  tone(420, 0.2, "triangle", 0.025, 100);
}
function updateDecoyEscort(sh, dt) {
  if (sh.decoyId === undefined || sh.decoyId === null) return false;
  const s = game.sub,
    d = game.decoys.find((x) => x.id === sh.decoyId && x.ttl > 0);
  if (!d || s.depth < 3 || dist(sh, s) < 130) {
    sh.decoyId = null;
    sh.state = "search";
    sh.searchT = 14;
    return false;
  }
  sh.contact = Math.max(0, sh.contact - dt * 0.1);
  sh.lastKnown = { x: d.x, y: d.y };
  sh.state = "decoy";
  const angle = game.time * 0.3 + sh.id,
    near = dist(sh, d) < 65;
  turnToward(
    sh,
    d.x + (near ? Math.cos(angle) * 70 : 0),
    d.y + (near ? Math.sin(angle) * 70 : 0),
    0.7,
    dt,
  );
  sh.speed = near ? 22 : 36;
  sh.x += Math.cos(sh.a) * sh.speed * dt;
  sh.y += Math.sin(sh.a) * sh.speed * dt;
  sh.fire = Math.max(0, sh.fire - dt);
  return true;
}
function visualRange() {
  return (
    (game.sub.depth < 3 ? 1000 : game.sub.depth < 18 ? 570 : 0) *
    game.weather.visual
  );
}
function observeShip(sh) {
  if (!sh?.alive) return null;
  if (dist(game.sub, sh) < visualRange())
    return { x: sh.x, y: sh.y, t: game.time, visual: true };
  const m = game.sub.sonarMarks.find((x) => x.shipId === sh.id && x.ttl > 0);
  return m ? { x: m.x, y: m.y, t: m.observedAt ?? 0, visual: false } : null;
}
function selectTarget() {
  const contacts = game.ships.filter((sh) => observeShip(sh));
  if (!contacts.length) {
    announce("No observed target — use visual contact or active sonar");
    return;
  }
  contacts.sort(
    (a, b) =>
      Math.abs(
        norm(Math.atan2(a.y - game.sub.y, a.x - game.sub.x) - currentAim()),
      ) -
      Math.abs(
        norm(Math.atan2(b.y - game.sub.y, b.x - game.sub.x) - currentAim()),
      ),
  );
  const previous = contacts.findIndex((x) => x.id === game.targeting.id),
    sh = contacts[previous < 0 ? 0 : (previous + 1) % contacts.length];
  game.targeting = {
    id: sh.id,
    quality: 0,
    estimate: null,
    lastSample: null,
    lastCourse: null,
  };
  announce(
    `TRACKING ${sh.type.toUpperCase()} — steady observation improves the solution`,
    3,
  );
}
function updateTargeting(dt) {
  const t = game.targeting;
  if (t.id === null) return;
  const sh = game.ships.find((x) => x.id === t.id && x.alive);
  if (!sh) {
    t.id = null;
    t.estimate = null;
    t.quality = 0;
    return;
  }
  const o = observeShip(sh);
  if (o && (!t.lastSample || o.t > t.lastSample.t + 0.3)) {
    if (t.lastSample) {
      const elapsed = o.t - t.lastSample.t,
        vx = (o.x - t.lastSample.x) / elapsed,
        vy = (o.y - t.lastSample.y) / elapsed,
        course = Math.atan2(vy, vx);
      if (
        t.lastCourse !== null &&
        Math.hypot(vx, vy) > 2 &&
        Math.abs(norm(course - t.lastCourse)) > 0.12
      )
        t.quality *= 0.5;
      t.lastCourse = course;
      t.estimate = { x: o.x, y: o.y, vx, vy };
    } else t.estimate = { x: o.x, y: o.y, vx: 0, vy: 0 };
    t.lastSample = { x: o.x, y: o.y, t: o.t };
    if (!o.visual) t.quality = Math.min(0.8, t.quality + 0.15);
  }
  if (o?.visual) t.quality = Math.min(1, t.quality + dt * 0.075);
  else t.quality = Math.max(0, t.quality - dt * 0.022);
  if (t.estimate && t.lastSample) {
    t.estimate.x =
      t.lastSample.x + t.estimate.vx * (game.time - t.lastSample.t);
    t.estimate.y =
      t.lastSample.y + t.estimate.vy * (game.time - t.lastSample.t);
  }
}
function interceptSolution(origin, estimate, speed = 220) {
  if (!estimate) return null;
  const rx = estimate.x - origin.x,
    ry = estimate.y - origin.y,
    a = estimate.vx ** 2 + estimate.vy ** 2 - speed ** 2,
    b = 2 * (rx * estimate.vx + ry * estimate.vy),
    c = rx ** 2 + ry ** 2;
  let time;
  if (Math.abs(a) < 1e-8) {
    if (Math.abs(b) < 1e-8) return null;
    time = -c / b;
  } else {
    const d = b * b - 4 * a * c;
    if (d < 0) return null;
    const roots = [
      (-b - Math.sqrt(d)) / (2 * a),
      (-b + Math.sqrt(d)) / (2 * a),
    ].filter((t) => t > 0);
    if (!roots.length) return null;
    time = Math.min(...roots);
  }
  if (time <= 0 || time > 7) return null;
  const x = estimate.x + estimate.vx * time,
    y = estimate.y + estimate.vy * time;
  return { x, y, time, a: Math.atan2(y - origin.y, x - origin.x) };
}
function alertConvoy(ship, source) {
  if (!ship) return;
  let fresh = false;
  for (const sh of game.ships) {
    if (!sh.alive || sh.convoyId !== ship.convoyId) continue;
    fresh ||= sh.alertUntil <= game.time;
    sh.alertUntil = Math.max(sh.alertUntil || 0, game.time + 45);
    if (
      sh.escort &&
      sh.role !== "guard" &&
      sh.contact < 0.5 &&
      source &&
      dist(sh, source) < 650
    ) {
      sh.state = "investigate";
      sh.searchT = 22;
      sh.lastKnown = { x: source.x + rnd(-70, 70), y: source.y + rnd(-70, 70) };
    }
  }
  if (fresh)
    recordEvent(
      "Convoy alarm: merchants taking evasive action; escorts splitting duties.",
      "enemy",
    );
}
function merchantCourse(sh, dt) {
  if ((sh.alertUntil || 0) > game.time) {
    const desired =
      sh.routeA +
      Math.sin(game.time * 0.3 + sh.id * 1.9) * 0.36 +
      (sh.id % 2 ? 0.08 : -0.08);
    sh.a += clamp(norm(desired - sh.a), -0.28 * dt, 0.28 * dt);
  } else sh.a += clamp(norm(sh.routeA - sh.a), -0.2 * dt, 0.2 * dt);
}
function convoyGuardPoint(sh) {
  if (sh.role !== "guard" || sh.alertUntil <= game.time || sh.contact > 0.55)
    return null;
  const ships = game.ships.filter(
    (x) => x.alive && !x.escort && x.convoyId === sh.convoyId,
  );
  if (!ships.length) return null;
  return {
    x: ships.reduce((n, x) => n + x.x, 0) / ships.length,
    y: ships.reduce((n, x) => n + x.y, 0) / ships.length + 105,
  };
}
function safeToAccelerate() {
  if (!game || game.phase !== "patrol" || game.over || game.logOpen)
    return false;
  const s = game.sub;
  if (
    game.charges.length ||
    game.shots.length ||
    game.shells.length ||
    game.enemyShells.length ||
    s.repairT > 0 ||
    game.extraction > 0 ||
    dist(s, EXIT) < 130
  )
    return false;
  if (
    game.ships.some(
      (sh) =>
        sh.alive && (dist(s, sh) < 620 || (sh.escort && sh.state !== "patrol")),
    )
  )
    return false;
  if (game.plane && dist(game.plane, s) < 750) return false;
  if (
    game.mission.id === 3 &&
    !game.mission.rescued &&
    dist(s, { x: game.mission.rescueX, y: game.mission.rescueY }) < 150
  )
    return false;
  if (
    game.mission.id === 4 &&
    !game.mission.targetSunk &&
    game.mission.deadline - game.time < 30
  )
    return false;
  return true;
}
function cycleTime() {
  if (!safeToAccelerate()) {
    game.timeScale = 1;
    announce(
      "TIME ×1 — compression requires clear water and no immediate mission activity",
    );
    return;
  }
  game.timeScale = game.timeScale === 1 ? 2 : game.timeScale === 2 ? 4 : 1;
  announce(`TIME ×${game.timeScale}`, 2);
}
function toggleLog() {
  if (!game) return;
  game.logOpen = !game.logOpen;
  game.timeScale = 1;
  clearInput();
  document.getElementById("logOverlay").style.display = game.logOpen
    ? "flex"
    : "none";
  if (game.logOpen) renderLog();
}
function renderLog() {
  const list = document.getElementById("logEntries");
  list.innerHTML = "";
  for (const entry of game.log.slice().reverse()) {
    const p = document.createElement("p");
    p.textContent = `${Math.floor(entry.t / 60)
      .toString()
      .padStart(2, "0")}:${Math.floor(entry.t % 60)
      .toString()
      .padStart(2, "0")} · ${entry.text}`;
    list.appendChild(p);
  }
  if (!game.log.length) list.textContent = "No events recorded on this patrol.";
}
function updateTactics(dt, hullBefore) {
  const s = game.sub;
  s.decoyCD = Math.max(0, s.decoyCD - dt);
  for (const d of game.decoys) d.ttl -= dt;
  game.decoys = game.decoys.filter((d) => d.ttl > 0);
  if (s.depth < 3) s.silent = false;
  updateTargeting(dt);
  if (game.timeScale > 1 && !safeToAccelerate()) {
    game.timeScale = 1;
    announce("THREAT OR OBJECTIVE NEARBY — time returned to ×1", 3);
  }
  for (const sig of game.signals) {
    if (sig.type === "gun")
      for (const sh of game.ships)
        if (!sh.escort && sh.alive && dist(sh, sig) < 500) alertConvoy(sh, sig);
  }
  const damage = Math.max(0, hullBefore - s.hull);
  game.pendingDamage += damage;
  if (game.pendingDamage >= 1 && game.time - game.lastDamageLog >= 1) {
    recordEvent(
      `Hull damage: ${game.pendingDamage.toFixed(1)}. Hull remaining: ${Math.max(0, s.hull).toFixed(0)}%.`,
      "damage",
    );
    game.pendingDamage = 0;
    game.lastDamageLog = game.time;
  }
}
function renderApproaches() {
  if (!game) return;
  document.getElementById("approachPanel").style.display =
    game.plannedSortie === "harbor" ? "none" : "";
  const p = game.portMission || game.campaign.patrol,
    d = MISSIONS[p - 1],
    w = weatherFor(p),
    picked = approachDef(game.plannedApproach);
  document.getElementById("conditions").textContent =
    `Forecast: ${w.label}. ${w.night ? "Reduced visual range for both sides. " : ""}${w.rough ? "Wider gun dispersion; aircraft search and bomb damage reduced." : ""}`;
  const box = document.getElementById("approachChoices");
  box.innerHTML = "";
  for (const a of APPROACHES) {
    const button = document.createElement("button");
    button.className = a.id === picked.id ? "primary" : "";
    button.setAttribute("aria-pressed", String(a.id === picked.id));
    button.innerHTML = `<b>${a.name}</b><span>${a.description}</span>`;
    button.addEventListener("click", () => {
      game.plannedApproach = a.id;
      renderApproaches();
      checkpoint();
    });
    box.appendChild(button);
  }
  const base = p === 1 || p === 3 ? 1 : p === 5 ? 3 : 2;
  document.getElementById("contactEstimate").textContent =
    `Contact estimate: ${d.kind === "rescue" ? "survivors and a local patrol" : p === 1 ? "2 merchants" : p === 5 ? "4 merchants including a tanker" : "mission target with accompanying merchants"} · approximately ${Math.max(1, base + picked.escorts)} escorts${p === 5 && config.heavyHunters ? " + heavy hunter" : ""}.`;
  const marker = document.getElementById("approachMarker");
  marker.setAttribute("cx", String(picked.x / 4));
  marker.setAttribute("cy", String(picked.y / 4));
}
function tacticalHud() {
  const s = game.sub,
    t = game.targeting,
    solution = interceptSolution(s, t.estimate);
  return `<section><span class="label">Tactical station · ×${game.timeScale}</span><div class="row"><span>Spread</span><b>${SPREADS[s.spread].name}</b></div><div class="row"><span>Decoys</span><b>${s.decoyCount} / 2</b></div><div class="row"><span>Running</span><b>${s.silent ? "SILENT" : "NORMAL"}</b></div><div class="small ${t.quality > 0.7 ? "green" : "yellow"}">${t.id === null ? "G / R-stick click: track a target" : `Solution: ${Math.round(t.quality * 100)}%${solution ? " · lead diamond shown" : " · outside torpedo reach"}`}</div><div class="small muted">${game.weather.label}</div></section>`;
}
function drawTactics() {
  for (const d of game.decoys) {
    circle(d.x, d.y, 20 + Math.sin(game.time * 4) * 5, "#9bd1ebaa", 2);
    label("DECOY", d.x, d.y - 30, "#a9e2fa", 11);
  }
  const t = game.targeting;
  if (t.id !== null && t.estimate) {
    const e = t.estimate,
      sol = interceptSolution(game.sub, e);
    circle(e.x, e.y, 26, "#e9efd88a", 1);
    if (sol) {
      ctx.save();
      ctx.setLineDash([4, 6]);
      circle(sol.x, sol.y, 12 + (1 - t.quality) * 55, "#8edbbc66", 1);
      ctx.setLineDash([]);
      ctx.translate(sol.x, sol.y);
      ctx.rotate(Math.PI / 4);
      ctx.strokeStyle = t.quality > 0.7 ? "#a9ffce" : "#edcf82";
      ctx.strokeRect(-7, -7, 14, 14);
      ctx.restore();
      label(
        `LEAD · ${Math.round(t.quality * 100)}%`,
        sol.x,
        sol.y - 28,
        "#daf3bf",
        12,
      );
    }
  }
  const sp = SPREADS[game.sub.spread];
  if (sp.count > 1) {
    ctx.save();
    ctx.strokeStyle = "#e3ce8855";
    ctx.setLineDash([3, 7]);
    for (const off of [-sp.angle, sp.angle]) {
      const a = currentAim() + off;
      ctx.beginPath();
      ctx.moveTo(game.sub.x, game.sub.y);
      ctx.lineTo(
        game.sub.x + Math.cos(a) * 260,
        game.sub.y + Math.sin(a) * 260,
      );
      ctx.stroke();
    }
    ctx.restore();
  }
}
// Save import is data-only, bounded, validated, and applied only after validation.
function validateSaveTree(value, depth = 0, budget = { n: 0 }) {
  if (++budget.n > 40000 || depth > 18) throw Error("Save is too complex.");
  if (typeof value === "number" && !Number.isFinite(value))
    throw Error("Save contains non-finite numbers.");
  if (typeof value === "string" && value.length > 4096)
    throw Error("Save contains oversized text.");
  if (Array.isArray(value) && value.length > 2000)
    throw Error("Save contains too many objects.");
  if (value && typeof value === "object")
    for (const [key, v] of Object.entries(value)) {
      if (["__proto__", "prototype", "constructor"].includes(key))
        throw Error("Save contains an invalid key.");
      validateSaveTree(v, depth + 1, budget);
    }
}
function validateRestoredState(g) {
  const numeric = (x, name) => {
    if (typeof x !== "number" || !Number.isFinite(x))
      throw Error("Invalid " + name);
  };
  for (const [key, val] of Object.entries(g.sub)) {
    if (
      [
        "x",
        "y",
        "a",
        "speed",
        "depth",
        "targetDepth",
        "hull",
        "battery",
        "detected",
        "sonarCD",
        "sonarPulse",
        "torpCD",
        "torpReloadT",
        "selectedGun",
        "aimAngle",
        "fwdTubes",
        "aftTubes",
        "torpReserve",
        "deck",
        "deckReserve",
        "bofors",
        "boforsReserve",
        "oerlikon",
        "oerlikonReserve",
        "repairT",
        "repairCharges",
      ].includes(key)
    )
      numeric(val, "submarine " + key);
  }
  if (
    !Number.isInteger(g.sub.selectedGun) ||
    g.sub.selectedGun < 0 ||
    g.sub.selectedGun > 2
  )
    throw Error("Invalid selected gun");
  for (const key of [
    "time",
    "score",
    "encounter",
    "encounterAge",
    "planeTimer",
    "extraction",
    "messageT",
  ])
    numeric(g[key], key);
  if (
    g.ships.length > 200 ||
    g.shots.length + g.shells.length + g.enemyShells.length > 1000
  )
    throw Error("Save contains too many active combat objects.");
  for (const entry of g.campaign.log) {
    numeric(entry.patrol, "campaign log patrol");
    numeric(entry.score, "campaign log score");
    numeric(entry.tonnage, "campaign log tonnage");
  }
  for (const entry of g.log) {
    numeric(entry.t, "log time");
    if (typeof entry.text !== "string") throw Error("Invalid log text");
  }
  for (const mark of g.sub.sonarMarks) {
    for (const key of ["x", "y", "ttl", "range"])
      numeric(mark[key], "sonar mark " + key);
  }
  for (const m of g.sub.mounts) {
    numeric(m.cd, "gun cooldown");
    numeric(m.reload, "gun reload");
  }
  for (const list of [
    "ships",
    "shots",
    "shells",
    "enemyShells",
    "charges",
    "decoys",
  ])
    for (const item of g[list]) {
      numeric(item.x, list + " position");
      numeric(item.y, list + " position");
      if (list === "ships") {
        numeric(item.a, "ship heading");
        numeric(item.hp, "ship hull");
        numeric(item.maxhp, "ship max hull");
        numeric(item.convoySpeed, "convoy speed");
        if (
          ![
            "merchant",
            "tanker",
            "transport",
            "coaster",
            "escort",
            "heavy",
          ].includes(item.type)
        )
          throw Error("Invalid ship type");
      }
      if (["shots", "shells", "enemyShells"].includes(list)) {
        numeric(item.a, "projectile heading");
        numeric(item.speed, "projectile speed");
        numeric(item.life, "projectile life");
        if (
          list === "shells" &&
          (!Number.isInteger(item.weapon) || item.weapon < 0 || item.weapon > 2)
        )
          throw Error("Invalid shell weapon");
      }
      if (list === "charges") {
        numeric(item.t, "charge timer");
        numeric(item.radius, "blast radius");
        numeric(item.power, "blast power");
      }
    }
  for (const k of ["rescueX", "rescueY", "rescueProgress", "pointsEarned"])
    numeric(g.mission[k], "mission " + k);
  if (g.mission.id === 4 && !g.mission.targetSunk)
    numeric(g.mission.deadline, "interception deadline");
  if (g.plane) {
    for (const key of ["x", "y", "a", "speed", "hp", "life", "acquire", "runT"])
      numeric(g.plane[key], "aircraft " + key);
    if (g.plane.state === "approach") {
      if (!g.plane.target) throw Error("Missing aircraft attack target");
      numeric(g.plane.target.x, "aircraft target");
      numeric(g.plane.target.y, "aircraft target");
    }
  }
  for (const fx of g.splashes) {
    numeric(fx.x, "effect x");
    numeric(fx.y, "effect y");
    numeric(fx.life, "effect life");
    numeric(fx.max, "effect duration");
  }
  for (const w of g.wrecks) {
    numeric(w.x, "wreck x");
    numeric(w.y, "wreck y");
    numeric(w.a, "wreck heading");
    numeric(w.life, "wreck life");
    numeric(w.max, "wreck duration");
  }
  if (g.targeting.estimate)
    for (const k of ["x", "y", "vx", "vy"])
      numeric(g.targeting.estimate[k], "target estimate");
  if (g.targeting.lastSample)
    for (const k of ["x", "y", "t"])
      numeric(g.targeting.lastSample[k], "target sample");
  return g;
}
function parsePortableSave(text) {
  if (text.length > 2 * 1024 * 1024)
    throw Error("Save exceeds the 2 MB limit.");
  const data = JSON.parse(text);
  validateSaveTree(data);
  if (!Number.isInteger(data.version) || data.version < 8 || data.version > 14)
    throw Error("Unsupported save version.");
  const before = nextShipId;
  try {
    const restored = migrateSave(data);
    validateRestoredState(restored);
    return { data, restored };
  } finally {
    nextShipId = before;
  }
}
function exportSave() {
  if (!game?.active) {
    setTransferStatus("Start or load a campaign before exporting.");
    return;
  }
  const payload = {
    format: "gato-convoy-patrol",
    version: 14,
    nextShipId,
    config,
    game,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    }),
    url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = `gato-campaign-p${game.campaign.patrol}-${Math.floor(game.time)}s.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setTransferStatus(
    "Campaign exported. Keep the JSON file to transfer your progress.",
  );
}
function setTransferStatus(text) {
  document.getElementById("transferStatus").textContent = text;
  saveStatus.textContent = text;
}
async function importSaveFile(file) {
  if (!file) return false;
  if (file.size > 2 * 1024 * 1024) {
    setTransferStatus("Import failed: save exceeds 2 MB.");
    return false;
  }
  try {
    const { data, restored } = parsePortableSave(await file.text());
    game = restored;
    nextShipId =
      Math.max(data.nextShipId || 1, ...game.ships.map((s) => s.id || 0)) + 1;
    if (data.config) {
      config = { ...DEFAULT_CONFIG };
      for (const key of [
        "aircraft",
        "heavyHunters",
        "autosave",
        "sonarPenalty",
        "sound",
      ])
        if (typeof data.config[key] === "boolean")
          config[key] = data.config[key];
      if (["easy", "normal", "hard"].includes(data.config.difficulty))
        config.difficulty = data.config.difficulty;
      syncConfigUI();
    }
    document.getElementById("logOverlay").style.display = "none";
    lastAutoSave = game.time;
    clearInput();
    if (game.phase === "port") openPort();
    else if (game.over) showResults();
    else closeSplash();
    recordEvent("Campaign imported from a portable save.", "save");
    checkpoint();
    setTransferStatus("Campaign imported successfully.");
    renderHUD();
    return true;
  } catch (e) {
    setTransferStatus("Import failed: " + e.message);
    return false;
  }
}
function initTacticalUI() {
  document.getElementById("exportBtn").addEventListener("click", exportSave);
  document
    .getElementById("portExportBtn")
    .addEventListener("click", exportSave);
  document
    .getElementById("importBtn")
    .addEventListener("click", () =>
      document.getElementById("importFile").click(),
    );
  document
    .getElementById("importFile")
    .addEventListener("change", async (e) => {
      await importSaveFile(e.target.files?.[0]);
      e.target.value = "";
    });
  document.getElementById("logBtn").addEventListener("click", toggleLog);
  document.getElementById("closeLogBtn").addEventListener("click", toggleLog);
}
