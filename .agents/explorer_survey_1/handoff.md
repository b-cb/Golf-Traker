# Codebase Structure Survey & Architecture Report

## 1. Observation

### Codebase Inventory & Paths
- **Project Root**: `/home/batiste/Documents/Projet_perso/zeep/golf-tracker`
- **Config & Build**:
  - `app.json`: Config version `v2`, appId `20000`, target `454x454-amazfit-t-rex-2` (deviceSource 418/419 - T-Rex 2 / T-Rex 2 Wild), runtime API version compatible `1.0.0`, target `1.0.1`. Declares permission `"data:user.hd.location"`. Pages: `page/index`, `page/game`. App-side: `app-side/index`. Setting: `setting/index`.
  - `package.json`: Main `app.js`, scripts: `dev`, `build` (`rm -rf dist && zeus build`), `clean`, `fetch-maps`, `preview`. DevDependencies: `@zeppos/device-types`.
  - `jsconfig.json`: Module `commonjs`, target `es6`, references `@zeppos/device-types/index.d.ts`.
- **Runtime Environment**:
  - Zepp OS 1.0 (JerryScript / QuickJS engine), screen resolution 454x454 circular.
  - Native global namespaces available: `hmUI`, `hmSensor`, `hmStorage`, `hmApp`, `messaging`.
  - Verified build: `zeus build` completes with code 0 (`[ROLLUP] Transform 5 JS files`, `[PNG2TGA] Converting PNG files`, `[QJSC] Compiling JS files`).

### Detailed File Analysis

#### `page/game.js` (576 lines)
- **Static Course Data (`GAME_COURSES`)**:
  - Currently contains `Golf de Luchon` (par 33).
  - Hole structure:
    ```javascript
    {
      par: 4,
      tee: { lat: 42.791202, lon: 0.601721 },
      greenEntry: { lat: 42.788392, lon: 0.601717 },
      flag: { lat: 42.788272, lon: 0.601729 },
      map: {
        src: 'luchon_01.png',
        bounds: { topLat: 42.791254, bottomLat: 42.787938, leftLon: 0.601439, rightLon: 0.602214 }
      }
    }
    ```
  - **Defect observed on Line 19**: Duplicate hole object definition for Hole 3:
    `{ par: 3, tee: null, greenEntry: { lat: 42.7942, lon: 0.6018 }, flag: { lat: 42.7943, lon: 0.6019 }, map: { src: 'luchon_03.png', ... } },{ par: 3, ... }`
  - **Obstacle/Bunker Data**: Not currently present in `GAME_COURSES`.
- **Math / Calculations**:
  - `haversineDistance(lat1, lon1, lat2, lon2)` (lines 31-37): Mathematically accurate using $R = 6,371,000$ m and $\sin^2(\Delta\text{lat}/2) + \cos\dots$.
  - `calculateBearing(lat1, lon1, lat2, lon2)` (lines 40-47): Computes azimuth angle for map orientation.
- **GPS & Sensor Management**:
  - Uses `hmSensor.createSensor(hmSensor.id.GEOLOCATION)` (lines 506-531).
  - Listens to `hmSensor.event.CHANGE` and runs backup polling timer.
  - Updates distances and player position on map when coords change.
- **Messaging (Watch)**:
  - Listens for `COURSE_DATA` messages from mobile (lines 477-503).
  - Does **not** currently send `{ type: 'REQUEST_OSM', lat, lon }` on startup/first GPS fix.
- **UI Components (hmUI)**:
  - Split screen layout: Left half ($x \in [0, 227]$) has Par `#1 Par 4`, Flag distance (`txtDistFlag`, text_size 58), Green entrance distance (`txtDistGreen`, text_size 26), Club selector pill, Shot count, GPS status.
  - Right half ($x \in [229, 454]$) has satellite map image (`hmUI.widget.IMG`), flag icon (`🚩`), player position dot (`FILL_RECT` 14x14 red), and shot record button (`+`).
  - Lacks list display for bunker/obstacle distances.

#### `page/index.js` (277 lines)
- Home / Course selector page.
- Lists hardcoded courses (`Golf de Luchon`, `Golf du Totche`) and loads `receivedCourse` from `hmStorage` (`golfState`).
- Displays bag clubs from storage.
- Modal for score history (`golfHistory`).
- Click on course card saves state to `hmStorage.setItem('golfState', ...)` and navigates to `page/game`.

#### `app-side/index.js` (253 lines)
- Companion service running on the mobile phone.
- Uses `messaging.peerSocket` with helper `safeSend(payloadObj, onSuccess, onError)` (lines 10-36).
- `searchCourseOnOSM(rawName, callback)` (lines 106-140):
  - Current query:
    ```
    [out:json][timeout:30];
    area["leisure"="golf_course"]["name"~"<name>",i]->.c;
    (way["golf"="hole"](area.c);node["golf"="hole"](area.c););
    out geom;
    ```
  - Only triggered when mobile settings change (`searchTrigger`).
  - Does not currently support GPS radius query (`around:3000, lat, lon`).
  - Does not query `golf=green`, `golf=bunker`, `golf=tee`.
- `parseCourseFromOSM(osmData, courseName)` (lines 40-102):
  - Parses `golf=hole` ways and nodes to extract bounding boxes, `flag` (last point of way) and `greenEntry`.
  - Does not compute polygon centroids for greens/bunkers/tees.
- Listens to `messaging.peerSocket` for `ROUND_COMPLETE` and posts to `webhookUrl`.

#### `setting/index.js` (106 lines)
- Phone settings page built with `AppSettingsPage({ build: ... })`.
- Offers course dropdown (`COURSE_PRESETS`), club toggles (`ALL_CLUBS`), and webhook input URL.

#### `scripts/fetch_ign_maps.py` (175 lines) & `assets/`
- Python utility fetching IGN French Orthophotos via WMS, rotating based on tee-flag bearing, cropping to 225x454, and saving to `assets/454x454-amazfit-t-rex-2/`.

---

## 2. Logic Chain

1. **Requirement Comparison (R1 - R5 vs Existing Code)**:
   - **R1 (OSM Overpass query around GPS coords)**:
     - *Requirement*: On app launch, phone app-side queries Overpass for `leisure=golf_course`, `golf=hole`, `golf=green`, `golf=bunker`, `golf=tee` within 3000m around initial watch GPS coords; triggered once per session.
     - *Observation*: `app-side/index.js` only has name-based regex search over area. No handler for GPS `REQUEST_OSM` message.
     - *Inference*: `app-side/index.js` needs a dedicated listener for `REQUEST_OSM` event containing `{ type: 'REQUEST_OSM', lat, lon }`, constructing an Overpass query with `(around:3000, lat, lon)`.
   - **R2 (Data simplification & payload size < 2 KB)**:
     - *Requirement*: Simplify raw OSM geometries to lat/lon centroids, strip all metadata, send compact coordinate tables < 2 KB.
     - *Observation*: `parseCourseFromOSM` in `app-side/index.js` handles way geometries but retains bounds/map properties and doesn't extract bunkers/tees centroids.
     - *Inference*: Polygon vertices for green, bunkers, tees must be averaged into single centroid `(lat, lon)`. Holes should be grouped with `green: {lat, lon}`, `bunkers: [{lat, lon}]`, `tees: {lat, lon}`. Compact field naming ensures payload stays well below 2 KB even for 18-hole courses.
   - **R3 (Watch reception, fallback & Haversine calculation)**:
     - *Requirement*: Watch reads GPS, requests OSM upon first fix, switches to dynamic mode on reception, silently retains static `game.js` on failure/timeout, calculates distances via exact Haversine.
     - *Observation*: `page/game.js` already has exact Haversine and GPS sensor polling/event listener. However, watch never sends `REQUEST_OSM` on first fix, and fallback flow is partially coupled to `loadState`.
     - *Inference*: When `geo` gets its first valid GPS fix (`lat, lon`), watch should check if an OSM request was already sent in this session; if not, send `{ type: 'REQUEST_OSM', lat, lon }`. If response comes within timeout window, update `state.course` and refresh UI; otherwise continue seamlessly with `GAME_COURSES` static data.
   - **R4 (Watch UI & hmUI bunker display)**:
     - *Requirement*: Distance to green in large font at center; distances to bunkers/obstacles in smaller font in list; dynamic updates on GPS callback without flicker.
     - *Observation*: `page/game.js` currently displays green flag and green entry in left pane, but has no widgets for bunker distances.
     - *Inference*: UI layout in `page/game.js` must incorporate dynamic bunker distance widgets (e.g. `B1: 120m, B2: 145m` or compact list) updated inside `calcDistances()` and `refreshUI()`.
   - **R5 (Bidirectional Communication Protocol)**:
     - *Requirement*: Watch sends `{ type: 'REQUEST_OSM', lat, lon }` -> Phone queries Overpass -> Phone replies with structured JSON -> Watch updates or catches error silently.
     - *Observation*: `messaging.peerSocket` is configured on both sides but only handles `COURSE_DATA` and `ROUND_COMPLETE`.
     - *Inference*: The protocol message types and data schema must be unified across `page/game.js` and `app-side/index.js`.

2. **Codebase Quality & Bug Fixes Needed**:
   - `page/game.js` line 19 contains duplicate Hole 3 definition, corrupting hole count from 9 to 10.
   - `GAME_COURSES` in `game.js` needs fallback bunker coordinates for default courses to ensure consistent UI display in static mode.

---

## 3. Caveats

- **Network Mode & Overpass Availability**: Overpass API (`overpass-api.de`) may experience rate limiting or transient latency (>5s). The companion app-side must set a reasonable timeout (e.g. 15-20s) and fallback gracefully.
- **GPS Fix Time**: In outdoor real-device usage, initial GPS fix on the T-Rex 2 may take 5–30 seconds. The watch must immediately display static data and send `REQUEST_OSM` as soon as the first valid fix arrives.
- **Simulator vs Physical Device**: `zeus preview` / QR code deployment to Amazfit T-Rex 2 is supported without requiring a local GUI simulator.
- **Zepp OS 1.0 vs ES6 Imports**: On Zepp OS 1.0 (target 1.0.1 on Amazfit T-Rex 2), global APIs (`hmUI`, `hmSensor`, `hmStorage`, `messaging`) are standard and fully functional. Standard JS functions and objects must remain ES5/ES6 compatible without external NPM dependencies.

---

## 4. Conclusion

The existing codebase provides a solid foundation with working build tooling (`zeus build`), GPS sensor integration (`hmSensor.GEOLOCATION`), Haversine math, and companion messaging plumbing (`safeSend`). 

To fulfill R1–R5, the required adaptations are:
1. **`app-side/index.js`**: Implement `REQUEST_OSM` handler with 3000m radius Overpass query `[out:json][timeout:25];(way["leisure"="golf_course"](around:3000,lat,lon);relation["leisure"="golf_course"](around:3000,lat,lon);way["golf"~"hole|green|bunker|tee"](around:3000,lat,lon);node["golf"~"hole|green|bunker|tee"](around:3000,lat,lon););out geom;`, polygon centroid calculator, metadata stripper (< 2 KB payload), and timeout error handling.
2. **`page/game.js` & `page/index.js`**:
   - Fix duplicate Hole 3 defect in `GAME_COURSES`.
   - Add bunker data structures to static fallback holes.
   - Trigger `{ type: 'REQUEST_OSM', lat, lon }` once on first GPS fix.
   - Update `calcDistances()` and `refreshUI()` to display green distance prominently at center and bunker distances in list format without flickering.
   - Retain seamless static fallback if no OSM response is received.

---

## 5. Verification Method

1. **Build Verification**:
   ```bash
   npm run build
   ```
   *Expected result*: Exit code 0, Rollup transforms all JS files, PNG to TGA completes, QuickJS bytecode compiles 3 JS bundles without syntax errors.

2. **Mathematical Accuracy of Haversine**:
   - Verify distance between $(42.791202, 0.601721)$ and $(42.788272, 0.601729)$ produces $\approx 326\text{ m}$.
   - Verify against standard geodesy calculator.

3. **Payload Size Verification**:
   - Ensure generated JSON for an 18-hole course with greens, bunkers, and tees is $< 2048$ bytes.

4. **Static Fallback Invalidation Test**:
   - Disconnect network / companion: Verify app immediately renders static course from `game.js` with functional GPS distance calculations and no crashes.
