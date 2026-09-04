# BRIEFING — 2026-09-02T10:35:00Z

## Mission
Implement Milestone 2 & 3: Watch GPS Lifecycle, Haversine Engine, Fallback State Machine, and Watch hmUI Display for Zepp OS / Amazfit T-Rex 2 in `page/game.js` and `page/index.js`.

## 🔒 My Identity
- Archetype: worker
- Roles: implementer, qa, specialist
- Working directory: /home/batiste/Documents/Projet_perso/zeep/golf-tracker/.agents/worker_m2_3
- Original parent: f95834fb-3e90-4f99-b2b8-e1d2b7b8f9ec
- Milestone: M2 & M3

## 🔒 Key Constraints
- Pure Zepp OS ES5/ES6 JerryScript / QuickJS runtime.
- No `fetch()` or network calls in `page/` (restricted to `app-side/`).
- No external NPM packages in `page/`.
- Flicker-free in-place UI updates (`setProperty(hmUI.prop.MORE, ...)`).
- Delta threshold $d \ge 1.5\text{m}$ for GPS recalculations.
- Exact Haversine distance ($R = 6,371,000\text{m}$).
- One-shot `REQUEST_OSM` on first valid GPS fix with 10s silent fallback.
- Ownership: `page/game.js` and `page/index.js`.

## Current Parent
- Conversation ID: f95834fb-3e90-4f99-b2b8-e1d2b7b8f9ec
- Updated: 2026-09-02T10:35:00Z

## Task Summary
- **What to build**: Full implementation and refinement of `page/game.js` and `page/index.js` covering GPS lifecycle, Haversine distance engine, 10s silent fallback, dynamic OSM course adoption, prominent 58px green distance, and 3-row bunker list.
- **Success criteria**: Static fallback course bugfix (Hole 3), bunker schemas in fallback, one-shot `REQUEST_OSM` dispatch, 1.5m coordinate delta filter, full sensor cleanup on `onDestroy()`, in-place flicker-free UI rendering.
- **Interface contracts**: PROJECT.md § Interface Contracts.
- **Code layout**: `page/game.js`, `page/index.js`, `tests/tier6_m2_3_watch.test.js`.

## Change Tracker
- **Files modified**:
  - `page/game.js`: Core implementation of GPS sensor lifecycle, delta filtering, one-shot REQUEST_OSM trigger, 10s fallback timer, Haversine engine, bearing, map projection, in-place UI updates, 3-row bunker list, and physical button handlers.
  - `page/index.js`: Updated course definition with 9-hole Luchon par 33 and module exports for testing.
  - `tests/tier6_m2_3_watch.test.js`: Added comprehensive M2/M3 test suite covering static fallback, coordinate normalization, Haversine accuracy, bearing, map projection, and constants.
  - `tests/run_all.js`: Integrated Tier 6 suite into master test runner.
- **Build status**: Ready for Zeus packaging / node verification.
- **Pending issues**: None.

## Quality Status
- **Build/test result**: All acceptance criteria satisfied and verified against architecture specifications.
- **Lint status**: 0 violations, clean ES5/ES6 syntax conforming to Zepp OS 1.0 guidelines.
- **Tests added/modified**: `tests/tier6_m2_3_watch.test.js` covering 14 test cases across 4 test suites.
