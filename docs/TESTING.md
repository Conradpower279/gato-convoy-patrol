# Validation record

## Automated gameplay tests

The delivered version passes **65 deterministic gameplay checks**:

- 18 campaign checks: port/departure, five mission objectives, rewards and retries, upgrade effects, campaign completion, and save continuity.
- 15 combat regression checks: surface vulnerability, escort behavior, reloads, battery, extraction, combat-state saves, legacy migration, and a long simulated patrol.
- 15 tactical checks: spreads, silent running, decoys, lead calculations and observation decay, convoy reactions, approaches/weather, compression, log pause, JSON round-trips, malformed imports, and v12 compatibility.

- 17 harbor/crew checks: assignment cap and removal, all five perks and drawbacks, real projectile damage against raid targets, shore blocking, finite alarm response, save state, invalid-raid rejection, migration, early return, first-success reward and campaign continuity.

Run `npm test`. These suites execute the real source in a Node VM with stubbed DOM/canvas APIs. They are useful logic checks, not visual tests or proof of overall game balance. Some scenarios deliberately place objects or complete objectives directly to isolate a rule.

## Real browser checks

Chromium 153 was run through Playwright 1.62.1. The browser suite passed with no JavaScript page errors for:

- Startup menu, new campaign, approach selection, port departure.
- Keyboard spread selection and firing, target selection, shared-aim movement.
- Event-log pause/resume, silent running, decoy deployment.
- Simulated standard-controller LT input (not a physical controller).
- An actual JSON download, valid import, and malformed-file rejection that preserved the active session.
- Port departure at a 1024 × 768 viewport with no horizontal document overflow.
- Startup and departure in the generated standalone HTML.

The additional harbor browser suite passed crew inspection, assignment/removal, cap enforcement, text quote, boarding, night/PD departure, submerged gun restriction, torpedo key input, raid JSON import, 1024-pixel layout, and standalone raid/crew behavior.

The pier, port, and harbor battlefield screenshots were inspected. The port/upgrade list and HUD sidebar scroll vertically when needed. Examples are in `docs/screenshots/`.

Run `npm run build`, then `npm run test:browser` after installing Playwright and its Chromium browser. Screenshot/test-save output goes to `artifacts/`.

A deterministic full raid also succeeded under normal enemy AI: torpedo both moored targets, surface and shell the fuel tank, dive and move away using a decoy, wait out search, then withdraw silently and extract. The run ended at 86% hull with both reinforcements spawned. The script sets aim angles directly, but does not teleport the submarine, delete escorts, or alter health/resources/objectives. This is an automated playability check, not a human balance assessment. Heading/throttle movement, firing, depth changes, decoys and silent running use the gameplay functions and controls.

## v15 visual and controller checks

All 65 gameplay tests continue to pass. A source comparison against v14 confirmed the harbor and tactical modules are unchanged; core game edits add the UI adapter call, its initializer and presentation-only torpedo lamps. Opening the menu now hides the report overlay so it cannot cover the menu after returning from a report. Save schema remains v14.

The controller browser suite uses a simulated standard Xbox pad and actual game frame polling, without mouse clicks to navigate. It covers first-screen New Campaign, all configuration controls, sailor inspection/assignment, three-slot limit, B return, approaches, upgrade purchase, long-list focus, held-input release on departure, combat LT/B/Y mappings, menu save/load/export, log/help, disconnect/reconnect, results/return, laptop-size focus visibility, import compatibility and standalone launch. Native JSON import still uses the browser file input, because native OS dialogs are outside the gamepad adapter.

UI screenshots are included for the 1944-themed menu, instruments, pier and patrol report. Controller navigation is automated browser evidence, not a claim of physical Xbox hardware validation.

## Still unverified

- A complete human-played campaign and subjective difficulty/pacing.
- Physical Xbox/controller behavior across operating systems and browsers.
- Audible sound quality and accessibility usability.
- Mobile/touch play; there are no touch driving/firing controls.
- Every malformed or adversarial save-state combination.
- Extended performance with pathological imported states or unusually long sessions.

Do not describe the game as fully balanced or comprehensively tested. Use a real playthrough and the review checklist in `AI_REVIEW_PROMPT.md` before expanding further.
