/**
 * tests/tier2_boundaries.test.js
 * Tier 2 Boundary, Extreme Coordinates, Malformed JSON, and Edge Case Tests (>= 50 tests).
 * 
 * Part of Golf Tracker OpenStreetMap Overpass Integration Test Suite.
 */

const req = typeof require !== 'undefined' ? eval('require') : null;

const {
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
  FIXTURE_LUCHON_OSM,
  FIXTURE_TOTCHE_OSM,
  FIXTURE_PEBBLE_BEACH_OSM,
  FIXTURE_STATIC_LUCHON
} = req ? req('./helpers') : {};

const runner = new TestRunner('Tier 2: Boundary & Edge Case Tests');

// ─── Feature 1: Overpass QL Query Construction Boundaries ───────────────────

runner.describe('Feature 1: Query Construction Boundaries', () => {
  runner.test('F1-B1: Extreme North and South Pole latitudes (+90, -90)', () => {
    const qNorth = buildOverpassQuery(90.0, 0.0);
    const qSouth = buildOverpassQuery(-90.0, 0.0);
    expect(qNorth).toContain('around:3000,90,0');
    expect(qSouth).toContain('around:3000,-90,0');
  });

  runner.test('F1-B2: International Date Line longitudes (+180, -180)', () => {
    const qEast = buildOverpassQuery(0.0, 180.0);
    const qWest = buildOverpassQuery(0.0, -180.0);
    expect(qEast).toContain('around:3000,0,180');
    expect(qWest).toContain('around:3000,0,-180');
  });

  runner.test('F1-B3: Null Island coordinates (0.0, 0.0)', () => {
    const q = buildOverpassQuery(0.0, 0.0);
    expect(q).toContain('around:3000,0,0');
  });

  runner.test('F1-B4: Radius boundary clamping (min 100m, max 10000m)', () => {
    const qMin = buildOverpassQuery(42.7912, 0.6017, 10);
    const qMax = buildOverpassQuery(42.7912, 0.6017, 50000);
    expect(qMin).toContain('around:100,');
    expect(qMax).toContain('around:10000,');
  });

  runner.test('F1-B5: High precision float coordinates truncated to 6 decimals', () => {
    const q = buildOverpassQuery(42.79120284759, 0.60172193847);
    expect(q).toContain('around:3000,42.791203,0.601722');
  });
});

// ─── Feature 2: Multi-Endpoint Failover & Session Cache Boundaries ───────────

runner.describe('Feature 2: Multi-Endpoint Failover Boundaries', () => {
  runner.test('F2-B1: Empty endpoints array immediately throws error', async () => {
    const fetcher = new OverpassFetcherEngine([]);
    let threw = false;
    try {
      await fetcher.fetchWithFailover('query', 42.7912, 0.6017);
    } catch (e) {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  runner.test('F2-B2: Simulated network disconnect (TypeError: Failed to fetch) triggers failover', async () => {
    let attempts = 0;
    const mockFetch = async () => {
      attempts++;
      if (attempts === 1) throw new TypeError('Failed to fetch (offline)');
      return { ok: true, status: 200, json: async () => FIXTURE_LUCHON_OSM };
    };

    const fetcher = new OverpassFetcherEngine(OVERPASS_ENDPOINTS, mockFetch);
    const res = await fetcher.fetchWithFailover('query', 42.7912, 0.6017);
    expect(attempts).toBe(2);
    expect(res.endpointUsed).toBe(OVERPASS_ENDPOINTS[1]);
  });

  runner.test('F2-B3: HTTP 429 Too Many Requests (Rate limit) triggers failover to mirror', async () => {
    let attempts = 0;
    const mockFetch = async () => {
      attempts++;
      if (attempts === 1) return { ok: false, status: 429 };
      return { ok: true, status: 200, json: async () => FIXTURE_LUCHON_OSM };
    };

    const fetcher = new OverpassFetcherEngine(OVERPASS_ENDPOINTS, mockFetch);
    const res = await fetcher.fetchWithFailover('query', 42.7912, 0.6017);
    expect(attempts).toBe(2);
    expect(res.endpointUsed).toBe(OVERPASS_ENDPOINTS[1]);
  });

  runner.test('F2-B4: Non-JSON / HTML error response (e.g. 502 Bad Gateway) fails over cleanly', async () => {
    let attempts = 0;
    const mockFetch = async () => {
      attempts++;
      if (attempts === 1) {
        return {
          ok: true,
          status: 200,
          json: async () => { throw new Error('Unexpected token < in JSON at position 0'); }
        };
      }
      return { ok: true, status: 200, json: async () => FIXTURE_LUCHON_OSM };
    };

    const fetcher = new OverpassFetcherEngine(OVERPASS_ENDPOINTS, mockFetch);
    const res = await fetcher.fetchWithFailover('query', 42.7912, 0.6017);
    expect(attempts).toBe(2);
  });

  runner.test('F2-B5: Distinct coordinates have distinct cache keys', () => {
    const fetcher = new OverpassFetcherEngine();
    const k1 = fetcher.getCacheKey(42.7912, 0.6017);
    const k2 = fetcher.getCacheKey(42.7925, 0.6017);
    expect(k1).not.toBe(k2);
  });
});

// ─── Feature 3: Polygon Centroid Math Boundaries ────────────────────────────

runner.describe('Feature 3: Polygon Centroid Math Boundaries', () => {
  runner.test('F3-B1: Single point geometry returns exact point', () => {
    const single = [{ lat: 42.7912, lon: 0.6017 }];
    const c = shoelaceCentroidOracle(single);
    expect(c.lat).toBe(42.7912);
    expect(c.lon).toBe(0.6017);
  });

  runner.test('F3-B2: Two-point line returns exact midpoint', () => {
    const line = [
      { lat: 10, lon: 10 },
      { lat: 20, lon: 30 }
    ];
    const c = shoelaceCentroidOracle(line);
    expect(c.lat).toBeCloseTo(15, 4);
    expect(c.lon).toBeCloseTo(20, 4);
  });

  runner.test('F3-B3: Unclosed polygon array automatically closes and computes correct centroid', () => {
    const unclosed = [
      { lat: 0, lon: 0 },
      { lat: 0, lon: 10 },
      { lat: 10, lon: 10 },
      { lat: 10, lon: 0 }
    ];
    const c = shoelaceCentroidOracle(unclosed);
    expect(c.lat).toBeCloseTo(5, 4);
    expect(c.lon).toBeCloseTo(5, 4);
  });

  runner.test('F3-B4: L-shaped (concave) polygon centroid calculation is accurate', () => {
    // 6 vertices of an L shape
    const lShape = [
      { lat: 0, lon: 0 },
      { lat: 0, lon: 2 },
      { lat: 4, lon: 2 },
      { lat: 4, lon: 6 },
      { lat: 6, lon: 6 },
      { lat: 6, lon: 0 },
      { lat: 0, lon: 0 }
    ];
    const c = shoelaceCentroidOracle(lShape);
    expect(c.lat).toBeGreaterThan(0);
    expect(c.lat).toBeLessThan(6);
    expect(c.lon).toBeGreaterThan(0);
    expect(c.lon).toBeLessThan(6);
  });

  runner.test('F3-B5: Null or empty geometry returns null without throwing', () => {
    expect(calculateCentroid(null)).toBeNull();
    expect(calculateCentroid({})).toBeNull();
    expect(calculateCentroid({ geometry: [] })).toBeNull();
  });
});

// ─── Feature 4: Ultra-Compact Payload Serializer Boundaries ─────────────────

runner.describe('Feature 4: Ultra-Compact Payload Serializer Boundaries', () => {
  runner.test('F4-B1: Empty OSM elements produces valid structure with 0 holes', () => {
    const res = serializeCoursePayload({ elements: [] });
    expect(res.payload.course.holes.length).toBe(0);
    expect(res.payload.course.par).toBe(0);
    expect(res.isUnder2KB).toBe(true);
  });

  runner.test('F4-B2: Course with missing leisure=golf_course uses fallback name', () => {
    const noNameData = {
      elements: [
        { type: 'way', id: 1, tags: { golf: 'hole', ref: '1', par: '4' }, geometry: [{ lat: 10, lon: 10 }, { lat: 11, lon: 11 }] }
      ]
    };
    const res = serializeCoursePayload(noNameData);
    expect(res.payload.course.name).toBe('Golf Course');
  });

  runner.test('F4-B3: 9-hole course with 0 bunkers (Golf du Totche) serializes with empty bunker arrays', () => {
    const res = serializeCoursePayload(FIXTURE_TOTCHE_OSM);
    expect(res.payload.course.holes.length).toBe(9);
    for (const hole of res.payload.course.holes) {
      expect(hole.bunkers.length).toBe(0);
    }
    expect(res.isUnder2KB).toBe(true);
  });

  runner.test('F4-B4: 18-hole championship course with multiple bunkers (Pebble Beach) remains < 2 KB', () => {
    const res = serializeCoursePayload(FIXTURE_PEBBLE_BEACH_OSM);
    expect(res.payload.course.holes.length).toBe(18);
    expect(res.payload.course.par).toBe(72);
    expect(res.sizeBytes).toBeLessThan(2048);
    expect(res.isUnder2KB).toBe(true);
  });

  runner.test('F4-B5: Holes without explicit tee or green tags fallback to geometry endpoints', () => {
    const implicitHoleOSM = {
      elements: [
        {
          type: 'way',
          id: 501,
          tags: { golf: 'hole', ref: '1', par: '5' },
          geometry: [
            { lat: 42.1000, lon: 1.1000 },
            { lat: 42.1020, lon: 1.1020 },
            { lat: 42.1040, lon: 1.1040 }
          ]
        }
      ]
    };
    const res = serializeCoursePayload(implicitHoleOSM);
    const h1 = res.payload.course.holes[0];
    expect(h1.num).toBe(1);
    expect(h1.par).toBe(5);
    expect(h1.tee).toEqual([42.1, 1.1]);
    expect(h1.green).toEqual([42.104, 1.104]);
  });
});

// ─── Feature 5: Watch GPS Sensor Lifecycle Boundaries ───────────────────────

runner.describe('Feature 5: Watch GPS Sensor Lifecycle Boundaries', () => {
  runner.test('F5-B1: GPS movement delta of exactly 1.49m is ignored (< 1.5m)', () => {
    const sensor = createMockGeolocationSensor({ lat: 42.791200, lon: 0.601700 });
    let updateCount = 0;

    const ctrl = new WatchGPSController({
      sensor,
      onLocationUpdate: () => { updateCount++; },
      deltaThreshold: 1.5
    });

    ctrl.start();
    expect(updateCount).toBe(1); // initial fix

    // 1.49m north: dLat = 1.49 / 6371000 * 180 / PI = 0.000013396 deg
    const lat149 = 42.791200 + (1.49 / 6371000) * (180 / Math.PI);
    sensor.emitCoords(lat149, 0.601700);
    expect(updateCount).toBe(1); // still 1
  });

  runner.test('F5-B2: GPS movement delta of exactly 1.51m triggers distance update (>= 1.5m)', () => {
    const sensor = createMockGeolocationSensor({ lat: 42.791200, lon: 0.601700 });
    let updateCount = 0;

    const ctrl = new WatchGPSController({
      sensor,
      onLocationUpdate: () => { updateCount++; },
      deltaThreshold: 1.5
    });

    ctrl.start();
    expect(updateCount).toBe(1);

    // 1.51m north
    const lat151 = 42.791200 + (1.51 / 6371000) * (180 / Math.PI);
    sensor.emitCoords(lat151, 0.601700);
    expect(updateCount).toBe(2);
  });

  runner.test('F5-B3: Rapid successive callbacks with identical coords only update once', () => {
    const sensor = createMockGeolocationSensor({ lat: 42.7912, lon: 0.6017 });
    let updateCount = 0;

    const ctrl = new WatchGPSController({
      sensor,
      onLocationUpdate: () => { updateCount++; }
    });

    ctrl.start();
    for (let i = 0; i < 20; i++) {
      sensor.emitCoords(42.7912, 0.6017);
    }
    expect(updateCount).toBe(1);
  });

  runner.test('F5-B4: Sensor emitting NaN or non-number coordinates is safely ignored', () => {
    const sensor = createMockGeolocationSensor({ lat: 42.7912, lon: 0.6017 });
    let updateCount = 0;

    const ctrl = new WatchGPSController({
      sensor,
      onLocationUpdate: () => { updateCount++; }
    });

    ctrl.start();
    sensor.emitCoords(NaN, 0.6017);
    sensor.emitCoords(42.7912, null);
    sensor.emitCoords('invalid', 'coord');
    expect(updateCount).toBe(1);
  });

  runner.test('F5-B5: Multiple calls to start() and stop() are idempotent', () => {
    const sensor = createMockGeolocationSensor();
    const ctrl = new WatchGPSController({ sensor });

    ctrl.start();
    ctrl.start();
    expect(sensor.isActive()).toBe(true);
    ctrl.stop();
    ctrl.stop();
    expect(sensor.isActive()).toBe(false);
  });
});

// ─── Feature 6: Exact Haversine Distance Engine Boundaries ──────────────────

runner.describe('Feature 6: Exact Haversine Distance Boundaries', () => {
  runner.test('F6-B1: Antipodal coordinates across Earth diameter (~20,015 km)', () => {
    // 0,0 vs 0,180
    const d = haversineOracle(0, 0, 0, 180);
    expect(d).toBeCloseTo(20015087, -3); // ~20,015,087m
  });

  runner.test('F6-B2: North Pole (+90) to South Pole (-90)', () => {
    const d = haversineOracle(90, 0, -90, 0);
    expect(d).toBeCloseTo(20015087, -3);
  });

  runner.test('F6-B3: Sub-meter displacement (0.3m) rounds down to 0m', () => {
    const lat1 = 42.791200;
    const lat2 = lat1 + (0.3 / 6371000) * (180 / Math.PI);
    const d = haversineOracle(lat1, 0.6017, lat2, 0.6017);
    expect(d).toBe(0);
  });

  runner.test('F6-B4: 0.6m displacement rounds up to 1m', () => {
    const lat1 = 42.791200;
    const lat2 = lat1 + (0.6 / 6371000) * (180 / Math.PI);
    const d = haversineOracle(lat1, 0.6017, lat2, 0.6017);
    expect(d).toBe(1);
  });

  runner.test('F6-B5: Longitude wrap-around at 180 meridian (179.9999 to -179.9999)', () => {
    const d = haversineOracle(0, 179.9999, 0, -179.9999);
    expect(d).toBeCloseTo(22, -1); // ~22m across 180 meridian
  });
});

// ─── Feature 7: Dynamic Transition & Static Fallback Boundaries ─────────────

runner.describe('Feature 7: Dynamic Transition & Fallback Boundaries', () => {
  runner.test('F7-B1: Late companion response arriving after 10s timeout transitions or stays stable', () => {
    let timerCallback = null;
    const sm = new CourseStateManager({
      staticCourse: FIXTURE_STATIC_LUCHON,
      timerEngine: (cb) => { timerCallback = cb; return 1; }
    });

    const peerSocket = createMockPeerSocket();
    sm.onGPSFixSent(peerSocket, 42.7912, 0.6017);
    expect(sm.state).toBe(FallbackState.WAITING_OSM);

    // Timeout triggers fallback
    timerCallback();
    expect(sm.state).toBe(FallbackState.FALLBACK_STATIC);

    // Delayed response arrives
    const payload = serializeCoursePayload(FIXTURE_LUCHON_OSM).payload;
    sm.onCompanionMessage(payload);
    expect(sm.state).toBe(FallbackState.DYNAMIC_ACTIVE);
    expect(sm.isDynamic).toBe(true);
  });

  runner.test('F7-B2: Empty holes array payload triggers static fallback', () => {
    const sm = new CourseStateManager({ staticCourse: FIXTURE_STATIC_LUCHON });
    sm.onCompanionMessage({ type: 'COURSE_DATA', course: { name: 'Empty', par: 0, holes: [] } });
    expect(sm.state).toBe(FallbackState.FALLBACK_STATIC);
    expect(sm.isDynamic).toBe(false);
  });

  runner.test('F7-B3: Repeated onGPSFixSent calls do not leak timers', () => {
    let timerClears = 0;
    const sm = new CourseStateManager({
      staticCourse: FIXTURE_STATIC_LUCHON,
      timerEngine: () => 999,
      clearTimerEngine: () => { timerClears++; }
    });

    const peerSocket = createMockPeerSocket();
    sm.onGPSFixSent(peerSocket, 42.7912, 0.6017);
    sm.onGPSFixSent(peerSocket, 42.7912, 0.6017);
    expect(timerClears).toBe(1);
  });

  runner.test('F7-B4: Hole index is preserved within bounds during course transitions', () => {
    const sm = new CourseStateManager({ staticCourse: FIXTURE_STATIC_LUCHON });
    sm.setHoleIndex(3);
    expect(sm.currentHoleIndex).toBe(3);

    const payload = serializeCoursePayload(FIXTURE_LUCHON_OSM).payload;
    sm.onCompanionMessage(payload);
    expect(sm.currentHoleIndex).toBe(3);
  });

  runner.test('F7-B5: Out-of-bounds hole index request is clamped/ignored', () => {
    const sm = new CourseStateManager({ staticCourse: FIXTURE_STATIC_LUCHON });
    sm.setHoleIndex(-1);
    expect(sm.currentHoleIndex).toBe(0);
    sm.setHoleIndex(99);
    expect(sm.currentHoleIndex).toBe(0);
  });
});

// ─── Feature 8: Prominent Central Green Distance UI Boundaries ──────────────

runner.describe('Feature 8: Green Distance UI Boundaries', () => {
  runner.test('F8-B1: Extreme distance value (9999m) formats correctly', () => {
    const hmUI = createMockHmUI();
    const ui = new WatchUIController(hmUI);
    ui.initWidgets();

    ui.updateDistances({ greenDist: 9999 });
    expect(ui.greenWidget.getProperty('TEXT')).toBe('9999m');
  });

  runner.test('F8-B2: Exact 0m distance displays 0m', () => {
    const hmUI = createMockHmUI();
    const ui = new WatchUIController(hmUI);
    ui.initWidgets();

    ui.updateDistances({ greenDist: 0 });
    expect(ui.greenWidget.getProperty('TEXT')).toBe('0m');
  });

  runner.test('F8-B3: 100 rapid distance updates execute without memory or widget growth', () => {
    const hmUI = createMockHmUI();
    const ui = new WatchUIController(hmUI);
    ui.initWidgets();

    for (let i = 300; i >= 0; i--) {
      ui.updateDistances({ greenDist: i });
    }

    expect(hmUI.getCreatedWidgets().length).toBe(4); // 1 green + 3 bunkers
    expect(ui.greenWidget.getProperty('TEXT')).toBe('0m');
  });

  runner.test('F8-B4: Calling updateDistances before initWidgets does not throw', () => {
    const hmUI = createMockHmUI();
    const ui = new WatchUIController(hmUI);
    expect(() => ui.updateDistances({ greenDist: 100 })).not.toThrow();
  });

  runner.test('F8-B5: Green widget dimensions are consistent with 454x454 AMOLED screen', () => {
    const hmUI = createMockHmUI();
    const ui = new WatchUIController(hmUI);
    ui.initWidgets();

    const p = ui.greenWidget._props;
    expect(p.w).toBe(454);
    expect(p.h).toBe(80);
    expect(p.text_size).toBe(64);
  });
});

// ─── Feature 9: Obstacle & Bunker Distance List UI Boundaries ───────────────

runner.describe('Feature 9: Bunker Distance List UI Boundaries', () => {
  runner.test('F9-B1: Excess bunkers (> 3) are capped to top 3 without crashing', () => {
    const hmUI = createMockHmUI();
    const ui = new WatchUIController(hmUI);
    ui.initWidgets();

    ui.updateDistances({ greenDist: 200, bunkerDists: [50, 75, 100, 125, 150] });
    expect(ui.bunkerWidgets[0].getProperty('TEXT')).toBe('B1: 50m');
    expect(ui.bunkerWidgets[1].getProperty('TEXT')).toBe('B2: 75m');
    expect(ui.bunkerWidgets[2].getProperty('TEXT')).toBe('B3: 100m');
  });

  runner.test('F9-B2: Bunker distance of 0m displays B1: 0m', () => {
    const hmUI = createMockHmUI();
    const ui = new WatchUIController(hmUI);
    ui.initWidgets();

    ui.updateDistances({ greenDist: 50, bunkerDists: [0] });
    expect(ui.bunkerWidgets[0].getProperty('TEXT')).toBe('B1: 0m');
    expect(ui.bunkerWidgets[1].getProperty('TEXT')).toBe('');
  });

  runner.test('F9-B3: Transitioning from 3 bunkers to 0 bunkers clears all bunker text', () => {
    const hmUI = createMockHmUI();
    const ui = new WatchUIController(hmUI);
    ui.initWidgets();

    ui.updateDistances({ greenDist: 180, bunkerDists: [60, 80, 110] });
    ui.updateDistances({ greenDist: 180, bunkerDists: [] });

    expect(ui.bunkerWidgets[0].getProperty('TEXT')).toBe('');
    expect(ui.bunkerWidgets[1].getProperty('TEXT')).toBe('');
    expect(ui.bunkerWidgets[2].getProperty('TEXT')).toBe('');
  });

  runner.test('F9-B4: Large bunker distance (> 1000m) formats correctly', () => {
    const hmUI = createMockHmUI();
    const ui = new WatchUIController(hmUI);
    ui.initWidgets();

    ui.updateDistances({ greenDist: 1500, bunkerDists: [1200] });
    expect(ui.bunkerWidgets[0].getProperty('TEXT')).toBe('B1: 1200m');
  });

  runner.test('F9-B5: Alternating bunker counts (3 -> 1 -> 2 -> 0) updates in-place', () => {
    const hmUI = createMockHmUI();
    const ui = new WatchUIController(hmUI);
    ui.initWidgets();

    ui.updateDistances({ greenDist: 200, bunkerDists: [10, 20, 30] });
    ui.updateDistances({ greenDist: 190, bunkerDists: [15] });
    expect(ui.bunkerWidgets[0].getProperty('TEXT')).toBe('B1: 15m');
    expect(ui.bunkerWidgets[1].getProperty('TEXT')).toBe('');
    expect(ui.bunkerWidgets[2].getProperty('TEXT')).toBe('');

    ui.updateDistances({ greenDist: 180, bunkerDists: [12, 25] });
    expect(ui.bunkerWidgets[0].getProperty('TEXT')).toBe('B1: 12m');
    expect(ui.bunkerWidgets[1].getProperty('TEXT')).toBe('B2: 25m');
    expect(ui.bunkerWidgets[2].getProperty('TEXT')).toBe('');
  });
});

// ─── Feature 10: Bidirectional peerSocket Protocol Boundaries ───────────────

runner.describe('Feature 10: peerSocket Protocol Boundaries', () => {
  runner.test('F10-B1: Payload near max size limit (2047 bytes) transmits successfully', () => {
    const peerSocket = createMockPeerSocket();
    const payload = 'A'.repeat(2047);
    peerSocket.send(payload);
    expect(peerSocket.getSentMessages()[0].length).toBe(2047);
  });

  runner.test('F10-B2: Payload exactly at 2048 bytes transmits', () => {
    const peerSocket = createMockPeerSocket();
    const payload = 'B'.repeat(2048);
    peerSocket.send(payload);
    expect(peerSocket.getSentMessages()[0].length).toBe(2048);
  });

  runner.test('F10-B3: Socket state CLOSING (readyState 2) prevents transmission', () => {
    const peerSocket = createMockPeerSocket();
    peerSocket.setReadyState(peerSocket.CLOSING);
    expect(() => peerSocket.send('msg')).toThrow('peerSocket is not OPEN');
  });

  runner.test('F10-B4: Simulated socket error notifies error listeners', () => {
    const peerSocket = createMockPeerSocket();
    let errorCaught = null;

    peerSocket.addEventListener('error', (err) => {
      errorCaught = err;
    });

    peerSocket.simulateError(new Error('Bluetooth connection lost'));
    expect(errorCaught).not.toBeNull();
    expect(errorCaught.message).toBe('Bluetooth connection lost');
  });

  runner.test('F10-B5: Receiving non-string/raw buffer data does not throw uncaught error', () => {
    const peerSocket = createMockPeerSocket();
    let received = null;

    peerSocket.addEventListener('message', (evt) => {
      received = evt.data;
    });

    peerSocket.simulateReceive({ byteLength: 64 });
    expect(received).not.toBeNull();
  });
});

// Run directly if invoked from command line
if (require.main === module) {
  runner.run().then(summary => {
    console.log(`\n=== ${summary.suiteName} ===`);
    console.log(`Passed: ${summary.passed}/${summary.total} (Failed: ${summary.failed})`);
    if (summary.failed > 0) {
      console.error('\nFailures:');
      summary.results.filter(r => r.status === 'FAILED').forEach(r => {
        console.error(`- ${r.name}: ${r.error}`);
      });
      process.exit(1);
    }
  });
}

module.exports = runner;
