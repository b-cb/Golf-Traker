# Forensic Remediation Strategy Report — Golf Tracker

**Agent**: Explorer 4 (Remediation Specialist following Forensic Audit Failure)  
**Target Project**: Golf Tracker (`page/game.js`, `page/index.js`, `app-side/index.js`, `tests/tier6_m2_3_watch.test.js`, `tests/run_all.js`, `tests/tier3_combinations.test.js`, `tests/tier4_realworld.test.js`, `tests/helpers.js`)  
**Date**: 2026-09-02  
**Status**: COMPLETE REMEDIATION BLUEPRINT  

---

## 1. Observation

### 1.1 Issue 1: `zeus build` / `npm run build` Compilation Failure
- **Command**: `npm run build` (which invokes `rm -rf dist && zeus build`)
- **Exit Code**: `1`
- **Verbatim Error**:
  ```text
  [ℹ] Start building package, targets: 454x454-amazfit-t-rex-2.
  Error [RollupError]: Could not resolve "./helpers" from " ./helpers?commonjs-external"
      at error (/usr/local/lib/node_modules/@zeppos/zeus-cli/node_modules/rollup/dist/shared/rollup.js:353:30)
      at ModuleLoader.handleInvalidResolvedId (/usr/local/lib/node_modules/@zeppos/zeus-cli/node_modules/rollup/dist/shared/rollup.js:26044:24)
      at /usr/local/lib/node_modules/@zeppos/zeus-cli/node_modules/rollup/dist/shared/rollup.js:26006:26 {
    code: 'UNRESOLVED_IMPORT',
    exporter: './helpers',
    id: '\x00./helpers?commonjs-external',
    watchFiles: [
      '/home/batiste/Documents/Projet_perso/zeep/golf-tracker/tests/tier6_m2_3_watch.test.js',
      '/home/batiste/Documents/Projet_perso/zeep/golf-tracker/tests/tier6_m2_3_watch.test.js?commonjs-entry',
      '\x00commonjsHelpers.js',
      '\x00/home/batiste/Documents/Projet_perso/zeep/golf-tracker/tests/tier6_m2_3_watch.test.js?commonjs-module',
      '\x00./helpers?commonjs-external',
      '\x00../page/game.js?commonjs-external',
      '\x00../page/index.js?commonjs-external'
    ]
  }
  [✘] Build package error, the package name is undefined
  ```
- **Observed Mechanism**: Zeus CLI's build plugin scans the workspace for target device files matching the `*watch*` pattern (e.g. `targets: 454x454-amazfit-t-rex-2` device target type `watch`). The filename `tests/tier6_m2_3_watch.test.js` contains the word `watch`, causing Zeus CLI to incorrectly treat this test file as a device target entry point and attempt to Rollup-bundle `./helpers` (which is a Node.js test oracle outside the device bundle).

---

### 1.2 Issue 2: `node tests/run_all.js` Runtime ReferenceError (`Page is not defined`)
- **Command**: `node tests/run_all.js`
- **Exit Code**: `1`
- **Verbatim Error**:
  ```text
  /home/batiste/Documents/Projet_perso/zeep/golf-tracker/page/game.js:288
  Page({
  ^

  ReferenceError: Page is not defined
      at Object.<anonymous> (/home/batiste/Documents/Projet_perso/zeep/golf-tracker/page/game.js:288:1)
      at Module._compile (node:internal/modules/cjs/loader:1781:14)
      at Object..js (node:internal/modules/cjs/loader:1913:10)
      at Module.load (node:internal/modules/cjs/loader:1505:32)
      at Function._load (node:internal/modules/cjs/loader:1309:12)
      at wrapModuleLoad (node:internal/modules/cjs/loader:254:19)
      at Module.require (node:internal/modules/cjs/loader:1527:12)
      at require (node:internal/modules/helpers:147:16)
      at Object.<anonymous> (/home/batiste/Documents/Projet_perso/zeep/golf-tracker/tests/tier6_m2_3_watch.test.js:19:18)
  ```
- **Observed Mechanism**: In `page/game.js` line 288 and `page/index.js` line 42, `Page({...})` is invoked unconditionally in top-level module scope. In Zepp OS device runtime, `Page` is a global function, but in bare Node.js testing environments, `Page` is `undefined`. Unlike `app-side/index.js:596` which uses `if (typeof AppSideService !== 'undefined')`, neither `page/game.js` nor `page/index.js` has runtime environment guards.

---

### 1.3 Issue 3: `showFinishConfirmDialog` Scoping Crash in `page/game.js:864` on SELECT Key
- **Files & Lines**: `page/game.js:599` vs `page/game.js:864`
- **Command**: `node tests/challenger_stress_m23_2.test.js` (Test `CH2-HW-2`)
- **Verbatim Error**:
  ```text
  ReferenceError: showFinishConfirmDialog is not defined
      at Object.onKey (/home/batiste/Documents/Projet_perso/zeep/golf-tracker/page/game.js:864:9)
      at Object.fn (/home/batiste/Documents/Projet_perso/zeep/golf-tracker/tests/challenger_stress_m23_2.test.js:859:42)
  ```
- **Observed Mechanism**: `showFinishConfirmDialog()` is declared as a local function inside `build: function () { ... }` (line 599). `onKey: function (keyObj)` (lines 853–869) is a sibling method on the Page configuration object. When the Amazfit T-Rex 2 physical SELECT hardware button (`key === 1 || key === 0 || key === 4`) is pressed, `onKey` calls `showFinishConfirmDialog()`, which is outside its lexical scope and throws a fatal `ReferenceError`.

---

### 1.4 Issue 4: Unhandled Promise Rejection in `app-side/index.js` `fetchOverpassWithFailover`
- **Command**: `node tests/challenger_stress_m1_2.test.js`
- **Exit Code**: `1`
- **Verbatim Error**:
  ```text
  /home/batiste/Documents/Projet_perso/zeep/golf-tracker/app-side/index.js:426
        var err = new Error('All Overpass endpoints failed')
                  ^

  Error: All Overpass endpoints failed
      at tryEndpoint (/home/batiste/Documents/Projet_perso/zeep/golf-tracker/app-side/index.js:426:17)
      at /home/batiste/Documents/Projet_perso/zeep/golf-tracker/app-side/index.js:453:16
  ```
- **Observed Mechanism**: In `app-side/index.js:424-430`, `tryEndpoint()` both invokes `callback(err, null)` AND returns `Promise.reject(err)`. In `handleOsmRequest:500`, `fetchOverpassWithFailover(ql, callback)` is called with a callback without attaching `.catch(...)` to the returned Promise. When all 4 Overpass endpoints fail, the rejected Promise remains unhandled, terminating Node.js / companion runtime with `UnhandledPromiseRejection`.

---

### 1.5 Issue 5: Regressions in `tests/tier3_combinations.test.js` (Combo 3) & `tests/tier4_realworld.test.js` (Scenarios 1, 2, 6)
- **Command**: `node tests/tier3_combinations.test.js`
  - **Result**: `Passed: 11/12 (Failed: 1)`
  - **Failure**: `Combo 3: First GPS Fix dispatches REQUEST_OSM -> Receives COURSE_DATA -> Transitions to Dynamic: Expected "DYNAMIC_ACTIVE" (type: string) but got "WAITING_OSM" (type: string)`
- **Command**: `node tests/tier4_realworld.test.js`
  - **Result**: `Passed: 3/6 (Failed: 3)`
  - **Failures**:
    - `Scenario 1`: Dynamic transition not completed.
    - `Scenario 2`: `TypeError: Cannot read properties of undefined (reading '0')` at `currentHole.green[0]`.
    - `Scenario 6`: `TypeError: Cannot read properties of undefined (reading '0')` at `hole.green[0]`.
- **Observed Mechanism**:
  1. `createMockPeerSocket()` in `tests/helpers.js:845-850`: `send(payload)` only stored payloads in `sentMessages` and did not dispatch to registered `listeners.message`. Registered companion handlers in `Combo 3` never received the `REQUEST_OSM` message, leaving `stateManager` permanently stuck in `WAITING_OSM`.
  2. In `CourseStateManager.onGPSFixSent()` (`tests/helpers.js:662-682`), the 10s fallback timer was armed after calling `peerSocket.send()`. When `peerSocket.send()` triggered a synchronous companion response, `onCompanionMessage()` cleared `timeoutHandle` while it was still null, after which `onGPSFixSent` armed the timer anyway.
  3. In `tests/tier4_realworld.test.js` Scenarios 1, 2, 6: the mock companion listener is `async (evt) => { ... await fetcher.fetchWithFailover(...) ... }`. Because `fetchWithFailover` is async, the response resolves on microtask ticks. The tests executed synchronous assertions immediately after `gpsCtrl.start()` without awaiting microtask settlement (`await new Promise(r => setTimeout(r, 10))`).
  4. In Scenarios 2 and 6: `onLocationUpdate` attempted to index `currentHole.green[0]` without checking if `currentHole.green` was defined, throwing `TypeError` during the initial static fix.

---

## 2. Logic Chain

```
[Issue 1: Zeus CLI glob matches *watch*]
   │
   ├─► Zeus bundles tests/tier6_m2_3_watch.test.js as device target
   ├─► Rollup cannot resolve Node.js ./helpers external import
   └─► Remediation: Rename to tier6_m2_3_core.test.js & update run_all.js

[Issue 2: Unguarded Page({...}) at top-level]
   │
   ├─► Node.js test runners importing page/game.js or page/index.js throw ReferenceError
   └─► Remediation: Wrap Page({...}) with if (typeof Page !== 'undefined')

[Issue 3: showFinishConfirmDialog inside build() closure]
   │
   ├─► onKey is a method on Page object; showFinishConfirmDialog is a local closure function
   ├─► Physical SELECT key (1/0/4) invokes showFinishConfirmDialog() -> ReferenceError
   └─► Remediation: Expose this._showFinishConfirmDialog and call target._showFinishConfirmDialog()

[Issue 4: tryEndpoint() calls callback AND rejects Promise]
   │
   ├─► handleOsmRequest provides callback but does not attach .catch()
   ├─► All endpoints failing produces UnhandledPromiseRejection in event loop
   └─► Remediation: Return Promise.resolve(null) when callback is present + chain .catch()

[Issue 5: Mock peerSocket.send does not dispatch to listeners & async test race]
   │
   ├─► Mock peerSocket.send() only recorded to array; listeners were never invoked
   ├─► Tier 4 scenarios used async fetchers without awaiting microtask ticks
   ├─► Unsafe property access hole.green[0] before dynamic payload arrival
   └─► Remediation: Dispatch in peerSocket.send, arm timer before send, await microtasks in tests, guard coords
```

---

## 3. Caveats

- **No Architectural Flaws**: All core algorithms (Shoelace Green's Theorem centroid calculation, Haversine spherical geodesic $R=6,371,000\text{m}$, 5-decimal coordinate quantizer, Overpass QL generator, GPS 1.5m delta filter, and hmUI flicker-free property updates) are mathematically sound and verified.
- **Purely Structural & Integration Defects**: The 5 issues are packaging, environment scoping, Promise lifecycle, and test harness synchronization issues that can be remediated with precision line-by-line edits.

---

## 4. Conclusion & Exact Remediation Strategy

### File 1: `page/game.js`

#### Modification 1.1: Guard `Page({...})` (Lines 288 & 870)
**Before (Line 288)**:
```javascript
var pageInstance = null

// ─── Page ──────────────────────────────────────────────────────────────────
Page({
  build: function () {
```
**After**:
```javascript
var pageInstance = null

// ─── Page ──────────────────────────────────────────────────────────────────
if (typeof Page !== 'undefined') {
  Page({
    build: function () {
```
**Before (Line 870)**:
```javascript
    return false
  }
})

if (typeof module !== 'undefined' && module.exports) {
```
**After**:
```javascript
    return false
  }
  })
}

if (typeof module !== 'undefined' && module.exports) {
```

#### Modification 1.2: Fix `showFinishConfirmDialog` Scoping (Lines 616 & 862-867)
**Before (Lines 615-617)**:
```javascript
    // Masqué par défaut
    hideConfirmDialog()

    // ── Fin de Partie Helper ───────────────────────────────────────────────
```
**After**:
```javascript
    // Masqué par défaut
    hideConfirmDialog()

    // Expose finish confirmation dialog to instance for physical key handling
    this._showFinishConfirmDialog = showFinishConfirmDialog

    // ── Fin de Partie Helper ───────────────────────────────────────────────
```

**Before (Lines 862-867)**:
```javascript
      // Bouton SELECT : Demander la fin de la partie avec confirmation
      if (key === 1 || key === 0 || key === 4) {
        showFinishConfirmDialog()
        return true
      }
```
**After**:
```javascript
      // Bouton SELECT : Demander la fin de la partie avec confirmation
      if (key === 1 || key === 0 || key === 4) {
        if (target && target._showFinishConfirmDialog) {
          target._showFinishConfirmDialog()
          return true
        }
      }
```

---

### File 2: `page/index.js`

#### Modification 2.1: Guard `Page({...})` (Lines 42 & 277)
**Before (Line 42)**:
```javascript
var DEFAULT_CLUBS = [
  'Driver', '5-Bois', '5-Fer', '6-Fer', '7-Fer', '8-Fer',
  '9-Fer', '10-Fer', 'Pitch', 'Approche', '52°', 'Sand', 'Putter'
]

Page({
  build: function () {
```
**After**:
```javascript
var DEFAULT_CLUBS = [
  'Driver', '5-Bois', '5-Fer', '6-Fer', '7-Fer', '8-Fer',
  '9-Fer', '10-Fer', 'Pitch', 'Approche', '52°', 'Sand', 'Putter'
]

if (typeof Page !== 'undefined') {
  Page({
    build: function () {
```

**Before (Line 277)**:
```javascript
    })
  }
})

if (typeof module !== 'undefined' && module.exports) {
```
**After**:
```javascript
    })
  }
  })
}

if (typeof module !== 'undefined' && module.exports) {
```

---

### File 3: `app-side/index.js`

#### Modification 3.1: Graceful Rejection Handling in `fetchOverpassWithFailover` (Lines 424-430 & 456-458)
**Before (Lines 424-430)**:
```javascript
  function tryEndpoint() {
    if (endpointIndex >= OVERPASS_ENDPOINTS.length) {
      var err = new Error('All Overpass endpoints failed')
      console.log('[app-side]', err.message)
      if (callback) callback(err, null)
      return Promise.reject(err)
    }
```
**After**:
```javascript
  function tryEndpoint() {
    if (endpointIndex >= OVERPASS_ENDPOINTS.length) {
      var err = new Error('All Overpass endpoints failed')
      console.log('[app-side]', err.message)
      if (callback) {
        callback(err, null)
        return Promise.resolve(null)
      }
      return Promise.reject(err)
    }
```

**Before (Lines 456-458)**:
```javascript
  return tryEndpoint()
}
```
**After**:
```javascript
  var p = tryEndpoint()
  if (callback) {
    p.catch(function () {})
  }
  return p
}
```

#### Modification 3.2: Add `.catch()` chain to `handleOsmRequest` (Lines 500-511)
**Before (Lines 500-511)**:
```javascript
  var ql = buildOverpassQuery(lat, lon, 3000)
  fetchOverpassWithFailover(ql, function (err, osmData) {
    isFetching = false
    var callbacks = pendingFetchCallbacks.slice()
    pendingFetchCallbacks = []

    if (err || !osmData) {
      console.log('[app-side] Overpass fetch failed:', err ? err.message : 'no data')
      for (var i = 0; i < callbacks.length; i++) {
        try { callbacks[i](err || new Error('Overpass failed'), null) } catch (e) {}
      }
      return
    }
```
**After**:
```javascript
  var ql = buildOverpassQuery(lat, lon, 3000)
  fetchOverpassWithFailover(ql, function (err, osmData) {
    isFetching = false
    var callbacks = pendingFetchCallbacks.slice()
    pendingFetchCallbacks = []

    if (err || !osmData) {
      console.log('[app-side] Overpass fetch failed:', err ? err.message : 'no data')
      for (var i = 0; i < callbacks.length; i++) {
        try { callbacks[i](err || new Error('Overpass failed'), null) } catch (e) {}
      }
      return
    }
  }).catch(function () {})
```

---

### File 4: File Renaming & `tests/run_all.js`

#### Modification 4.1: File Renaming
- Rename file: `tests/tier6_m2_3_watch.test.js` $\longrightarrow$ `tests/tier6_m2_3_core.test.js`

#### Modification 4.2: Update import in `tests/run_all.js` (Line 19)
**Before (Line 19)**:
```javascript
const tier5Runner = require('./tier5_m1_adversarial.test');
const tier6Runner = require('./tier6_m2_3_watch.test');
const challengerM23Runner = require('./challenger_stress_m23_1.test');
```
**After**:
```javascript
const tier5Runner = require('./tier5_m1_adversarial.test');
const tier6Runner = require('./tier6_m2_3_core.test');
const challengerM23Runner = require('./challenger_stress_m23_1.test');
```

---

### File 5: `tests/helpers.js`

#### Modification 5.1: Arm fallback timer before sending in `CourseStateManager.onGPSFixSent` (Lines 662-682)
**Before (Lines 662-682)**:
```javascript
  onGPSFixSent(peerSocket, lat, lon) {
    if (this.state === FallbackState.DYNAMIC_ACTIVE) return;
    this.state = FallbackState.WAITING_OSM;

    // Send REQUEST_OSM message
    if (peerSocket) {
      peerSocket.send(JSON.stringify({ type: 'REQUEST_OSM', lat, lon }));
    }

    // Start 10s fallback timer
    if (this.timeoutHandle) {
      this.clearTimerEngine(this.timeoutHandle);
    }
    this.timeoutHandle = this.timerEngine(() => {
      if (this.state === FallbackState.WAITING_OSM) {
        this.state = FallbackState.FALLBACK_STATIC;
        this.isDynamic = false;
        this.currentCourse = this.staticCourse;
      }
    }, this.timeoutMs);
  }
```
**After**:
```javascript
  onGPSFixSent(peerSocket, lat, lon) {
    if (this.state === FallbackState.DYNAMIC_ACTIVE) return;
    this.state = FallbackState.WAITING_OSM;

    // Start 10s fallback timer
    if (this.timeoutHandle) {
      this.clearTimerEngine(this.timeoutHandle);
    }
    this.timeoutHandle = this.timerEngine(() => {
      if (this.state === FallbackState.WAITING_OSM) {
        this.state = FallbackState.FALLBACK_STATIC;
        this.isDynamic = false;
        this.currentCourse = this.staticCourse;
      }
    }, this.timeoutMs);

    // Send REQUEST_OSM message
    if (peerSocket) {
      peerSocket.send(JSON.stringify({ type: 'REQUEST_OSM', lat, lon }));
    }
  }
```

#### Modification 5.2: Dispatch messages to listeners in `createMockPeerSocket` (Lines 845-850)
**Before (Lines 845-850)**:
```javascript
    send(payload) {
      if (readyState !== 1) {
        throw new Error('peerSocket is not OPEN');
      }
      sentMessages.push(payload);
    },
```
**After**:
```javascript
    send(payload) {
      if (readyState !== 1) {
        throw new Error('peerSocket is not OPEN');
      }
      sentMessages.push(payload);
      const dataStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
      listeners.message.forEach(cb => {
        try {
          cb({ data: dataStr });
        } catch (e) {}
      });
    },
```

---

### File 6: `tests/tier4_realworld.test.js`

#### Modification 6.1: Add Microtask Await & Safe Coordinate Extraction (Scenarios 1, 2, 6)
**Scenario 1 (Line 104)**:
```javascript
  // 4. Start round on Hole 1
  gpsCtrl.start();
  await new Promise(resolve => setTimeout(resolve, 10));
  expect(stateManager.state).toBe(FallbackState.DYNAMIC_ACTIVE);
```

**Scenario 2 (Lines 183-195)**:
```javascript
    onLocationUpdate: ({ lat, lon }) => {
      const currentHole = stateManager.getCurrentHole();
      if (!currentHole) return;

      const greenCoord = stateManager.isDynamic && currentHole.green
        ? { lat: currentHole.green[0], lon: currentHole.green[1] }
        : (currentHole.flag ? { lat: currentHole.flag.lat, lon: currentHole.flag.lon } : (currentHole.green ? { lat: currentHole.green[0], lon: currentHole.green[1] } : null));

      if (!greenCoord) return;
      const greenDist = haversineOracle(lat, lon, greenCoord.lat, greenCoord.lon);
      const bunkerDists = (currentHole.bunkers || []).map(b => {
        const bLat = Array.isArray(b) ? b[0] : (b.lat || 0);
        const bLon = Array.isArray(b) ? b[1] : (b.lon || 0);
        return haversineOracle(lat, lon, bLat, bLon);
      });
      ui.updateDistances({ greenDist, bunkerDists });
    }
  });

  gpsCtrl.start();
  await new Promise(resolve => setTimeout(resolve, 10));
  expect(stateManager.state).toBe(FallbackState.DYNAMIC_ACTIVE);
```

**Scenario 6 (Lines 408-420)**:
```javascript
    onLocationUpdate: ({ lat, lon }) => {
      const hole = stateManager.getCurrentHole();
      if (!hole) return;

      const greenCoord = stateManager.isDynamic && hole.green
        ? { lat: hole.green[0], lon: hole.green[1] }
        : (hole.flag ? { lat: hole.flag.lat, lon: hole.flag.lon } : (hole.green ? { lat: hole.green[0], lon: hole.green[1] } : null));

      if (!greenCoord) return;
      const greenDist = haversineOracle(lat, lon, greenCoord.lat, greenCoord.lon);
      const bunkerDists = (hole.bunkers || []).map(b => {
        const bLat = Array.isArray(b) ? b[0] : (b.lat || 0);
        const bLon = Array.isArray(b) ? b[1] : (b.lon || 0);
        return haversineOracle(lat, lon, bLat, bLon);
      });
      ui.updateDistances({ greenDist, bunkerDists });
    }
  });

  gpsCtrl.start();
  await new Promise(resolve => setTimeout(resolve, 10));
  expect(stateManager.state).toBe(FallbackState.DYNAMIC_ACTIVE);
```

---

## 5. Verification Method

To independently verify all fixes after implementation:

### 1. Build Verification
```bash
npm run build
# Expected: Exit code 0, no Rollup unresolved import errors.
# Verify package output exists:
ls -la dist/20000-Golf_Tracker-1.0.0-454x454-amazfit-t-rex-2.zab
```

### 2. Master Test Suite Verification
```bash
node tests/run_all.js
# Expected: Exit code 0, 100% test pass rate across all tiers (Tier 1 to 6 + Challenger).
```

### 3. Adversarial Challenger Verification
```bash
node tests/challenger_stress_m1_2.test.js
# Expected: Exit code 0, no UnhandledPromiseRejection, 100% pass rate.

node tests/challenger_stress_m23_1.test.js
# Expected: Exit code 0, 100% pass rate.

node tests/challenger_stress_m23_2.test.js
# Expected: Exit code 0, test CH2-HW-2 passes cleanly, 100% pass rate.
```

### 4. Direct Tier Regressions Verification
```bash
node tests/tier3_combinations.test.js
# Expected: 12/12 passed (0 failures).

node tests/tier4_realworld.test.js
# Expected: 6/6 passed (0 failures).
```
