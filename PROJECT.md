# Project: Golf Tracker OpenStreetMap Overpass Integration

## Architecture
Zepp OS Dual-Side Architecture on Amazfit T-Rex 2 (454x454 round AMOLED screen, JerryScript/QuickJS ES5/ES6):
- **Phone Companion (`app-side/index.js`)**: [IMPLEMENTED & VERIFIED]
  - Receives `{ type: 'REQUEST_OSM', lat, lon }` from watch over `messaging.peerSocket`.
  - Executes Overpass QL POST query (`[out:json][timeout:25]; (nwr["leisure"="golf_course"](around:3000,lat,lon); nwr["golf"~"^(hole|green|bunker|tee)$"](around:3000,lat,lon);); out geom;`) with multi-endpoint failover and session caching.
  - Converts closed polygon ways (`golf=green`, `golf=bunker`, `golf=tee`) to exact geometric centroids using Green's Theorem (Shoelace formula).
  - Matches greens, tees, and up to 3 bunkers per hole based on spatial proximity.
  - Strips all OSM metadata and serializes compact JSON payload (`{ type: 'COURSE_DATA', course: { name, par, holes: [{ num, par, green: [lat, lon], tee: [lat, lon], bunkers: [[lat, lon], ...] }] } }`) guaranteed `< 2 KB`.
- **Watch App (`page/game.js`, `page/index.js`)**: [IMPLEMENTED & VERIFIED]
  - Initializes GPS sensor (`@zos/sensor` / `hmSensor.GEOLOCATION`) on launch.
  - Dispatches `{ type: 'REQUEST_OSM', lat, lon }` once upon acquiring first valid GPS fix.
  - Implements mathematically exact Haversine distance formula ($R = 6,371,000\text{ m}$).
  - Recalculates distances strictly upon coordinate delta ($\ge 1.5\text{ m}$) from GPS callback.
  - Pre-allocates `hmUI` widget pool and updates properties in-place without redraw flicker:
    - Prominent central Green distance (58px large font, high contrast).
    - Structured secondary list for bunker/hazard distances.
  - Manages seamless fallback state machine: loads static `GAME_COURSES` immediately; smoothly adopts dynamic OSM data on arrival; silently retains static data on network error or 10s timeout.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Overpass QL Query Builder (R1) | Construct Overpass QL query with 3000m radius around watch GPS coordinates for leisure=golf_course, golf=hole, golf=green, golf=bunker, golf=tee | M1 (App-side) | ORIGINAL_REQUEST §R1 |
| 2 | Multi-Endpoint Overpass Fetcher (R1) | POST request fetcher with mirror endpoints failover (overpass-api.de, lz4, z, kumi.systems) and single-fetch session cache | M1 (App-side) | ORIGINAL_REQUEST §R1 |
| 3 | Shoelace Polygon Centroid Calculator (R2) | Exact geometric centroid calculation for green, bunker, and tee polygons using Green's theorem, fallback to mean on degenerate lines | M1 (App-side) | ORIGINAL_REQUEST §R2 |
| 4 | Ultra-Compact Payload Serializer (R2) | Spatial feature matching, 5-decimal coordinate quantization, stripping metadata, producing structured JSON < 2 KB | M1 (App-side) | ORIGINAL_REQUEST §R2 |
| 5 | Watch GPS Sensor Lifecycle & Trigger (R3, R5) | GPS acquisition, start/stop lifecycle cleanup in onDestroy, coordinate delta thresholding (1.5m), and one-shot REQUEST_OSM dispatch | M2 (Watch Core) | ORIGINAL_REQUEST §R3, R5 |
| 6 | Exact Haversine Engine (R3) | Geodesic distance calculation using exact Haversine formula (R=6,371,000m) triggered on GPS updates | M2 (Watch Core) | ORIGINAL_REQUEST §R3, AC |
| 7 | Dynamic Switch & Static Fallback State Machine (R3, AC) | Immediate game.js static load, 10s timeout on REQUEST_OSM, seamless dynamic switch, silent fallback on network/Bluetooth error | M2 (Watch Core) | ORIGINAL_REQUEST §R3, AC |
| 8 | Prominent Central Green Distance UI (R4) | Center-aligned large font (58px) green distance display on 454x454 round screen | M3 (Watch UI) | ORIGINAL_REQUEST §R4 |
| 9 | Obstacle & Bunker Distance List UI (R4) | Secondary list widgets for bunker/hazard distances updated dynamically without flicker | M3 (Watch UI) | ORIGINAL_REQUEST §R4 |
| 10 | Static Course Data Fix & Bunkers (R3, AC) | Fix line 19 duplicate Hole 3 in game.js, add bunker coordinate structures to fallback courses | M2 (Watch Core) | Codebase Survey |
| 11 | Bidirectional peerSocket Handler (R5) | Safe message transmission and event handling between watch and companion app | M1, M2 | ORIGINAL_REQUEST §R5 |
| 12 | Comprehensive E2E Verification Suite | Multi-tier test suite covering feature tests, boundaries, cross-feature combinations, and real-world courses | M-E2E (Testing Track) | Architecture Plan |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M-E2E | E2E Testing Suite | Requirements-driven test suite (Tiers 1-4) covering Overpass parsing, centroid math, payload size, Haversine accuracy, fallback state transitions, and UI widget contract -> TEST_READY.md | none | DONE |
| M1 | App-side Overpass Service & Data Reducer | `app-side/index.js` implementation: REQUEST_OSM handler, Overpass QL query, multi-endpoint POST, Shoelace centroid calculation, spatial feature matching, < 2 KB payload serialization, session cache | none | DONE |
| M2 | Watch GPS, Haversine Engine & Fallback | `page/game.js` core logic: Sensor lifecycle, first-fix REQUEST_OSM trigger, Haversine distance calculation, static fallback bugfix and bunker schema, seamless dynamic state transition | M1 | DONE |
| M3 | Watch UI (hmUI) Display & Refresh | `page/game.js` UI rendering: Prominent central Green widget, 3-row obstacle/bunker list widgets, flicker-free in-place property updates on GPS callback | M2 | DONE |
| M4 | Integration Verification & Adversarial Hardening | Run 100% E2E tests against built bundle, Tier 5 whitebox adversarial tests, Forensic Integrity Audit, Zeus build validation | M-E2E, M1, M2, M3 | DONE |

## Interface Contracts
### Watch (`page/game.js`) -> Phone (`app-side/index.js`)
- **Message Type**: `REQUEST_OSM`
- **Payload**:
  ```json
  {
    "type": "REQUEST_OSM",
    "lat": 42.791202,
    "lon": 0.601721
  }
  ```

### Phone (`app-side/index.js`) -> Watch (`page/game.js`)
- **Message Type**: `COURSE_DATA`
- **Payload** (Size `< 2048 bytes`):
  ```json
  {
    "type": "COURSE_DATA",
    "course": {
      "name": "Golf de Luchon",
      "par": 33,
      "holes": [
        {
          "num": 1,
          "par": 4,
          "green": [42.78827, 0.60173],
          "tee": [42.79119, 0.60176],
          "bunkers": [
            [42.78828, 0.60189],
            [42.78822, 0.60158]
          ]
        }
      ]
    }
  }
  ```

## Code Layout
- `app-side/index.js`: Companion mobile service (Overpass HTTP fetching, Shoelace centroid reduction, payload compression, Bluetooth peerSocket dispatch).
- `page/game.js`: Watch game page (Sensor GPS lifecycle, Haversine engine, fallback state machine, hmUI widget creation and flicker-free updates).
- `page/index.js`: Watch home / course selector page.
- `app.json`: Zepp OS configuration, permissions, pages, and deviceSource declarations.
- `tests/`: E2E test suites and verification scripts.
