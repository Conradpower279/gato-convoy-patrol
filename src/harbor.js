"use strict";
// Static definitions are authoritative. Saves store crew IDs and mission state only.
const HOT_RUNNERS = [
  {
    id: "captain",
    name: "Jack “Shortcut” Harlow",
    role: "Captain",
    color: "#d8c69d",
    perk: "Enemy contact fades 10% faster.",
    drawback: "Deck gun reload takes 10% longer.",
    quote: "We’re going home. The scenic route is optional.",
  },
  {
    id: "engineer",
    name: "Eddie “Rattle” Briggs",
    role: "Engineer",
    color: "#b28a53",
    perk: "Battery endurance +10%.",
    drawback: "Movement noise +5%.",
    quote: "She’ll hold. Stop asking what that sound was.",
  },
  {
    id: "chief",
    name: "Frank “Pops” Malloy",
    role: "Chief of the Boat",
    color: "#718779",
    perk: "Emergency repair +5 hull. Provides one 20-hull repair if untrained.",
    drawback: "Repair takes 12 seconds instead of 10.",
    quote: "You run the boat, Captain. I’ll run the circus.",
  },
  {
    id: "torpedoman",
    name: "Lou “Spare Parts” Russo",
    role: "Torpedoman",
    color: "#9b7770",
    perk: "Torpedo reload time −10%.",
    drawback: "Two fewer reserve torpedoes.",
    quote: "I packed them carefully. You aim them carefully.",
  },
  {
    id: "sonarman",
    name: "Art “Whispers” Bell",
    role: "Sonarman",
    color: "#688c9b",
    perk: "Active sonar fixes last 15% longer.",
    drawback:
      "Active pings alert escorts from 10% farther away when sonar alerts are enabled.",
    quote: "Quiet down. The ocean’s talking.",
  },
];
const HARBOR_MISSION = {
  id: 6,
  name: "Blackwater Harbor",
  kind: "harbor",
  brief:
    "0230 hours. Approach at periscope depth. Sink BOTH moored cargo ships, surface and shell the shore fuel tank, then escape through the southern circle. Break pursuit and remain in the exit for 15 seconds.",
  bonus:
    "One upgrade point on your first successful raid. Repeat raids earn score only. No aircraft; one harbor patrol and at most two alarm reinforcements.",
  bonusLabel: null,
};
// Top-down chart geometry. The broad southern opening leaves room to evade.
const HARBOR_LAND = [
  { x: 0, y: 0, w: 1600, h: 170 },
  { x: 0, y: 170, w: 450, h: 480 },
  { x: 1150, y: 170, w: 450, h: 480 },
  { x: 550, y: 170, w: 28, h: 155 },
  { x: 800, y: 170, w: 28, h: 155 },
  { x: 1050, y: 170, w: 28, h: 155 },
];
const HARBOR_FUEL = { x: 940, y: 108, r: 39 };
let inspectedCrew = "captain";
function normalizeCrew(ids) {
  return Array.isArray(ids)
    ? [
        ...new Set(ids.filter((id) => HOT_RUNNERS.some((c) => c.id === id))),
      ].slice(0, 3)
    : [];
}
function crewHas(id, g = game) {
  return !!g?.campaign?.crew?.includes(id);
}
function toggleCrew(id) {
  if (game?.phase !== "port") return false;
  const c = HOT_RUNNERS.find((c) => c.id === id);
  if (!c) return false;
  const crew = game.campaign.crew;
  const assigned = crew.includes(id);
  if (!assigned && crew.length >= 3) {
    document.getElementById("crewQuote").textContent =
      "Three Hot Runners already assigned. Stand one down before adding another.";
    return false;
  }
  game.campaign.crew = assigned ? crew.filter((x) => x !== id) : [...crew, id];
  renderCrewPort();
  document.getElementById("crewQuote").textContent = assigned
    ? `${c.name} is back on the pier.`
    : `“${c.quote}” — ${c.name}`;
  recordEvent(
    `${c.role} ${assigned ? "stood down" : "assigned"}: ${c.name}`,
    "crew",
  );
  checkpoint();
  return true;
}
function sailorSVG(c) {
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="34" cy="40" rx="20" ry="15" fill="#0005"/><g class="sailorBody"><path d="M24 42v12h7V42m4 0v12h7V42" stroke="#14232a" stroke-width="5"/><ellipse cx="32" cy="34" rx="16" ry="13" fill="${c.color}" stroke="#253236" stroke-width="2"/><path d="M17 31l-4 12m34-12l4 12" stroke="${c.color}" stroke-width="7"/><circle cx="32" cy="25" r="10" fill="#c39c75"/><ellipse cx="32" cy="21" rx="12" ry="9" fill="${c.id === "captain" || c.id === "chief" ? "#e4ddc5" : "#d3c6a8"}" stroke="#454a45" stroke-width="2"/><path d="M23 27q9 6 18 0" stroke="#333e3d" stroke-width="4"/>${c.id === "engineer" ? '<path d="M48 35v18m-4-17l4 4 4-4" stroke="#afb9b7" stroke-width="3"/>' : c.id === "sonarman" ? '<path d="M20 24q12-19 24 0" fill="none" stroke="#1b2e35" stroke-width="4"/>' : ""}</g></svg>`;
}
function drawPierArt() {
  const svg = document.getElementById("pierArt");
  svg.innerHTML = `<defs><pattern id="planks" width="24" height="26" patternUnits="userSpaceOnUse"><rect width="24" height="26" fill="#645943"/><path d="M0 25h24M2 0v26" stroke="#352f28"/><path d="M5 7h14M9 18h10" stroke="#817158" stroke-opacity=".4"/></pattern><pattern id="waterLines" width="110" height="40" patternUnits="userSpaceOnUse"><path d="M10 20q20-5 42 0m25 10h15" fill="none" stroke="#73938f" stroke-opacity=".18"/></pattern></defs><rect width="1000" height="360" fill="#142d34"/><rect width="1000" height="360" fill="url(#waterLines)"/><rect x="0" y="0" width="1000" height="160" fill="url(#planks)"/><path d="M0 160h1000" stroke="#b4a482" stroke-width="7"/><path d="M0 167h1000" stroke="#060f14" stroke-width="8"/><text x="32" y="32" fill="#c9baa0" font-family="monospace" font-size="14">PIER 07 / NIGHT WATCH / 0230</text><g fill="#948060" stroke="#403b30" stroke-width="3"><rect x="22" y="56" width="48" height="38"/><path d="M22 56l48 38m0-38L22 94"/><rect x="914" y="87" width="54" height="51"/></g><g fill="#ccb079"><circle cx="90" cy="152" r="6"/><circle cx="880" cy="152" r="6"/></g><path d="M260 174L280 218m460-44l-35 43" stroke="#998e74" stroke-width="3"/><ellipse cx="507" cy="274" rx="342" ry="42" fill="#020e1480"/><path d="M170 245q26-35 120-36h393q93 1 148 37-43 37-148 37H290q-86-1-120-38Z" fill="#4c5c5b" stroke="#89938a" stroke-width="3"/><path d="M216 245h555" stroke="#a2a58e" stroke-width="2"/><path d="M280 218h402v54H280Z" fill="#5f6e67"/><g fill="#303f40" stroke="#8d988a" stroke-width="2"><ellipse cx="355" cy="245" rx="21" ry="14"/><ellipse cx="665" cy="245" rx="21" ry="14"/><rect x="458" y="226" width="93" height="37" rx="14"/></g><path d="M503 232v26m-12-15h24" stroke="#bec1a7" stroke-width="3"/><path d="M592 241h40m-31-8v17" stroke="#afb3a0" stroke-width="5"/><rect x="490" y="149" width="25" height="72" fill="#918468" stroke="#2f3937" stroke-width="3"/><path d="M493 155h19m-19 12h19m-19 12h19m-19 12h19m-19 12h19" stroke="#554c3d" stroke-width="2"/><text x="505" y="326" text-anchor="middle" fill="#b9c5b3" font-family="monospace" font-size="13">GATO CLASS · CREW MUSTER</text>`;
}
function renderCrewPort() {
  if (!game) return;
  const crew = game.campaign.crew;
  document.getElementById("crewCount").textContent =
    `${crew.length} / 3 assigned`;
  const container = document.getElementById("crewSailors");
  container.innerHTML = "";
  HOT_RUNNERS.forEach((c, i) => {
    const b = document.createElement("button");
    b.className = `pierSailor ${crew.includes(c.id) ? "aboard" : ""} ${inspectedCrew === c.id ? "inspected" : ""}`;
    b.id = `sailor-${c.id}`;
    b.style.left = `${crew.includes(c.id) ? 32 + crew.indexOf(c.id) * 17 : 17 + i * 16}%`;
    b.style.top = crew.includes(c.id) ? "57%" : "17%";
    b.setAttribute(
      "aria-label",
      `${c.role}: ${c.name}${crew.includes(c.id) ? ", assigned" : ", on pier"}`,
    );
    b.setAttribute("aria-pressed", String(inspectedCrew === c.id));
    b.innerHTML = `${sailorSVG(c)}<span>${c.role}${crew.includes(c.id) ? " ✓" : ""}</span>`;
    b.addEventListener("click", () => {
      inspectedCrew = c.id;
      renderCrewPort();
    });
    container.appendChild(b);
  });
  const c = HOT_RUNNERS.find((c) => c.id === inspectedCrew) || HOT_RUNNERS[0];
  const record = document.getElementById("crewRecord");
  record.innerHTML = `<div><span class="personnelStamp">PERSONNEL RECORD / ${c.role.toUpperCase()}</span><h3>${c.name}</h3><p class="crewPerk">+ ${c.perk}</p><p class="crewDrawback">− ${c.drawback}</p></div>`;
  const assign = document.createElement("button");
  assign.id = "assignCrewBtn";
  assign.textContent = crew.includes(c.id)
    ? "Stand down"
    : crew.length >= 3
      ? "Loadout full · stand someone down"
      : "Assign to boat";
  assign.disabled = !crew.includes(c.id) && crew.length >= 3;
  assign.addEventListener("click", () => {
    const joining = !crewHas(c.id);
    if (toggleCrew(c.id) && joining) {
      const b = document.getElementById(`sailor-${c.id}`);
      // Walk to the gangway and along the deck, rather than teleporting.
      b?.animate?.(
        [
          { left: `${17 + HOT_RUNNERS.indexOf(c) * 16}%`, top: "17%" },
          { left: "48%", top: "24%", offset: 0.35 },
          { left: "48%", top: "57%", offset: 0.7 },
          { left: b.style.left, top: "57%" },
        ],
        { duration: 1800, easing: "linear" },
      );
    }
  });
  record.appendChild(assign);
  document.getElementById("crewManifest").textContent = crew.length
    ? "Aboard: " +
      HOT_RUNNERS.filter((c) => crew.includes(c.id))
        .map((c) => c.role)
        .join(" · ") +
      ". Perks apply on departure."
    : "Standard crew aboard. No Hot Runner bonuses or drawbacks.";
  for (const mode of ["campaign", "harbor"]) {
    const b = document.getElementById(mode + "SortieBtn");
    b.setAttribute(
      "aria-pressed",
      String((game.plannedSortie || "campaign") === mode),
    );
    b.className = (game.plannedSortie || "campaign") === mode ? "primary" : "";
  }
}
function initCrewUI() {
  drawPierArt();
  for (const mode of ["campaign", "harbor"])
    document
      .getElementById(mode + "SortieBtn")
      .addEventListener("click", () => {
        if (game?.phase !== "port") return;
        game.plannedSortie = mode;
        renderPort();
        checkpoint();
      });
}
function crewHud() {
  const crew = HOT_RUNNERS.filter((c) => crewHas(c.id));
  return `<section><span class="label">Hot Runners · ${crew.length}/3</span>${crew.length ? crew.map((c) => `<div class="small" title="${c.perk} ${c.drawback}">${c.role} · ${c.name.split("“")[1].split("”")[0]}</div>`).join("") : '<div class="small muted">Standard crew</div>'}</section>`;
}
function initHarbor(g) {
  g.mission = freshMission(6);
  g.harbor = {
    fuelHP: 112,
    sunk: [],
    targets: [],
    alarmAt: null,
    reinforcements: 0,
    alarmSource: null,
  };
  g.weather = weatherFor(2);
  g.approach = "balanced";
  g.sub.x = 800;
  g.sub.y = 710;
  g.sub.depth = 12;
  g.sub.targetDepth = 12;
  g.encounter = 1;
  g.encounterName = "Blackwater Harbor · moored shipping";
  for (const [x, type] of [
    [670, "merchant"],
    [930, "transport"],
  ]) {
    const sh = makeShip(x, 355, 0, type, 0);
    sh.moored = true;
    g.ships.push(sh);
    g.harbor.targets.push(sh.id);
  }
  const patrol = makeShip(560, 500, 0, "escort", 17);
  patrol.patrolPoint = 0;
  g.ships.push(patrol);
  recordEvent(
    "0230: Blackwater Harbor. Periscope-depth approach; two moored ships and shore fuel tank designated.",
    "orders",
  );
}
function raiseHarborAlarm(source) {
  const h = game.harbor;
  if (!h || h.alarmAt !== null) return;
  h.alarmAt = game.time;
  h.alarmSource =
    source && Number.isFinite(source.x) && Number.isFinite(source.y)
      ? { x: source.x, y: source.y }
      : null;
  announce("HARBOR ALARM — reinforcements inbound in 18 seconds", 5);
  recordEvent(
    "Harbor alarm raised. Two reinforcement patrols dispatched.",
    "enemy",
  );
}
function updateHarbor() {
  const h = game.harbor;
  if (!h) return;
  const gun = game.signals.find((s) => s.type === "gun");
  const spotter = game.ships.find(
    (s) => s.alive && s.escort && s.contact > 0.6,
  );
  if (gun || spotter) raiseHarborAlarm(gun || spotter.lastKnown);
  if (
    h.alarmAt !== null &&
    h.reinforcements < 2 &&
    game.time - h.alarmAt >= 18 + h.reinforcements * 20
  ) {
    const sh = makeShip(
      800 + (h.reinforcements ? 220 : -220),
      780,
      -Math.PI / 2,
      "escort",
      22,
    );
    sh.patrolPoint = 0;
    if (h.alarmSource) {
      sh.lastKnown = { ...h.alarmSource };
      sh.state = "investigate";
      sh.searchT = 24;
    }
    game.ships.push(sh);
    h.reinforcements++;
    announce(
      `HARBOR REINFORCEMENT ${h.reinforcements}/2 — arriving from the south`,
      4,
    );
    recordEvent(`Harbor reinforcement ${h.reinforcements}/2 arrived.`, "enemy");
  }
}
function harborPatrol(sh) {
  if (!game.harbor || sh.state !== "patrol") return;
  const points = [
    { x: 1040, y: 490 },
    { x: 1040, y: 730 },
    { x: 550, y: 730 },
    { x: 550, y: 490 },
  ];
  sh.patrolPoint = Number.isInteger(sh.patrolPoint) ? sh.patrolPoint % 4 : 0;
  if (dist(sh, points[sh.patrolPoint]) < 60)
    sh.patrolPoint = (sh.patrolPoint + 1) % 4;
  const p = points[sh.patrolPoint];
  sh.routeA = Math.atan2(p.y - sh.y, p.x - sh.x);
}
function harborBlocked(x, y, r = 0) {
  return HARBOR_LAND.some(
    (b) => x > b.x - r && x < b.x + b.w + r && y > b.y - r && y < b.y + b.h + r,
  );
}
function harborCollision(entity, previous, radius) {
  if (!game.harbor || !harborBlocked(entity.x, entity.y, radius)) return;
  entity.x = previous.x;
  entity.y = previous.y;
  entity.speed = 0;
  if (entity === game.sub) {
    if (!game.harbor.bumpAt || game.time - game.harbor.bumpAt > 3) {
      announce("SHOAL / PIER — turn away from the charted shoreline", 2);
      game.harbor.bumpAt = game.time;
    }
  } else {
    entity.a = norm(entity.a + Math.PI / 2);
    entity.attack = null;
    entity.patrolPoint = ((entity.patrolPoint || 0) + 1) % 4;
  }
}
function harborProjectile(b, x0, y0, torpedo) {
  const h = game.harbor;
  if (!h) return false;
  // Substeps keep normal travel below 13 units. Sampling also protects restored fast projectiles.
  if (torpedo) {
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - x0, b.y - y0) / 8));
    for (let i = 0; i <= steps; i++)
      if (
        harborBlocked(
          x0 + ((b.x - x0) * i) / steps,
          y0 + ((b.y - y0) * i) / steps,
        )
      ) {
        b.life = 0;
        effect(b.x, b.y, "hit", 0.4);
        return true;
      }
  } else if (
    h.fuelHP > 0 &&
    segmentDistance(x0, y0, b.x, b.y, HARBOR_FUEL.x, HARBOR_FUEL.y) <
      HARBOR_FUEL.r
  ) {
    const damage = b.damage * GUNS[b.weapon].hull;
    h.fuelHP = Math.max(0, h.fuelHP - damage);
    b.life = 0;
    game.stats.hits++;
    raiseHarborAlarm(Number.isFinite(b.ox) ? { x: b.ox, y: b.oy } : null);
    effect(
      HARBOR_FUEL.x,
      HARBOR_FUEL.y,
      h.fuelHP === 0 ? "sink" : "hit",
      h.fuelHP === 0 ? 3 : 0.5,
    );
    if (h.fuelHP === 0) {
      game.score += 600;
      announce(
        "SHORE FUEL DESTROYED — check remaining ships, then withdraw",
        5,
      );
      recordEvent("Shore fuel tank destroyed.", "objective");
    }
    return true;
  }
  return false;
}
function normalizeHarbor(g) {
  g.plannedSortie = g.plannedSortie === "harbor" ? "harbor" : "campaign";
  if (g.mission.id !== 6) {
    g.harbor = null;
    return;
  }
  const h = g.harbor;
  if (
    !h ||
    !Number.isFinite(h.fuelHP) ||
    h.fuelHP < 0 ||
    h.fuelHP > 112 ||
    !Array.isArray(h.targets) ||
    h.targets.length !== 2 ||
    h.targets.some((id) => !Number.isInteger(id)) ||
    new Set(h.targets).size !== 2 ||
    !Array.isArray(h.sunk) ||
    new Set(h.sunk).size !== h.sunk.length ||
    h.sunk.some((id) => !h.targets.includes(id)) ||
    !Number.isInteger(h.reinforcements) ||
    h.reinforcements < 0 ||
    h.reinforcements > 2 ||
    (h.alarmAt !== null &&
      (!Number.isFinite(h.alarmAt) || h.alarmAt < 0 || h.alarmAt > g.time))
  )
    throw Error("Invalid harbor mission state.");
  if (
    h.alarmSource &&
    (!Number.isFinite(h.alarmSource.x) || !Number.isFinite(h.alarmSource.y))
  )
    throw Error("Invalid harbor alarm position.");
  for (const id of h.targets)
    if (
      !h.sunk.includes(id) &&
      !g.ships.some(
        (s) =>
          s.id === id &&
          s.alive &&
          s.moored &&
          !s.escort &&
          s.convoySpeed === 0,
      )
    )
      throw Error("Missing moored mission target.");
  g.weather = weatherFor(2);
  g.approach = "balanced";
}
function harborHud() {
  if (!game.harbor) return "";
  const h = game.harbor;
  return `<section><span class="label">Harbor watch</span><div class="small ${h.alarmAt === null ? "green" : "yellow"}">${h.alarmAt === null ? "QUIET · harbor asleep" : `ALARM · ${h.reinforcements}/2 reinforcements arrived`}</div><p class="small">Torpedo the two moored ships. Surface for the fuel tank: 4 deck-gun hits. Escape south.</p></section>`;
}
function drawHarbor() {
  if (!game.harbor) return;
  const h = game.harbor;
  ctx.save();
  for (const b of HARBOR_LAND) {
    ctx.fillStyle = "#3a443e";
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = "#b2a078";
    ctx.lineWidth = 4;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
  }
  // Warehouses, roof seams, crates and quay lamps, all viewed from directly above.
  for (const [x, y, w, ht] of [
    [95, 62, 200, 75],
    [65, 260, 170, 100],
    [240, 410, 120, 145],
    [1240, 255, 245, 110],
    [1260, 475, 160, 90],
    [1110, 55, 250, 70],
  ]) {
    ctx.fillStyle = "#202d2d";
    ctx.fillRect(x + 7, y + 9, w, ht);
    ctx.fillStyle = "#58615a";
    ctx.fillRect(x, y, w, ht);
    ctx.strokeStyle = "#859080";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, ht);
    ctx.beginPath();
    ctx.moveTo(x, y + ht / 2);
    ctx.lineTo(x + w, y + ht / 2);
    ctx.stroke();
  }
  for (const x of [500, 750, 1000, 1100]) {
    circle(x, 180, 13, "#eed19322", 8);
    circle(x, 180, 3, "#ffe4a6", 4);
  }
  ctx.fillStyle = h.fuelHP > 0 ? "#a4a493" : "#282c2a";
  ctx.beginPath();
  ctx.arc(HARBOR_FUEL.x, HARBOR_FUEL.y, 39, 0, Math.PI * 2);
  ctx.fill();
  circle(940, 108, 31, h.fuelHP > 0 ? "#d7ccb0" : "#805847", 3);
  circle(940, 108, 8, "#565c55", 4);
  label(
    h.fuelHP > 0 ? "FUEL TANK · DECK GUN" : "FUEL DESTROYED",
    940,
    48,
    h.fuelHP > 0 ? "#f2d08d" : "#d8a080",
    14,
  );
  if (h.fuelHP > 0) {
    ctx.fillStyle = "#282c2a";
    ctx.fillRect(898, 154, 84, 6);
    ctx.fillStyle = "#e0b977";
    ctx.fillRect(898, 154, (84 * h.fuelHP) / 112, 6);
  } else {
    for (let i = 0; i < 7; i++) {
      const x = 940 + Math.sin(game.time * 2 + i * 2) * 27,
        y = 110 - i * 7;
      circle(x, y, 10 + i, "#d37b3433", 7);
    }
  }
  for (const [i, x] of [670, 930].entries()) {
    const destroyed = h.sunk.includes(h.targets[i]);
    ctx.save();
    ctx.setLineDash([5, 6]);
    circle(x, 355, 48, destroyed ? "#8dad8877" : "#d2b36f66", 1);
    ctx.restore();
    label(
      destroyed ? "BERTH CLEARED" : `BERTH ${i + 1} · MOORED TARGET`,
      x,
      420,
      destroyed ? "#95b394" : "#ddc792",
      12,
    );
  }
  label("CHARTED HARBOR · 0230 HOURS", 650, 70, "#cbbf9c", 14);
  label("HARBOR ENTRANCE", 800, 661, "#a9bcb7", 13);
  label(
    h.alarmAt === null
      ? "DARKENED PORT"
      : `ALARM · REINFORCEMENTS ${h.reinforcements}/2`,
    245,
    215,
    h.alarmAt === null ? "#b6c0ac" : "#edb584",
    15,
  );
  ctx.restore();
}
