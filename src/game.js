"use strict";
// All gameplay uses a fixed world; browser resizing changes presentation only.
const WORLD = { w: 1600, h: 1000 },
  EXIT = { x: 800, y: 906, r: 82 };
const canvas = document.getElementById("game"),
  ctx = canvas.getContext("2d");
canvas.width = WORLD.w;
canvas.height = WORLD.h;
const hud = document.getElementById("hud"),
  msg = document.getElementById("msg"),
  splash = document.getElementById("splash"),
  death = document.getElementById("death"),
  saveStatus = document.getElementById("saveStatus");
const SAVE_KEY = "gato_convoy_patrol_v14",
  V13_KEY = "gato_convoy_patrol_v13",
  V12_KEY = "gato_convoy_patrol_v12",
  V11_KEY = "gato_convoy_patrol_v11",
  LEGACY_KEY = "gato_convoy_patrol_v8",
  CONFIG_KEY = "gato_convoy_patrol_config_v1";
const DEFAULT_CONFIG = {
  difficulty: "normal",
  aircraft: true,
  heavyHunters: true,
  autosave: true,
  sonarPenalty: true,
  sound: true,
};
let config = { ...DEFAULT_CONFIG },
  game = null,
  nextShipId = 1,
  lastAutoSave = 0,
  saveFlash = 0,
  hudClock = 0,
  audioCtx = null;
const keys = {},
  pressed = {},
  padPrevious = {};
let pad = null;
const rnd = (a, b) => a + Math.random() * (b - a),
  clamp = (v, a, b) => Math.max(a, Math.min(b, v)),
  dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
  norm = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const GUNS = [
  {
    name: "3-inch / 50",
    short: "3-IN",
    ammo: "deck",
    reserve: "deckReserve",
    cap: 12,
    reload: 3.5,
    damage: 28,
    interval: 0.65,
    speed: 440,
    life: 1.8,
    spread: 0.012,
    size: 3.5,
    color: "#ffd386",
    hull: 1,
  },
  {
    name: "40 mm Bofors",
    short: "40 MM",
    ammo: "bofors",
    reserve: "boforsReserve",
    cap: 24,
    reload: 2.5,
    damage: 8,
    interval: 0.12,
    speed: 500,
    life: 1.25,
    spread: 0.027,
    size: 2.5,
    color: "#fff0a4",
    hull: 0.35,
  },
  {
    name: "20 mm Oerlikon",
    short: "20 MM",
    ammo: "oerlikon",
    reserve: "oerlikonReserve",
    cap: 40,
    reload: 2,
    damage: 4,
    interval: 0.075,
    speed: 520,
    life: 0.9,
    spread: 0.045,
    size: 2,
    color: "#e2ffeb",
    hull: 0.18,
  },
];
const DEPTHS = [0, 12, 60];
function difficultyScale() {
  return config.difficulty === "easy"
    ? 0.75
    : config.difficulty === "hard"
      ? 1.25
      : 1;
}
function announce(text, seconds = 3) {
  recordEvent(text);
  if (game) {
    game.message = text;
    game.messageT = seconds;
  }
  msg.textContent = text;
}
function initAudio() {
  if (!config.sound) return;
  try {
    const A = window.AudioContext || window.webkitAudioContext;
    if (A && !audioCtx) audioCtx = new A();
    if (audioCtx?.state === "suspended") audioCtx.resume().catch(() => {});
  } catch {}
}
function tone(
  freq = 240,
  duration = 0.12,
  type = "sine",
  volume = 0.035,
  end = 80,
) {
  if (!config.sound || !audioCtx) return;
  try {
    const o = audioCtx.createOscillator(),
      g = audioCtx.createGain(),
      t = audioCtx.currentTime;
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, end), t + duration);
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start(t);
    o.stop(t + duration);
  } catch {}
}
function loadConfig() {
  try {
    config = {
      ...DEFAULT_CONFIG,
      ...JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}"),
    };
  } catch {}
  syncConfigUI();
}
function syncConfigUI() {
  document.getElementById("difficulty").value = config.difficulty;
  for (const [id, key] of Object.entries({
    cfgAircraft: "aircraft",
    cfgHeavy: "heavyHunters",
    cfgAutosave: "autosave",
    cfgSonarPenalty: "sonarPenalty",
    cfgSound: "sound",
  }))
    document.getElementById(id).checked = !!config[key];
}
function readConfigFromUI() {
  config.difficulty = document.getElementById("difficulty").value;
  for (const [id, key] of Object.entries({
    cfgAircraft: "aircraft",
    cfgHeavy: "heavyHunters",
    cfgAutosave: "autosave",
    cfgSonarPenalty: "sonarPenalty",
    cfgSound: "sound",
  }))
    config[key] = document.getElementById(id).checked;
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch {}
  if (!config.aircraft && game) game.plane = null;
}
function hasSave() {
  try {
    return !!(
      localStorage.getItem(SAVE_KEY) ||
      localStorage.getItem(V13_KEY) ||
      localStorage.getItem(V12_KEY) ||
      localStorage.getItem(V11_KEY) ||
      localStorage.getItem(LEGACY_KEY)
    );
  } catch {
    return false;
  }
}
function updateMenu() {
  const has = hasSave();
  document.getElementById("loadPatrolBtn").disabled = !has;
  document.getElementById("resumeBtn").disabled = !game;
  document.getElementById("resumeBtn").textContent =
    game?.phase === "port"
      ? "Return to Port"
      : game?.over
        ? "View Patrol Report"
        : "Resume Patrol";
  try {
    document.getElementById("loadManualBtn").disabled = !(
      localStorage.getItem(SAVE_KEY + "_manual") ||
      localStorage.getItem(V13_KEY + "_manual") ||
      localStorage.getItem(V12_KEY + "_manual") ||
      localStorage.getItem(V11_KEY + "_manual")
    );
  } catch {
    document.getElementById("loadManualBtn").disabled = true;
  }
  document.getElementById("saveFound").textContent = has
    ? "Saved patrol available."
    : "No saved patrol found.";
}
function clearInput() {
  for (const k of Object.keys(keys)) delete keys[k];
  for (const k of Object.keys(pressed)) delete pressed[k];
}
function openSplash() {
  if (game) {
    game.timeScale = 1;
    game.logOpen = false;
  }
  document.getElementById("logOverlay").style.display = "none";
  document.getElementById("port").style.display = "none";
  splash.style.display = "flex";
  death.style.display = "none";
  clearInput();
  updateMenu();
}
function closeSplash() {
  if (game?.phase === "port") {
    openPort();
    return;
  }
  if (!game) return;
  if (game.over) {
    showResults();
    return;
  }
  splash.style.display = "none";
  death.style.display = "none";
  clearInput();
  initAudio();
}
// Campaign progression: missions and upgrades are saved with the patrol.
const MISSIONS = [
  {
    id: 1,
    name: "First Contact",
    kind: "merchants",
    goal: 2,
    brief:
      "Sink two merchants and return through the southern exit. A small coastal convoy is your first assignment.",
    bonus: "No secondary objective. Bring the boat home.",
    bonusLabel: null,
  },
  {
    id: 2,
    name: "Fuel Shortage",
    kind: "target",
    targetType: "tanker",
    brief:
      "Sink the designated tanker marked with a gold diamond, then return south. Other tankers do not satisfy this order.",
    bonus:
      "Sink one additional merchant and complete the patrol for +1 upgrade point.",
    bonusLabel: "Additional merchant",
  },
  {
    id: 3,
    name: "Lifeguard Duty",
    kind: "rescue",
    brief:
      "Recover the survivors at the liferaft. Stay within 65 units, surfaced and moving no faster than 8 u/s, for 12 seconds. Then return south.",
    bonus:
      "Recover the survivors and return with at least 85% hull for +1 upgrade point.",
    bonusLabel: "Return with 85% hull",
  },
  {
    id: 4,
    name: "Convoy Interception",
    kind: "target",
    targetType: "transport",
    brief:
      "Intercept and sink the designated transport before it crosses the eastern exit line. Then return south. Do not get distracted by escorts.",
    bonus:
      "Sink the transport before the timer drops below 30 seconds, then return, for +1 upgrade point.",
    bonusLabel: "Intercept with 30s remaining",
  },
  {
    id: 5,
    name: "Heavy Opposition",
    kind: "tonnage",
    goal: 24000,
    brief:
      "Sink at least 24,000 tons of merchant shipping and return. Heavily defended targets are valuable, but you do not need to destroy every ship.",
    bonus: "Sink at least 36,000 tons and return for a campaign commendation.",
    bonusLabel: "36,000-ton commendation",
  },
];
const UPGRADES = [
  {
    id: "reload",
    name: "Reload drills",
    description: "Torpedo reload time −12% per level.",
    effect: (n) => `${(8 * (1 - 0.12 * n)).toFixed(2)} s reload`,
  },
  {
    id: "battery",
    name: "Battery maintenance",
    description: "Submerged endurance +15% per level.",
    effect: (n) => `+${n * 15}% endurance`,
  },
  {
    id: "quiet",
    name: "Quiet machinery",
    description:
      "Detection from movement noise −12% per level. Visual detection and active sonar are unchanged.",
    effect: (n) => `−${n * 12}% movement noise`,
  },
  {
    id: "sonar",
    name: "Sonar training",
    description: "Active-sonar contact fixes last 15% longer per level.",
    effect: (n) => `${(5 * (1 + 0.15 * n)).toFixed(2)} s contact fixes`,
  },
  {
    id: "repair",
    name: "Damage control",
    description:
      "One emergency repair per patrol: +15 hull at level 1, +25 at level 2. Takes 10 seconds at slow speed; weapons are unavailable while repairing.",
    effect: (n) =>
      n ? `1 repair · +${n === 1 ? 15 : 25} hull` : "No emergency repair",
  },
];
function normalizeCampaign(c = {}) {
  const out = {
    patrol: 1,
    totalScore: 0,
    totalTonnage: 0,
    points: 0,
    upgrades: {},
    completed: [],
    bonusClaimed: [],
    log: [],
    ended: false,
    ...c,
  };
  out.patrol = clamp(Math.floor(Number(out.patrol) || 1), 1, 5);
  out.points = Math.max(0, Math.floor(Number(out.points) || 0));
  out.upgrades = { ...out.upgrades };
  for (const u of UPGRADES)
    out.upgrades[u.id] = clamp(
      Math.floor(Number(out.upgrades[u.id]) || 0),
      0,
      2,
    );
  out.completed = Array.isArray(out.completed)
    ? [
        ...new Set(
          out.completed.filter((x) => Number.isInteger(x) && x >= 1 && x <= 5),
        ),
      ]
    : [];
  out.bonusClaimed = Array.isArray(out.bonusClaimed)
    ? [
        ...new Set(
          out.bonusClaimed.filter(
            (x) => Number.isInteger(x) && x >= 1 && x <= 5,
          ),
        ),
      ]
    : [];
  out.log = Array.isArray(out.log) ? out.log : [];
  out.crew = normalizeCrew(out.crew);
  out.raidCompleted = out.raidCompleted === true;
  return out;
}
function missionDef(g = game) {
  if (g?.mission?.id === 6) return HARBOR_MISSION;
  return (
    MISSIONS[(g?.mission?.id || g?.campaign?.patrol || 1) - 1] || MISSIONS[0]
  );
}
function freshMission(id) {
  return {
    id,
    targetId: null,
    targetSunk: false,
    targetEscaped: false,
    failed: false,
    rescueX: 1020,
    rescueY: 420,
    rescueProgress: 0,
    rescued: false,
    deadline: null,
    targetKillTime: null,
    awarded: false,
    pointsEarned: 0,
    bonusEarned: false,
  };
}
function upgradeLevel(id) {
  return game?.campaign?.upgrades?.[id] || 0;
}
function objectiveComplete(g = game) {
  if (!g?.mission || g.mission.failed) return false;
  if (g.mission.id === 6)
    return !!g.harbor && g.harbor.sunk.length === 2 && g.harbor.fuelHP <= 0;
  const d = missionDef(g),
    m = g.mission;
  return d.kind === "merchants"
    ? g.stats.merchants >= d.goal
    : d.kind === "tonnage"
      ? g.stats.tonnage >= d.goal
      : d.kind === "rescue"
        ? m.rescued
        : m.targetSunk;
}
function objectiveProgress() {
  const d = missionDef(),
    m = game.mission;
  if (m.id === 6)
    return `${game.harbor.sunk.length}/2 ships · fuel ${game.harbor.fuelHP <= 0 ? "destroyed" : Math.ceil(game.harbor.fuelHP) + " HP"}`;
  if (m.failed) return "TARGET ESCAPED";
  if (d.kind === "merchants")
    return `${game.stats.merchants} / ${d.goal} merchants`;
  if (d.kind === "tonnage")
    return `${game.stats.tonnage.toLocaleString()} / ${d.goal.toLocaleString()} tons`;
  if (d.kind === "rescue")
    return m.rescued
      ? "SURVIVORS ABOARD"
      : `${m.rescueProgress.toFixed(1)} / 12 s recovery`;
  return m.targetSunk
    ? "TARGET SUNK"
    : d.id === 4
      ? `${Math.max(0, Math.ceil(m.deadline - game.time))} s to intercept`
      : "DESIGNATED TANKER";
}
function bonusComplete() {
  const m = game.mission;
  return m.id === 2
    ? m.targetSunk && game.stats.merchants >= 2
    : m.id === 3
      ? m.rescued && game.sub.hull >= 85
      : m.id === 4
        ? m.targetSunk && m.deadline - m.targetKillTime >= 30
        : m.id === 5
          ? game.stats.tonnage >= 36000
          : false;
}
function newCampaign() {
  newGame(normalizeCampaign());
  openPort(1);
}
function openPort(nextId) {
  if (!game || game.campaign.ended) return;
  game.phase = "port";
  game.portMission = nextId || game.portMission || game.campaign.patrol;
  document.getElementById("port").style.display = "flex";
  splash.style.display = "none";
  death.style.display = "none";
  clearInput();
  renderPort();
  checkpoint();
}
function renderPort() {
  const c = game.campaign,
    d =
      game.plannedSortie === "harbor"
        ? HARBOR_MISSION
        : MISSIONS[game.portMission - 1];
  document.getElementById("portTitle").textContent =
    d.id === 6
      ? "Special assignment — Blackwater Harbor"
      : `Patrol ${d.id} / 5 — ${d.name}`;
  document.getElementById("portBrief").textContent = d.brief;
  document.getElementById("portBonus").textContent = d.bonus;
  document.getElementById("upgradePoints").textContent =
    `${c.points} upgrade point${c.points === 1 ? "" : "s"} available`;
  document.getElementById("portStatus").textContent =
    game.portNotice ||
    (c.completed.length
      ? "Your boat will depart fully repaired, rearmed, and charged. Unspent points carry forward."
      : "Complete your first patrol to earn an upgrade point. Your boat is provisioned for departure.");
  document.getElementById("campaignTrack").innerHTML = MISSIONS.map(
    (m) =>
      `<span class="missionStep ${c.completed.includes(m.id) ? "done" : m.id === d.id ? "current" : ""}">${c.completed.includes(m.id) ? "✓ " : ""}${m.id}. ${m.name}</span>`,
  ).join("");
  const list = document.getElementById("upgradeList");
  list.innerHTML = "";
  for (const u of UPGRADES) {
    const n = c.upgrades[u.id],
      card = document.createElement("article");
    card.className = "upgradeCard";
    const body = document.createElement("div");
    body.innerHTML = `<b>${u.name}</b><span class="level">${n} / 2</span><p>${u.description}</p><span class="small yellow">${u.effect(n)}${n < 2 ? " → " + u.effect(n + 1) : ""}</span>`;
    const button = document.createElement("button");
    button.textContent = n >= 2 ? "Fully trained" : "Upgrade · 1 point";
    button.disabled = n >= 2 || c.points < 1;
    button.dataset.upgrade = u.id;
    button.addEventListener("click", () => buyUpgrade(u.id));
    card.appendChild(body);
    card.appendChild(button);
    list.appendChild(card);
  }
  const log = document.getElementById("campaignLog");
  log.textContent = c.log.length
    ? c.log
        .map(
          (entry) =>
            `Patrol ${entry.patrol}: ${entry.outcome === "success" ? "Complete" : entry.outcome === "lost" ? "Lost" : "Returned early"} · ${entry.tonnage.toLocaleString()} tons · ${entry.score.toLocaleString()} points`,
        )
        .join(" | ")
    : "Five missions. Upgrade your crew and bring the boat home.";
  document.getElementById("departBtn").textContent = c.completed.includes(d.id)
    ? "Depart again"
    : `Depart · Patrol ${d.id}`;
  renderApproaches();
  renderCrewPort();
  document.getElementById("departBtn").textContent =
    d.id === 6 ? "Depart · Harbor Raid" : `Depart · Patrol ${d.id}`;
}
function buyUpgrade(id) {
  const u = UPGRADES.find((x) => x.id === id);
  if (
    !u ||
    game?.phase !== "port" ||
    game.campaign.points < 1 ||
    upgradeLevel(id) >= 2
  )
    return false;
  game.campaign.points--;
  game.campaign.upgrades[id]++;
  game.portNotice = `${u.name} upgraded. ${u.effect(upgradeLevel(id))}.`;
  renderPort();
  checkpoint();
  tone(520, 0.12, "sine", 0.025, 850);
  return true;
}
function departPort() {
  if (!game || game.phase !== "port" || game.campaign.ended) return;
  const c = normalizeCampaign(game.campaign);
  c.patrol = game.portMission;
  c.approach = game.plannedApproach;
  newGame(c, game.plannedSortie === "harbor" ? "harbor" : "campaign");
  checkpoint();
}
function emergencyRepair() {
  const s = game.sub;
  if (game.over || game.phase !== "patrol" || s.repairT > 0) return;
  if (!s.repairCharges) {
    announce(
      upgradeLevel("repair")
        ? "Emergency repair already used this patrol"
        : "Damage control upgrade required — available at port",
    );
    return;
  }
  if (s.hull >= 100) {
    announce("Hull already at 100%");
    return;
  }
  if (Math.abs(s.speed) > 8) {
    announce("Slow to 8 u/s or less to start emergency repairs");
    return;
  }
  s.repairT = crewHas("chief") ? 12 : 10;
  announce(`DAMAGE CONTROL — maintain slow speed for ${s.repairT} seconds`, 4);
}
function updateMission(dt) {
  const m = game.mission,
    s = game.sub,
    d = missionDef();
  if (m.failed) return;
  if (d.kind === "rescue" && !m.rescued) {
    if (
      dist(s, { x: m.rescueX, y: m.rescueY }) <= 65 &&
      s.depth < 3 &&
      Math.abs(s.speed) <= 8
    ) {
      m.rescueProgress = Math.min(12, m.rescueProgress + dt);
      if (m.rescueProgress >= 12) {
        m.rescued = true;
        game.score += 600;
        announce("SURVIVORS ABOARD — return south", 5);
      }
    } else m.rescueProgress = 0;
  }
  if (d.kind === "target" && !m.targetSunk) {
    const target = game.ships.find((sh) => sh.id === m.targetId);
    if (d.id === 4 && target?.alive && target.x < 1510)
      m.deadline =
        game.time +
        (1510 - target.x) / Math.max(0.1, Math.cos(target.a) * target.speed);
    if (
      m.targetEscaped ||
      (d.id === 4 && (game.time >= m.deadline || (target && target.x >= 1510)))
    ) {
      m.failed = true;
      m.targetEscaped = true;
      announce("MISSION TARGET ESCAPED — return south to refit and retry", 7);
    }
  }
  if (objectiveComplete() && !game.objectiveAnnounced) {
    game.objectiveAnnounced = true;
    announce("PRIMARY OBJECTIVE COMPLETE — return south", 5);
  }
}
function drawMission() {
  if (!game?.mission) return;
  const m = game.mission,
    d = missionDef();
  if (d.kind === "rescue" && !m.rescued) {
    ctx.save();
    ctx.setLineDash([5, 6]);
    circle(m.rescueX, m.rescueY, 65, "#8ad9c5", 2);
    ctx.setLineDash([]);
    ctx.fillStyle = "#f0b270";
    ctx.fillRect(m.rescueX - 13, m.rescueY - 7, 26, 14);
    label("SURVIVORS", m.rescueX, m.rescueY - 35, "#b7ffe4", 15);
    label(
      "Surface · ≤8 u/s · 12 seconds",
      m.rescueX,
      m.rescueY + 87,
      "#d1ece3",
      13,
    );
    if (m.rescueProgress > 0)
      label(
        m.rescueProgress.toFixed(1) + " / 12 s",
        m.rescueX,
        m.rescueY + 30,
        "#fff3bc",
        14,
      );
    ctx.restore();
  }
  if (d.kind === "target" && !m.targetSunk && !m.failed) {
    const target = game.ships.find((sh) => sh.id === m.targetId && sh.alive);
    if (target) {
      const visible =
        game.sub.depth < 3 ||
        (game.sub.depth < 18 && dist(game.sub, target) < 570) ||
        game.sub.sonarMarks.some(
          (mark) => mark.shipId === target.id && mark.ttl > 0,
        );
      if (visible) {
        ctx.save();
        ctx.translate(target.x, target.y);
        ctx.rotate(Math.PI / 4);
        ctx.strokeStyle = "#ffdf88";
        ctx.lineWidth = 2;
        ctx.strokeRect(-32, -32, 64, 64);
        ctx.restore();
        label("MISSION TARGET", target.x, target.y - 53, "#ffe5a0", 13);
      }
    }
  }
  if (d.id === 4) {
    ctx.save();
    ctx.setLineDash([9, 8]);
    ctx.strokeStyle = "#ddb16f88";
    ctx.beginPath();
    ctx.moveTo(1510, 80);
    ctx.lineTo(1510, 600);
    ctx.stroke();
    ctx.restore();
    label("TARGET EXIT", 1460, 65, "#eac189", 12);
  }
}
function awardMission() {
  const c = game.campaign,
    m = game.mission;
  if (m.awarded) return;
  m.awarded = true;
  if (m.id === 6) {
    if (game.outcome === "success" && !c.raidCompleted) {
      c.raidCompleted = true;
      c.points++;
      m.pointsEarned = 1;
    }
    c.log.push({
      patrol: 6,
      outcome: game.outcome,
      tonnage: game.stats.tonnage,
      score: game.score,
      hull: Math.round(game.sub.hull),
      points: m.pointsEarned,
    });
    return;
  }
  if (game.outcome === "success" && !c.completed.includes(m.id)) {
    c.completed.push(m.id);
    c.points++;
    m.pointsEarned++;
    if (
      m.id >= 2 &&
      m.id <= 4 &&
      bonusComplete() &&
      !c.bonusClaimed.includes(m.id)
    ) {
      c.bonusClaimed.push(m.id);
      c.points++;
      m.pointsEarned++;
      m.bonusEarned = true;
    }
    if (m.id === 5) {
      c.ended = true;
      m.bonusEarned = bonusComplete();
    }
  }
  c.log.push({
    patrol: m.id,
    outcome: game.outcome,
    tonnage: game.stats.tonnage,
    score: game.score,
    hull: Math.round(game.sub.hull),
    points: m.pointsEarned,
  });
}
function nextPatrol() {
  if (!game || !game.over || game.outcome === "lost" || game.campaign.ended)
    return;
  if (game.mission.id === 6) {
    openPort(game.campaign.patrol);
    return;
  }
  openPort(
    game.outcome === "success"
      ? Math.min(5, game.mission.id + 1)
      : game.mission.id,
  );
}

function makeSub() {
  return {
    x: 800,
    y: 760,
    a: -Math.PI / 2,
    speed: 0,
    depth: 0,
    targetDepth: 0,
    hull: 100,
    battery: 100,
    detected: 0,
    pingAlert: 0,
    launchAlert: 0,
    gunAlert: 0,
    sonarCD: 0,
    sonarPulse: 0,
    sonarMarks: [],
    selectedGun: 0,
    aimAngle: 0,
    fwdTubes: 6,
    aftTubes: 4,
    torpReserve: 14,
    torpCD: 0,
    torpReloading: false,
    torpReloadT: 0,
    deck: 12,
    deckReserve: 108,
    bofors: 24,
    boforsReserve: 240,
    oerlikon: 40,
    oerlikonReserve: 400,
    mounts: GUNS.map(() => ({ cd: 0, reload: 0 })),
    lowBatteryWarned: false,
    exhausted: false,
    repairCharges: 0,
    repairT: 0,
  };
}
function newGame(campaign = null, sortie = "campaign") {
  readConfigFromUI();
  nextShipId = 1;
  game = {
    version: 14,
    active: true,
    over: false,
    outcome: null,
    time: 0,
    score: 0,
    campaign: normalizeCampaign(campaign || {}),
    sub: makeSub(),
    ships: [],
    shots: [],
    shells: [],
    enemyShells: [],
    charges: [],
    splashes: [],
    wrecks: [],
    signals: [],
    plane: null,
    planeTimer: 45,
    encounter: 0,
    encounterName: "",
    encounterAge: 0,
    nextEncounterIn: null,
    extraction: 0,
    clearContact: 0,
    objectiveAnnounced: false,
    stats: {
      merchants: 0,
      escorts: 0,
      aircraft: 0,
      tonnage: 0,
      shots: 0,
      hits: 0,
      torpedoesFired: 0,
      torpedoHits: 0,
    },
    message: "",
    messageT: 0,
    soundCD: 0,
  };
  game.phase = "patrol";
  game.mission = freshMission(game.campaign.patrol);
  initTactics(game);
  game.sub.repairCharges =
    upgradeLevel("repair") > 0 || crewHas("chief") ? 1 : 0;
  if (crewHas("torpedoman")) game.sub.torpReserve -= 2;
  game.plannedSortie = sortie;
  game.planeTimer =
    game.campaign.patrol === 1 ? 90 : game.campaign.patrol === 3 ? 22 : 35;
  if (sortie === "harbor") initHarbor(game);
  else spawnConvoy();
  document.getElementById("port").style.display = "none";
  death.style.display = "none";
  closeSplash();
  lastAutoSave = 0;
  announce(missionDef().brief, 8);
  renderHUD();
}
function makeShip(x, y, a, type, convoySpeed) {
  const heavy = type === "heavy",
    escort = type === "escort" || heavy,
    small = type === "coaster",
    tanker = type === "tanker",
    transport = type === "transport";
  const hp = heavy
    ? 180
    : escort
      ? 85
      : tanker
        ? 145
        : transport
          ? 125
          : small
            ? 85
            : 110;
  return {
    id: nextShipId++,
    x,
    y,
    a,
    routeA: a,
    type,
    escort,
    heavy,
    small,
    hp,
    maxhp: hp,
    tonnage: escort
      ? 0
      : tanker
        ? 12000
        : transport
          ? 9000
          : small
            ? 3500
            : 6000,
    speed: convoySpeed,
    convoySpeed,
    alive: true,
    fire: rnd(1, 3),
    contact: 0,
    state: "patrol",
    lastKnown: null,
    searchT: 0,
    sampleT: 0,
    sonarT: rnd(3, 6),
    attack: null,
    burn: 0,
    burnTick: 0,
    smokeT: 0,
    convoyId: game?.encounter || 0,
    role: "hunter",
    alertUntil: 0,
  };
}
function spawnConvoy() {
  if (game.harbor) return;
  game.encounter++;
  game.encounterAge = 0;
  game.nextEncounterIn = null;
  const d = missionDef(),
    first = game.encounter === 1;
  let kind =
    d.id === 1
      ? "opening"
      : d.id === 2
        ? "high-value"
        : d.id === 3
          ? "rescue"
          : d.id === 4
            ? "intercept"
            : "challenge";
  if (!first && d.id !== 1)
    kind = game.encounter % 2 ? "high-value" : "standard";
  game.encounterName = {
    opening: "Coastal supply group",
    "high-value": "Tanker convoy",
    rescue: "Rescue-area patrol",
    intercept: "Eastbound troop transport",
    challenge: "Heavily defended shipping",
    standard: "Merchant convoy",
  }[kind];
  const fromLeft = first ? true : Math.random() < 0.5,
    a = fromLeft ? 0.035 : Math.PI - 0.035,
    baseX = fromLeft ? 140 : WORLD.w - 140,
    baseY = d.id === 4 && first ? 320 : rnd(220, 340),
    speed = d.id === 4 && first ? 13 : kind === "opening" ? 16 : 18;
  const f = { x: Math.cos(a), y: Math.sin(a) },
    r = { x: -Math.sin(a), y: Math.cos(a) };
  const types =
    kind === "opening"
      ? ["coaster", "merchant"]
      : kind === "high-value"
        ? ["tanker", "merchant", "coaster"]
        : kind === "rescue"
          ? []
          : kind === "intercept"
            ? ["transport", "merchant"]
            : kind === "challenge"
              ? ["tanker", "transport", "merchant", "merchant"]
              : ["merchant", "coaster", "transport"];
  types.forEach((type, i) => {
    const lateral = (i % 2 ? 1 : -1) * 48,
      back = Math.floor(i / 2) * 95;
    const sh = makeShip(
      baseX + r.x * lateral - f.x * back,
      baseY + r.y * lateral - f.y * back,
      a,
      type,
      speed,
    );
    if (first && type === d.targetType && game.mission.targetId === null) {
      game.mission.targetId = sh.id;
      sh.missionTarget = true;
      if (d.id === 4)
        game.mission.deadline = (1510 - sh.x) / (Math.cos(a) * speed);
    }
    game.ships.push(sh);
  });
  const escorts = Math.max(
    1,
    (kind === "opening" || kind === "rescue"
      ? 1
      : kind === "challenge"
        ? 3
        : 2) + approachDef(game.approach).escorts,
  );
  for (let i = 0; i < escorts; i++) {
    const lateral = i === 0 ? 145 : i === 1 ? -145 : 0,
      forward = i === 2 ? 150 : 20;
    const escort = makeShip(
      baseX + r.x * lateral + f.x * forward,
      baseY + r.y * lateral + f.y * forward,
      a,
      "escort",
      speed + 3,
    );
    escort.role = escorts > 1 && i === escorts - 1 ? "guard" : "hunter";
    game.ships.push(escort);
  }
  if (
    config.heavyHunters &&
    (kind === "challenge" || (!first && kind === "high-value" && d.id >= 4))
  )
    game.ships.push(
      makeShip(
        baseX + r.x * 225 - f.x * 45,
        baseY + r.y * 225 - f.y * 45,
        a,
        "heavy",
        speed + 4,
      ),
    );
  if (!first)
    announce(`${game.encounterName.toUpperCase()} — optional targets`, 4);
}
function currentAim() {
  return game.sub.a + game.sub.aimAngle;
}
function selectedTubeBank() {
  return Math.abs(norm(game.sub.aimAngle)) <= Math.PI / 2 ? "FWD" : "AFT";
}
function selectGun(i) {
  game.sub.selectedGun = (i + GUNS.length) % GUNS.length;
  tone(400, 0.05, "sine", 0.012, 600);
}
function setDepth(depth) {
  const s = game.sub;
  if (s.exhausted && depth > 0) {
    announce("Battery depleted — remain surfaced to recharge");
    return;
  }
  s.targetDepth = depth;
  announce(
    depth === 0
      ? "SURFACE — guns and battery charging"
      : depth === 12
        ? "PERISCOPE DEPTH — visual targeting and torpedoes"
        : "DEEP — slow down to break contact",
  );
}
function cycleDepth() {
  setDepth(DEPTHS[(DEPTHS.indexOf(game.sub.targetDepth) + 1) % 3]);
}
function beginReload(index = game.sub.selectedGun) {
  const s = game.sub,
    g = GUNS[index],
    m = s.mounts[index];
  if (game.over || m.reload > 0 || s[g.ammo] >= g.cap || s[g.reserve] <= 0)
    return;
  m.reload = g.reload * (index === 0 && crewHas("captain") ? 1.1 : 1);
}
function reloadTorpedoes() {
  const s = game.sub;
  if (
    game.over ||
    s.torpReloading ||
    s.torpReserve <= 0 ||
    (s.fwdTubes === 6 && s.aftTubes === 4)
  )
    return;
  s.torpReloading = true;
  s.torpReloadT =
    8 * (1 - 0.12 * upgradeLevel("reload")) * (crewHas("torpedoman") ? 0.9 : 1);
  announce("Torpedo reload — " + s.torpReloadT.toFixed(2) + " seconds");
}
function signal(type, x, y, radius, ttl = 2) {
  game.signals.push({ type, x, y, radius, ttl });
}
function fireTorpedo() {
  const s = game.sub;
  if (game.over || s.torpReloading || s.torpCD > 0 || s.repairT > 0) return;
  if (s.depth > 15) {
    announce("Too deep to launch — rise to periscope depth");
    return;
  }
  const bank = selectedTubeBank(),
    key = bank === "FWD" ? "fwdTubes" : "aftTubes",
    spread = SPREADS[s.spread];
  if (s[key] < spread.count) {
    announce(
      `${bank} needs ${spread.count} loaded tube${spread.count > 1 ? "s" : ""} — select single shot or reload`,
    );
    return;
  }
  s[key] -= spread.count;
  s.torpCD = spread.count === 1 ? 0.85 : 1.4;
  s.launchAlert = 3;
  s.silent = false;
  const origin = bank === "FWD" ? 30 : -30;
  for (let i = 0; i < spread.count; i++) {
    game.shots.push({
      x: s.x + Math.cos(s.a) * origin,
      y: s.y + Math.sin(s.a) * origin,
      ox: s.x,
      oy: s.y,
      a: currentAim() + (i - (spread.count - 1) / 2) * spread.angle,
      speed: 220,
      life: 7,
      damage: 85,
    });
  }
  game.stats.shots += spread.count;
  game.stats.torpedoesFired += spread.count;
  signal("launch", s.x, s.y, 430, 3);
  recordEvent(
    `${bank} ${spread.name.toLowerCase()} launched: ${spread.count} torpedo${spread.count > 1 ? "es" : ""}.`,
    "attack",
  );
  game.timeScale = 1;
  tone(150, 0.25, "triangle", 0.04, 45);
}
function fireGun() {
  const s = game.sub,
    index = s.selectedGun,
    g = GUNS[index],
    m = s.mounts[index];
  if (game.over || s.depth >= 3 || m.reload > 0 || m.cd > 0 || s.repairT > 0)
    return;
  if (s[g.ammo] <= 0) {
    beginReload(index);
    return;
  }
  const a = currentAim();
  s[g.ammo]--;
  m.cd = g.interval;
  s.gunAlert = 2;
  game.shells.push({
    x: s.x + Math.cos(a) * 32,
    y: s.y + Math.sin(a) * 32,
    ox: s.x,
    oy: s.y,
    a: a + rnd(-g.spread, g.spread) * game.weather.gunSpread,
    speed: g.speed,
    life: g.life,
    damage: g.damage,
    size: g.size,
    color: g.color,
    weapon: index,
  });
  game.stats.shots++;
  if (game.time - game.lastGunLog > 3) {
    recordEvent(g.name + " opened fire.", "attack");
    game.lastGunLog = game.time;
  }
  signal("gun", s.x, s.y, 620, 0.2);
  effect(s.x + Math.cos(a) * 36, s.y + Math.sin(a) * 36, "muzzle", 0.12);
  if (s[g.ammo] === 0) beginReload(index);
  if (game.soundCD <= 0) {
    tone(index === 0 ? 115 : 200, 0.08, "sawtooth", 0.025, 45);
    game.soundCD = 0.1;
  }
}
function activeSonar() {
  const s = game.sub;
  if (game.over || s.depth < 3 || s.sonarCD > 0) return;
  s.sonarCD = 7;
  s.sonarPulse = 1;
  s.sonarMarks = [];
  if (config.sonarPenalty) {
    s.pingAlert = 3;
    signal("ping", s.x, s.y, 680 * (crewHas("sonarman") ? 1.1 : 1), 3);
  }
  for (const sh of game.ships) {
    if (
      sh.alive &&
      dist(s, sh) <= 760 &&
      Math.abs(norm(Math.atan2(sh.y - s.y, sh.x - s.x) - s.a)) <= Math.PI / 4
    )
      s.sonarMarks.push({
        shipId: sh.id,
        x: sh.x,
        y: sh.y,
        ttl:
          5 *
          (1 + 0.15 * upgradeLevel("sonar")) *
          (crewHas("sonarman") ? 1.15 : 1),
        observedAt: game.time,
        range: Math.round(dist(s, sh)),
      });
  }
  announce(`ACTIVE SONAR — ${s.sonarMarks.length} contact returns`);
  tone(1100, 0.4, "sine", 0.035, 750);
}
// Detection is local to each escort. Search and attack orders use sampled positions.
function turnToward(sh, x, y, rate, dt) {
  const desired = Math.atan2(y - sh.y, x - sh.x);
  sh.a += clamp(norm(desired - sh.a), -rate * dt, rate * dt);
}
function updateEscort(sh, dt) {
  if (updateDecoyEscort(sh, dt)) return;
  const s = game.sub,
    ag = difficultyScale(),
    d = dist(sh, s);
  sh.fire = Math.max(0, sh.fire - dt);
  sh.sampleT -= dt;
  sh.sonarT -= dt;
  let strength = 0;
  if (s.depth < 3)
    strength = clamp(
      (590 * game.weather.visual - d) / (340 * game.weather.visual),
      0,
      1,
    );
  else if (s.depth < 18)
    strength = clamp(
      (280 * game.weather.visual - d) / (220 * game.weather.visual),
      0,
      0.8,
    );
  else strength = clamp((115 - d) / 100, 0, 0.85);
  if (s.depth >= 3) {
    const noisy = clamp((Math.abs(s.speed) - 8) / 25, 0, 1);
    strength = Math.max(
      strength,
      clamp((340 - d) / 260, 0, 1) *
        noisy *
        0.85 *
        (1 - 0.12 * upgradeLevel("quiet")) *
        (crewHas("engineer") ? 1.05 : 1) *
        (s.silent ? 0.35 : 1),
    );
  }
  if (s.depth >= 3 && sh.sonarT <= 0) {
    sh.sonarT = rnd(4.5, 7) / ag;
    if (d < 330) {
      effect(sh.x, sh.y, "ping", 1.7);
      tone(720, 0.2, "sine", 0.018, 500);
      strength = Math.max(strength, clamp((220 - d) / 180, 0, 0.9));
    }
  }
  let heard = null;
  for (const sig of game.signals) {
    if (dist(sh, sig) < sig.radius) {
      heard = sig;
      break;
    }
  }
  if (heard && sh.state === "patrol" && sh.contact < 0.2) {
    sh.lastKnown = { x: heard.x + rnd(-65, 65), y: heard.y + rnd(-65, 65) };
    sh.state = "investigate";
    sh.searchT = 20;
    sh.contact = 0.22;
  }
  if (strength > 0.16) {
    sh.contact = clamp(sh.contact + strength * 0.7 * ag * dt, 0, 1);
    if (sh.sampleT <= 0) {
      const error = (1 - sh.contact) * (s.depth < 3 ? 20 : 75);
      sh.lastKnown = {
        x: s.x + rnd(-error, error),
        y: s.y + rnd(-error, error),
      };
      sh.sampleT = s.depth < 3 ? 0.7 : 2.5;
      sh.searchT = 22;
    }
  } else
    sh.contact = Math.max(
      0,
      sh.contact - dt * 0.055 * (crewHas("captain") ? 1.1 : 1),
    );
  if (sh.contact > 0.52 && !sh.attack) {
    sh.state = "track";
  } else if (sh.state === "track" && sh.contact < 0.3) {
    sh.state = "search";
    sh.searchT = 22;
  }
  if (sh.state === "investigate" || sh.state === "search") {
    sh.searchT -= dt;
    if (sh.searchT <= 0) {
      sh.state = "patrol";
      sh.lastKnown = null;
      sh.contact = 0;
    }
  }
  if (
    sh.lastKnown &&
    sh.contact > 0.58 &&
    s.depth >= 3 &&
    !sh.attack &&
    sh.fire <= 0 &&
    dist(sh, sh.lastKnown) < 280
  ) {
    sh.attack = {
      x: clamp(sh.lastKnown.x + rnd(-28, 28), 30, WORLD.w - 30),
      y: clamp(sh.lastKnown.y + rnd(-28, 28), 30, WORLD.h - 30),
      depth: s.depth < 20 ? 12 : 60,
      stage: "approach",
      run: 0,
    };
    sh.state = "attack";
    announce("ESCORT ATTACK RUN — change course and depth", 2.5);
  }
  let desiredSpeed = sh.convoySpeed;
  const guard = convoyGuardPoint(sh);
  if (guard && !sh.attack) {
    sh.state = "screen";
    turnToward(sh, guard.x, guard.y, 0.6 * ag, dt);
    desiredSpeed = dist(sh, guard) > 80 ? 30 : sh.convoySpeed;
  } else if (sh.attack) {
    const at = sh.attack;
    desiredSpeed = sh.heavy ? 45 : 42;
    if (at.stage === "approach") {
      turnToward(sh, at.x, at.y, (sh.heavy ? 0.55 : 0.75) * ag, dt);
      if (dist(sh, at) < 48) {
        dropCharges(sh, at);
        at.stage = "run";
        at.run = 4;
        sh.fire = (sh.heavy ? 13 : 16) / ag;
      }
    } else {
      at.run -= dt;
      if (at.run <= 0) {
        sh.attack = null;
        sh.state = "search";
        sh.searchT = 22;
      }
    }
  } else if (sh.state !== "patrol" && sh.lastKnown) {
    desiredSpeed = sh.state === "track" ? 40 : 31;
    const search = sh.state === "search" || dist(sh, sh.lastKnown) < 45;
    const phase = game.time * 0.22 + sh.id;
    const tx = sh.lastKnown.x + (search ? Math.cos(phase) * 95 : 0),
      ty = sh.lastKnown.y + (search ? Math.sin(phase) * 95 : 0);
    turnToward(sh, tx, ty, 0.65 * ag, dt);
  } else {
    sh.a += clamp(norm(sh.routeA - sh.a), -0.4 * dt, 0.4 * dt);
  }
  if (
    s.depth < 3 &&
    sh.contact > 0.5 &&
    d < (sh.heavy ? 490 : 390) &&
    sh.fire <= 0
  ) {
    const a = Math.atan2(s.y - sh.y, s.x - sh.x) + rnd(-0.025, 0.025);
    const count = sh.heavy ? 2 : 1;
    for (let i = 0; i < count; i++)
      game.enemyShells.push({
        x: sh.x + Math.cos(a) * 30,
        y: sh.y + Math.sin(a) * 30,
        a: a + (i - (count - 1) / 2) * 0.05,
        speed: 250,
        life: 2.2,
        damage: sh.heavy ? 9 : 7,
      });
    sh.fire = (sh.heavy ? 2.8 : 3.5) / ag;
    effect(sh.x, sh.y, "muzzle", 0.18);
  }
  sh.speed = desiredSpeed * (sh.hp < sh.maxhp * 0.4 ? 0.8 : 1);
  sh.x += Math.cos(sh.a) * sh.speed * dt;
  sh.y += Math.sin(sh.a) * sh.speed * dt;
}
function dropCharges(sh, at) {
  const count = sh.heavy ? 4 : 3;
  for (let i = 0; i < count; i++) {
    const back = i * 24;
    game.charges.push({
      x: sh.x - Math.cos(sh.a) * back + rnd(-12, 12),
      y: sh.y - Math.sin(sh.a) * back + rnd(-12, 12),
      t: 2.8 + i * 0.22,
      total: 2.8 + i * 0.22,
      depth: at.depth,
      kind: "depth",
      power: 22,
      radius: 82,
    });
  }
  announce("DEPTH CHARGES RELEASED — evade the marked pattern", 3);
  tone(180, 0.3, "triangle", 0.045, 60);
}
function spawnPlane() {
  const s = game.sub,
    left = Math.random() < 0.5;
  game.plane = {
    x: left ? -70 : WORLD.w + 70,
    y: clamp(s.y + rnd(-190, 190), 80, WORLD.h - 120),
    a: left ? 0 : Math.PI,
    speed: 135,
    hp: 32,
    maxhp: 32,
    life: 26,
    state: "patrol",
    target: null,
    acquire: 0,
    runT: 0,
    attacks: 0,
  };
  game.planeTimer = rnd(45, 65);
  announce("AIRCRAFT SIGHTED — watch for its attack approach", 3);
}
function updatePlane(dt) {
  const p = game.plane,
    s = game.sub;
  if (!p) return;
  p.life -= dt;
  if (p.state === "patrol") {
    const visible =
      (s.depth < 3 ? 480 : s.depth < 18 ? 230 : 0) *
      game.weather.visual *
      game.weather.airFactor;
    if (dist(p, s) < visible) {
      p.acquire += dt;
      if (p.acquire >= 0.9) {
        p.state = "approach";
        p.target = {
          x: clamp(s.x + Math.cos(s.a) * s.speed * 1.2, 20, WORLD.w - 20),
          y: clamp(s.y + Math.sin(s.a) * s.speed * 1.2, 20, WORLD.h - 20),
        };
        p.runT = 0;
        announce("AIRCRAFT ATTACKING — crash dive or maneuver", 3);
        tone(520, 0.4, "triangle", 0.03, 230);
      }
    } else p.acquire = Math.max(0, p.acquire - dt);
  }
  if (p.state === "approach") {
    p.runT += dt;
    turnToward(p, p.target.x, p.target.y, 1.3, dt);
    if (dist(p, p.target) < 62 && p.runT > 2) {
      for (let i = 0; i < 3; i++)
        game.charges.push({
          x: p.x - Math.cos(p.a) * i * 26,
          y: p.y - Math.sin(p.a) * i * 26,
          t: 1.4 + i * 0.16,
          total: 1.4 + i * 0.16,
          depth: 0,
          kind: "bomb",
          power: 24 * game.weather.airFactor,
          radius: 85,
        });
      p.state = "depart";
      p.attacks++;
      announce("BOMBS RELEASED", 2);
    }
  }
  p.x += Math.cos(p.a) * p.speed * dt;
  p.y += Math.sin(p.a) * p.speed * dt;
  if (
    p.life <= 0 ||
    (p.state === "depart" &&
      (p.x < -100 || p.x > WORLD.w + 100 || p.y < -100 || p.y > WORLD.h + 100))
  )
    game.plane = null;
}
function effect(x, y, type, life = 1) {
  game.splashes.push({ x, y, type, life, max: life, seed: rnd(0, 6.28) });
}
function hitShip(sh, damage, kind, source) {
  if (game.harbor) raiseHarborAlarm(source);
  alertConvoy(sh, source);
  sh.hp -= damage;
  effect(
    sh.x,
    sh.y,
    kind === "torpedo" ? "torpedo" : "hit",
    kind === "torpedo" ? 1.1 : 0.35,
  );
  if (kind === "torpedo") tone(70, 0.6, "sawtooth", 0.05, 25);
  if (!sh.escort && sh.hp > 0 && sh.hp < sh.maxhp * 0.38 && kind !== "aa")
    sh.burn = Math.max(sh.burn, 14);
  if (sh.hp <= 0) sink(sh);
}
function sink(sh) {
  if (!sh.alive) return;
  if (sh.id === game.mission.targetId) {
    game.mission.targetSunk = true;
    game.mission.targetKillTime = game.time;
  }
  sh.alive = false;
  if (game.harbor && sh.moored && !game.harbor.sunk.includes(sh.id))
    game.harbor.sunk.push(sh.id);
  game.score += Math.round(
    (sh.heavy ? 650 : sh.escort ? 250 : sh.tonnage / 10) *
      approachDef(game.approach).reward,
  );
  if (sh.escort) game.stats.escorts++;
  else {
    game.stats.merchants++;
    game.stats.tonnage += sh.tonnage;
  }
  game.wrecks.push({
    x: sh.x,
    y: sh.y,
    a: sh.a,
    type: sh.type,
    heavy: sh.heavy,
    escort: sh.escort,
    small: sh.small,
    life: 5,
    max: 5,
  });
  effect(sh.x, sh.y, "sink", 3);
  tone(95, 1, "triangle", 0.06, 22);
  announce(
    sh.escort
      ? "ESCORT SUNK"
      : `${sh.type.toUpperCase()} SUNK — ${sh.tonnage.toLocaleString()} tons`,
    2.5,
  );
  if (objectiveComplete() && !game.objectiveAnnounced) {
    game.objectiveAnnounced = true;
    announce("OBJECTIVE COMPLETE — return south or hunt bonus targets", 6);
  }
}
function segmentDistance(x1, y1, x2, y2, x, y) {
  const dx = x2 - x1,
    dy = y2 - y1,
    t = clamp(((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(x - (x1 + dx * t), y - (y1 + dy * t));
}
function shipHit(b, x0, y0, sh) {
  const ca = Math.cos(sh.a),
    sa = Math.sin(sh.a);
  const x1 = (x0 - sh.x) * ca + (y0 - sh.y) * sa,
    y1 = -(x0 - sh.x) * sa + (y0 - sh.y) * ca;
  const x2 = (b.x - sh.x) * ca + (b.y - sh.y) * sa,
    y2 = -(b.x - sh.x) * sa + (b.y - sh.y) * ca;
  const L = sh.heavy ? 39 : sh.small ? 23 : 30,
    W = sh.heavy ? 12 : 10; // Swept line against the hull rectangle.
  let lo = 0,
    hi = 1;
  for (const [v, d, extent] of [
    [x1, x2 - x1, L],
    [y1, y2 - y1, W],
  ]) {
    if (Math.abs(d) < 1e-9) {
      if (Math.abs(v) > extent) return false;
    } else {
      let a = (-extent - v) / d,
        z = (extent - v) / d;
      if (a > z) [a, z] = [z, a];
      lo = Math.max(lo, a);
      hi = Math.min(hi, z);
      if (lo > hi) return false;
    }
  }
  return true;
}
function updateProjectiles(dt) {
  const s = game.sub;
  for (const [list, torpedo] of [
    [game.shots, true],
    [game.shells, false],
  ])
    for (const b of list) {
      if (b.life <= 0) continue;
      const x0 = b.x,
        y0 = b.y;
      b.x += Math.cos(b.a) * b.speed * dt;
      b.y += Math.sin(b.a) * b.speed * dt;
      b.life -= dt;
      if (harborProjectile(b, x0, y0, torpedo)) continue;
      for (const sh of game.ships) {
        if (sh.alive && shipHit(b, x0, y0, sh)) {
          let damage = b.damage;
          if (!torpedo) {
            const g = GUNS[b.weapon];
            damage *= g.hull;
            if (sh.small && b.weapon > 0) damage *= 1.8;
            if (sh.heavy && b.weapon > 0) damage *= 0.55;
          }
          hitShip(
            sh,
            damage,
            torpedo ? "torpedo" : b.weapon === 0 ? "shell" : "aa",
            Number.isFinite(b.ox) ? { x: b.ox, y: b.oy } : null,
          );
          b.life = 0;
          game.stats.hits++;
          if (torpedo) game.stats.torpedoHits++;
          break;
        }
      }
      if (
        !torpedo &&
        b.life > 0 &&
        game.plane &&
        segmentDistance(x0, y0, b.x, b.y, game.plane.x, game.plane.y) < 21
      ) {
        const p = game.plane;
        p.hp -= b.damage;
        b.life = 0;
        game.stats.hits++;
        effect(p.x, p.y, "hit", 0.4);
        if (p.hp <= 0) {
          game.score += 180;
          game.stats.aircraft++;
          effect(p.x, p.y, "torpedo", 1.2);
          announce("AIRCRAFT DOWN", 2);
          game.plane = null;
        }
      }
    }
  for (const b of game.enemyShells) {
    const x0 = b.x,
      y0 = b.y;
    b.x += Math.cos(b.a) * b.speed * dt;
    b.y += Math.sin(b.a) * b.speed * dt;
    b.life -= dt;
    if (
      b.life > 0 &&
      s.depth < 3 &&
      segmentDistance(x0, y0, b.x, b.y, s.x, s.y) < 14
    ) {
      s.hull -= b.damage;
      b.life = 0;
      effect(s.x, s.y, "hit", 0.5);
      tone(90, 0.1, "sawtooth", 0.04, 35);
    }
  }
  for (const c of game.charges) {
    c.t -= dt;
    if (c.t <= 0 && !c.exploded) {
      c.exploded = true;
      effect(c.x, c.y, c.kind === "bomb" ? "bomb" : "charge", 1.2);
      const d = dist(c, s);
      let depthFactor =
        c.kind === "bomb"
          ? clamp(1 - s.depth / 32, 0, 1)
          : clamp(1 - Math.abs(s.depth - c.depth) / 32, 0, 1);
      if (d < c.radius && depthFactor > 0) {
        const damage =
          c.power *
          Math.pow(1 - d / c.radius, 1.7) *
          depthFactor *
          (config.difficulty === "easy" ? 0.8 : 1);
        s.hull -= damage;
        if (damage > 2) tone(70, 0.2, "sawtooth", 0.04, 25);
      }
    }
  }
  game.shots = game.shots.filter((b) => b.life > 0);
  game.shells = game.shells.filter((b) => b.life > 0);
  game.enemyShells = game.enemyShells.filter((b) => b.life > 0);
  game.charges = game.charges.filter((c) => !c.exploded);
}
function finishPatrol(outcome) {
  if (game.over) return;
  game.over = true;
  game.phase = "result";
  game.outcome = outcome;
  game.sub.hull = Math.max(0, game.sub.hull);
  if (outcome !== "lost") {
    game.score +=
      Math.round(game.sub.hull * 4) + (outcome === "success" ? 1000 : 0);
    // Only successful patrols add to the campaign total, so an early return
    // cannot farm campaign score by repeating the same assignment.
    if (outcome === "success") {
      game.campaign.totalScore += game.score;
      game.campaign.totalTonnage += game.stats.tonnage;
    }
  }
  awardMission();
  showResults();
  checkpoint();
}
function showResults() {
  document.getElementById("port").style.display = "none";
  splash.style.display = "none";
  death.style.display = "flex";
  const won = game.outcome === "success",
    returned = game.outcome === "partial",
    ended = game.campaign.ended;
  document.getElementById("resultTitle").textContent = ended
    ? "CAMPAIGN COMPLETE"
    : won
      ? "PATROL COMPLETE"
      : returned
        ? "EARLY RETURN"
        : "SUBMARINE LOST";
  document.getElementById("resultSubtitle").textContent = ended
    ? `All five assignments complete. ${game.mission.bonusEarned ? "Heavy Opposition commendation earned. " : ""}Your crew is home. Start a new campaign to try another upgrade path.`
    : won
      ? `${missionDef().name} complete. Earned ${game.mission.pointsEarned} upgrade point${game.mission.pointsEarned === 1 ? "" : "s"}. Return to port to prepare your next patrol.`
      : returned
        ? "Primary objective incomplete. Return to port, refit, and retry this assignment. No upgrade points awarded."
        : "Your campaign has ended. Start a new campaign or load an earlier manual save.";
  const st = game.stats;
  document.getElementById("deathScore").innerHTML = [
    ["Patrol score", game.score.toLocaleString()],
    ["Primary objective", won ? "COMPLETE" : "INCOMPLETE"],
    ["Tonnage", st.tonnage.toLocaleString()],
    ["Hull remaining", `${Math.round(game.sub.hull)}%`],
    ["Upgrade points earned", String(game.mission.pointsEarned)],
    [
      "Secondary objective",
      missionDef().bonusLabel
        ? game.mission.bonusEarned
          ? "ACHIEVED"
          : "NOT ACHIEVED"
        : "—",
    ],
    [
      "All-weapon accuracy",
      `${st.shots ? Math.round((st.hits / st.shots) * 100) : 0}%`,
    ],
    ["Campaign score", game.campaign.totalScore.toLocaleString()],
  ]
    .map(
      ([k, v]) =>
        `<div><span class="label">${k}</span><strong>${v}</strong></div>`,
    )
    .join("");
  const b = document.getElementById("nextPatrolBtn");
  b.style.display = game.outcome === "lost" || ended ? "none" : "";
  b.textContent = won ? "Return to Port" : "Refit & Retry";
  clearInput();
}
function pressedPad(i) {
  return !!pad?.buttons[i]?.pressed;
}
function edgePad(i) {
  return pressedPad(i) && !padPrevious[i];
}
function pollPad() {
  try {
    pad =
      [...(navigator.getGamepads?.() || [])].find((p) => p && p.connected) ||
      null;
  } catch {
    pad = null;
  }
}
function rememberInput() {
  for (let i = 0; i < 18; i++) padPrevious[i] = pressedPad(i);
  for (const k of Object.keys(pressed)) delete pressed[k];
}
function axis(i) {
  const n = pad?.axes[i] || 0;
  return Math.abs(n) > 0.16 ? n : 0;
}
function handleControls() {
  const s = game.sub;
  if (pressed.KeyG || edgePad(11)) selectTarget();
  if (pressed.KeyV || edgePad(15)) cycleSpread();
  if (pressed.KeyN || edgePad(14)) toggleSilent();
  if (pressed.KeyB || edgePad(10)) deployDecoy();
  if (pressed.KeyJ || edgePad(8)) cycleTime();
  if (pressed.KeyH || edgePad(12)) emergencyRepair();
  if (pressed.KeyQ || edgePad(1)) cycleDepth();
  if (pressed.KeyZ) setDepth(0);
  if (pressed.KeyX) setDepth(12);
  if (pressed.KeyC) setDepth(60);
  if (pressed.KeyE || edgePad(0)) activeSonar();
  if (pressed.KeyR || edgePad(2)) beginReload();
  if (pressed.KeyT || edgePad(13)) reloadTorpedoes();
  if (pressed.Tab || edgePad(5)) selectGun(s.selectedGun + 1);
  if (edgePad(4)) selectGun(s.selectedGun - 1);
  for (let i = 0; i < 3; i++) if (pressed["Digit" + (i + 1)]) selectGun(i);
  if (pressed.Space || edgePad(6)) fireTorpedo();
  if (keys.KeyF || pressedPad(7)) fireGun();
  if (pressed.KeyK || edgePad(3)) saveGame(true);
}
function update(dt) {
  pollPad();
  if (updateControllerMenus(dt)) {
    rememberInput();
    return;
  }
  if (game && (pressed.KeyO || (game.logOpen && pressed.Escape))) {
    toggleLog();
    rememberInput();
    return;
  }
  const paused = splash.style.display !== "none";
  if (pressed.Escape || edgePad(9)) {
    if (game) {
      if (paused) closeSplash();
      else openSplash();
    }
    rememberInput();
    return;
  }
  if (paused || !game || game.over || game.phase === "port" || game.logOpen) {
    rememberInput();
    return;
  }
  if (pressed.KeyL) {
    loadGame(true);
    rememberInput();
    return;
  }
  const s = game.sub,
    hullBefore = s.hull;
  game.time += dt;
  game.encounterAge += dt;
  game.soundCD = Math.max(0, game.soundCD - dt);
  game.messageT = Math.max(0, game.messageT - dt);
  if (game.messageT === 0) game.message = "";
  for (const k of [
    "torpCD",
    "sonarCD",
    "sonarPulse",
    "pingAlert",
    "launchAlert",
    "gunAlert",
  ])
    s[k] = Math.max(0, s[k] - dt);
  for (let i = 0; i < 3; i++) {
    const m = s.mounts[i],
      g = GUNS[i];
    m.cd = Math.max(0, m.cd - dt);
    if (m.reload > 0 && !s.silent) {
      m.reload = Math.max(0, m.reload - dt);
      if (m.reload === 0) {
        const n = Math.min(g.cap - s[g.ammo], s[g.reserve]);
        s[g.ammo] += n;
        s[g.reserve] -= n;
        tone(500, 0.06, "sine", 0.012, 800);
      }
    }
  }
  if (s.torpReloading && !s.silent) {
    s.torpReloadT -= dt;
    if (s.torpReloadT <= 0) {
      let n = Math.min(6 - s.fwdTubes, s.torpReserve);
      s.fwdTubes += n;
      s.torpReserve -= n;
      n = Math.min(4 - s.aftTubes, s.torpReserve);
      s.aftTubes += n;
      s.torpReserve -= n;
      s.torpReloading = false;
      s.torpReloadT = 0;
      announce("TORPEDO TUBES READY", 2);
    }
  }
  handleControls();
  if (s.repairT > 0 && Math.abs(s.speed) <= 8) {
    s.repairT = Math.max(0, s.repairT - dt);
    if (s.repairT === 0) {
      s.repairCharges = Math.max(0, s.repairCharges - 1);
      s.hull = Math.min(
        100,
        s.hull +
          (upgradeLevel("repair") >= 2 ? 25 : 15) +
          (crewHas("chief") ? 5 : 0),
      );
      announce("EMERGENCY REPAIRS COMPLETE", 3);
    }
  }
  const accel = clamp(
      (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0) - axis(1),
      -1,
      1,
    ),
    turn = clamp((keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + axis(0), -1, 1),
    train = clamp(
      (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0) + axis(2),
      -1,
      1,
    );
  const maxSpeed = s.silent ? 12 : s.depth < 3 ? 68 : s.depth < 18 ? 36 : 29;
  s.speed = clamp(s.speed + accel * 25 * dt, -maxSpeed * 0.35, maxSpeed);
  if (!accel) s.speed *= Math.pow(0.992, dt * 60);
  s.a = norm(
    s.a +
      turn * (0.72 - Math.abs(s.speed) / 180) * dt * (s.speed >= 0 ? 1 : -1),
  );
  s.aimAngle = norm(s.aimAngle + train * 1.8 * dt);
  s.depth += clamp(s.targetDepth - s.depth, -8 * dt, 9 * dt);
  const previousSub = { x: s.x, y: s.y };
  s.x = clamp(s.x + Math.cos(s.a) * s.speed * dt, 30, WORLD.w - 30);
  s.y = clamp(s.y + Math.sin(s.a) * s.speed * dt, 30, WORLD.h - 30);
  harborCollision(s, previousSub, 22);
  if (s.depth >= 3) {
    s.battery = Math.max(
      0,
      s.battery -
        (dt * (0.28 + 0.2 * Math.pow(Math.abs(s.speed) / 36, 2))) /
          ((1 + 0.15 * upgradeLevel("battery")) *
            (crewHas("engineer") ? 1.1 : 1)),
    );
    if (s.battery < 20 && !s.lowBatteryWarned) {
      s.lowBatteryWarned = true;
      announce("BATTERY BELOW 20% — plan a surface recharge", 4);
    }
    if (s.battery === 0 && !s.exhausted) {
      s.exhausted = true;
      s.targetDepth = 0;
      announce("BATTERY DEPLETED — emergency surfacing", 5);
    }
  } else {
    s.battery = Math.min(100, s.battery + dt * 1.6);
    if (s.battery >= 15) s.exhausted = false;
    if (s.battery > 25) s.lowBatteryWarned = false;
  }
  for (const sh of game.ships) {
    if (!sh.alive) continue;
    const previousShip = { x: sh.x, y: sh.y };
    if (sh.escort) {
      harborPatrol(sh);
      updateEscort(sh, dt);
    } else {
      if (!sh.moored) merchantCourse(sh, dt);
      sh.speed =
        sh.convoySpeed *
        (sh.hp < sh.maxhp * 0.4 ? 0.48 : sh.hp < sh.maxhp * 0.7 ? 0.75 : 1);
      sh.x += Math.cos(sh.a) * sh.speed * dt;
      sh.y += Math.sin(sh.a) * sh.speed * dt;
    }
    harborCollision(sh, previousShip, 32);
    if (sh.burn > 0) {
      sh.burn -= dt;
      sh.hp -= dt * 0.9;
      if (sh.hp <= 0) {
        sink(sh);
        continue;
      }
    }
    if (sh.hp < sh.maxhp * 0.7) {
      sh.smokeT -= dt;
      if (sh.smokeT <= 0) {
        effect(sh.x, sh.y, "smoke", 1.8);
        sh.smokeT = 0.35;
      }
    }
    if (
      sh.x < -240 ||
      sh.x > WORLD.w + 240 ||
      sh.y < -240 ||
      sh.y > WORLD.h + 240
    ) {
      sh.alive = false;
      if (sh.id === game.mission.targetId) game.mission.targetEscaped = true;
    }
  }
  game.planeTimer -= dt;
  if (!game.harbor && config.aircraft && !game.plane && game.planeTimer <= 0)
    spawnPlane();
  updatePlane(dt);
  updateMission(dt);
  updateProjectiles(dt);
  updateMission(0);
  updateTactics(dt, hullBefore);
  updateHarbor(dt);
  s.detected = game.ships.reduce(
    (v, sh) => Math.max(v, sh.alive && sh.escort ? sh.contact : 0),
    0,
  );
  const airContact =
    game.plane && ["approach", "depart"].includes(game.plane.state);
  const hunted = game.ships.some(
    (sh) => sh.alive && sh.escort && sh.state !== "patrol",
  );
  const contact = hunted || airContact;
  game.clearContact = contact ? 0 : game.clearContact + dt;
  const inExit = dist(s, EXIT) < EXIT.r;
  game.extraction = inExit && !contact ? game.extraction + dt : 0;
  if (s.hull <= 0) {
    finishPatrol("lost");
    rememberInput();
    return;
  }
  if (game.extraction >= 15) {
    finishPatrol(objectiveComplete() ? "success" : "partial");
    rememberInput();
    return;
  }
  const merchants = game.ships.filter((sh) => sh.alive && !sh.escort).length;
  if (
    !game.harbor &&
    merchants === 0 &&
    game.nextEncounterIn === null &&
    missionDef().kind !== "rescue" &&
    !game.mission.failed
  )
    game.nextEncounterIn = objectiveComplete() ? 32 : 18;
  if (game.nextEncounterIn !== null) {
    game.nextEncounterIn -= dt;
    if (game.nextEncounterIn <= 0) spawnConvoy();
  }
  // Prune completed contacts and visuals; no invisible dead ships accumulate.
  game.ships = game.ships.filter((sh) => sh.alive);
  game.signals.forEach((x) => (x.ttl -= dt));
  game.signals = game.signals.filter((x) => x.ttl > 0);
  s.sonarMarks.forEach((x) => (x.ttl -= dt));
  s.sonarMarks = s.sonarMarks.filter((x) => x.ttl > 0);
  game.splashes.forEach((x) => (x.life -= dt));
  game.splashes = game.splashes.filter((x) => x.life > 0);
  game.wrecks.forEach((x) => (x.life -= dt));
  game.wrecks = game.wrecks.filter((x) => x.life > 0);
  if (config.autosave && game.time - lastAutoSave >= 10) checkpoint();
  saveFlash = Math.max(0, saveFlash - dt);
  if (saveFlash === 0)
    saveStatus.textContent = config.autosave
      ? "Autosave every 10 seconds"
      : "Autosave off";
  rememberInput();
}
function checkpoint() {
  if (config.autosave) return saveGame(false);
  return false;
}
function saveGame(manual = true) {
  if (!game?.active) return;
  try {
    const payload = JSON.stringify({ version: 14, nextShipId, config, game });
    if (manual) localStorage.setItem(SAVE_KEY + "_manual", payload);
    localStorage.setItem(SAVE_KEY, payload);
    lastAutoSave = game.time;
    if (manual) {
      saveStatus.textContent = "Manual save stored";
      saveFlash = 3;
    }
    return true;
  } catch {
    saveStatus.textContent = "Save unavailable — browser storage blocked";
    saveFlash = 5;
    return false;
  }
}
function migrateSave(data) {
  if (
    !data ||
    !data.game ||
    !data.game.sub ||
    !Array.isArray(data.game.ships) ||
    data.version > 14
  )
    throw Error("This save is not supported.");
  const g = data.game,
    old = g.sub;
  for (const key of ["x", "y", "a", "hull"])
    if (!Number.isFinite(old[key]))
      throw Error("Save contains invalid submarine data.");
  const legacy = (data.version || 0) < 11;
  const base = makeSub();
  g.sub = { ...base, ...old };
  const s = g.sub;
  s.hull = clamp(s.hull, 0, 100);
  s.x = clamp(s.x, 30, WORLD.w - 30);
  s.y = clamp(s.y, 30, WORLD.h - 30);
  s.aimAngle = old.aimAngle ?? old.aimAngles?.[old.selectedWeapon || 0] ?? 0;
  s.selectedGun = clamp(
    old.selectedGun ?? Math.max(0, (old.selectedWeapon || 0) - 1),
    0,
    2,
  );
  s.mounts =
    Array.isArray(old.mounts) && old.mounts.length === 3
      ? old.mounts
      : GUNS.map(() => ({ cd: 0, reload: 0 }));
  if (legacy && old.reloading && old.reloadWeapon >= 0 && old.reloadWeapon < 3)
    s.mounts[old.reloadWeapon].reload = Math.max(0, old.reloadT || 0);
  s.targetDepth = DEPTHS.includes(s.targetDepth)
    ? s.targetDepth
    : s.targetDepth > 18
      ? 60
      : s.targetDepth > 0
        ? 12
        : 0;
  for (const key of [
    "speed",
    "depth",
    "battery",
    "torpCD",
    "torpReloadT",
    "sonarCD",
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
  ])
    if (!Number.isFinite(s[key]))
      throw Error("Save contains invalid resource data.");
  const defaults = {
    version: 14,
    active: true,
    over: false,
    outcome: null,
    time: 0,
    score: 0,
    campaign: { patrol: 1, totalScore: 0, totalTonnage: 0 },
    shots: [],
    shells: [],
    enemyShells: [],
    charges: [],
    splashes: [],
    wrecks: [],
    signals: [],
    plane: null,
    planeTimer: 30,
    encounter: 1,
    encounterName: "Resumed convoy",
    encounterAge: 0,
    nextEncounterIn: null,
    extraction: 0,
    clearContact: 0,
    objectiveAnnounced: false,
    stats: {
      merchants: 0,
      escorts: 0,
      aircraft: 0,
      tonnage: 0,
      shots: 0,
      hits: 0,
      torpedoesFired: 0,
      torpedoHits: 0,
    },
    message: "",
    messageT: 0,
    soundCD: 0,
  };
  const result = { ...defaults, ...g, version: 14, active: true };
  result.stats = { ...defaults.stats, ...g.stats };
  result.campaign = { ...defaults.campaign, ...g.campaign };
  for (const key of Object.keys(defaults.stats))
    if (!Number.isFinite(result.stats[key]))
      throw Error("Invalid patrol statistics.");
  for (const key of Object.keys(defaults.campaign))
    if (!Number.isFinite(result.campaign[key]))
      throw Error("Invalid campaign data.");
  for (const key of [
    "time",
    "score",
    "planeTimer",
    "encounter",
    "encounterAge",
    "extraction",
  ])
    if (!Number.isFinite(result[key])) throw Error("Invalid patrol state.");
  for (const k of [
    "shots",
    "shells",
    "enemyShells",
    "charges",
    "splashes",
    "wrecks",
    "signals",
  ])
    if (!Array.isArray(result[k])) throw Error("Invalid saved objects.");
  result.ships = result.ships
    .filter((sh) => sh.alive)
    .map((sh) => {
      if (
        !Number.isFinite(sh.x) ||
        !Number.isFinite(sh.y) ||
        !Number.isFinite(sh.hp)
      )
        throw Error("Invalid ship data.");
      const type =
        sh.type || (sh.heavy ? "heavy" : sh.escort ? "escort" : "merchant");
      return {
        ...makeShip(sh.x, sh.y, sh.a, type, sh.convoySpeed || 20),
        ...sh,
        type,
        routeA: sh.routeA ?? sh.a,
      };
    });
  if (legacy) {
    result.plane = null;
    result.charges = result.charges.map((c) => ({
      ...c,
      kind: c.kind || "depth",
      depth: c.depth ?? 45,
      power: c.power ?? 22,
      radius: c.radius ?? 82,
      total: c.total ?? c.t,
    }));
    result.enemyShells = result.enemyShells.map((b) => ({
      ...b,
      damage: b.damage ?? 10,
    }));
    result.splashes = [];
    result.wrecks = [];
    s.sonarMarks = [];
    result.message =
      "Older patrol restored — new objective starts at 0 / 3 merchants";
    result.messageT = 6;
  }
  result.campaign = normalizeCampaign(result.campaign);
  if ((data.version || 0) < 12) {
    result.campaign.patrol = 1;
    result.mission = freshMission(1);
    result.phase = result.over ? "result" : "patrol";
    result.message =
      "Older save restored as First Contact — sink two merchants and return";
    result.messageT = 7;
    if (result.over) {
      result.mission.awarded = true;
      if (result.outcome === "success") {
        result.campaign.completed = [1];
        result.campaign.points = 1;
        result.mission.pointsEarned = 1;
      }
    }
  } else {
    if (
      !result.mission ||
      !Number.isInteger(result.mission.id) ||
      result.mission.id < 1 ||
      result.mission.id > 6
    )
      throw Error("Invalid campaign mission.");
    result.mission = { ...freshMission(result.mission.id), ...result.mission };
    if (!["port", "patrol", "result"].includes(result.phase))
      throw Error("Invalid campaign phase.");
    if (
      result.phase === "port" &&
      (!Number.isInteger(result.portMission) ||
        result.portMission < 1 ||
        result.portMission > 5)
    )
      throw Error("Invalid port assignment.");
  }
  if (s.hull <= 0) {
    result.over = true;
    result.outcome = "lost";
    result.phase = "result";
  } else if (result.over && !result.outcome) result.outcome = "partial";
  normalizeTactics(result);
  normalizeHarbor(result);
  return result;
}
function loadGame(show = true, manual = false) {
  try {
    const raw =
      localStorage.getItem(manual ? SAVE_KEY + "_manual" : SAVE_KEY) ||
      localStorage.getItem(manual ? V13_KEY + "_manual" : V13_KEY) ||
      localStorage.getItem(manual ? V12_KEY + "_manual" : V12_KEY) ||
      localStorage.getItem(manual ? V11_KEY + "_manual" : V11_KEY) ||
      (!manual ? localStorage.getItem(LEGACY_KEY) : null);
    if (!raw)
      throw Error(manual ? "No manual save found." : "No saved patrol found.");
    const { data, restored: loaded } = parsePortableSave(raw);
    game = loaded;
    nextShipId =
      Math.max(data.nextShipId || 1, ...game.ships.map((s) => s.id || 0)) + 1;
    if (data.config) {
      config = { ...DEFAULT_CONFIG, ...data.config };
      if (!["easy", "normal", "hard"].includes(config.difficulty))
        config.difficulty = "normal";
      syncConfigUI();
    }
    lastAutoSave = game.time;
    document.getElementById("error").style.display = "none";
    if (game.phase === "port") openPort();
    else if (game.over) showResults();
    else closeSplash();
    if (show) {
      saveStatus.textContent = manual ? "Manual save loaded" : "Patrol loaded";
      saveFlash = 3;
    }
    renderHUD();
    return true;
  } catch (e) {
    const text = e.message || "Unable to load save.";
    saveStatus.textContent = text;
    saveFlash = 5;
    const el = document.getElementById("error");
    el.textContent = text;
    el.style.display = "block";
    return false;
  }
}
function drawShip(sh, alpha = 1, sinking = 0) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(sh.x, sh.y);
  ctx.rotate(sh.a + sinking * 0.25);
  ctx.scale(1, 1 - sinking * 0.55);
  const L = sh.heavy ? 40 : sh.small ? 24 : 32,
    W = sh.heavy ? 12 : 10;
  ctx.fillStyle = sh.heavy
    ? "#80949e"
    : sh.escort
      ? "#b9cbd1"
      : sh.type === "tanker"
        ? "#ab926d"
        : sh.type === "transport"
          ? "#95b7bd"
          : "#b2aa90";
  ctx.strokeStyle = "#041720";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(L, 0);
  ctx.lineTo(L * 0.65, -W);
  ctx.lineTo(-L * 0.85, -W);
  ctx.lineTo(-L - 3, 0);
  ctx.lineTo(-L * 0.85, W);
  ctx.lineTo(L * 0.65, W);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#4b5d63";
  ctx.fillRect(-5, -7, 14, 14);
  if (sh.escort) {
    ctx.fillRect(16, -3, 11, 6);
    ctx.fillRect(-24, -3, 9, 6);
  }
  if (sh.type === "tanker") {
    ctx.fillStyle = "#785e42";
    for (let i = -19; i <= 19; i += 12) {
      ctx.beginPath();
      ctx.arc(i, 0, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (sh.burn > 0) {
    ctx.fillStyle = "#ff994d";
    ctx.beginPath();
    ctx.arc(-12, -2, 4 + Math.sin(game.time * 19) * 2, 0, 7);
    ctx.fill();
  }
  ctx.restore();
  if (!sinking && alpha > 0.8 && sh.hp < sh.maxhp) {
    ctx.fillStyle = "#311d22";
    ctx.fillRect(sh.x - 23, sh.y - 24, 46, 4);
    ctx.fillStyle = "#d3ae68";
    ctx.fillRect(sh.x - 23, sh.y - 24, 46 * Math.max(0, sh.hp / sh.maxhp), 4);
  }
}
function circle(x, y, r, color, width = 1) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}
function label(text, x, y, color = "#bad5d5", size = 13) {
  ctx.font = `${size}px system-ui,Arial`;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
}
function drawSonar() {
  const s = game.sub,
    rr = 160;
  ctx.save();
  circle(s.x, s.y, rr, "#81cdbc45");
  circle(s.x, s.y, rr * 0.65, "#81cdbc22");
  ctx.setLineDash([3, 7]);
  circle(s.x, s.y, rr * 0.3, "#81cdbc22");
  ctx.setLineDash([]);
  const range = Math.abs(s.speed) > 20 ? 430 : 690;
  for (const sh of game.ships) {
    if (!sh.alive || dist(s, sh) > range) continue;
    const angle = Math.atan2(sh.y - s.y, sh.x - s.x),
      x = s.x + Math.cos(angle) * rr,
      y = s.y + Math.sin(angle) * rr;
    ctx.strokeStyle = sh.escort ? "#ebc77a88" : "#a0e3cd80";
    ctx.beginPath();
    ctx.moveTo(
      s.x + Math.cos(angle) * rr * 0.7,
      s.y + Math.sin(angle) * rr * 0.7,
    );
    ctx.lineTo(x, y);
    ctx.stroke();
    label(sh.escort ? "▲" : "●", x, y, sh.escort ? "#ebc77a" : "#a0e3cd", 16);
  }
  label("N", s.x, s.y - rr - 15);
  label("S", s.x, s.y + rr + 15);
  label("W", s.x - rr - 15, s.y);
  label("E", s.x + rr + 15, s.y);
  if (s.sonarPulse > 0) {
    const radius = 760 * (1 - s.sonarPulse);
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.arc(s.x, s.y, radius, s.a - Math.PI / 4, s.a + Math.PI / 4);
    ctx.closePath();
    ctx.fillStyle = "#bcffe509";
    ctx.fill();
    ctx.strokeStyle = "#bdffe766";
    ctx.stroke();
  }
  for (const mark of s.sonarMarks) {
    ctx.globalAlpha = Math.min(1, mark.ttl / 2);
    circle(mark.x, mark.y, 22, "#dbfff0", 2);
    label(`${mark.range} u · sonar fix`, mark.x, mark.y - 33, "#dbfff0", 12);
  }
  ctx.restore();
}
function drawSub() {
  const s = game.sub;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(s.a);
  ctx.globalAlpha = s.depth > 18 ? 0.65 : 1;
  ctx.fillStyle = s.depth < 3 ? "#7d999a" : "#73959d";
  ctx.strokeStyle = "#071b22";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(36, 0);
  ctx.quadraticCurveTo(25, -9, -12, -8);
  ctx.lineTo(-36, -3);
  ctx.lineTo(-40, 0);
  ctx.lineTo(-36, 3);
  ctx.lineTo(-12, 8);
  ctx.quadraticCurveTo(25, 9, 36, 0);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#354e58";
  ctx.fillRect(-5, -6, 15, 12);
  if (s.depth < 3) {
    for (const [x, len] of [
      [12, 22],
      [-10, 15],
      [-24, 12],
    ]) {
      ctx.save();
      ctx.translate(x, 0);
      ctx.rotate(s.aimAngle);
      ctx.fillStyle = "#d2dfd5";
      ctx.fillRect(-3, -3, 6, 6);
      ctx.fillRect(0, -1, len, 2);
      ctx.restore();
    }
  }
  ctx.restore();
  const a = currentAim(),
    g = GUNS[s.selectedGun],
    range = s.depth < 3 ? g.speed * g.life : 220 * 7;
  ctx.save();
  ctx.strokeStyle = s.depth > 15 ? "#aacfc36b" : "#e9dba5c0";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([7, 7]);
  ctx.beginPath();
  ctx.moveTo(s.x + Math.cos(a) * 40, s.y + Math.sin(a) * 40);
  ctx.lineTo(
    s.x + Math.cos(a) * Math.min(range, 260),
    s.y + Math.sin(a) * Math.min(range, 260),
  );
  ctx.stroke();
  ctx.setLineDash([]);
  const x = s.x + Math.cos(a) * 150,
    y = s.y + Math.sin(a) * 150;
  circle(x, y, 6, "#ffedb9", 1.5);
  ctx.restore();
}
function renderHUD() {
  if (!game) {
    hud.innerHTML = '<p class="muted">Awaiting patrol orders.</p>';
    return;
  }
  const s = game.sub,
    g = GUNS[s.selectedGun],
    m = s.mounts[s.selectedGun],
    state = s.depth < 3 ? "SURFACED" : s.depth < 18 ? "PERISCOPE" : "DEEP",
    ordered =
      s.targetDepth === 0
        ? "Surface"
        : s.targetDepth === 12
          ? "Periscope"
          : "Deep";
  const contact =
    s.detected > 0.52
      ? "TRACKED"
      : game.ships.some((sh) => sh.escort && sh.state !== "patrol")
        ? "SEARCHING"
        : "NO CONTACT";
  const bearing =
    (((((currentAim() + Math.PI / 2) * 180) / Math.PI) % 360) + 360) % 360;
  const inExit = dist(s, EXIT) < EXIT.r;
  const row = (k, v) =>
    `<div class="row"><span class="muted">${k}</span><b>${v}</b></div>`;
  const bar = (val, col) =>
    `<div class="bar"><i style="width:${clamp(val, 0, 100)}%;background:${col}"></i></div>`;
  hud.innerHTML = `<span class="label">Patrol ${game.campaign.patrol} · ${Math.floor(game.time / 60)}:${Math.floor(
    game.time % 60,
  )
    .toString()
    .padStart(
      2,
      "0",
    )}</span>${row("Hull", Math.ceil(s.hull) + "%")}${bar(s.hull, s.hull < 35 ? "#ea8b75" : "#8dd8ad")}${row("Battery", Math.floor(s.battery) + "%")}${bar(s.battery, s.battery < 20 ? "#ea8b75" : "#87c8d9")}${row("Depth", s.depth.toFixed(0) + " m · " + state)}${row("Ordered", ordered)}${row("Speed", Math.abs(s.speed).toFixed(0) + " u/s" + (s.speed < 0 ? " REV" : ""))}<section><span class="label">${missionDef().name} · ${game.harbor ? "SPECIAL" : game.mission.id + "/5"}</span>${row("Objective", objectiveProgress())}${row("Tonnage", game.stats.tonnage.toLocaleString())}<div class="small ${objectiveComplete() ? "green" : game.mission.failed ? "red" : "muted"}">${game.mission.failed ? "Target escaped. Return south to retry." : objectiveComplete() ? "Orders fulfilled. Return south." : missionDef().kind === "rescue" ? "Recover survivors at the marked liferaft." : missionDef().kind === "target" ? "Find and sink the gold-marked target." : "Meet your objective, then return south."}</div>${inExit ? `<div class="yellow small">${game.extraction > 0 ? "Extracting: " + game.extraction.toFixed(1) + " / 15 s" : "Break enemy contact to extract"}</div>` : '<div class="small muted">Southern circle: extraction / early return</div>'}</section><section>${row("Selected gun", g.short)}${row("Loaded / reserve", s[g.ammo] + " / " + s[g.reserve])}<div class="small ${s.depth >= 3 ? "muted" : "yellow"}">${s.depth >= 3 ? "Surface to fire guns" : m.reload > 0 ? "Reload: " + m.reload.toFixed(1) + " s" : "Ready · F / RT"}</div>${GUNS.map((w, i) => (s.mounts[i].reload > 0 && i !== s.selectedGun ? `<div class="small muted">${w.short} reload: ${s.mounts[i].reload.toFixed(1)} s</div>` : "")).join("")}${row("Tubes FWD / AFT", s.fwdTubes + " / " + s.aftTubes)}${tubePanel()}${row("Torpedo reserve", s.torpReserve)}<div class="small yellow">${s.torpReloading ? "Tube reload: " + s.torpReloadT.toFixed(1) + " s" : s.depth > 15 ? "Rise to ≤15 m for torpedoes" : selectedTubeBank() + " bank · Space / LT"}</div>${row("Shared bearing", bearing.toFixed(0).padStart(3, "0") + "°")}</section><section>${row("Enemy contact", contact)}${row("Active sonar", s.depth < 3 ? "Submerge" : s.sonarCD > 0 ? Math.ceil(s.sonarCD) + " s" : "READY · E / A")}${row("Score", game.score.toLocaleString())}${upgradeLevel("repair") || crewHas("chief") ? row("Damage control", s.repairT > 0 ? s.repairT.toFixed(1) + "s" + (Math.abs(s.speed) > 8 ? " · PAUSED" : "") : s.repairCharges ? "READY · H / ↑" : "USED") : ""}<div class="small muted">Encounter ${game.encounter} · ${escapeHTML(game.encounterName)}</div>${game.nextEncounterIn !== null ? '<div class="small muted">New contact in ' + Math.ceil(game.nextEncounterIn) + " s</div>" : ""}</section>${tacticalHud()}${crewHud()}${harborHud()}`;
}
function render() {
  ctx.fillStyle = game?.weather?.night ? "#061e30" : "#092b3b";
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);
  ctx.strokeStyle = "#8bcccf0c";
  ctx.lineWidth = 1;
  for (let x = 0; x < WORLD.w; x += 100) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, WORLD.h);
    ctx.stroke();
  }
  for (let y = 0; y < WORLD.h; y += 100) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WORLD.w, y);
    ctx.stroke();
  }
  if (!game) return;
  const s = game.sub;
  ctx.strokeStyle = "#b5dedd10";
  for (let y = 30; y < WORLD.h; y += 65) {
    ctx.beginPath();
    for (let x = 0; x < WORLD.w; x += 25) {
      const yy =
        y +
        Math.sin(x * 0.018 + game.time * 0.5) * (game.weather.rough ? 9 : 4);
      x ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy);
    }
    ctx.stroke();
  }
  drawHarbor();
  ctx.fillStyle = objectiveComplete() ? "#8bdbab13" : "#ebd38d08";
  ctx.beginPath();
  ctx.arc(EXIT.x, EXIT.y, EXIT.r, 0, 7);
  ctx.fill();
  circle(
    EXIT.x,
    EXIT.y,
    EXIT.r,
    objectiveComplete() ? "#a2e8ba" : "#c9b581",
    2,
  );
  label(
    objectiveComplete() ? "EXTRACTION" : "RETURN / EARLY EXIT",
    EXIT.x,
    EXIT.y - 15,
    "#d6ddac",
    14,
  );
  label(
    game.extraction > 0
      ? `${game.extraction.toFixed(1)} / 15 s`
      : "15 seconds · no contact",
    EXIT.x,
    EXIT.y + 12,
    "#aabfae",
    12,
  );
  ctx.strokeStyle = "#42616c";
  ctx.lineWidth = 2;
  ctx.strokeRect(18, 18, WORLD.w - 36, WORLD.h - 36);
  if (!game.harbor)
    label("NORTH PACIFIC · PATROL SECTOR", WORLD.w / 2, 34, "#6e98a6", 12);
  for (const w of game.wrecks)
    if (s.depth < 18) drawShip(w, w.life / w.max, 1 - w.life / w.max);
  if (s.depth < 3) {
    for (const sh of game.ships)
      if (sh.alive && dist(s, sh) < visualRange()) drawShip(sh);
  } else {
    drawSonar();
    if (s.depth < 18)
      for (const sh of game.ships)
        if (sh.alive && dist(s, sh) < visualRange())
          drawShip(sh, clamp(1 - dist(s, sh) / 800, 0.35, 1));
  }
  // Search markers are deliberate arcade feedback, distinct from sonar returns.
  for (const sh of game.ships) {
    if (!sh.alive || !sh.escort) continue;
    if (sh.lastKnown && sh.state !== "patrol") {
      const p = sh.lastKnown;
      ctx.save();
      ctx.setLineDash([4, 6]);
      circle(p.x, p.y, 38, "#eab47b45");
      ctx.setLineDash([]);
      ctx.strokeStyle = "#eab47b90";
      ctx.beginPath();
      ctx.moveTo(p.x - 6, p.y - 6);
      ctx.lineTo(p.x + 6, p.y + 6);
      ctx.moveTo(p.x + 6, p.y - 6);
      ctx.lineTo(p.x - 6, p.y + 6);
      ctx.stroke();
      ctx.restore();
      if (sh.state === "search" || sh.state === "investigate")
        label("SEARCH AREA", p.x, p.y + 49, "#d1a675", 10);
    }
    if (sh.attack?.stage === "approach") {
      circle(sh.attack.x, sh.attack.y, 35, "#ecba7744");
    }
  }
  for (const t of game.shots) {
    ctx.strokeStyle = "#c5e6de88";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(t.x - Math.cos(t.a) * 24, t.y - Math.sin(t.a) * 24);
    ctx.lineTo(t.x, t.y);
    ctx.stroke();
    ctx.fillStyle = "#ecfff1";
    ctx.beginPath();
    ctx.arc(t.x, t.y, 3.5, 0, 7);
    ctx.fill();
  }
  for (const b of [...game.shells, ...game.enemyShells]) {
    ctx.fillStyle = b.color || "#ff9f7b";
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.size || 3, 0, 7);
    ctx.fill();
  }
  for (const c of game.charges) {
    const phase = 1 - c.t / c.total;
    ctx.save();
    ctx.setLineDash([5, 5]);
    circle(c.x, c.y, c.radius, "#edb26955");
    ctx.setLineDash([]);
    circle(c.x, c.y, 12 + phase * 18, "#f4ca87", 2);
    ctx.fillStyle = "#e8bc73";
    ctx.fillRect(c.x - 4, c.y - 4, 8, 8);
    label(
      `${c.kind === "bomb" ? "BOMB" : c.depth + " m"} · ${Math.max(0, c.t).toFixed(1)}s`,
      c.x,
      c.y - 24,
      "#ffe2ac",
      11,
    );
    ctx.restore();
  }
  if (game.plane) {
    const p = game.plane;
    if (p.state === "approach") {
      ctx.save();
      ctx.setLineDash([9, 8]);
      ctx.strokeStyle = "#edbf7288";
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.target.x, p.target.y);
      ctx.stroke();
      circle(p.target.x, p.target.y, 40, "#edbf7277");
      ctx.restore();
    }
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.a);
    ctx.fillStyle = "#d7e4df";
    ctx.strokeStyle = "#10252a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(23, 0);
    ctx.lineTo(4, -4);
    ctx.lineTo(-5, -24);
    ctx.lineTo(-10, -24);
    ctx.lineTo(-6, -4);
    ctx.lineTo(-23, -3);
    ctx.lineTo(-27, 0);
    ctx.lineTo(-23, 3);
    ctx.lineTo(-6, 4);
    ctx.lineTo(-10, 24);
    ctx.lineTo(-5, 24);
    ctx.lineTo(4, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  for (const e of game.splashes) {
    const p = 1 - e.life / e.max;
    ctx.save();
    ctx.globalAlpha = 1 - p;
    if (e.type === "smoke") {
      ctx.fillStyle = "#35464ccc";
      ctx.beginPath();
      ctx.arc(e.x + p * 14, e.y - p * 22, 5 + p * 10, 0, 7);
      ctx.fill();
    } else if (e.type === "ping") {
      circle(e.x, e.y, 25 + p * 220, "#f5c688", 1.5);
    } else if (e.type === "muzzle") {
      ctx.fillStyle = "#fff1b9";
      ctx.beginPath();
      ctx.arc(e.x, e.y, 7 * (1 - p) + 2, 0, 7);
      ctx.fill();
    } else {
      const big = ["torpedo", "sink", "bomb", "charge"].includes(e.type),
        r = big ? 10 + p * 65 : 3 + p * 15;
      circle(
        e.x,
        e.y,
        r,
        e.type === "hit" ? "#ffd087" : "#d7f5ee",
        big ? 3 : 2,
      );
      if (p < 0.35) {
        ctx.fillStyle = big ? "#ffc980" : "#fff1be";
        ctx.beginPath();
        ctx.arc(e.x, e.y, r * 0.6, 0, 7);
        ctx.fill();
      }
    }
    ctx.restore();
  }
  drawMission();
  drawTactics();
  drawSub();
  msg.textContent = game.messageT > 0 ? game.message : "";
}
addEventListener("keydown", (e) => {
  if (
    ["INPUT", "SELECT", "BUTTON"].includes(e.target?.tagName) &&
    splash.style.display !== "none" &&
    e.code !== "Escape"
  )
    return;
  if (!keys[e.code]) pressed[e.code] = true;
  keys[e.code] = true;
  if (
    [
      "Space",
      "Tab",
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
    ].includes(e.code)
  )
    e.preventDefault();
});
addEventListener("keyup", (e) => {
  delete keys[e.code];
});
addEventListener("blur", () => {
  clearInput();
  if (game && !game.over) openSplash();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && game && !game.over) openSplash();
});
document
  .getElementById("newPatrolBtn")
  .addEventListener("click", () => newCampaign());
document.getElementById("resumeBtn").addEventListener("click", closeSplash);
document
  .getElementById("loadPatrolBtn")
  .addEventListener("click", () => loadGame());
document.getElementById("saveBtn").addEventListener("click", () => saveGame());
document.getElementById("loadBtn").addEventListener("click", () => loadGame());
document.getElementById("menuBtn").addEventListener("click", openSplash);
document
  .getElementById("restartBtn")
  .addEventListener("click", () => newCampaign());
document.getElementById("nextPatrolBtn").addEventListener("click", nextPatrol);
document.getElementById("resultMenuBtn").addEventListener("click", openSplash);
const manualButton = document.createElement("button");
manualButton.id = "loadManualBtn";
manualButton.textContent = "Load Manual Save";
manualButton.addEventListener("click", () => loadGame(true, true));
document.querySelector("#splash .actions").appendChild(manualButton);
for (const id of [
  "difficulty",
  "cfgAircraft",
  "cfgHeavy",
  "cfgAutosave",
  "cfgSonarPenalty",
  "cfgSound",
])
  document.getElementById(id).addEventListener("change", readConfigFromUI);
document.getElementById("departBtn").addEventListener("click", departPort);
document.getElementById("portMenuBtn").addEventListener("click", openSplash);
document.getElementById("portSaveBtn").addEventListener("click", () => {
  const ok = saveGame(true);
  game.portNotice = ok
    ? "Campaign saved at port."
    : "Could not save — browser storage is unavailable.";
  renderPort();
});
initTacticalUI();
initCrewUI();
initInterface();
loadConfig();
updateMenu();
renderHUD();
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  let wall = dt;
  while (wall > 1e-6) {
    const scale = game?.timeScale || 1,
      step = Math.min(0.025, wall * scale);
    update(step);
    wall -= step / scale;
  }
  render();
  hudClock += dt;
  if (hudClock >= 0.1) {
    renderHUD();
    hudClock = 0;
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
