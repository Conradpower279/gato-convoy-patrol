"use strict";
// Presentation/input adapter only. No gameplay state is serialized here.
const menuPad = {
  screen: null,
  token: null,
  index: 0,
  direction: null,
  repeatAt: 0,
  engaged: false,
  releaseGate: false,
  previousPad: null,
  crewReturn: null,
};
function interfaceScreen() {
  if (document.getElementById("helpOverlay")?.style.display === "flex")
    return document.getElementById("helpOverlay");
  if (game?.logOpen) return document.getElementById("logOverlay");
  if (document.getElementById("port").style.display === "flex")
    return document.getElementById("port");
  if (splash.style.display !== "none") return splash;
  if (game?.over) return death;
  return null;
}
function menuItems(root) {
  return [
    ...root.querySelectorAll('button, select, input[type="checkbox"], summary'),
  ].filter(
    (e) =>
      !e.disabled &&
      e.getClientRects().length &&
      getComputedStyle(e).visibility !== "hidden",
  );
}
function menuToken(e) {
  return (
    e?.id ||
    e?.dataset?.upgrade ||
    e?.querySelector("b")?.textContent ||
    e?.textContent?.trim()
  );
}
function focusMenuItem(items, index, scroll = true) {
  if (!items.length) return;
  index = (index + items.length) % items.length;
  const target = items[index];
  menuPad.index = index;
  menuPad.token = menuToken(target);
  document
    .querySelectorAll(".padFocus")
    .forEach((e) => e.classList.remove("padFocus"));
  target.classList.add("padFocus");
  target.focus({ preventScroll: true });
  if (scroll)
    target.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "instant",
    });
}
function showFieldGuide() {
  document.getElementById("fieldGuideText").innerHTML =
    document.querySelector("#help .helpbody").innerHTML;
  document.getElementById("helpOverlay").style.display = "flex";
  clearInput();
}
function closeFieldGuide() {
  document.getElementById("helpOverlay").style.display = "none";
  clearInput();
}
function controllerBack(root) {
  if (root.id === "helpOverlay") closeFieldGuide();
  else if (root.id === "logOverlay") toggleLog();
  else if (
    root.id === "port" &&
    menuPad.crewReturn &&
    menuPad.token === "assignCrewBtn"
  ) {
    const items = menuItems(root),
      index = items.findIndex((e) => e.id === menuPad.crewReturn);
    if (index >= 0) focusMenuItem(items, index);
    menuPad.crewReturn = null;
  } else if (root.id === "splash") {
    if (game) closeSplash();
  } else openSplash();
}
function menuDirection() {
  if (pressedPad(12) || axis(1) < -0.55) return "up";
  if (pressedPad(13) || axis(1) > 0.55) return "down";
  if (pressedPad(14) || axis(0) < -0.55) return "left";
  if (pressedPad(15) || axis(0) > 0.55) return "right";
  return null;
}
function changeMenuOption(el, direction) {
  const options = [...el.options].filter((o) => !o.disabled);
  const index = options.findIndex((o) => o.value === el.value);
  el.value =
    options[(index + direction + options.length) % options.length].value;
  el.dispatchEvent(new Event("change", { bubbles: true }));
}
function updateControllerMenus(dt) {
  // VM logic suites have no layout DOM. The browser suite exercises this adapter.
  if (typeof document.querySelectorAll !== "function") return false;
  const root = interfaceScreen(),
    now = performance.now();
  const padId = pad ? `${pad.index}:${pad.id}` : null;
  const hint = document.getElementById("controllerHint");
  if (
    menuPad.previousPad &&
    !padId &&
    game &&
    !game.over &&
    game.phase === "patrol" &&
    !root
  ) {
    openSplash();
    document.getElementById("controllerStatus").textContent =
      "Controller disconnected. Reconnect or use keyboard and mouse.";
  }
  menuPad.previousPad = padId;
  const buttonsDown = pad?.buttons.some((b) => b.pressed),
    axesDown = pad?.axes.some((a) => Math.abs(a) > 0.25);
  if (!root) {
    if (menuPad.screen) {
      menuPad.releaseGate = !!pad;
      menuPad.screen = null;
      menuPad.token = null;
      document
        .querySelectorAll(".padFocus")
        .forEach((e) => e.classList.remove("padFocus"));
    }
    hint.hidden = true;
    if (menuPad.releaseGate) {
      if (!pad || (!buttonsDown && !axesDown)) menuPad.releaseGate = false;
      else {
        hint.hidden = false;
        hint.textContent =
          "Release the sticks and buttons to take control of the boat.";
        return true;
      }
    }
    const instruments = document.querySelector("aside");
    if (instruments && Math.abs(axis(3)) > 0.25)
      instruments.scrollTop += axis(3) * 500 * dt;
    return false;
  }
  const items = menuItems(root);
  const active = buttonsDown || axesDown;
  if (active) menuPad.engaged = true;
  hint.hidden = !pad;
  hint.textContent =
    "D-pad / L stick: move · A: select · B: back · R stick: scroll · LB/RB: page · Menu: resume";
  document.getElementById("menuLogBtn").disabled = !game;
  document.getElementById("controllerStatus").textContent = pad
    ? "Controller connected. A selects; left/right changes resistance. X opens log; Y opens field guide."
    : "Xbox controller: press a button to connect. D-pad moves; A selects; B goes back.";
  if (!pad || !menuPad.engaged) return false;
  if (root.id !== menuPad.screen) {
    menuPad.screen = root.id;
    const sheet = root.querySelector(".card");
    if (sheet) sheet.scrollTop = 0;
    menuPad.token = null;
    menuPad.crewReturn = null;
    menuPad.direction = null;
    const preferred =
      root.id === "splash"
        ? game
          ? "resumeBtn"
          : "newPatrolBtn"
        : root.id === "death"
          ? "nextPatrolBtn"
          : null;
    const index = items.findIndex((e) => e.id === preferred);
    focusMenuItem(items, index >= 0 ? index : 0);
  } else {
    let index = items.findIndex((e) => menuToken(e) === menuPad.token);
    if (index < 0) index = Math.min(menuPad.index, items.length - 1);
    menuPad.index = index;
    if (items[index] && document.activeElement !== items[index])
      focusMenuItem(items, index, false);
  }
  if (edgePad(1)) {
    controllerBack(root);
    return true;
  }
  if (edgePad(9)) {
    if (root.id === "helpOverlay") closeFieldGuide();
    else if (root.id === "logOverlay") toggleLog();
    else if (game?.phase === "patrol" && !game.over) closeSplash();
    else controllerBack(root);
    return true;
  }
  if (
    edgePad(2) &&
    root.id !== "logOverlay" &&
    root.id !== "helpOverlay" &&
    game
  ) {
    toggleLog();
    return true;
  }
  if (edgePad(3) && root.id !== "helpOverlay") {
    showFieldGuide();
    return true;
  }
  const direction = menuDirection();
  if (
    direction &&
    (direction !== menuPad.direction || now >= menuPad.repeatAt)
  ) {
    const el = items[menuPad.index];
    if (el?.tagName === "SELECT" && ["left", "right"].includes(direction))
      changeMenuOption(el, direction === "left" ? -1 : 1);
    else
      focusMenuItem(
        items,
        menuPad.index + (["up", "left"].includes(direction) ? -1 : 1),
      );
    menuPad.repeatAt = now + (direction !== menuPad.direction ? 350 : 160);
  }
  menuPad.direction = direction;
  const scroller =
    root.id === "logOverlay"
      ? document.getElementById("logEntries")
      : root.id === "helpOverlay"
        ? document.getElementById("fieldGuideText")
        : root.querySelector(".card");
  if (scroller) {
    if (Math.abs(axis(3)) > 0.25) scroller.scrollTop += axis(3) * 650 * dt;
    if (edgePad(4) || edgePad(5)) {
      const delta = edgePad(4) ? -1 : 1;
      // Move focus too, so page navigation never leaves the selection off screen.
      focusMenuItem(items, menuPad.index + delta * 5);
      if (root.id === "logOverlay" || root.id === "helpOverlay")
        scroller.scrollTop += delta * scroller.clientHeight * 0.8;
    }
  }
  if (edgePad(0)) {
    const target = items[menuPad.index];
    if (target?.tagName === "SELECT") changeMenuOption(target, 1);
    else if (target) {
      const crew = target.classList.contains("pierSailor");
      const id = target.id;
      target.click();
      if (crew) {
        menuPad.crewReturn = id;
        const updated = menuItems(root),
          index = updated.findIndex((e) => e.id === "assignCrewBtn");
        if (index >= 0) focusMenuItem(updated, index);
      }
    }
  }
  return !!buttonsDown || !!axesDown || root.id === "helpOverlay";
}
function tubePanel() {
  const s = game.sub;
  const bank = (name, count, capacity, start) =>
    `<div class="tubeBank"><span>${name}</span><div>${Array.from({ length: capacity }, (_, i) => `<span class="tubeLamp ${i < count ? "ready" : s.torpReloading ? "loading" : "empty"}" title="Tube ${start + i}: ${i < count ? "loaded" : s.torpReloading ? "reload in progress" : "empty"}"><i></i>${start + i}</span>`).join("")}</div></div>`;
  return `<div class="tubePanel" aria-label="Torpedo banks: ${s.fwdTubes} forward loaded, ${s.aftTubes} aft loaded. Lamps represent bank counts, not individually selectable tubes.">${bank("FORWARD", s.fwdTubes, 6, 1)}${bank("AFT", s.aftTubes, 4, 7)}</div>`;
}
function initInterface() {
  document.getElementById("menuLogBtn").addEventListener("click", () => {
    if (game) toggleLog();
  });
  document
    .getElementById("menuHelpBtn")
    .addEventListener("click", showFieldGuide);
  document
    .getElementById("closeHelpBtn")
    .addEventListener("click", closeFieldGuide);
  // A file chooser belongs to the browser/OS, beyond the in-game focus adapter.
  document.getElementById("importBtn").addEventListener("click", () => {
    document.getElementById("transferStatus").textContent =
      "Select a JSON save in your browser’s file picker. That external dialog may require a mouse or keyboard.";
  });
  document.addEventListener("keydown", (e) => {
    menuPad.engaged = false;
    if (
      e.code === "Escape" &&
      document.getElementById("helpOverlay").style.display === "flex"
    ) {
      closeFieldGuide();
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  });
  document.addEventListener("pointerdown", () => {
    menuPad.engaged = false;
    menuPad.screen = null;
    menuPad.token = null;
    document
      .querySelectorAll(".padFocus")
      .forEach((e) => e.classList.remove("padFocus"));
  });
}
