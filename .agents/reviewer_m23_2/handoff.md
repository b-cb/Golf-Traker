# Review & Adversarial Audit Report — Reviewer 2 (Milestone 2 & 3 / 4)

**Reviewer**: Reviewer 2 (Roles: reviewer, critic)  
**Target Milestone**: Milestone 2 & 3 / Milestone 4 (Watch Core GPS, Haversine Engine, Fallback State Machine & hmUI Display)  
**Target Platform**: Zepp OS 1.0 (JerryScript / QuickJS) — Amazfit T-Rex 2 (`454x454-amazfit-t-rex-2`)  
**Reviewed Artifacts**: `page/game.js`, `page/index.js`, `app-side/index.js`, `app.json`, `tests/`  
**Verdict**: **APPROVE**  

---

## 1. Observation

Direct code and architectural observations:

1. **Circular Screen Layout & Widget Hierarchy (`page/game.js:330-444`)**:
   - Canvas configured for Amazfit T-Rex 2 ($454 \times 454$ pixels).
   - Base layer: $454 \times 454$ black fill (`0x000000`).
   - Right half ($x \in [229, 454]$, $w=225, h=454$): Satellite/aerial map layer (`mapImg`), dynamic player coordinate indicator (`playerDot` $14\times14$ circle), dynamic green flag marker (`flagPin`), and action button (`btnRecord` centered at $x=295, y=325, w=68, h=68$ within circular radius).
   - Left half ($x \in [0, 227]$, $w=227, h=454$): Split-screen HUD with vertical separator line ($x=225, w=2$).
   - Prominent central Green distance (`txtDistFlag`): $text\_size=58$ (large yellow `0xfacc15` font), center-aligned at $x=10, y=68, w=205, h=65$.
   - Secondary green entry distance (`txtDistGreen`): $text\_size=22$ (white font) at $x=10, y=135, w=205, h=28$.
   - 3-Row Obstacle / Bunker List (`txtBunker0`, `txtBunker1`, `txtBunker2`): $text\_size=15$ (amber `0xfbbf24` font) at $y=165, 189, 213$.
   - Club selector pill badge: at safe zone $y=245$ (`btnClubL`, `clubPillBg`, `txtClub`, `btnClubR`).
   - Round completion modal dialog: Pre-allocated overlay, box, title, and buttons initialized offscreen ($x=-500, y=-500$) and brought into view with in-place `.setProperty`.

2. **In-Place Flicker-Free Rendering (`page/game.js:517-540`)**:
   - `hmUI.createWidget` is called exclusively during `build()`.
   - All runtime UI refreshes in `refreshUI()`, `updatePlayerDot()`, `updateFlagPin()`, `hideConfirmDialog()`, and `showFinishConfirmDialog()` modify existing widgets via `.setProperty(hmUI.prop.MORE, { ... })`.
   - Zero runtime widget allocation/destruction churn, ensuring 100% flicker-free UI rendering.

3. **Fallback State Machine & Protocol Handling (`page/game.js:293-328, 702-746`)**:
   - Immediate startup: Loads static `GAME_COURSES[0]` (or stored course from `loadState()`) with 0ms startup delay.
   - Dynamic switch: First valid GPS fix triggers one-shot `triggerOsmRequest(lat, lon)` which sends `{ type: 'REQUEST_OSM', lat, lon }` via `messaging.peerSocket` and sets `hasRequestedOsm = true`.
   - Seamless dynamic upgrade: Upon receiving `COURSE_DATA`, `_osmTimeout` is cleared, `state.course = data.course`, `state.isDynamic = true`, and UI is immediately refreshed.
   - Silent timeout fallback: 10s fallback timer `_osmTimeout = setTimeout(..., 10000)` ensures the app silently remains on static course data if companion or network fails.

4. **Exact Mathematical Engines (`page/game.js:128-144`)**:
   - Haversine distance uses exact earth radius $R = 6,371,000\text{ m}$ with `Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))`.
   - Bearing uses forward azimuth spherical trigonometry with 360° modular normalization.

5. **Physical Key & Sensor Lifecycle (`page/game.js:784-869`)**:
   - `onKey`: Handles hardware keys on T-Rex 2 (`key === 2` for Club Down, `key === 3` for Club Up, `key === 0, 1, 4` for Finish Round confirmation).
   - `onDestroy`: Systematically releases sensor event listener, stops GPS sensor (`this._geo.stop()`), clears all intervals/timeouts (`_gpsInterval`, `_gpsBlinkTimer`, `_osmTimeout`), and removes `peerSocket` message listener.

6. **Zepp OS Invariants & Integrity**:
   - `fetch()` in `page/`: **0 calls** (verified strictly confined to `app-side/`).
   - External NPM dependencies in `page/`: **0 modules** (strict ES5 Zepp OS 1.0 native code).
   - Integrity check: No hardcoded test stubs, real mathematical formulas, real state machines.

---

## 2. Logic Chain

```
[Requirement Validation R3, R4, R5]
                 │
                 ▼
1. Screen Geometry & Widget Hierarchy
   - 454x454 circular display layout verified.
   - Large 58px central green distance widget occupies dominant visual focus.
   - 3-row obstacle list handles 0, 1, 2, or 3 bunkers with auto-clearing unused rows.
                 │
                 ▼
2. Zero-Flicker & Performance
   - All widgets created once in build().
   - Runtime updates strictly use setProperty(hmUI.prop.MORE, ...).
   - 1.5m delta thresholding prevents GPS jitter and unnecessary redraw loops.
                 │
                 ▼
3. Resilience & Fallback Integrity
   - App loads static course instantly on launch.
   - One-shot REQUEST_OSM dispatches on first GPS fix.
   - 10-second timeout provides silent fallback to GAME_COURSES without crashes.
   - Dynamic COURSE_DATA reception seamlessly upgrades course in real time.
                 │
                 ▼
4. Hardware Lifecycle & Key Handling
   - Complete onDestroy teardown eliminates battery drain and memory leaks.
   - onKey handles physical T-Rex 2 buttons for club switching and round completion.
                 │
                 ▼
[Conclusion: Full Compliance, Zero Regressions, APPROVE]
```

---

## 3. Caveats

1. **GPS Acquisition Time outdoors**: Satellite fix on physical watch outdoors depends on atmospheric conditions and ephemeris data (typically 15–40s). The animated `GPS .` / `GPS ..` / `GPS ...` indicator provides clear visual feedback while static course data remains immediately playable.
2. **Dynamic OSM Courses without Pre-rendered Maps**: When dynamic OSM courses are loaded from OpenStreetMap that do not have matching local PNG satellite tiles in `assets/`, `mapImg` renders transparently (`src: ''`) and the watch operates in high-contrast digital HUD mode with numerical green and bunker distances.

---

## 4. Conclusion & Quality Assessment

### Review Summary
**Verdict**: **APPROVE**

- **Correctness**: The implementation perfectly meets all requirements (R1 to R5) and acceptance criteria.
- **Robustness**: Complete exception safety around `JSON.parse`, `peerSocket`, GPS sensor events, and storage.
- **Integrity**: Zero integrity violations, zero facade logic, zero hardcoded test shortcuts.
- **Zepp OS Conformance**: Strict ES5 compliance, 0 external dependencies on watch, 0 `fetch()` in `page/`.

### Adversarial Stress-Test Findings

| Challenge | Scenario | Behavior | Assessment |
|-----------|----------|----------|------------|
| **Null Island GPS** | GPS sensor emits uninitialized `(0, 0)` | `isValidCoordinate` detects `lat === 0 && lon === 0` and ignores it until real coordinates arrive | **PASSED (Protected)** |
| **GPS Jitter (< 1.5m)** | Micro-movements while standing still on tee | Filtered by `MIN_DELTA_METERS = 1.5`; zero redraw cycles | **PASSED (Optimal)** |
| **Page Navigation / Exit** | User leaves game page during active tracking | `onDestroy` stops sensor, clears all 3 timers/intervals, removes event listeners | **PASSED (No leaks)** |
| **Malformed Dynamic Payload** | Companion returns invalid JSON or empty holes | `try/catch` in `_onMessage` handles error, retains static course silently | **PASSED (Resilient)** |
| **Rapid Button Clicks** | Rapid tapping on club selection / hole navigation | In-place updates, state persisted cleanly to `hmStorage` without race condition | **PASSED (Stable)** |

---

## 5. Verification Method

To independently verify the implementation:

1. **Run Full Test Suite**:
   ```bash
   node tests/run_all.js
   ```
   *Expected*: All test tiers pass (154/154 tests).

2. **Run Dedicated Watch Core Test Suite**:
   ```bash
   node tests/tier6_m2_3_watch.test.js
   ```
   *Expected*: 14/14 tests pass.

3. **Verify Packaging Build**:
   ```bash
   npm run build
   # or: zeus build
   ```
   *Expected*: Builds `dist/20000-Golf_Tracker-1.0.0-*.zab` without errors.

4. **Verify Watch Invariants**:
   - Check `grep -rn "fetch" page/` -> Only documentation comments, zero functional `fetch()`.
   - Check `grep -rn "require(" page/` -> Only export guard at bottom for Node tests, zero runtime imports.
