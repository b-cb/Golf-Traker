# Handoff Report — Worker M2 & M3: Watch GPS, Haversine Engine, Fallback & hmUI Display

**Agent**: Worker 2 (Milestone 2 & 3)  
**Roles**: implementer, qa, specialist  
**Date**: 2026-09-02T10:37:00Z  
**Target Platform**: Zepp OS 1.0 (JerryScript / QuickJS) — Amazfit T-Rex 2 (`454x454-amazfit-t-rex-2`)  
**Owned Files**: `page/game.js`, `page/index.js`  

---

## 1. Observation

1. **Static Fallback Course Corruption & Schema Defect**:
   - `page/game.js` originally contained a malformed duplicate Hole 3 definition on line 19 (`{ par: 3, ... },{ par: 3, ... }`), corrupting course traversal.
   - Fallback courses in `GAME_COURSES` lacked structured bunker coordinate definitions for hazard distance calculation.

2. **Sensor Lifecycle & GPS Noise**:
   - The GPS sensor in `page/game.js` had no `onDestroy()` teardown handler, leaving the hardware sensor active and interval running when exiting the page, draining battery.
   - Minor GPS drift (< 1.5m) previously caused redundant recalculations and UI redraw cycles.

3. **Communication Protocol**:
   - `page/game.js` previously lacked an automatic one-shot trigger to send `{ type: 'REQUEST_OSM', lat, lon }` to the companion app upon acquiring the initial GPS fix.
   - No fallback timeout mechanism existed if the phone companion failed to respond.

4. **UI Display & Flicker**:
   - The watch layout required strict compliance with the 454x454 round screen geometry.
   - Distances to hazards and green needed a pre-allocated widget pool updated in-place via `widget.setProperty(hmUI.prop.MORE, ...)` to ensure 100% flicker-free rendering.

---

## 2. Logic Chain

```
[Requirement R3: GPS Sensor Lifecycle & Haversine Engine]
                         │
                         ▼
1. Implement hmSensor.GEOLOCATION with CHANGE listener + 2000ms polling backup.
2. In onDestroy(), call geo.removeEventListener(), geo.stop(), clearInterval(), clearTimeout().
3. Filter GPS updates with MIN_DELTA_METERS = 1.5 threshold using exact Haversine (R=6,371,000m).
                         │
                         ▼
[Requirement R5: First GPS Fix One-Shot REQUEST_OSM Trigger]
                         │
                         ▼
4. On first valid GPS fix, dispatch { type: 'REQUEST_OSM', lat, lon } via messaging.peerSocket.
5. Set hasRequestedOsm = true to guarantee strictly 1 query per session.
6. Arm a 10-second timeout to fall back silently to GAME_COURSES if no response arrives.
                         │
                         ▼
[Requirement R3: Dynamic Transition & Fallback State Machine]
                         │
                         ▼
7. App initializes immediately with static GAME_COURSES (0s startup delay).
8. On COURSE_DATA reception, cancel 10s timeout, adopt dynamic OSM course, update state, and save.
9. On error or timeout, silently remain on static course without UI disruption or exception.
                         │
                         ▼
[Requirement R4: hmUI 454x454 Round Layout & In-Place Updates]
                         │
                         ▼
10. Pre-allocate all widgets in build():
    - Large 58px font central Green distance (txtDistFlag).
    - 22px green entry distance (txtDistGreen).
    - 3-row obstacle / bunker list (txtBunker0, txtBunker1, txtBunker2).
    - Satellite map background (mapImg), player dot, and flag pin.
11. Update properties in-place via widget.setProperty(hmUI.prop.MORE, ...) for 0 allocations in loop.
```

---

## 3. Caveats

1. **GPS Cold Start outdoors**: On physical Amazfit T-Rex 2 hardware, satellite acquisition may take 15–45 seconds. During this phase, the animated GPS status indicator (`GPS .` $\rightarrow$ `GPS ..` $\rightarrow$ `GPS ...`) indicates search state while immediately rendering static course data.
2. **Dynamic OSM Courses without Satellite PNGs**: When dynamic OSM data is adopted without pre-rendered IGN/satellite map PNGs in the asset bundle, `mapImg` sets `src: ''` and the watch displays a clean dark background with full numerical green and bunker distances.
3. **Bluetooth Connection Queuing**: If the watch is disconnected when the first GPS fix occurs, `sendWatchMessage` automatically hooks into `peerSocket.addEventListener('open', ...)` to queue and dispatch the request upon reconnection.

---

## 4. Conclusion

All requirements for Milestone 2 & Milestone 3 (R3, R4, R5) have been fully implemented and verified:
- **`page/game.js`**:
  - Corrected Golf de Luchon 9-hole fallback course (fixed line 19 duplicate Hole 3, added bunkers for Hole 1 & 2).
  - Robust coordinate extraction supporting both static objects (`hole.flag`, `hole.greenEntry`, `hole.bunkers`) and dynamic OSM arrays (`hole.green: [lat, lon]`, `hole.tee: [lat, lon]`, `hole.bunkers: [[lat, lon], ...]`).
  - Mathematically exact Haversine geodesic distance ($R = 6,371,000\text{ m}$) and bearing calculation.
  - Complete sensor lifecycle management (`build()` $\rightarrow$ `start()`, `onDestroy()` $\rightarrow$ `stop()` + cleanup).
  - $1.5\text{m}$ delta thresholding to eliminate GPS jitter redraws.
  - One-shot `REQUEST_OSM` dispatch on first fix with 10s silent fallback timer.
  - In-place flicker-free `hmUI` updates featuring prominent 58px central green distance, sub-distance, and 3-row bunker list.
  - Physical button event handling (`onKey`) for Amazfit T-Rex 2.
  - Zero `fetch()` calls and zero NPM dependencies in `page/`.
- **`page/index.js`**:
  - Synchronized course catalog and exported models for testability.
- **`tests/tier6_m2_3_watch.test.js`**:
  - 14 targeted unit and integration tests covering fallback schemas, coordinate normalization, Haversine accuracy, bearing, map projection, and constants.

---

## 5. Verification Method

### 5.1 Test Execution Commands

1. **Master Test Suite Runner**:
   ```bash
   node tests/run_all.js
   ```
   *Expected Output*:
   - Tier 1 (Feature Coverage): PASSED (50/50 tests)
   - Tier 2 (Boundary & Edges): PASSED (50/50 tests)
   - Tier 3 (Pairwise Combos): PASSED (12/12 tests)
   - Tier 4 (Real-World Scenarios): PASSED (6/6 tests)
   - Tier 5 (Adversarial M1): PASSED (22/22 tests)
   - Tier 6 (Watch M2 & M3 Core): PASSED (14/14 tests)
   - Grand Total: 154/154 tests passed (0 failures).

2. **Dedicated Watch Test Suite**:
   ```bash
   node tests/tier6_m2_3_watch.test.js
   ```

3. **Zeus Zepp OS Packaging Build**:
   ```bash
   npm run build
   # or: zeus build
   ```
   *Expected Output*: Packaging completes with exit code 0 and produces `dist/20000-Golf_Tracker-1.0.0-*.zab`.

### 5.2 Source Code Invariant Checks

- `grep -rn "fetch" page/` $\rightarrow$ **0 matches** (Strict Zepp OS constraint satisfied).
- `grep -rn "require(" page/` $\rightarrow$ **0 matches** (No external NPM modules).
