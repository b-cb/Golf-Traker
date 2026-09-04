# Project Orchestrator Plan

## Goal
Integrate OpenStreetMap Overpass API into the Golf Tracker Zepp OS application (Amazfit T-Rex 2) according to requirements R1 to R5 and acceptance criteria.

## Phases and Milestones

### Phase 0: Survey & Scope Mapping
- Spawn 3 parallel Explorers:
  - Explorer 1: Codebase structure, existing game.js, page/ logic, Zepp OS config (app.json, targets, packages).
  - Explorer 2: Overpass query construction, tags (leisure=golf_course, golf=hole, golf=green, golf=bunker, golf=tee), centroid reduction algorithms (< 2KB payload).
  - Explorer 3: Zepp OS messaging protocol (peerSocket), sensor GPS API (@zos/sensor), hmUI widgets layout & performance.
- Synthesize survey findings into `PROJECT.md` with Feature Inventory and Interface Contracts.

### Phase 1: Dual Track Initiation
- **Track A: E2E Testing Track**:
  - Test harness setup (mocking peerSocket, GPS sensor, Overpass HTTP response).
  - Test suite design across 4 Tiers:
    - Tier 1: Feature coverage (5+ per feature).
    - Tier 2: Boundary & corner cases (empty responses, missing tags, network timeouts, GPS precision/extremes).
    - Tier 3: Cross-feature combinations (Bluetooth drops, dynamic vs static switchover).
    - Tier 4: Real-world golf course scenarios (Pebble Beach / Le Golf National mock Overpass data).
  - Publish `TEST_READY.md`.
- **Track B: Implementation Track**:
  - **Milestone 1: App-side Overpass Service & Data Reducer (R1, R2)**:
    - Query builder (3000m radius around watch initial GPS coordinates).
    - Fetch logic with single-trigger per session safeguard.
    - Centroid calculation for OSM polygons/ways/nodes.
    - Minimalist payload serialization (< 2KB).
    - Error handling & timeout management.
  - **Milestone 2: Watch Page GPS, Haversine Engine & Fallback Logic (R3, R5)**:
    - GPS initialization with `@zos/sensor`.
    - `REQUEST_OSM` dispatch over `peerSocket` on initial GPS fix.
    - Haversine formula calculation engine (recomputed strictly on GPS coordinate changes).
    - Dynamic payload parser & graceful fallback to `game.js` on failure/timeout.
  - **Milestone 3: Watch UI (hmUI) Display & Real-time Refresh (R4)**:
    - Prominent central Green distance display.
    - Secondary bunker/hazard distance list.
    - Flicker-free widget update on GPS callback.
    - Compliance with Zepp OS ES6 constraints and T-Rex 2 screen constraints.
  - **Milestone 4: E2E Verification & Hardening**:
    - Pass 100% of Tier 1-4 E2E test suite.
    - Tier 5 Adversarial Coverage Hardening (Challengers + Reviewers).
    - Forensic Integrity Audit.

### Phase 2: Final Acceptance & Victory Claim
- Sentinel verification.
- Victory audit.
