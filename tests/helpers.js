/**
 * tests/helpers.js
 * Comprehensive testing utilities, oracles, Zepp OS mocks, and OSM fixtures.
 * 
 * Part of Golf Tracker OpenStreetMap Overpass Integration Test Suite.
 */

// ─── Lightweight Zero-Dependency Test Framework ─────────────────────────────

class TestRunner {
  constructor(suiteName) {
    this.suiteName = suiteName || 'Test Suite';
    this.tests = [];
    this.results = [];
    this.currentSuite = '';
  }

  describe(name, fn) {
    const prevSuite = this.currentSuite;
    this.currentSuite = prevSuite ? `${prevSuite} > ${name}` : name;
    fn();
    this.currentSuite = prevSuite;
  }

  test(name, fn) {
    const fullName = this.currentSuite ? `${this.currentSuite} > ${name}` : name;
    this.tests.push({ name: fullName, fn });
  }

  it(name, fn) {
    this.test(name, fn);
  }

  async run() {
    this.results = [];
    let passed = 0;
    let failed = 0;

    for (const t of this.tests) {
      const startTime = Date.now();
      try {
        await t.fn();
        const durationMs = Date.now() - startTime;
        this.results.push({ name: t.name, status: 'PASSED', durationMs });
        passed++;
      } catch (err) {
        const durationMs = Date.now() - startTime;
        this.results.push({
          name: t.name,
          status: 'FAILED',
          durationMs,
          error: err.message || String(err),
          stack: err.stack
        });
        failed++;
      }
    }

    return {
      suiteName: this.suiteName,
      total: this.tests.length,
      passed,
      failed,
      results: this.results
    };
  }
}

function safeStringify(obj) {
  if (obj === undefined) return 'undefined';
  if (obj === null) return 'null';
  if (typeof obj === 'function') return '[Function]';
  if (typeof obj === 'symbol') return obj.toString();
  try {
    return JSON.stringify(obj);
  } catch (e) {
    return String(obj);
  }
}

function createMatchers(actual, isNot = false) {
  const check = (condition, failMsgFn) => {
    const passed = isNot ? !condition : condition;
    if (!passed) {
      const msg = typeof failMsgFn === 'function' ? failMsgFn() : failMsgFn;
      throw new Error(msg);
    }
  };

  const matchers = {
    toBe(expected) {
      check(
        actual === expected,
        () => isNot
          ? `Expected value NOT to be ${safeStringify(expected)}`
          : `Expected ${safeStringify(expected)} (type: ${typeof expected}) but got ${safeStringify(actual)} (type: ${typeof actual})`
      );
    },
    toEqual(expected) {
      const a = safeStringify(actual);
      const b = safeStringify(expected);
      check(
        a === b,
        () => isNot
          ? `Expected values NOT to be deeply equal`
          : `Expected deep equality:\nExpected: ${b}\nActual:   ${a}`
      );
    },
    toBeCloseTo(expected, precision = 2) {
      const diff = Math.abs(actual - expected);
      const tolerance = Math.pow(10, -precision) / 2;
      check(
        diff <= tolerance,
        () => isNot
          ? `Expected ${actual} NOT to be close to ${expected} within precision ${precision}`
          : `Expected ${actual} to be close to ${expected} within precision ${precision} (diff: ${diff}, tol: ${tolerance})`
      );
    },
    toBeGreaterThan(expected) {
      check(
        actual > expected,
        () => isNot
          ? `Expected ${actual} NOT to be greater than ${expected}`
          : `Expected ${actual} to be greater than ${expected}`
      );
    },
    toBeGreaterThanOrEqual(expected) {
      check(
        actual >= expected,
        () => isNot
          ? `Expected ${actual} NOT to be greater than or equal to ${expected}`
          : `Expected ${actual} to be greater than or equal to ${expected}`
      );
    },
    toBeLessThan(expected) {
      check(
        actual < expected,
        () => isNot
          ? `Expected ${actual} NOT to be less than ${expected}`
          : `Expected ${actual} to be less than ${expected}`
      );
    },
    toBeLessThanOrEqual(expected) {
      check(
        actual <= expected,
        () => isNot
          ? `Expected ${actual} NOT to be less than or equal to ${expected}`
          : `Expected ${actual} to be less than or equal to ${expected}`
      );
    },
    toBeTruthy() {
      check(
        !!actual,
        () => isNot
          ? `Expected falsy value, but got ${safeStringify(actual)}`
          : `Expected truthy value, but got ${safeStringify(actual)}`
      );
    },
    toBeFalsy() {
      check(
        !actual,
        () => isNot
          ? `Expected truthy value, but got ${safeStringify(actual)}`
          : `Expected falsy value, but got ${safeStringify(actual)}`
      );
    },
    toBeNull() {
      check(
        actual === null,
        () => isNot
          ? `Expected value NOT to be null`
          : `Expected null, but got ${safeStringify(actual)}`
      );
    },
    toBeDefined() {
      check(
        actual !== undefined,
        () => isNot
          ? `Expected value to be undefined`
          : `Expected defined value, but got undefined`
      );
    },
    toBeUndefined() {
      check(
        actual === undefined,
        () => isNot
          ? `Expected value to be defined, but got undefined`
          : `Expected undefined, but got ${safeStringify(actual)}`
      );
    },
    toContain(expected) {
      let contains = false;
      if (typeof actual === 'string' || Array.isArray(actual)) {
        contains = actual.includes(expected);
      } else {
        throw new Error(`toContain requires string or array target, got ${typeof actual}`);
      }
      check(
        contains,
        () => isNot
          ? `Expected ${safeStringify(actual)} NOT to contain ${safeStringify(expected)}`
          : `Expected ${safeStringify(actual)} to contain ${safeStringify(expected)}`
      );
    },
    toThrow(expectedSubstring) {
      let threw = false;
      let errorMsg = '';
      try {
        actual();
      } catch (err) {
        threw = true;
        errorMsg = err.message || String(err);
      }
      check(
        threw,
        isNot
          ? `Expected function NOT to throw an error, but it threw "${errorMsg}"`
          : `Expected function to throw an error, but it did not throw.`
      );
      if (threw && expectedSubstring) {
        check(
          errorMsg.includes(expectedSubstring),
          isNot
            ? `Expected error message NOT to contain "${expectedSubstring}"`
            : `Expected error message to contain "${expectedSubstring}", but got "${errorMsg}"`
        );
      }
    }
  };

  if (!isNot) {
    matchers.not = createMatchers(actual, true);
  }

  return matchers;
}

function expect(actual) {
  return createMatchers(actual, false);
}

// ─── Authoritative Mathematical Oracles ────────────────────────────────────

/**
 * Exact Haversine Geodesic Distance Oracle (Earth Radius = 6,371,000 meters).
 */
function haversineOracle(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const lat1Rad = lat1 * toRad;
  const lat2Rad = lat2 * toRad;

  const sinDLat2 = Math.sin(dLat / 2);
  const sinDLon2 = Math.sin(dLon / 2);

  const a = sinDLat2 * sinDLat2 +
            Math.cos(lat1Rad) * Math.cos(lat2Rad) * sinDLon2 * sinDLon2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Exact Polygon Centroid Oracle using Green's Theorem (Shoelace formula).
 * Handles closed polygons, degenerate lines, and single nodes.
 */
function shoelaceCentroidOracle(geometry) {
  if (!geometry || geometry.length === 0) return null;
  if (geometry.length === 1) {
    return { lat: geometry[0].lat, lon: geometry[0].lon };
  }

  // Ensure closed loop
  const pts = [...geometry];
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (first.lat !== last.lat || first.lon !== last.lon) {
    pts.push({ lat: first.lat, lon: first.lon });
  }

  let signedArea = 0;
  let cx = 0;
  let cy = 0;
  const n = pts.length - 1;

  for (let i = 0; i < n; i++) {
    const x0 = pts[i].lon;
    const y0 = pts[i].lat;
    const x1 = pts[i + 1].lon;
    const y1 = pts[i + 1].lat;

    const cross = (x0 * y1) - (x1 * y0);
    signedArea += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }

  signedArea = signedArea * 0.5;

  // If area is near zero (degenerate line, collinear points), return arithmetic mean
  if (Math.abs(signedArea) < 1e-12) {
    let sumLat = 0;
    let sumLon = 0;
    const count = geometry.length;
    for (let i = 0; i < count; i++) {
      sumLat += geometry[i].lat;
      sumLon += geometry[i].lon;
    }
    return {
      lat: sumLat / count,
      lon: sumLon / count
    };
  }

  const factor = 1 / (6 * signedArea);
  return {
    lat: cy * factor,
    lon: cx * factor
  };
}

// ─── Reference Specifications & Implementations (F1 to F10) ────────────────

/**
 * F1: Overpass QL Query Builder Specification
 */
function buildOverpassQuery(lat, lon, radius = 3000) {
  if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) {
    throw new Error('Invalid coordinates for Overpass query');
  }
  const qLat = Number(lat.toFixed(6));
  const qLon = Number(lon.toFixed(6));
  const qRadius = Math.max(100, Math.min(10000, Math.round(radius)));

  return `[out:json][timeout:25]; (nwr["leisure"="golf_course"](around:${qRadius},${qLat},${qLon}); nwr["golf"~"^(hole|green|bunker|tee)$"](around:${qRadius},${qLat},${qLon});); out geom;`;
}

/**
 * F2: Multi-Endpoint Fetcher & Session Cache Specification
 */
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];

class OverpassFetcherEngine {
  constructor(endpoints = OVERPASS_ENDPOINTS, fetchImpl = null) {
    this.endpoints = endpoints;
    this.fetchImpl = fetchImpl || global.fetch;
    this.sessionCache = new Map(); // key: "lat,lon" -> cached course data
  }

  getCacheKey(lat, lon) {
    return `${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`;
  }

  clearCache() {
    this.sessionCache.clear();
  }

  async fetchWithFailover(query, lat, lon) {
    const cacheKey = this.getCacheKey(lat, lon);
    if (this.sessionCache.has(cacheKey)) {
      return { data: this.sessionCache.get(cacheKey), fromCache: true, endpointUsed: null };
    }

    let lastError = null;
    for (const endpoint of this.endpoints) {
      try {
        const url = `${endpoint}?data=${encodeURIComponent(query)}`;
        const res = await this.fetchImpl(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 25000
        });

        if (!res || !res.ok) {
          throw new Error(`HTTP ${(res && res.status) || 500}`);
        }

        const data = typeof res.json === 'function' ? await res.json() : res.data;
        if (!data || !Array.isArray(data.elements)) {
          throw new Error('Malformed Overpass response: missing elements array');
        }

        this.sessionCache.set(cacheKey, data);
        return { data, fromCache: false, endpointUsed: endpoint };
      } catch (err) {
        lastError = err;
        // Continue to next mirror endpoint
      }
    }

    throw new Error(`All Overpass endpoints failed. Last error: ${lastError ? lastError.message : 'Unknown'}`);
  }
}

/**
 * F3: Polygon Centroid Math implementation
 */
function calculateCentroid(element) {
  if (!element) return null;
  if (element.type === 'node' && element.lat !== undefined && element.lon !== undefined) {
    return { lat: element.lat, lon: element.lon };
  }
  if (element.geometry && Array.isArray(element.geometry) && element.geometry.length > 0) {
    return shoelaceCentroidOracle(element.geometry);
  }
  if (element.lat !== undefined && element.lon !== undefined) {
    return { lat: element.lat, lon: element.lon };
  }
  return null;
}

/**
 * F4: Ultra-Compact Payload Serializer (< 2 KB) Specification
 */
function serializeCoursePayload(osmData, courseNameOverride = null) {
  if (!osmData || !Array.isArray(osmData.elements)) {
    throw new Error('Invalid OSM data');
  }

  const elements = osmData.elements;
  let courseName = courseNameOverride;
  const holesRaw = [];
  const greens = [];
  const tees = [];
  const bunkers = [];

  for (const el of elements) {
    if (el.tags && el.tags.leisure === 'golf_course' && !courseName) {
      courseName = el.tags.name;
    }

    if (!el.tags || !el.tags.golf) continue;

    const golfType = el.tags.golf;
    const centroid = calculateCentroid(el);
    if (!centroid) continue;

    if (golfType === 'hole') {
      const ref = parseInt(el.tags.ref, 10);
      const par = parseInt(el.tags.par, 10) || 4;
      holesRaw.push({
        num: isNaN(ref) ? null : ref,
        par: par,
        raw: el,
        centroid: centroid
      });
    } else if (golfType === 'green') {
      const ref = el.tags.ref ? parseInt(el.tags.ref, 10) : null;
      greens.push({ ref, centroid, raw: el });
    } else if (golfType === 'tee') {
      const ref = el.tags.ref ? parseInt(el.tags.ref, 10) : null;
      tees.push({ ref, centroid, raw: el });
    } else if (golfType === 'bunker') {
      bunkers.push({ centroid, raw: el });
    }
  }

  // Fallback name if none found
  courseName = courseName || 'Golf Course';

  // Sort or build holes list
  // If holes are defined explicitly
  let holes = [];
  if (holesRaw.length > 0) {
    // Sort holes by num
    holesRaw.sort((a, b) => (a.num || 99) - (b.num || 99));
    for (let i = 0; i < holesRaw.length; i++) {
      const h = holesRaw[i];
      const holeNum = h.num !== null ? h.num : i + 1;
      
      // Find matching green (by ref or proximity to last point in geometry)
      let matchedGreen = greens.find(g => g.ref === holeNum);
      if (!matchedGreen && h.raw.geometry && h.raw.geometry.length > 0) {
        const lastPt = h.raw.geometry[h.raw.geometry.length - 1];
        matchedGreen = { centroid: { lat: lastPt.lat, lon: lastPt.lon } };
      } else if (!matchedGreen) {
        matchedGreen = { centroid: h.centroid };
      }

      // Find matching tee (by ref or proximity to first point in geometry)
      let matchedTee = tees.find(t => t.ref === holeNum);
      if (!matchedTee && h.raw.geometry && h.raw.geometry.length > 0) {
        const firstPt = h.raw.geometry[0];
        matchedTee = { centroid: { lat: firstPt.lat, lon: firstPt.lon } };
      }

      // Match nearest bunkers (up to 3) within 200m of green or fairway
      const matchedBunkers = [];
      if (matchedGreen) {
        const sortedBunkers = bunkers.map(b => ({
          bunker: b,
          dist: haversineOracle(matchedGreen.centroid.lat, matchedGreen.centroid.lon, b.centroid.lat, b.centroid.lon)
        })).filter(item => item.dist <= 250)
          .sort((a, b) => a.dist - b.dist)
          .slice(0, 3);

        for (const item of sortedBunkers) {
          matchedBunkers.push([
            Number(item.bunker.centroid.lat.toFixed(5)),
            Number(item.bunker.centroid.lon.toFixed(5))
          ]);
        }
      }

      holes.push({
        num: holeNum,
        par: h.par,
        green: [
          Number(matchedGreen.centroid.lat.toFixed(5)),
          Number(matchedGreen.centroid.lon.toFixed(5))
        ],
        tee: matchedTee ? [
          Number(matchedTee.centroid.lat.toFixed(5)),
          Number(matchedTee.centroid.lon.toFixed(5))
        ] : null,
        bunkers: matchedBunkers
      });
    }
  } else if (greens.length > 0) {
    // If no golf=hole relations but greens exist
    greens.sort((a, b) => (a.ref || 99) - (b.ref || 99));
    for (let i = 0; i < greens.length; i++) {
      const g = greens[i];
      const holeNum = g.ref !== null ? g.ref : i + 1;
      const matchedTee = tees.find(t => t.ref === holeNum);
      const sortedBunkers = bunkers.map(b => ({
        bunker: b,
        dist: haversineOracle(g.centroid.lat, g.centroid.lon, b.centroid.lat, b.centroid.lon)
      })).filter(item => item.dist <= 250)
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 3);

      holes.push({
        num: holeNum,
        par: 4,
        green: [
          Number(g.centroid.lat.toFixed(5)),
          Number(g.centroid.lon.toFixed(5))
        ],
        tee: matchedTee ? [
          Number(matchedTee.centroid.lat.toFixed(5)),
          Number(matchedTee.centroid.lon.toFixed(5))
        ] : null,
        bunkers: sortedBunkers.map(sb => [
          Number(sb.bunker.centroid.lat.toFixed(5)),
          Number(sb.bunker.centroid.lon.toFixed(5))
        ])
      });
    }
  }

  let totalPar = 0;
  for (const h of holes) totalPar += h.par;

    let payload = {
      type: 'COURSE_DATA',
      course: {
        name: courseName,
        par: totalPar,
        holes: holes
      }
    };

    let serialized = JSON.stringify(payload);
    let sizeBytes = Buffer.byteLength ? Buffer.byteLength(serialized, 'utf8') : serialized.length;

    // Hard constraint: If payload exceeds 2048 bytes (e.g. large 18-hole course with many bunkers),
    // progressively reduce bunker count per hole until size < 2048 bytes.
    if (sizeBytes >= 2048) {
      let maxBunkers = 2;
      while (sizeBytes >= 2048 && maxBunkers >= 0) {
        for (const h of holes) {
          if (h.bunkers.length > maxBunkers) {
            h.bunkers = h.bunkers.slice(0, maxBunkers);
          }
        }
        payload.course.holes = holes;
        serialized = JSON.stringify(payload);
        sizeBytes = Buffer.byteLength ? Buffer.byteLength(serialized, 'utf8') : serialized.length;
        maxBunkers--;
      }
    }

    return {
      payload,
      jsonString: serialized,
      sizeBytes,
      isUnder2KB: sizeBytes < 2048
    };
}

/**
 * F5: Watch GPS Sensor Lifecycle & Coordinate Delta Controller
 */
class WatchGPSController {
  constructor({ sensor, onFirstFix, onLocationUpdate, deltaThreshold = 1.5 }) {
    this.sensor = sensor;
    this.onFirstFix = onFirstFix;
    this.onLocationUpdate = onLocationUpdate;
    this.deltaThreshold = deltaThreshold;
    this.hasFirstFix = false;
    this.lastLat = null;
    this.lastLon = null;
    this.isRunning = false;
  }

  start() {
    this.isRunning = true;
    this.sensor.start((coords) => this.handleSensorUpdate(coords));
  }

  handleSensorUpdate(coords) {
    if (!this.isRunning || !coords) return;
    const lat = coords.latitude !== undefined ? coords.latitude : coords.lat;
    const lon = coords.longitude !== undefined ? coords.longitude : coords.lon;

    if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) {
      return;
    }

    if (!this.hasFirstFix) {
      this.hasFirstFix = true;
      this.lastLat = lat;
      this.lastLon = lon;
      if (this.onFirstFix) this.onFirstFix({ lat, lon });
      if (this.onLocationUpdate) this.onLocationUpdate({ lat, lon, deltaDistance: 0 });
      return;
    }

    const deltaDist = haversineOracle(this.lastLat, this.lastLon, lat, lon);
    if (deltaDist >= this.deltaThreshold) {
      this.lastLat = lat;
      this.lastLon = lon;
      if (this.onLocationUpdate) this.onLocationUpdate({ lat, lon, deltaDistance: deltaDist });
    }
  }

  stop() {
    this.isRunning = false;
    if (this.sensor && typeof this.sensor.stop === 'function') {
      this.sensor.stop();
    }
  }
}

/**
 * F7: Dynamic Transition & Fallback State Machine
 */
const FallbackState = {
  STATIC_INIT: 'STATIC_INIT',
  WAITING_OSM: 'WAITING_OSM',
  DYNAMIC_ACTIVE: 'DYNAMIC_ACTIVE',
  FALLBACK_STATIC: 'FALLBACK_STATIC'
};

class CourseStateManager {
  constructor({ staticCourse, timeoutMs = 10000, timerEngine = setTimeout, clearTimerEngine = clearTimeout }) {
    this.staticCourse = staticCourse;
    this.currentCourse = staticCourse;
    this.isDynamic = false;
    this.state = FallbackState.STATIC_INIT;
    this.timeoutMs = timeoutMs;
    this.timerEngine = timerEngine;
    this.clearTimerEngine = clearTimerEngine;
    this.timeoutHandle = null;
    this.currentHoleIndex = 0;
  }

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

  onCompanionMessage(data) {
    let msg = data;
    if (typeof data === 'string') {
      try {
        msg = JSON.parse(data);
      } catch (e) {
        this.onCompanionError(e);
        return;
      }
    }

    if (msg && msg.type === 'COURSE_DATA' && msg.course && Array.isArray(msg.course.holes) && msg.course.holes.length > 0) {
      if (this.timeoutHandle) {
        this.clearTimerEngine(this.timeoutHandle);
        this.timeoutHandle = null;
      }
      this.currentCourse = msg.course;
      this.isDynamic = true;
      this.state = FallbackState.DYNAMIC_ACTIVE;
    } else {
      this.onCompanionError(new Error('Invalid COURSE_DATA payload'));
    }
  }

  onCompanionError(err) {
    if (this.timeoutHandle) {
      this.clearTimerEngine(this.timeoutHandle);
      this.timeoutHandle = null;
    }
    this.state = FallbackState.FALLBACK_STATIC;
    this.isDynamic = false;
    this.currentCourse = this.staticCourse;
  }

  getCurrentHole() {
    if (!this.currentCourse || !this.currentCourse.holes) return null;
    return this.currentCourse.holes[this.currentHoleIndex] || null;
  }

  setHoleIndex(idx) {
    if (this.currentCourse && this.currentCourse.holes && idx >= 0 && idx < this.currentCourse.holes.length) {
      this.currentHoleIndex = idx;
    }
  }
}

/**
 * F8 & F9: Watch UI (hmUI) Display & Refresh Engine Specification
 */
class WatchUIController {
  constructor(hmUI) {
    this.hmUI = hmUI;
    this.greenWidget = null;
    this.bunkerWidgets = [];
    this.initialized = false;
  }

  initWidgets() {
    // Large prominent center Green widget (64px)
    this.greenWidget = this.hmUI.createWidget(this.hmUI.widget.TEXT, {
      x: 0,
      y: 160,
      w: 454,
      h: 80,
      color: 0x00FF88,
      text_size: 64,
      align_h: this.hmUI.align.CENTER_H,
      align_v: this.hmUI.align.CENTER_V,
      text: '---'
    });

    // 3 secondary bunker widgets
    this.bunkerWidgets = [];
    for (let i = 0; i < 3; i++) {
      const widget = this.hmUI.createWidget(this.hmUI.widget.TEXT, {
        x: 0,
        y: 250 + (i * 32),
        w: 454,
        h: 30,
        color: 0xE0E0E0,
        text_size: 24,
        align_h: this.hmUI.align.CENTER_H,
        align_v: this.hmUI.align.CENTER_V,
        text: ''
      });
      this.bunkerWidgets.push(widget);
    }
    this.initialized = true;
  }

  updateDistances({ greenDist, bunkerDists = [] }) {
    if (!this.initialized) return;

    // Update green distance in-place (flicker-free)
    const greenText = (greenDist !== null && greenDist !== undefined) ? `${greenDist}m` : '---';
    this.greenWidget.setProperty(this.hmUI.prop.TEXT, greenText);

    // Update bunker distances in-place
    for (let i = 0; i < 3; i++) {
      const bWidget = this.bunkerWidgets[i];
      if (i < bunkerDists.length && bunkerDists[i] !== null && bunkerDists[i] !== undefined) {
        bWidget.setProperty(this.hmUI.prop.TEXT, `B${i + 1}: ${bunkerDists[i]}m`);
      } else {
        bWidget.setProperty(this.hmUI.prop.TEXT, '');
      }
    }
  }
}

// ─── Zepp OS Mocks ─────────────────────────────────────────────────────────

function createMockGeolocationSensor(initialCoords = { lat: 42.791202, lon: 0.601721 }) {
  let callback = null;
  let active = false;
  let currentCoords = { ...initialCoords };

  return {
    start(cb) {
      active = true;
      callback = cb;
      if (currentCoords) {
        cb(currentCoords);
      }
    },
    stop() {
      active = false;
      callback = null;
    },
    emitCoords(lat, lon) {
      currentCoords = { lat, lon, latitude: lat, longitude: lon };
      if (active && callback) {
        callback(currentCoords);
      }
    },
    isActive() {
      return active;
    }
  };
}

function createMockPeerSocket() {
  const listeners = { message: [], open: [], close: [], error: [] };
  let readyState = 1; // 1 = OPEN, 0 = CONNECTING, 2 = CLOSING, 3 = CLOSED
  const sentMessages = [];

  const peerSocket = {
    OPEN: 1,
    CONNECTING: 0,
    CLOSING: 2,
    CLOSED: 3,
    get readyState() {
      return readyState;
    },
    setReadyState(state) {
      readyState = state;
      if (state === 1) {
        listeners.open.forEach(cb => cb());
      } else if (state === 3) {
        listeners.close.forEach(cb => cb());
      }
    },
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
    addEventListener(event, cb) {
      if (listeners[event]) listeners[event].push(cb);
    },
    removeEventListener(event, cb) {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter(fn => fn !== cb);
      }
    },
    // Test helper to simulate incoming message from the other side
    simulateReceive(data) {
      listeners.message.forEach(cb => cb({ data }));
    },
    simulateError(err) {
      listeners.error.forEach(cb => cb(err));
    },
    getSentMessages() {
      return [...sentMessages];
    },
    clearSentMessages() {
      sentMessages.length = 0;
    }
  };

  return peerSocket;
}

function createMockHmUI() {
  let widgetIdCounter = 1;
  const widgets = [];

  const mockUI = {
    widget: {
      TEXT: 'TEXT',
      IMG: 'IMG',
      BUTTON: 'BUTTON',
      STROKE_RECT: 'STROKE_RECT'
    },
    prop: {
      TEXT: 'TEXT',
      COLOR: 'COLOR',
      X: 'X',
      Y: 'Y',
      W: 'W',
      H: 'H',
      VISIBLE: 'VISIBLE'
    },
    align: {
      CENTER_H: 1,
      CENTER_V: 2,
      LEFT: 3,
      RIGHT: 4
    },
    createWidget(type, props) {
      const id = widgetIdCounter++;
      const currentProps = { ...props };
      const propertyHistory = [{ ...props }];

      const widget = {
        _id: id,
        _type: type,
        _props: currentProps,
        _history: propertyHistory,
        setProperty(propKey, value) {
          currentProps[propKey] = value;
          propertyHistory.push({ propKey, value, timestamp: Date.now() });
        },
        getProperty(propKey) {
          return currentProps[propKey];
        }
      };

      widgets.push(widget);
      return widget;
    },
    deleteWidget(widget) {
      const idx = widgets.findIndex(w => w._id === widget._id);
      if (idx !== -1) widgets.splice(idx, 1);
    },
    getCreatedWidgets() {
      return [...widgets];
    }
  };

  return mockUI;
}

function createMockHmStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, val) {
      store.set(key, String(val));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    }
  };
}

// ─── Real-World Course OSM Fixtures ────────────────────────────────────────

/**
 * Golf de Luchon (9 holes, par 33, greens, tees, bunkers)
 */
const FIXTURE_LUCHON_OSM = {
  version: 0.6,
  generator: 'Overpass API',
  elements: [
    {
      type: 'way',
      id: 100001,
      tags: { leisure: 'golf_course', name: 'Golf de Luchon', par: '33' },
      geometry: [
        { lat: 42.7915, lon: 0.6010 },
        { lat: 42.7915, lon: 0.6035 },
        { lat: 42.7875, lon: 0.6035 },
        { lat: 42.7875, lon: 0.6010 },
        { lat: 42.7915, lon: 0.6010 }
      ]
    },
    // Hole 1: Par 4
    {
      type: 'way',
      id: 1001,
      tags: { golf: 'hole', ref: '1', par: '4' },
      geometry: [
        { lat: 42.791202, lon: 0.601721 },
        { lat: 42.789500, lon: 0.601725 },
        { lat: 42.788272, lon: 0.601729 }
      ]
    },
    {
      type: 'way',
      id: 2001,
      tags: { golf: 'green', ref: '1' },
      geometry: [
        { lat: 42.788320, lon: 0.601680 },
        { lat: 42.788320, lon: 0.601780 },
        { lat: 42.788220, lon: 0.601780 },
        { lat: 42.788220, lon: 0.601680 },
        { lat: 42.788320, lon: 0.601680 }
      ]
    },
    {
      type: 'node',
      id: 3001,
      lat: 42.791202,
      lon: 0.601721,
      tags: { golf: 'tee', ref: '1' }
    },
    {
      type: 'way',
      id: 4001,
      tags: { golf: 'bunker' },
      geometry: [
        { lat: 42.788300, lon: 0.601850 },
        { lat: 42.788300, lon: 0.601930 },
        { lat: 42.788260, lon: 0.601930 },
        { lat: 42.788260, lon: 0.601850 },
        { lat: 42.788300, lon: 0.601850 }
      ]
    },
    {
      type: 'way',
      id: 4002,
      tags: { golf: 'bunker' },
      geometry: [
        { lat: 42.788240, lon: 0.601550 },
        { lat: 42.788240, lon: 0.601610 },
        { lat: 42.788200, lon: 0.601610 },
        { lat: 42.788200, lon: 0.601550 },
        { lat: 42.788240, lon: 0.601550 }
      ]
    },

    // Hole 2: Par 4
    {
      type: 'way',
      id: 1002,
      tags: { golf: 'hole', ref: '2', par: '4' },
      geometry: [
        { lat: 42.788068, lon: 0.602869 },
        { lat: 42.787785, lon: 0.601307 }
      ]
    },
    {
      type: 'way',
      id: 2002,
      tags: { golf: 'green', ref: '2' },
      geometry: [
        { lat: 42.787835, lon: 0.601257 },
        { lat: 42.787835, lon: 0.601357 },
        { lat: 42.787735, lon: 0.601357 },
        { lat: 42.787735, lon: 0.601257 },
        { lat: 42.787835, lon: 0.601257 }
      ]
    },
    {
      type: 'node',
      id: 3002,
      lat: 42.788068,
      lon: 0.602869,
      tags: { golf: 'tee', ref: '2' }
    },
    {
      type: 'way',
      id: 4003,
      tags: { golf: 'bunker' },
      geometry: [
        { lat: 42.787750, lon: 0.601200 },
        { lat: 42.787750, lon: 0.601250 },
        { lat: 42.787710, lon: 0.601250 },
        { lat: 42.787710, lon: 0.601200 },
        { lat: 42.787750, lon: 0.601200 }
      ]
    },

    // Hole 3: Par 3 (Fixed reference coordinates)
    {
      type: 'way',
      id: 1003,
      tags: { golf: 'hole', ref: '3', par: '3' },
      geometry: [
        { lat: 42.788115, lon: 0.601357 },
        { lat: 42.791080, lon: 0.601465 }
      ]
    },
    {
      type: 'way',
      id: 2003,
      tags: { golf: 'green', ref: '3' },
      geometry: [
        { lat: 42.791130, lon: 0.601415 },
        { lat: 42.791130, lon: 0.601515 },
        { lat: 42.791030, lon: 0.601515 },
        { lat: 42.791030, lon: 0.601415 },
        { lat: 42.791130, lon: 0.601415 }
      ]
    },
    {
      type: 'node',
      id: 3003,
      lat: 42.788115,
      lon: 0.601357,
      tags: { golf: 'tee', ref: '3' }
    },

    // Holes 4 to 9
    {
      type: 'way',
      id: 1004,
      tags: { golf: 'hole', ref: '4', par: '4' },
      geometry: [{ lat: 42.7940, lon: 0.6015 }, { lat: 42.7950, lon: 0.6013 }]
    },
    {
      type: 'way',
      id: 1005,
      tags: { golf: 'hole', ref: '5', par: '3' },
      geometry: [{ lat: 42.7945, lon: 0.6010 }, { lat: 42.7941, lon: 0.6009 }]
    },
    {
      type: 'way',
      id: 1006,
      tags: { golf: 'hole', ref: '6', par: '4' },
      geometry: [{ lat: 42.7940, lon: 0.6005 }, { lat: 42.7934, lon: 0.6006 }]
    },
    {
      type: 'way',
      id: 1007,
      tags: { golf: 'hole', ref: '7', par: '4' },
      geometry: [{ lat: 42.7930, lon: 0.6008 }, { lat: 42.7928, lon: 0.6011 }]
    },
    {
      type: 'way',
      id: 1008,
      tags: { golf: 'hole', ref: '8', par: '4' },
      geometry: [{ lat: 42.7925, lon: 0.6015 }, { lat: 42.7921, lon: 0.6020 }]
    },
    {
      type: 'way',
      id: 1009,
      tags: { golf: 'hole', ref: '9', par: '3' },
      geometry: [{ lat: 42.7918, lon: 0.6022 }, { lat: 42.7916, lon: 0.6026 }]
    }
  ]
};

/**
 * Golf du Totche (9 holes, par 32, greens & tees, 0 bunkers)
 */
const FIXTURE_TOTCHE_OSM = {
  version: 0.6,
  generator: 'Overpass API',
  elements: [
    {
      type: 'way',
      id: 200001,
      tags: { leisure: 'golf_course', name: 'Golf du Totche', par: '32' },
      geometry: [
        { lat: 44.550, lon: 2.100 },
        { lat: 44.555, lon: 2.100 },
        { lat: 44.555, lon: 2.105 },
        { lat: 44.550, lon: 2.105 },
        { lat: 44.550, lon: 2.100 }
      ]
    },
    ...Array.from({ length: 9 }, (_, i) => {
      const holeNum = i + 1;
      const par = (holeNum === 1 || holeNum === 5) ? 4 : (holeNum === 9 ? 4 : 3);
      const latOffset = i * 0.0005;
      return [
        {
          type: 'way',
          id: 2100 + holeNum,
          tags: { golf: 'hole', ref: String(holeNum), par: String(par) },
          geometry: [
            { lat: 44.5510 + latOffset, lon: 2.1010 },
            { lat: 44.5525 + latOffset, lon: 2.1025 }
          ]
        },
        {
          type: 'way',
          id: 2200 + holeNum,
          tags: { golf: 'green', ref: String(holeNum) },
          geometry: [
            { lat: 44.55255 + latOffset, lon: 2.10245 },
            { lat: 44.55255 + latOffset, lon: 2.10255 },
            { lat: 44.55245 + latOffset, lon: 2.10255 },
            { lat: 44.55245 + latOffset, lon: 2.10245 },
            { lat: 44.55255 + latOffset, lon: 2.10245 }
          ]
        },
        {
          type: 'node',
          id: 2300 + holeNum,
          lat: 44.5510 + latOffset,
          lon: 2.1010,
          tags: { golf: 'tee', ref: String(holeNum) }
        }
      ];
    }).flat()
  ]
};

/**
 * Pebble Beach Golf Links (18 holes, par 72, multiple bunkers)
 */
const FIXTURE_PEBBLE_BEACH_OSM = {
  version: 0.6,
  generator: 'Overpass API',
  elements: [
    {
      type: 'way',
      id: 300001,
      tags: { leisure: 'golf_course', name: 'Pebble Beach Golf Links', par: '72' },
      geometry: [
        { lat: 36.568, lon: -121.950 },
        { lat: 36.575, lon: -121.950 },
        { lat: 36.575, lon: -121.940 },
        { lat: 36.568, lon: -121.940 },
        { lat: 36.568, lon: -121.950 }
      ]
    },
    ...Array.from({ length: 18 }, (_, i) => {
      const holeNum = i + 1;
      const par = (holeNum % 3 === 0) ? 5 : (holeNum % 2 === 0 ? 3 : 4);
      const latOffset = i * 0.0003;
      const lonOffset = i * 0.0004;
      return [
        {
          type: 'way',
          id: 3100 + holeNum,
          tags: { golf: 'hole', ref: String(holeNum), par: String(par) },
          geometry: [
            { lat: 36.5690 + latOffset, lon: -121.9480 + lonOffset },
            { lat: 36.5710 + latOffset, lon: -121.9460 + lonOffset }
          ]
        },
        {
          type: 'way',
          id: 3200 + holeNum,
          tags: { golf: 'green', ref: String(holeNum) },
          geometry: [
            { lat: 36.57105 + latOffset, lon: -121.94605 + lonOffset },
            { lat: 36.57105 + latOffset, lon: -121.94595 + lonOffset },
            { lat: 36.57095 + latOffset, lon: -121.94595 + lonOffset },
            { lat: 36.57095 + latOffset, lon: -121.94605 + lonOffset },
            { lat: 36.57105 + latOffset, lon: -121.94605 + lonOffset }
          ]
        },
        {
          type: 'node',
          id: 3300 + holeNum,
          lat: 36.5690 + latOffset,
          lon: -121.9480 + lonOffset,
          tags: { golf: 'tee', ref: String(holeNum) }
        },
        // 2 bunkers per hole
        {
          type: 'way',
          id: 3400 + (holeNum * 2),
          tags: { golf: 'bunker' },
          geometry: [
            { lat: 36.57090 + latOffset, lon: -121.94610 + lonOffset },
            { lat: 36.57090 + latOffset, lon: -121.94600 + lonOffset },
            { lat: 36.57080 + latOffset, lon: -121.94600 + lonOffset },
            { lat: 36.57080 + latOffset, lon: -121.94610 + lonOffset },
            { lat: 36.57090 + latOffset, lon: -121.94610 + lonOffset }
          ]
        },
        {
          type: 'way',
          id: 3401 + (holeNum * 2),
          tags: { golf: 'bunker' },
          geometry: [
            { lat: 36.57110 + latOffset, lon: -121.94590 + lonOffset },
            { lat: 36.57110 + latOffset, lon: -121.94580 + lonOffset },
            { lat: 36.57100 + latOffset, lon: -121.94580 + lonOffset },
            { lat: 36.57100 + latOffset, lon: -121.94590 + lonOffset },
            { lat: 36.57110 + latOffset, lon: -121.94590 + lonOffset }
          ]
        }
      ];
    }).flat()
  ]
};

/**
 * St Andrews Old Course (18 holes, par 72, famous pot bunkers)
 */
const FIXTURE_ST_ANDREWS_OSM = {
  version: 0.6,
  generator: 'Overpass API',
  elements: [
    {
      type: 'way',
      id: 400001,
      tags: { leisure: 'golf_course', name: 'St Andrews Links (Old Course)', par: '72' },
      geometry: [
        { lat: 56.340, lon: -2.805 },
        { lat: 56.355, lon: -2.805 },
        { lat: 56.355, lon: -2.795 },
        { lat: 56.340, lon: -2.795 },
        { lat: 56.340, lon: -2.805 }
      ]
    },
    ...Array.from({ length: 18 }, (_, i) => {
      const holeNum = i + 1;
      const par = (holeNum === 5 || holeNum === 14) ? 5 : (holeNum === 8 || holeNum === 11 ? 3 : 4);
      const latOffset = i * 0.0006;
      return [
        {
          type: 'way',
          id: 4100 + holeNum,
          tags: { golf: 'hole', ref: String(holeNum), par: String(par) },
          geometry: [
            { lat: 56.3410 + latOffset, lon: -2.8020 },
            { lat: 56.3435 + latOffset, lon: -2.8010 }
          ]
        },
        {
          type: 'way',
          id: 4200 + holeNum,
          tags: { golf: 'green', ref: String(holeNum) },
          geometry: [
            { lat: 56.34355 + latOffset, lon: -2.80105 },
            { lat: 56.34355 + latOffset, lon: -2.80095 },
            { lat: 56.34345 + latOffset, lon: -2.80095 },
            { lat: 56.34345 + latOffset, lon: -2.80105 },
            { lat: 56.34355 + latOffset, lon: -2.80105 }
          ]
        },
        {
          type: 'node',
          id: 4300 + holeNum,
          lat: 56.3410 + latOffset,
          lon: -2.8020,
          tags: { golf: 'tee', ref: String(holeNum) }
        },
        // Hell bunker or pot bunker
        {
          type: 'way',
          id: 4400 + holeNum,
          tags: { golf: 'bunker' },
          geometry: [
            { lat: 56.34330 + latOffset, lon: -2.80120 },
            { lat: 56.34330 + latOffset, lon: -2.80110 },
            { lat: 56.34320 + latOffset, lon: -2.80110 },
            { lat: 56.34320 + latOffset, lon: -2.80120 },
            { lat: 56.34330 + latOffset, lon: -2.80120 }
          ]
        }
      ];
    }).flat()
  ]
};

/**
 * Fixed Static Luchon course fixture (Hole 3 fixed & bunker structures included)
 */
const FIXTURE_STATIC_LUCHON = {
  name: 'Golf de Luchon',
  par: 33,
  holes: [
    {
      par: 4,
      tee: { lat: 42.791202, lon: 0.601721 },
      greenEntry: { lat: 42.788392, lon: 0.601717 },
      flag: { lat: 42.788272, lon: 0.601729 },
      bunkers: [
        { name: 'Bunker G', lat: 42.78828, lon: 0.60189 },
        { name: 'Bunker D', lat: 42.78822, lon: 0.60158 }
      ],
      map: {
        src: 'luchon_01.png',
        bounds: { topLat: 42.791254, bottomLat: 42.787938, leftLon: 0.601439, rightLon: 0.602214 }
      }
    },
    {
      par: 4,
      tee: { lat: 42.788068, lon: 0.602869 },
      greenEntry: { lat: 42.787802, lon: 0.601444 },
      flag: { lat: 42.787785, lon: 0.601307 },
      bunkers: [
        { name: 'Bunker Front', lat: 42.78773, lon: 0.60122 }
      ],
      map: {
        src: 'luchon_02.png',
        bounds: { topLat: 42.788205, bottomLat: 42.787638, leftLon: 0.601188, rightLon: 0.602970 }
      }
    },
    {
      par: 3,
      tee: { lat: 42.788115, lon: 0.601357 },
      greenEntry: { lat: 42.790955, lon: 0.601436 },
      flag: { lat: 42.791080, lon: 0.601465 },
      bunkers: [],
      map: {
        src: 'luchon_03.png',
        bounds: { topLat: 42.791227, bottomLat: 42.787995, leftLon: 0.601195, rightLon: 0.601613 }
      }
    },
    {
      par: 4,
      tee: null,
      greenEntry: { lat: 42.7948, lon: 0.6012 },
      flag: { lat: 42.7950, lon: 0.6013 },
      bunkers: [],
      map: {
        src: 'luchon_04.png',
        bounds: { topLat: 42.7965, bottomLat: 42.7930, leftLon: 0.5987, rightLon: 0.6037 }
      }
    },
    {
      par: 3,
      tee: null,
      greenEntry: { lat: 42.7940, lon: 0.6008 },
      flag: { lat: 42.7941, lon: 0.6009 },
      bunkers: [],
      map: {
        src: 'luchon_05.png',
        bounds: { topLat: 42.7957, bottomLat: 42.7922, leftLon: 0.5983, rightLon: 0.6033 }
      }
    },
    {
      par: 4,
      tee: null,
      greenEntry: { lat: 42.7933, lon: 0.6004 },
      flag: { lat: 42.7934, lon: 0.6006 },
      bunkers: [],
      map: {
        src: 'luchon_06.png',
        bounds: { topLat: 42.7950, bottomLat: 42.7915, leftLon: 0.5979, rightLon: 0.6029 }
      }
    },
    {
      par: 4,
      tee: null,
      greenEntry: { lat: 42.7926, lon: 0.6010 },
      flag: { lat: 42.7928, lon: 0.6011 },
      bunkers: [],
      map: {
        src: 'luchon_07.png',
        bounds: { topLat: 42.7943, bottomLat: 42.7908, leftLon: 0.5985, rightLon: 0.6035 }
      }
    },
    {
      par: 4,
      tee: null,
      greenEntry: { lat: 42.7920, lon: 0.6018 },
      flag: { lat: 42.7921, lon: 0.6020 },
      bunkers: [],
      map: {
        src: 'luchon_08.png',
        bounds: { topLat: 42.7937, bottomLat: 42.7902, leftLon: 0.5993, rightLon: 0.6043 }
      }
    },
    {
      par: 3,
      tee: null,
      greenEntry: { lat: 42.7915, lon: 0.6025 },
      flag: { lat: 42.7916, lon: 0.6026 },
      bunkers: [],
      map: {
        src: 'luchon_09.png',
        bounds: { topLat: 42.7932, bottomLat: 42.7897, leftLon: 0.6000, rightLon: 0.6050 }
      }
    }
  ]
};

// ─── Module Exports ────────────────────────────────────────────────────────

module.exports = {
  TestRunner,
  expect,
  haversineOracle,
  shoelaceCentroidOracle,
  buildOverpassQuery,
  OVERPASS_ENDPOINTS,
  OverpassFetcherEngine,
  calculateCentroid,
  serializeCoursePayload,
  WatchGPSController,
  FallbackState,
  CourseStateManager,
  WatchUIController,
  createMockGeolocationSensor,
  createMockPeerSocket,
  createMockHmUI,
  createMockHmStorage,
  FIXTURE_LUCHON_OSM,
  FIXTURE_TOTCHE_OSM,
  FIXTURE_PEBBLE_BEACH_OSM,
  FIXTURE_ST_ANDREWS_OSM,
  FIXTURE_STATIC_LUCHON
};
