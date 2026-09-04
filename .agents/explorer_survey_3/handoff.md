# Zepp OS Architecture, UI/Sensor & Protocol Report (R3, R4, R5)

## 1. Observation

### 1.1 Target Device & Platform Context
- **Target Device**: Amazfit T-Rex 2 (`454x454-amazfit-t-rex-2`), circular AMOLED display (454x454 px, radius = 227 px, center at $(227, 227)$).
- **Target Platform IDs**: Teide (`deviceSource: 418`), Teidew (`deviceSource: 419`) declared in `app.json` (lines 41-50).
- **Runtime Environment**: Zepp OS 1.0 (API Level 1.0.0/1.0.1) running JerryScript / QuickJS engine.
- **Build System**: Zeus CLI v1.9.1. Verified working build command `zeus build` producing `dist/20000-Golf_Tracker-1.0.0-*.zab`.

### 1.2 Existing Codebase Observations

#### `app.json` (60 lines)
- **Permissions** (line 15-17): `"permissions": ["data:user.hd.location"]` is correctly declared.
- **Modules** (line 27-40):
  - `page`: `["page/index", "page/game"]`
  - `app-side`: `path: "app-side/index"`
  - `setting`: `path: "setting/index"`

#### `page/game.js` (576 lines)
- **Sensor API** (lines 506-531):
  ```javascript
  var geo = hmSensor.createSensor(hmSensor.id.GEOLOCATION)
  geo.addEventListener(hmSensor.event.CHANGE, updateGPS)
  setInterval(updateGPS, 2000)
  geo.start()
  ```
  - Observation: Sensor is started in `build()`, but never explicitly stopped (`geo.stop()`) on page teardown/destroy, which risks battery drain.
  - Observation: `updateGPS` has basic delta check `(state.lat !== lat || state.lon !== lon)` without numerical drift threshold (GPS jitter of 1-2m triggers re-renders).
  - Observation: No startup trigger sending `{ type: 'REQUEST_OSM', lat, lon }` to the companion app upon initial GPS fix.
- **Haversine Implementation** (lines 31-37):
  ```javascript
  function haversineDistance(lat1, lon1, lat2, lon2) {
    var R = 6371000, rad = Math.PI / 180
    var dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad
    var sinLat = Math.sin(dLat / 2), sinLon = Math.sin(dLon / 2)
    var a = sinLat * sinLat + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * sinLon * sinLon
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
  }
  ```
  - Observation: Mathematical implementation is exact ($R=6,371,000\text{ m}$, `atan2(sqrt(a), sqrt(1-a))`).
- **UI Architecture & Layout** (lines 137-237):
  - Current layout uses split-screen: left 227px for distances/club, right 227px for static satellite map PNG.
  - No list display for bunkers/obstacles (sand traps, water hazards).
  - Main flag distance `txtDistFlag` (text_size 58) and green entry distance `txtDistGreen` (text_size 26) are updated in-place with `widget.setProperty(hmUI.prop.MORE, ...)`.
- **Defect in Static Course** (line 19):
  - Line 19 contains duplicate inline hole definition for Hole 3.

#### `app-side/index.js` (253 lines)
- **Messaging Transport** (lines 10-36):
  - Uses `messaging.peerSocket` with `safeSend(payloadObj, onSuccess, onError)` checking `messaging.peerSocket.OPEN`.
- **OSM Query & Parsing** (lines 106-200):
  - Overpass query is currently triggered only by manual settings change (`searchTrigger`).
  - No listener for `{ type: 'REQUEST_OSM', lat, lon }`.
  - No coordinate centroid calculation for bunkers or multi-point polygons.

---

## 2. Logic Chain

```
[Requirement R5: Watch sends REQUEST_OSM on first GPS fix]
                       │
                       ▼
Observation: page/game.js receives GPS fix but lacks outgoing REQUEST_OSM trigger.
                       │
                       ▼
Inference: A one-shot flag (e.g. hasRequestedOsm) must guard the first valid GPS fix,
dispatching { type: 'REQUEST_OSM', lat: lat, lon: lon } over messaging.peerSocket.

                       │
                       ▼
[Requirement R3: Dynamic Switch & game.js Silent Fallback]
                       │
                       ▼
Observation: If phone is disconnected, network fails, or timeout occurs, user is on course.
                       │
                       ▼
Inference: State machine must initialize with GAME_COURSES (static), request OSM with
a 10-second timeout, and seamlessly replace state.course if OSM_DATA arrives; otherwise
silently remain on static course with zero UI disruption.

                       │
                       ▼
[Requirement R4: hmUI Prominent Green Distance + Bunker List on 454x454 Round Screen]
                       │
                       ▼
Observation: T-Rex 2 454x454 round screen requires strict circular chord bounds.
Dynamic creation of widgets inside GPS callback causes visual flickering & heap leaks.
                       │
                       ▼
Inference: Pre-instantiate static widget pool in build(). Update text & visibility
in-place via widget.setProperty(hmUI.prop.MORE, ...). Prioritize central Green distance
(text_size 64+) followed by a structured 2-3 row obstacle list (text_size 15-18).
```

---

## 3. Detailed Architectural Specifications

### 3.1 Zepp OS Native Sensor Architecture (`@zos/sensor` / `hmSensor` Geolocation)

#### 1. Compatibility Layer
To ensure universal support across Zepp OS 1.0 (device target) and future API updates:
```javascript
// page/game.js
var geoSensor = null
if (typeof hmSensor !== 'undefined' && hmSensor.createSensor && hmSensor.id && hmSensor.id.GEOLOCATION) {
  geoSensor = hmSensor.createSensor(hmSensor.id.GEOLOCATION)
}
```

#### 2. Strict Lifecycle Management
```javascript
Page({
  build: function () {
    var self = this
    // 1. Instantiation & Listeners
    if (geoSensor) {
      this._onGpsChange = function () {
        self._handleGpsUpdate(geoSensor.latitude, geoSensor.longitude)
      }
      geoSensor.addEventListener(hmSensor.event.CHANGE, this._onGpsChange)
      
      // Backup polling interval (2000ms) to ensure responsiveness
      this._gpsInterval = setInterval(function () {
        if (geoSensor && geoSensor.latitude && geoSensor.longitude) {
          self._handleGpsUpdate(geoSensor.latitude, geoSensor.longitude)
        }
      }, 2000)
      
      geoSensor.start()
    }
  },
  
  onDestroy: function () {
    // 2. Teardown: Stop sensor & clear intervals to eliminate battery drain
    if (this._gpsInterval) {
      clearInterval(this._gpsInterval)
      this._gpsInterval = null
    }
    if (geoSensor) {
      if (this._onGpsChange) {
        geoSensor.removeEventListener(hmSensor.event.CHANGE, this._onGpsChange)
      }
      geoSensor.stop()
    }
  }
})
```

#### 3. Coordinate Delta & Noise Filtering
```javascript
var MIN_DELTA_METERS = 1.5 // Ignore GPS drift < 1.5m

function isValidCoordinate(lat, lon) {
  return lat !== null && lon !== null &&
         typeof lat === 'number' && typeof lon === 'number' &&
         !isNaN(lat) && !isNaN(lon) &&
         (lat !== 0 || lon !== 0) &&
         lat >= -90 && lat <= 90 &&
         lon >= -180 && lon <= 180
}

function shouldRecalculate(prevLat, prevLon, newLat, newLon) {
  if (prevLat === null || prevLon === null) return true
  var d = haversineDistance(prevLat, prevLon, newLat, newLon)
  return d >= MIN_DELTA_METERS
}
```

---

### 3.2 Bidirectional Messaging Protocol (`messaging.peerSocket`)

#### Watch $\leftrightarrow$ Phone Protocol Specifications:

```
[ Watch (page/game.js) ]                      [ Phone Companion (app-side/index.js) ]
          │                                                    │
          │ ──── 1. { type: 'REQUEST_OSM', lat, lon } ───────> │
          │                                                    │ (Queries Overpass API)
          │                                                    │ (Converts polygons to centroids)
          │                                                    │ (Ensures payload < 2 KB)
          │ <─── 2. { type: 'OSM_DATA', course: {...} } ───── │
          │                                                    │
          │ ──── 3. { type: 'ROUND_COMPLETE', round } ───────> │
          │                                                    │ (Posts to Webhook)
```

#### Watch Safe Send Implementation:
```javascript
function sendWatchMessage(msgObj) {
  try {
    var str = JSON.stringify(msgObj)
    if (typeof messaging !== 'undefined' && messaging.peerSocket) {
      if (messaging.peerSocket.readyState === messaging.peerSocket.OPEN) {
        messaging.peerSocket.send(str)
      } else {
        var onOpen = function () {
          if (messaging.peerSocket.removeEventListener) {
            messaging.peerSocket.removeEventListener('open', onOpen)
          }
          messaging.peerSocket.send(str)
        }
        messaging.peerSocket.addEventListener('open', onOpen)
      }
    }
  } catch (e) {
    console.log('[WATCH_MSG_ERR]', e)
  }
}
```

---

### 3.3 Haversine Distance & Bearing Mathematics

#### Exact Formula ($R = 6,371,000\text{ m}$):
$$\Delta\phi = (\text{lat}_2 - \text{lat}_1) \cdot \frac{\pi}{180}$$
$$\Delta\lambda = (\text{lon}_2 - \text{lon}_1) \cdot \frac{\pi}{180}$$
$$a = \sin^2\left(\frac{\Delta\phi}{2}\right) + \cos\left(\text{lat}_1 \cdot \frac{\pi}{180}\right) \cos\left(\text{lat}_2 \cdot \frac{\pi}{180}\right) \sin^2\left(\frac{\Delta\lambda}{2}\right)$$
$$d = 2 R \cdot \operatorname{atan2}\left(\sqrt{a}, \sqrt{1-a}\right)$$

```javascript
function haversineDistance(lat1, lon1, lat2, lon2) {
  var R = 6371000
  var rad = Math.PI / 180
  var dLat = (lat2 - lat1) * rad
  var dLon = (lon2 - lon1) * rad
  var sinLat = Math.sin(dLat / 2)
  var sinLon = Math.sin(dLon / 2)
  var a = sinLat * sinLat + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * sinLon * sinLon
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

function calculateBearing(lat1, lon1, lat2, lon2) {
  var rad = Math.PI / 180
  var dLon = (lon2 - lon1) * rad
  var lat1r = lat1 * rad
  var lat2r = lat2 * rad
  var x = Math.sin(dLon) * Math.cos(lat2r)
  var y = Math.cos(lat1r) * Math.sin(lat2r) - Math.sin(lat1r) * Math.cos(lat2r) * Math.cos(dLon)
  return ((Math.atan2(x, y) * 180 / Math.PI) + 360) % 360
}
```

---

### 3.4 hmUI Widget Hierarchy & 454x454 Round Layout (Requirement R4)

#### Visual Hierarchy on 454x454 Round Display:
```
               ┌───────────────────────┐
               │    #1 Par 4  [<  >]   │  y=25-60  (Hole Header)
               ├───────────────────────┤
               │      FLAG / GREEN     │  y=65-85  (Label)
               │                       │
               │         148 m         │  y=85-155 (Big Green Distance: 64px)
               │                       │
               │  Entrée: 135m | 162m  │  y=155-180 (Sub-Green Distances)
               ├───────────────────────┤
               │ ┌───────────────────┐ │  y=185-275 (Obstacles / Bunker Card)
               │ │ 🏖️ Bunker G : 112m │ │
               │ │ 🏖️ Bunker D : 130m │ │
               │ │ 💧 Obstacle  : 175m │ │
               │ └───────────────────┘ │
               ├───────────────────────┤
               │ [< 7-Fer >]  [+ Coup] │  y=285-335 (Club Selector & Shot Record)
               ├───────────────────────┤
               │  GPS OK · OSM Dyn     │  y=350-380 (Status / Mode Indicator)
               └───────────────────────┘
```

#### Flicker-Free UI Strategy:
1. **Pre-instantiation**: Create all background shapes, text widgets, obstacle rows, and buttons once in `build()`.
2. **Fixed Obstacle Widget Pool**: Pre-create 3 obstacle label widgets (`txtObstacle0`, `txtObstacle1`, `txtObstacle2`).
3. **In-place updates**: In `refreshDistances()`, calculate distances and call `widget.setProperty(hmUI.prop.MORE, { text: ... })`. If a hole has fewer obstacles, update with `{ text: '' }`.

---

### 3.5 Fallback State Machine & Dynamic OSM Transition (Requirement R3)

```
                     ┌──────────────┐
                     │   APP INIT   │
                     └──────┬───────┘
                            │ Load static course (game.js)
                            ▼
                     ┌──────────────┐
                     │ WAITING_GPS  │
                     └──────┬───────┘
                            │ Valid fix acquired (lat, lon != 0)
                            ▼
                     ┌──────────────┐
                     │ REQUEST_OSM  │ ── Start 10s Timer
                     └──────┬───────┘
            ┌───────────────┴───────────────┐
            ▼                               ▼
    [ OSM_DATA Received ]          [ Timeout / Network Error ]
            │                               │
            ▼                               ▼
  ┌───────────────────┐           ┌───────────────────┐
  │   DYNAMIC_OSM     │           │  FALLBACK_STATIC  │
  │ - Course replaced │           │ - Keep game.js    │
  │ - Obstacles loaded│           │ - Silent failover │
  │ - State persisted │           │ - Refresh UI      │
  └───────────────────┘           └───────────────────┘
```

---

### 3.6 ES6 Zepp OS & JerryScript Native Constraints

| Domain | Allowed | Strictly Prohibited |
|---|---|---|
| `page/` runtime | ES6 syntax (`const`, `let`, arrow functions transpiled by Zeus), `hmUI`, `hmSensor`, `hmStorage`, `hmApp`, `messaging` | `fetch()`, `XMLHttpRequest`, `WebSocket`, external NPM packages, DOM APIs |
| `app-side/` runtime | `fetch()`, `setTimeout`, `setInterval`, `settingsStorage`, `messaging.peerSocket` | Watch UI widgets (`hmUI`), watch hardware sensors |
| Message Size | Compressed JSON arrays $< 2\text{ KB}$ | Large GeoJSON features, unreduced polygons |

---

## 4. Caveats

1. **GNSS Cold Start Time**: On a cold start outdoors, the Amazfit T-Rex 2 GPS fix may take 15 to 45 seconds. The UI must immediately display static course data and animate the GPS status indicator (`GPS .`, `GPS ..`, `GPS OK`) without blocking user interaction.
2. **Bluetooth Connection Latency**: If the watch is disconnected from the Zepp companion app, `safeSend` queues the request until reconnect or triggers fallback upon timeout.
3. **Overpass API Response Latency**: Overpass queries typically take 800ms to 2500ms over mobile data. A 10-second timeout ensures ample leeway while preventing permanent pending state.

---

## 5. Conclusion & Actionable Blueprints

The architecture satisfies all constraints for R3, R4, and R5:
1. **Sensor (R3)**: Native Geolocation lifecycle with `geo.stop()` in `onDestroy()`, $1.5\text{m}$ delta thresholding, and backup polling.
2. **UI (R4)**: Prominent 64px central Green distance, dedicated 3-row obstacle list for bunkers/hazards, zero widget allocations in loop for 100% flicker-free rendering.
3. **Protocol (R5)**: Auto-trigger `{ type: 'REQUEST_OSM', lat, lon }` on first fix, paired with robust 10s silent fallback to `game.js`.

---

## 6. Verification Method

To independently verify the implementation:

1. **Compilation & Packaging**:
   ```bash
   cd /home/batiste/Documents/Projet_perso/zeep/golf-tracker
   rm -rf dist
   zeus build
   ```
   *Expected Result*: Build completes with code 0 and produces `.zab` package in `dist/`.

2. **Syntax & Rule Validation**:
   - Inspect `page/game.js` to ensure no `fetch` or third-party npm imports exist.
   - Inspect `app-side/index.js` to ensure `REQUEST_OSM` handler exists and payload is $<2\text{ KB}$.

3. **Deploy to Physical Watch**:
   ```bash
   zeus preview
   ```
   *Expected Result*: Zeus outputs a QR code for deployment onto Amazfit T-Rex 2.
