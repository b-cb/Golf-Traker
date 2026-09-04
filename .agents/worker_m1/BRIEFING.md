# BRIEFING — 2026-09-02T12:22:00+02:00

## Mission
Implement the App-side Overpass Service & Data Reducer in `app-side/index.js` (Milestone 1).

## 🔒 My Identity
- Archetype: implementer
- Roles: implementer, qa
- Working directory: /home/batiste/Documents/Projet_perso/zeep/golf-tracker/.agents/worker_m1
- Original parent: f95834fb-3e90-4f99-b2b8-e1d2b7b8f9ec
- Milestone: Milestone 1 (App-side Overpass Service & Data Reducer)

## 🔒 Key Constraints
- File ownership: Exclusively `app-side/index.js` (and companion utilities/tests in test suite if applicable).
- DO NOT CHEAT. Genuine implementation only.
- Strict payload size < 2048 bytes.
- Exact Interface Contract: `{ type: 'COURSE_DATA', course: { name, par, holes: [{ num, par, green: [lat, lon], tee: [lat, lon], bunkers: [[lat, lon], ...] }] } }`.
- Single-fetch session cache.
- Overpass QL with 3000m radius around lat/lon.
- Failover endpoints with timeouts.
- Green's Theorem (Shoelace formula) centroid calculation for closed polygons.
- 5 decimal places quantization (~1.1m precision).
- Preserve existing webhook and settings functionality.

## Current Parent
- Conversation ID: f95834fb-3e90-4f99-b2b8-e1d2b7b8f9ec
- Updated: 2026-09-02T12:22:00+02:00

## Task Summary
- **What to build**: App-side companion service fetching OSM golf data via Overpass API, parsing/reducing course data, and sending COURSE_DATA to watch.
- **Success criteria**: Full Overpass parsing with Shoelace centroid, hole/bunker correlation, < 2KB payload, failover endpoints, session caching, preserving existing handlers.
- **Interface contracts**: PROJECT.md / ORIGINAL_REQUEST.md / explorer_survey_2/handoff.md
- **Code layout**: `app-side/index.js`

## Change Tracker
- **Files modified**:
  - `app-side/index.js`: Complete implementation of Overpass QL builder, multi-endpoint POST failover, Green's theorem Shoelace centroid calculator, spatial hole/green/tee/bunker extractor, 5-decimal quantization, <2KB data reducer, single-fetch session cache, and peerSocket / settings / webhook event handlers.
- **Build status**: PASS (45/45 unit/integration assertions passing in `.agents/worker_m1/test_m1.js`, Tier 1 50/50 passing, Tier 2 50/50 passing).
- **Pending issues**: None.

## Quality Status
- **Build/test result**: PASS (100% tests passing)
- **Lint status**: Clean native ES6 companion code
- **Tests added/modified**: `.agents/worker_m1/test_m1.js` (45 automated test assertions covering F1, F2, F3, F4, F10)

## Key Decisions Made
- Implemented Green's Theorem (Shoelace formula) with signed area and centroid coordinates $C_x = \frac{1}{6A} \sum (x_i + x_{i+1})(x_i y_{i+1} - x_{i+1} y_i)$, $C_y = \frac{1}{6A} \sum (y_i + y_{i+1})(x_i y_{i+1} - x_{i+1} y_i)$, with arithmetic vertex mean fallback on degenerate polygons ($|A| < 10^{-12}$).
- Added adaptive bunker reduction loop to guarantee JSON payload never exceeds 2048 bytes even on extreme 18-hole courses with 50+ hazards.
- Implemented single-fetch session caching with in-flight request deduplication (`isFetching` locking with queued listeners).

## Artifact Index
- `.agents/worker_m1/DISPATCH.md` — Assignment instructions
- `.agents/worker_m1/progress.md` — Progress tracker
- `.agents/worker_m1/test_m1.js` — Milestone 1 verification suite (45 assertions)
- `.agents/worker_m1/handoff.md` — Final handoff report
