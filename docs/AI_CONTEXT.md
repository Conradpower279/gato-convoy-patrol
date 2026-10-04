# Project context for the next developer

## Evolution

- v10: a standalone HTML arcade game with shared aiming, separate torpedo/gun triggers, automatic reloads, and a startup menu.
- v11: fixed surface vulnerability, local escort search and physical attack runs, depth/battery mechanics, gun balance, extraction/refits, and fuller save state.
- v12: five-mission campaign, port upgrades, mission-specific objectives, early-return retries, and finite campaign completion.
- v13: tactical systems, portable JSON saves, and this IDE project.
- v14: optional night harbor raid, clickable top-down pier, five Hot Runners with three assignment slots, perk/drawback integration, boarding animation and original text quotes.

The user is a submarine officer and CS student. Preserve the approachable arcade controls; historical or platform-realistic simulation is not the goal. The user wants clear recommendations and working changes, with explicit validation limits.

## File map

| File                 | Responsibility                                                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `index.html`         | Menu, HUD containers, help, port, SVG approach chart, results, save transfer, event-log overlay                                                                    |
| `src/styles.css`     | Responsive layout, scrollable sidebar/dialogs, port and approach cards                                                                                             |
| `src/game.js`        | Shared state, configuration, campaign, upgrades, movement, combat, AI, rendering, input, save migration, frame loop                                                |
| `src/tactics.js`     | Tracking/intercept aid, salvos metadata, approaches/weather, convoy reaction helpers, decoys, silent running, compression checks, log, JSON portability/validation |
| `scripts/build.cjs`  | Inlines CSS and all four classic scripts into the standalone HTML                                                                                                 |
| `scripts/serve.cjs`  | Minimal loopback-only development server                                                                                                                           |
| `tests/campaign.cjs` | Campaign and upgrade scenarios in a Node VM                                                                                                                        |
| `tests/combat.cjs`   | Earlier combat regression scenarios in a Node VM                                                                                                                   |
| `tests/tactics.cjs`  | New tactics and portable-save scenarios in a Node VM                                                                                                               |
| `tests/browser.cjs`  | Playwright checks against source and standalone HTML                                                                                                               |

The four source scripts share top-level lexical state. `interface.js` loads first, then `harbor.js`, `tactics.js`, and `game.js`; its function bodies access game state only when called later. This keeps `file://` and the inline build usable without modules or a bundler. A future module split is reasonable, but preserve offline distribution and avoid maintaining two game implementations.

## Important invariants

- World geometry is fixed at 1600 × 1000 game units. Rendering fits the available canvas area; screen size must not change combat distances.
- `game.phase` is `port`, `patrol`, or `result`. The menu and log can pause a patrol. A port state may retain `game.over = true` from the preceding result; departure constructs a new patrol. Treat phase transitions carefully.
- `game.campaign` owns persistent score/tonnage, points, upgrade levels, completion IDs, bonus claims, and a summary log.
- `game.mission` owns the current designated target, rescue progress, objective failure, deadline, and one-time reward markers.
- `game.sub` owns hull/resources, shared aim, selected gun, independent mount timers, depth/battery, repair use, spread, silent mode, and decoy inventory.
- Every successful primary objective yields 1 upgrade point. Patrols 2–4 can yield one additional bonus point. Levels cost 1 point and cap at 2. Patrol 5's optional 36,000-ton goal grants a commendation rather than another useful upgrade.
- Early extraction returns to the same assignment with a refit and no new upgrade points. Sinking/return score still contributes to the campaign total; repeated-attempt score farming is a known design question.
- Failure by hull loss is terminal for that session; loading a separate earlier manual save is allowed.
- Extraction requires 15 continuous seconds in the southern circle without active escort/aircraft pursuit. Completion depends on the mission, not a universal merchant counter.

## Current tuning

- Depth commands: surface 0 m, periscope 12 m, deep 60 m. Torpedoes can launch at ≤15 m; guns require <3 m.
- Base max speed: 68 / 36 / 29 game units per second by depth. Silent mode caps speed at 12, cuts movement-noise contribution to 35%, and pauses gun/tube reloads. Launching torpedoes ends silent mode.
- Guns: deck gun 28 damage per .65 s; 40 mm 8 per .12 s with .35 large-hull multiplier; 20 mm 4 per .075 s with .18 large-hull multiplier. Smaller craft and heavy hunters have additional multipliers.
- Torpedoes: 85 damage, 220 units/s, 7 s life. Single consumes 1 tube. Narrow/wide spreads consume 3 from the selected bank with ±.024 / ±.065 rad spread. Not enough tubes means no partial salvo.
- Lead estimates use sampled visual/active-sonar observations. Quality grows with observation, drops on observed course changes, and decays after lost contact. The hint does not steer the weapon. The intercept solver uses estimated velocity; it does not infer future evasive maneuvers.
- Merchants zigzag during a 45-second convoy alert. In multi-escort groups, the last regular escort screens merchants while others investigate, subject to close local contact.
- Two decoys per patrol, 20 s life, 12 s launcher cooldown. They can divert escorts within 340 units if the real submarine is more than 130 units away and submerged. Close/surface reacquisition defeats the lure. This is a simple deterministic arcade model.
- Patrols 2 and 4 are night (.67 visual-range factor). Patrols 3 and 5 have rough seas (1.7 gun dispersion, .72 aircraft spotting and bomb-damage factor). Weather is mission-fixed, not dynamic.
- Approaches: cautious starts at (1100,800), removes one regular escort (minimum 1); balanced at (800,700); aggressive at (420,580), adds one escort and increases sinking points by 20%. All choices pursue the current mission; the chart is not an open-world sector simulation.
- Time ×1/×2/×4 is split into simulation steps no larger than .025 s. Threats, active projectiles, repair work, extraction, nearby rescue activity, or a closing interception window prevent compression.
- Event log is capped at 200 entries and pauses gameplay when open. Campaign summaries survive between patrols; detailed event history is per patrol.

## Save compatibility

Current payload: `{ format?, version: 14, nextShipId, config, game }`. Local keys are `gato_convoy_patrol_v14` and `gato_convoy_patrol_v14_manual`; readers also look for v13/v12/v11 and the older v8-named key. No old key is automatically deleted.

Import uses JSON parsing, a 2 MB limit, depth/node/array limits, forbidden prototype-like key checks, migration, and selected type/range checks before replacing the game. HUD encounter names are escaped; logs are inserted as text. This is not a formal complete JSON schema. Expand malformed-state tests before making save files a public interchange format. Loading resets compression and the transient log overlay.

Browser local storage is scoped to origin and sometimes to individual local files. Export/import solves transfer once the save is visible to a page. It cannot read another origin's storage. The older v12 UI had no export control.

## Review priorities

1. Human-playable balance and pacing over a complete campaign, including the longer cautious approach.
2. Information consistency between visual range, sonar fixes, the targeting overlay, and mission-target markers.
3. Strict import schema coverage and failure atomicity for every nested timer/object/state combination.
4. Escort guard/search/decoy transitions and extraction recovery after losing contact.
5. Keyboard focus, controller edge behavior under compression, and menu navigation on actual hardware.
6. Score farming on retries, difficulty changes mid-campaign, and upgrades that might dominate.
7. Small, test-preserving separations of state, AI, persistence, input, and rendering.

There is no telemetry, analytics, multiplayer, server, authentication, real asset pipeline, formal accessibility audit, or historical performance model. Do not mistake these omissions for defects without considering scope.

## v14 harbor and crew implementation

`src/harbor.js` owns static crew definitions, ID normalization, pier SVG and character buttons, boarding animation, roster actions, optional raid definition, harbor geometry, alarm/reinforcement state, shoreline collision, fuel projectile hits, save normalization, and the harbor overlay/HUD. `game.js` has explicit hooks where perks change reloads, sonar, battery/noise, repair and contact decay. Perks are calculated from crew IDs; loading does not reapply reserve penalties. `tests/harbor.cjs` and `tests/harbor-browser.cjs` cover the extension.

- `campaign.crew`: unique known role IDs, max three. All five recruits are unlocked. Changes only at port; ordinary crew fill unused roles. No voice assets or speech synthesis.
- Captain: contact decay ×1.1, deck magazine reload ×1.1. It does not accelerate enemy search timers.
- Engineer: battery drain ÷1.1, acoustic movement contribution ×1.05. Visual detection unchanged.
- Chief: +5 hull per repair, 12 seconds instead of 10. If no damage-control upgrade, grants one 20-hull repair. Level 1 still repairs 20; level 2 repairs 30. One use per patrol, hull cap 100.
- Torpedoman: tube reload ×0.9, 12 reserve torpedoes instead of 14 on departure. Loaded tubes remain 6 forward / 4 aft.
- Sonarman: sonar mark lifetime ×1.15, active-ping alert radius ×1.1 if sonar-alert option enabled.
- `game.plannedSortie`: campaign/harbor port choice. `campaign.patrol` and `portMission` stay 1–5; harbor uses `mission.id=6` with `HARBOR_MISSION`, outside the linear campaign.
- `game.harbor`: fuelHP (112 max), two target IDs, sunk IDs, alarm time/source, reinforcement count (max 2). Moored merchant/transport have zero convoy speed and do not zigzag.
- Harbor starts at (800,710), heading north, depth/ordered depth 12; night/calm weather, balanced score multiplier regardless of campaign approach. The map remains a fixed 1600×1000 sector, not a scrolling world.
- Both moored ships AND the fuel tank must be destroyed, followed by normal 15-second contact-free extraction. Fuel takes four 28-damage deck shells. AA has its hull multiplier; torpedoes stop at land and cannot destroy the shore tank.
- Shore geometry blocks submarines/ships at all depths; it is an arcade boundary, not bathymetry. Sub collisions stop movement without hull damage. Shells may pass over shoreline to hit the tank; charted landmarks remain visible at depth.
- Gunfire, target damage, or established escort contact raises the alarm once. Reinforcements arrive at +18/+38 seconds. They investigate the sampled alarm position, not a live hidden sub position. One initial escort; no aircraft or additional convoy spawns during raid.
- First raid success adds one upgrade point (`campaign.raidCompleted`); repeats earn score but not upgrade points. Campaign progress never skips. Loss remains terminal; early return refits/retries. Existing repeated-score farming behavior is unchanged.
- Normalization validates raid IDs, surviving targets, fuel HP, reinforcement count and alarm fields, then restores night weather. No exhaustive schema guarantee.

Next review focus: legitimate full raid playthrough, escape pacing, escorts near shore corners, crew combinations and readable labels on smaller windows. Design prefers worn dock/paper visuals and personality over glossy generic cards. Future scrolling world and 12-mission campaign are not implemented in this version.

## v15 presentation and controller navigation

- `src/interface.js` is the UI adapter; it does not serialize state. `menuPad` tracks focus, stable element keys, repeat timing and a transition release gate. `updateControllerMenus(dt)` runs immediately after `pollPad()` and consumes menu input before gameplay controls.
- Menu focus follows enabled DOM controls, preserves selection across generated HTML updates, wraps in document order, scrolls selected controls into view and skips disabled/hidden actions. Both vertical and horizontal directions navigate; a selected difficulty control uses left/right to change its existing option and dispatch its original change event.
- A activates the existing control; B goes back. Selecting a sailor focuses Assign; B from there returns to the sailor. X opens log, Y opens the copied operating guide, and Menu/Start resumes a live patrol or returns through menus. Right stick scrolls; shoulders jump five controls (page log/help text). Keyboard and pointer use relinquish controller focus.
- Leaving a controller menu requires neutral buttons/sticks before gameplay resumes. Held A/B/triggers cannot leak into sonar/depth/weapons. Controller disconnection pauses a live patrol. Right-stick vertical, previously unused, scrolls the instrument sidebar while playing; horizontal aim remains unchanged.
- New menu-only log/guide buttons expose existing content. Native JSON input and existing export/import are preserved. The browser/OS file dialog is outside the game's Gamepad API focus loop. Audio may require a trusted mouse/key gesture due to browser autoplay policy.
- CSS supplies steel/Bakelite labels, ivory scales, cream documents, chart grids and refit forms. A pure HUD renderer adds lamps derived from existing forward/aft counts; tube numbers are a count visualization, not individually tracked/selectable tubes.
- No changes to battle renderer, world dimensions, mission/AI/combat calculations, upgrades/crew tuning, or save storage/schema. Build version is v15; save payload stays version 14 for exact compatibility.
- `tests/controller-browser.cjs` covers simulated-controller screen flow, settings, crew, approaches, upgrades, held-input gating, save/load/export, log/help, reconnect, results, laptop focus and standalone launch. Existing 65 logic checks and earlier browser suites remain relevant. Physical hardware and subjective audio are unverified.

- UI layering fix: `openSplash()` hides the report overlay, allowing both mouse and controller users to reach the menu from a report. Mission/result calculations are untouched.
