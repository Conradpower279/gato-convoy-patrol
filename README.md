# Gato Class: Convoy Patrol — v15

An offline Canvas submarine arcade game with a five-patrol campaign. There is no backend, account, runtime framework, asset service, or paid API. All game graphics and sound effects are generated locally.

**For the next AI review, open `AI_REVIEW_PROMPT.md` and paste it into your IDE assistant.** It points to the design context, tests, and known limitations.

## Run and edit

Requires Node.js 20 or newer for the development commands.

```sh
npm start
```

Open **http://127.0.0.1:8080**. Edit `src/game.js`, `src/interface.js`, `src/harbor.js`, `src/tactics.js`, `src/styles.css`, and `index.html`, then refresh the page. There is no hot reload. Opening `index.html` directly also works, but a stable local-server URL makes browser save storage more predictable.

These commands use only built-in Node modules and work without installing packages:

```sh
npm test
npm run build
```

The build creates `dist/gato_convoy_patrol_v15.html`, a single file you can copy elsewhere and open offline. Treat the files in `src/` plus `index.html` as the source of truth; do not separately edit the generated distribution.

Optional formatting and browser testing:

```sh
npm install
npx playwright install chromium
npm run test:browser
npm run format
npm run build
```

The browser test can also use an existing compatible Chromium binary through the `GATO_TEST_BROWSER` environment variable. It writes screenshots and a synthetic test save to `artifacts/`, which is ignored by Git. Dependencies are development-only; the game itself does not use npm packages.

## Play the new night raid

Choose **New Campaign → Night Harbor Raid**. Click a top-down sailor on the pier, inspect the perk and drawback, then choose **Assign to boat**. You can take three of the five Hot Runners. Click an assigned sailor and choose **Stand down** to swap. Everyone is available immediately. Assignments show original text quotes, with no recorded or synthesized voice.

The raid starts at periscope depth at night. Sink both moored ships with torpedoes; surface with **Z** and use **F** / RT to shell the shore fuel tank (four deck-gun hits). Ships, the fuel tank, and your escape are all required. The alarm calls at most two reinforcements, arriving 18 and 38 seconds after it starts. Break pursuit, reach the southern circle, and remain there for 15 seconds. Early return refits the same assignment.

First raid success earns one upgrade point. Repeat raids do not farm upgrade points or advance the five-mission campaign. Select **Campaign orders** at port to resume that campaign. Crew bonuses and drawbacks also apply on campaign patrols. The Chief supplies a usable repair even before buying damage-control training.

## v15 presentation

The interface uses a 1944 submarine equipment-and-paperwork theme: steel HUD plates, segmented instrument meters, torpedo readiness lamps, a patrol-orders clipboard, paper charts, refit authorization rows, and a typed patrol report/logbook. Existing missions, enemy AI, timing, weapons, crew effects, rewards and progression are unchanged. The battlefield retains its existing geometry and renderer. Save schema and storage keys intentionally remain v14.

## What is included

- Five missions: two-merchant attack, designated tanker, survivor rescue, designated transport interception, and a tonnage objective against stronger escorts.
- A port screen, persistent two-level upgrades, optional bonus objectives, early-return retries, repairs and rearming, and a finite campaign ending.
- Surface, periscope, and deep states; battery management; distinct gun roles; independent automatic gun reloads; local escort tracking and search.
- Observation-based torpedo lead estimates, single/narrow/wide torpedo spreads, evasive merchants, screening escorts, two decoys per patrol, and silent running.
- Night and rough-sea modifiers; three pre-patrol approach choices with different positioning, escort count, and sinking-score rewards.
- Safe-travel time compression, a bounded patrol event log, and JSON export/import for portable saves.

## Essential controls

| Action                              | Keyboard          | Standard Xbox-style controller |
| ----------------------------------- | ----------------- | ------------------------------ |
| Throttle / rudder                   | W/S, A/D          | Left stick                     |
| Shared weapon aim                   | Left/right arrows | Right stick horizontal         |
| Fire torpedo or spread              | Space             | LT                             |
| Fire selected gun                   | F                 | RT                             |
| Select gun                          | 1/2/3 or Tab      | LB/RB                          |
| Cycle depth                         | Q                 | B                              |
| Direct surface / periscope / deep   | Z / X / C         | Cycle with B                   |
| Active sonar                        | E                 | A                              |
| Reload gun / torpedo banks          | R / T             | X / D-pad Down                 |
| Emergency repair (upgrade or Chief) | H                 | D-pad Up                       |
| Track/cycle observed target         | G                 | Right-stick click              |
| Cycle torpedo spread                | V                 | D-pad Right                    |
| Toggle silent running               | N                 | D-pad Left                     |
| Deploy decoy                        | B                 | Left-stick click               |
| Cycle time ×1/×2/×4                 | J                 | View/Back                      |
| Patrol log                          | O                 | On-screen button               |
| Manual save / load latest           | K / L             | Y saves                        |
| Pause/resume                        | Esc               | Start                          |

The controller mappings assume the browser's standard gamepad mapping. Press a controller button on the opening screen to connect. All in-game screens now support controller navigation.

| Menu action | Xbox control |
| --- | --- |
| Move through enabled controls | D-pad / left stick |
| Select, assign crew, toggle checkbox | A |
| Change selected difficulty | Left/right or A |
| Back / close | B |
| Scroll orders, log, or guide | Right stick up/down |
| Jump five controls / page long log or guide | LB / RB |
| Open patrol log from a menu | X |
| Open field guide from a menu | Y |
| Pause / resume patrol | Menu / Start |
| Scroll instruments during gameplay | Right stick up/down |

Selecting a sailor moves focus to **Assign**. B returns to that sailor. Disabled upgrades and unavailable actions are skipped. After leaving a menu, release sticks/buttons before taking control; this prevents held menu input from firing weapons. Disconnecting the controller pauses an active patrol.

The browser/OS owns the external JSON file picker and download dialogs; those may still require mouse/keyboard. Regular in-game saves and loads work with the controller. Browser audio policy may require a mouse/key interaction before sound can start. A physical Xbox controller has not been tested here; automated tests simulate its standard mapping.

## Saves

Use **Export Campaign JSON** in the main menu, or **Export JSON** at port. In the new copy/browser, choose **Import Campaign JSON**. Import replaces the current in-memory session after validation; export it first if you want to keep it. Files are limited to 2 MB. The entire in-flight state is included, including incoming weapons, reloads, mission progress, and upgrades. Loading a save resets time compression to ×1 and closes the log overlay.

Browser saves have separate latest/autosave and manual slots. Autosave occurs every 10 seconds and at campaign checkpoints when enabled. Disabling autosave also disables automatic checkpoint writes; manual Save and Export remain available.

v13 and v12 campaign saves preserve their mission and upgrades. Earlier v8/v9/v11-style saves are adapted to the First Contact mission while preserving supported resources and active combat data. Older files cannot reconstruct data their previous save format discarded. Storage depends on browser origin: `file://`, a different port, and a different browser may not see the same saves. To move into the IDE server, export from the page where your save is visible, then import at the server URL. v12 did not have export/import: recovering an old local save may require serving/replacing the new game at the same original URL/path before exporting. Keep a backup of the old HTML.

## Review and validation

See `docs/AI_CONTEXT.md` for implementation details and `docs/TESTING.md` for what was actually checked. Passing tests is not a claim that the game's long-term balance is finished. Physical-controller compatibility, sound quality, and a complete human playthrough still need testing.
