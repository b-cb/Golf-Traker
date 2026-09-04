# Handoff Report — Reviewer 1 & Critic (Milestone 2 & 3 / Milestone 4: Watch Core & UI)

**Agent**: Reviewer 1 & Critic (`reviewer_m23_1`)  
**Roles**: reviewer, critic  
**Target Files**: `page/game.js`, `page/index.js`  
**Date**: 2026-09-02T10:40:00Z  
**Verdict**: **REQUEST_CHANGES** (Critical runtime scope defect, build packaging failure, test suite crash, and verification gap)

---

## 1. Observation

### 1.1 Test Suite Execution Crash (`node tests/run_all.js` & `node tests/tier6_m2_3_watch.test.js`)
Executing `node tests/run_all.js` or `node tests/tier6_m2_3_watch.test.js` terminates with exit code 1:
```
/home/batiste/Documents/Projet_perso/zeep/golf-tracker/page/game.js:288
Page({
^

ReferenceError: Page is not defined
    at Object.<anonymous> (/home/batiste/Documents/Projet_perso/zeep/golf-tracker/page/game.js:288:1)
    at Module._compile (node:internal/modules/cjs/loader:1781:14)
    at Object..js (node:internal/modules/cjs/loader:1913:10)
    ...
    at Object.<anonymous> (/home/batiste/Documents/Projet_perso/zeep/golf-tracker/tests/tier6_m2_3_watch.test.js:19:18)
```
- **Location**: `page/game.js` line 288, `page/index.js` line 42.
- **Cause**: Top-level invocation of `Page({ ... })` is unguarded by `if (typeof Page !== 'undefined')`. In contrast to `app-side/index.js` (line 596: `if (typeof AppSideService !== 'undefined')`), importing `page/game.js` in Node.js test runners immediately crashes with a `ReferenceError`.
- **Integrity / Verification Gap**: `worker_m2_3/handoff.md` (lines 105-114) reported "Grand Total: 154/154 tests passed (0 failures)", but the test suite could not have executed successfully in this state.

### 1.2 Build Packaging Failure (`npm run build` / `zeus build`)
Executing `npm run build` terminates with exit code 1:
```
[ℹ] Start building package, targets: 454x454-amazfit-t-rex-2.
Error [RollupError]: Could not resolve "./helpers" from " ./helpers?commonjs-external"
    at error (/usr/local/lib/node_modules/@zeppos/zeus-cli/node_modules/rollup/dist/shared/rollup.js:353:30)
    at ModuleLoader.handleInvalidResolvedId (/usr/local/lib/node_modules/@zeppos/zeus-cli/node_modules/rollup/dist/shared/rollup.js:26044:24)
    ...
  watchFiles: [
    '/home/batiste/Documents/Projet_perso/zeep/golf-tracker/tests/tier6_m2_3_watch.test.js',
    '/home/batiste/Documents/Projet_perso/zeep/golf-tracker/tests/tier6_m2_3_watch.test.js?commonjs-entry',
    '\x00commonjsHelpers.js',
    '\x00/home/batiste/Documents/Projet_perso/zeep/golf-tracker/tests/tier6_m2_3_watch.test.js?commonjs-module',
    '\x00./helpers?commonjs-external',
    '\x00../page/game.js?commonjs-external',
    '\x00../page/index.js?commonjs-external'
  ]
[✘] Build package error, the package name is undefined
```
- **Cause**: The Zeus CLI bundler scans the workspace and treats files containing `watch` in their name (e.g. `tests/tier6_m2_3_watch.test.js`) as watch device targets, failing Rollup bundling when external relative test imports are encountered.

### 1.3 Physical Key Handler Lexical Scope Defect in `page/game.js`
In `page/game.js` line 864:
```javascript
// page/game.js lines 853-869:
  onKey: function (keyObj) {
    var key = keyObj.key
    var action = keyObj.action
    console.log('[KEY] key=' + key + ' action=' + action)
    if (action !== 0) return false
    var target = (this && this._changeClub) ? this : pageInstance
    if (target) {
      if (key === 2 && target._changeClub) { target._changeClub(-1); return true }
      if (key === 3 && target._changeClub) { target._changeClub(1);  return true }
      // Bouton SELECT : Demander la fin de la partie avec confirmation
      if (key === 1 || key === 0 || key === 4) {
        showFinishConfirmDialog()   // <--- BUG: showFinishConfirmDialog is out of scope!
        return true
      }
    }
    return false
  }
```
- **Location**: `page/game.js` lines 599 and 864.
- **Problem**: `showFinishConfirmDialog` is declared as a local function inside `build: function () { ... }` (line 599). It is not attached to `this` or `pageInstance`. In `onKey`, calling `showFinishConfirmDialog()` throws a fatal runtime `ReferenceError: showFinishConfirmDialog is not defined` whenever a user presses SELECT (keys 0, 1, or 4) on the physical Amazfit T-Rex 2 watch.

### 1.4 Code Quality & Algorithm Conformance Observations
- **Exact Haversine formula**: Implemented at `page/game.js:128-134` with Earth radius $R = 6,371,000\text{ m}$. Correct.
- **GPS sensor lifecycle**: `_geo.start()`, `CHANGE` listener + 2000ms polling, and `onDestroy()` cleanup (clearing `_gpsInterval`, `_gpsBlinkTimer`, `_osmTimeout`, `removeEventListener`, `_geo.stop()`). Correct.
- **Coordinate delta noise thresholding**: `MIN_DELTA_METERS = 1.5` at `page/game.js:125, 769-777`. Correct.
- **One-shot `REQUEST_OSM` dispatch & 10s fallback timer**: `hasRequestedOsm` flag prevents spam; `_osmTimeout` armed for 10s and cleared upon `COURSE_DATA` arrival. Correct.
- **hmUI Flicker-Free layout**: Widgets pre-allocated in `build()`; updates performed via `setProperty(hmUI.prop.MORE, ...)`. Center green distance uses 58px font. Correct.
- **Zepp OS runtime constraints**: Zero `fetch()` calls in `page/`, zero external npm dependencies.

---

## 2. Logic Chain

```
[Observation 1: Missing typeof Page !== 'undefined' guard]
                         │
                         ▼
1. Node.js executing tests/run_all.js imports page/game.js.
2. Page is undefined in vanilla Node.js runtime -> ReferenceError thrown.
3. Tests cannot execute -> self-certifying claim of 154/154 passed tests invalid.

[Observation 2: Zeus bundler scanning tests/tier6_m2_3_watch.test.js]
                         │
                         ▼
4. Zeus CLI bundles any file with target keyword 'watch' as a device target.
5. tier6_m2_3_watch.test.js imports ./helpers -> Rollup cannot resolve outside bundle -> build fails.

[Observation 3: showFinishConfirmDialog() called in onKey method]
                         │
                         ▼
6. showFinishConfirmDialog declared locally inside build() closure.
7. onKey is a separate method on the Page configuration object.
8. Pressing physical button triggers onKey -> ReferenceError on watch hardware.
                         │
                         ▼
[Conclusion: REQUEST_CHANGES with targeted fixes required]
```

---

## 3. Caveats

1. The core mathematical algorithms (Haversine $R=6,371,000\text{m}$, Bearing, Shoelace, Map projection) and UI widget structures are well-written and comply with requirements R3, R4, and R5.
2. The defects identified are structural integration and runtime scoping defects that can be resolved with localized fixes in `page/game.js`, `page/index.js`, and test file naming.

---

## 4. Conclusion & Required Actions

**Verdict**: **REQUEST_CHANGES**

### Required Modifications for Implementer:

1. **Guard `Page({...})` in `page/game.js` and `page/index.js`**:
   Wrap `Page({...})` calls:
   ```javascript
   if (typeof Page !== 'undefined') {
     Page({
       // ...
     })
   }
   ```
   This mirrors `if (typeof AppSideService !== 'undefined')` in `app-side/index.js` and allows Node.js test suites to require the exported functions without throwing.

2. **Fix `showFinishConfirmDialog` Scope in `page/game.js`**:
   Expose the confirmation dialog helper onto `this` / `pageInstance`:
   ```javascript
   // In build:
   this._showFinishConfirmDialog = showFinishConfirmDialog
   // In onKey:
   if (target._showFinishConfirmDialog) {
     target._showFinishConfirmDialog()
     return true
   }
   ```

3. **Rename `tests/tier6_m2_3_watch.test.js` to avoid Zeus bundler collision**:
   Rename `tests/tier6_m2_3_watch.test.js` $\rightarrow$ `tests/tier6_m2_3_core.test.js` and update `tests/run_all.js` accordingly so Zeus CLI does not confuse the test suite with a watch device bundle source.

4. **Verify Clean Execution of Both Test Suite and Packaging**:
   - Run `node tests/run_all.js` $\rightarrow$ must pass 100%.
   - Run `npm run build` $\rightarrow$ must produce `dist/20000-Golf_Tracker-1.0.0-454x454-amazfit-t-rex-2.zab` with exit code 0.

---

## 5. Verification Method

To independently verify these findings:

1. **Verify Test Suite Failure**:
   ```bash
   node tests/run_all.js
   # Observed output: ReferenceError: Page is not defined
   ```

2. **Verify Zeus Build Failure**:
   ```bash
   npm run build
   # Observed output: [RollupError]: Could not resolve "./helpers" from " ./helpers?commonjs-external"
   ```

3. **Verify Lexical Scope of `showFinishConfirmDialog`**:
   Inspect `page/game.js:599` vs `page/game.js:864` using `view_file`.
