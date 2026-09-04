/**
 * tests/tier1_features.test.js
 * Tier 1 Feature Coverage Tests (>= 5 tests per feature F1 to F10, total >= 50 tests).
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
  createMockHmStorage,
  FIXTURE_LUCHON_OSM,
  FIXTURE_TOTCHE_OSM,
  FIXTURE_STATIC_LUCHON
} = req ? req('./helpers') : {};

const runner = new TestRunner('Tier 1: Feature Coverage Tests');

// ─── Feature 1: Overpass QL Query Construction (R1) ─────────────────────────

runner.describe('Feature 1: Overpass QL Query Construction', () => {
  runner.test('F1-1: Construct query with default 3000m radius around GPS coordinate', () => {
    const lat = 42.791202;
    const lon = 0.601721;
    const q = buildOverpassQuery(lat, lon);
    expect(q).toContain('around:3000,42.791202,0.601721');
  });

  runner.test('F1-2: Construct query with custom radius', () => {
    const q = buildOverpassQuery(42.7912, 0.6017, 1500);
    expect(q).toContain('around:1500,42.7912,0.6017');
  });

  runner.test('F1-3: Query contains required Overpass QL header and geometry output', () => {
    const q = buildOverpassQuery(42.7912, 0.6017);
    expect(q.startsWith('[out:json][timeout:25];')).toBe(true);
    expect(q.endsWith('out geom;')).toBe(true);
  });

  runner.test('F1-4: Query targets leisure=golf_course and golf hole/green/bunker/tee tags', () => {
    const q = buildOverpassQuery(42.7912, 0.6017);
    expect(q).toContain('nwr["leisure"="golf_course"]');
    expect(q).toContain('nwr["golf"~"^(hole|green|bunker|tee)$"]');
  });

  runner.test('F1-5: Rejects invalid or non-numeric coordinates with error', () => {
    expect(() => buildOverpassQuery(NaN, 0.6017)).toThrow('Invalid coordinates');
    expect(() => buildOverpassQuery(42.7912, null)).toThrow('Invalid coordinates');
  });
});

// ─── Feature 2: Multi-Endpoint Failover & Session Cache (R1) ────────────────

runner.describe('Feature 2: Multi-Endpoint Failover & Session Cache', () => {
  runner.test('F2-1: Primary endpoint success returns data without contacting mirror endpoints', async () => {
    let callCount = 0;
    const mockFetch = async (url) => {
      callCount++;
      return {
        ok: true,
        status: 200,
        json: async () => FIXTURE_LUCHON_OSM
      };
    };

    const fetcher = new OverpassFetcherEngine(OVERPASS_ENDPOINTS, mockFetch);
    const result = await fetcher.fetchWithFailover('query', 42.7912, 0.6017);
    expect(callCount).toBe(1);
    expect(result.fromCache).toBe(false);
    expect(result.endpointUsed).toBe(OVERPASS_ENDPOINTS[0]);
    expect(result.data.elements.length).toBe(FIXTURE_LUCHON_OSM.elements.length);
  });

  runner.test('F2-2: Primary endpoint 500 error fails over to second endpoint', async () => {
    const calledUrls = [];
    const mockFetch = async (url) => {
      calledUrls.push(url);
      if (url.startsWith(OVERPASS_ENDPOINTS[0])) {
        return { ok: false, status: 500 };
      }
      return {
        ok: true,
        status: 200,
        json: async () => FIXTURE_LUCHON_OSM
      };
    };

    const fetcher = new OverpassFetcherEngine(OVERPASS_ENDPOINTS, mockFetch);
    const result = await fetcher.fetchWithFailover('query', 42.7912, 0.6017);
    expect(calledUrls.length).toBe(2);
    expect(calledUrls[0].startsWith(OVERPASS_ENDPOINTS[0])).toBe(true);
    expect(calledUrls[1].startsWith(OVERPASS_ENDPOINTS[1])).toBe(true);
    expect(result.endpointUsed).toBe(OVERPASS_ENDPOINTS[1]);
  });

  runner.test('F2-3: Failover continues through third mirror if first two fail', async () => {
    let attempts = 0;
    const mockFetch = async (url) => {
      attempts++;
      if (attempts < 3) {
        throw new Error('Connection timeout');
      }
      return {
        ok: true,
        status: 200,
        json: async () => FIXTURE_LUCHON_OSM
      };
    };

    const fetcher = new OverpassFetcherEngine(OVERPASS_ENDPOINTS, mockFetch);
    const result = await fetcher.fetchWithFailover('query', 42.7912, 0.6017);
    expect(attempts).toBe(3);
    expect(result.endpointUsed).toBe(OVERPASS_ENDPOINTS[2]);
  });

  runner.test('F2-4: Throws error when all mirror endpoints fail', async () => {
    const mockFetch = async () => {
      return { ok: false, status: 503 };
    };

    const fetcher = new OverpassFetcherEngine(OVERPASS_ENDPOINTS, mockFetch);
    let threw = false;
    try {
      await fetcher.fetchWithFailover('query', 42.7912, 0.6017);
    } catch (e) {
      threw = true;
      expect(e.message).toContain('All Overpass endpoints failed');
    }
    expect(threw).toBe(true);
  });

  runner.test('F2-5: Session cache returns cached data on second call without network fetch', async () => {
    let callCount = 0;
    const mockFetch = async () => {
      callCount++;
      return {
        ok: true,
        status: 200,
        json: async () => FIXTURE_LUCHON_OSM
      };
    };

    const fetcher = new OverpassFetcherEngine(OVERPASS_ENDPOINTS, mockFetch);
    const res1 = await fetcher.fetchWithFailover('query', 42.7912, 0.6017);
    const res2 = await fetcher.fetchWithFailover('query', 42.7912, 0.6017);

    expect(callCount).toBe(1);
    expect(res1.fromCache).toBe(false);
    expect(res2.fromCache).toBe(true);
    expect(res2.data.elements.length).toBe(FIXTURE_LUCHON_OSM.elements.length);
  });
});

// ─── Feature 3: Polygon Centroid Math (Shoelace / Green's Theorem) ──────────

runner.describe('Feature 3: Polygon Centroid Math', () => {
  runner.test('F3-1: Centroid of a square polygon is its geometric center', () => {
    const square = [
      { lat: 10, lon: 10 },
      { lat: 10, lon: 20 },
      { lat: 20, lon: 20 },
      { lat: 20, lon: 10 },
      { lat: 10, lon: 10 }
    ];
    const c = shoelaceCentroidOracle(square);
    expect(c.lat).toBeCloseTo(15, 4);
    expect(c.lon).toBeCloseTo(15, 4);
  });

  runner.test('F3-2: Centroid of a triangle polygon matches arithmetic average of vertices', () => {
    const triangle = [
      { lat: 0, lon: 0 },
      { lat: 0, lon: 6 },
      { lat: 6, lon: 0 },
      { lat: 0, lon: 0 }
    ];
    const c = shoelaceCentroidOracle(triangle);
    expect(c.lat).toBeCloseTo(2, 4);
    expect(c.lon).toBeCloseTo(2, 4);
  });

  runner.test('F3-3: Element node with lat/lon directly returns node coordinates', () => {
    const nodeEl = { type: 'node', id: 3001, lat: 42.791202, lon: 0.601721 };
    const c = calculateCentroid(nodeEl);
    expect(c.lat).toBe(42.791202);
    expect(c.lon).toBe(0.601721);
  });

  runner.test('F3-4: Degenerate collinear points fallback to arithmetic mean', () => {
    const collinear = [
      { lat: 10, lon: 10 },
      { lat: 20, lon: 20 },
      { lat: 30, lon: 30 }
    ];
    const c = shoelaceCentroidOracle(collinear);
    expect(c.lat).toBeCloseTo(20, 4);
    expect(c.lon).toBeCloseTo(20, 4);
  });

  runner.test('F3-5: Calculate centroid for realistic golf green polygon', () => {
    const greenEl = FIXTURE_LUCHON_OSM.elements.find(e => e.tags && e.tags.golf === 'green' && e.tags.ref === '1');
    const c = calculateCentroid(greenEl);
    expect(c.lat).toBeCloseTo(42.78827, 4);
    expect(c.lon).toBeCloseTo(0.60173, 4);
  });
});

// ─── Feature 4: Ultra-Compact Payload Serializer (< 2 KB) ──────────────────

runner.describe('Feature 4: Ultra-Compact Payload Serializer & Quantization', () => {
  runner.test('F4-1: Serializes Golf de Luchon OSM elements to valid COURSE_DATA structure', () => {
    const res = serializeCoursePayload(FIXTURE_LUCHON_OSM);
    expect(res.payload.type).toBe('COURSE_DATA');
    expect(res.payload.course.name).toBe('Golf de Luchon');
    expect(res.payload.course.holes.length).toBe(9);
    expect(res.payload.course.par).toBe(33);
  });

  runner.test('F4-2: Serialized JSON payload is strictly under 2048 bytes (< 2 KB)', () => {
    const res = serializeCoursePayload(FIXTURE_LUCHON_OSM);
    expect(res.isUnder2KB).toBe(true);
    expect(res.sizeBytes).toBeLessThan(2048);
  });

  runner.test('F4-3: Coordinates are quantized to 5 decimal places', () => {
    const res = serializeCoursePayload(FIXTURE_LUCHON_OSM);
    const hole1 = res.payload.course.holes[0];
    const greenLatDecimals = hole1.green[0].toString().split('.')[1] || '';
    const greenLonDecimals = hole1.green[1].toString().split('.')[1] || '';
    expect(greenLatDecimals.length).toBeLessThanOrEqual(5);
    expect(greenLonDecimals.length).toBeLessThanOrEqual(5);
  });

  runner.test('F4-4: Completely strips OSM metadata from serialized output', () => {
    const res = serializeCoursePayload(FIXTURE_LUCHON_OSM);
    expect(res.jsonString).not.toContain('"id":');
    expect(res.jsonString).not.toContain('"tags":');
    expect(res.jsonString).not.toContain('"generator":');
    expect(res.jsonString).not.toContain('"version":');
  });

  runner.test('F4-5: Caps bunkers to maximum 3 nearest per hole', () => {
    const res = serializeCoursePayload(FIXTURE_LUCHON_OSM);
    for (const hole of res.payload.course.holes) {
      expect(hole.bunkers.length).toBeLessThanOrEqual(3);
    }
  });
});

// ─── Feature 5: Watch GPS Sensor Lifecycle & Request Trigger ────────────────

runner.describe('Feature 5: Watch GPS Sensor Lifecycle & Request Trigger', () => {
  runner.test('F5-1: Sensor activates and registers update callback on start', () => {
    const sensor = createMockGeolocationSensor();
    const ctrl = new WatchGPSController({ sensor });
    expect(sensor.isActive()).toBe(false);
    ctrl.start();
    expect(sensor.isActive()).toBe(true);
  });

  runner.test('F5-2: First GPS fix triggers onFirstFix callback with coordinates', () => {
    const sensor = createMockGeolocationSensor();
    let firstFixCalled = false;
    let fixCoords = null;

    const ctrl = new WatchGPSController({
      sensor,
      onFirstFix: (coords) => {
        firstFixCalled = true;
        fixCoords = coords;
      }
    });

    ctrl.start();
    expect(firstFixCalled).toBe(true);
    expect(fixCoords.lat).toBe(42.791202);
    expect(fixCoords.lon).toBe(0.601721);
  });

  runner.test('F5-3: Coordinate movement under 1.5m delta is filtered and ignored', () => {
    const sensor = createMockGeolocationSensor({ lat: 42.791202, lon: 0.601721 });
    let updateCount = 0;

    const ctrl = new WatchGPSController({
      sensor,
      onLocationUpdate: () => {
        updateCount++;
      },
      deltaThreshold: 1.5
    });

    ctrl.start();
    expect(updateCount).toBe(1); // initial fix

    // Move ~0.5m (approx 0.000004 deg)
    sensor.emitCoords(42.791205, 0.601721);
    expect(updateCount).toBe(1); // ignored
  });

  runner.test('F5-4: Coordinate movement >= 1.5m delta triggers update callback', () => {
    const sensor = createMockGeolocationSensor({ lat: 42.791202, lon: 0.601721 });
    let updateCount = 0;

    const ctrl = new WatchGPSController({
      sensor,
      onLocationUpdate: () => {
        updateCount++;
      },
      deltaThreshold: 1.5
    });

    ctrl.start();
    expect(updateCount).toBe(1);

    // Move ~5m north (approx 0.000045 deg)
    sensor.emitCoords(42.791250, 0.601721);
    expect(updateCount).toBe(2);
  });

  runner.test('F5-5: Stop deactivates sensor lifecycle cleanly', () => {
    const sensor = createMockGeolocationSensor();
    const ctrl = new WatchGPSController({ sensor });
    ctrl.start();
    expect(sensor.isActive()).toBe(true);
    ctrl.stop();
    expect(sensor.isActive()).toBe(false);
  });
});

// ─── Feature 6: Exact Haversine Distance Engine ────────────────────────────

runner.describe('Feature 6: Exact Haversine Distance Engine', () => {
  runner.test('F6-1: Exact 0 meters distance when coordinates are identical', () => {
    const d = haversineOracle(42.791202, 0.601721, 42.791202, 0.601721);
    expect(d).toBe(0);
  });

  runner.test('F6-2: Luchon Hole 1 Tee to Green distance matches expected ~326 meters', () => {
    const tee = { lat: 42.791202, lon: 0.601721 };
    const green = { lat: 42.788272, lon: 0.601729 };
    const d = haversineOracle(tee.lat, tee.lon, green.lat, green.lon);
    expect(d).toBe(326);
  });

  runner.test('F6-3: Calculates small displacement distances (e.g. 10m north)', () => {
    const lat1 = 42.791200;
    const lon1 = 0.601700;
    // 10m north is approx 0.00009 deg lat
    const lat2 = lat1 + (10 / 6371000) * (180 / Math.PI);
    const d = haversineOracle(lat1, lon1, lat2, lon1);
    expect(d).toBe(10);
  });

  runner.test('F6-4: Cardinal symmetry (A to B equals B to A)', () => {
    const d1 = haversineOracle(42.7912, 0.6017, 42.7882, 0.6019);
    const d2 = haversineOracle(42.7882, 0.6019, 42.7912, 0.6017);
    expect(d1).toBe(d2);
  });

  runner.test('F6-5: Prime meridian & equator calculations are mathematically stable', () => {
    const d = haversineOracle(0, 0, 0, 1);
    // 1 deg on equator = 2 * PI * 6371000 / 360 = 111195m
    expect(d).toBe(111195);
  });
});

// ─── Feature 7: Dynamic Transition & Static Fallback State Machine ──────────

runner.describe('Feature 7: Dynamic Transition & Fallback State Machine', () => {
  runner.test('F7-1: Initial state is STATIC_INIT with static course loaded', () => {
    const sm = new CourseStateManager({ staticCourse: FIXTURE_STATIC_LUCHON });
    expect(sm.state).toBe(FallbackState.STATIC_INIT);
    expect(sm.isDynamic).toBe(false);
    expect(sm.currentCourse.name).toBe('Golf de Luchon');
  });

  runner.test('F7-2: GPS fix triggers WAITING_OSM and sends REQUEST_OSM message', () => {
    const peerSocket = createMockPeerSocket();
    const sm = new CourseStateManager({ staticCourse: FIXTURE_STATIC_LUCHON });
    sm.onGPSFixSent(peerSocket, 42.791202, 0.601721);

    expect(sm.state).toBe(FallbackState.WAITING_OSM);
    const sent = peerSocket.getSentMessages();
    expect(sent.length).toBe(1);
    const msg = JSON.parse(sent[0]);
    expect(msg.type).toBe('REQUEST_OSM');
    expect(msg.lat).toBe(42.791202);
  });

  runner.test('F7-3: Valid COURSE_DATA response triggers seamless transition to DYNAMIC_ACTIVE', () => {
    const peerSocket = createMockPeerSocket();
    const sm = new CourseStateManager({ staticCourse: FIXTURE_STATIC_LUCHON });
    sm.onGPSFixSent(peerSocket, 42.791202, 0.601721);

    const payload = serializeCoursePayload(FIXTURE_LUCHON_OSM).payload;
    sm.onCompanionMessage(payload);

    expect(sm.state).toBe(FallbackState.DYNAMIC_ACTIVE);
    expect(sm.isDynamic).toBe(true);
    expect(sm.currentCourse.holes.length).toBe(9);
  });

  runner.test('F7-4: 10-second timeout silently switches to FALLBACK_STATIC without crashing', () => {
    let timerCallback = null;
    const mockTimerEngine = (cb) => {
      timerCallback = cb;
      return 123;
    };

    const peerSocket = createMockPeerSocket();
    const sm = new CourseStateManager({
      staticCourse: FIXTURE_STATIC_LUCHON,
      timerEngine: mockTimerEngine
    });

    sm.onGPSFixSent(peerSocket, 42.791202, 0.601721);
    expect(sm.state).toBe(FallbackState.WAITING_OSM);

    // Simulate timeout firing
    timerCallback();
    expect(sm.state).toBe(FallbackState.FALLBACK_STATIC);
    expect(sm.isDynamic).toBe(false);
    expect(sm.currentCourse.name).toBe('Golf de Luchon');
  });

  runner.test('F7-5: Malformed payload or companion error triggers silent static fallback', () => {
    const sm = new CourseStateManager({ staticCourse: FIXTURE_STATIC_LUCHON });
    sm.onCompanionMessage('INVALID_NON_JSON');
    expect(sm.state).toBe(FallbackState.FALLBACK_STATIC);
    expect(sm.isDynamic).toBe(false);
  });
});

// ─── Feature 8: Prominent Central Green Distance UI ─────────────────────────

runner.describe('Feature 8: Prominent Central Green Distance UI', () => {
  runner.test('F8-1: Green widget is initialized with large 64px font and centered alignment', () => {
    const hmUI = createMockHmUI();
    const ui = new WatchUIController(hmUI);
    ui.initWidgets();

    expect(ui.greenWidget._props.text_size).toBe(64);
    expect(ui.greenWidget._props.align_h).toBe(hmUI.align.CENTER_H);
    expect(ui.greenWidget._props.align_v).toBe(hmUI.align.CENTER_V);
    expect(ui.greenWidget._props.text).toBe('---');
  });

  runner.test('F8-2: Updates green distance with formatted meter string', () => {
    const hmUI = createMockHmUI();
    const ui = new WatchUIController(hmUI);
    ui.initWidgets();

    ui.updateDistances({ greenDist: 142 });
    expect(ui.greenWidget.getProperty('TEXT')).toBe('142m');
  });

  runner.test('F8-3: Null or undefined green distance displays placeholder', () => {
    const hmUI = createMockHmUI();
    const ui = new WatchUIController(hmUI);
    ui.initWidgets();

    ui.updateDistances({ greenDist: null });
    expect(ui.greenWidget.getProperty('TEXT')).toBe('---');
  });

  runner.test('F8-4: In-place update modifies existing widget instance without re-creation', () => {
    const hmUI = createMockHmUI();
    const ui = new WatchUIController(hmUI);
    ui.initWidgets();

    const initialWidgetCount = hmUI.getCreatedWidgets().length;
    ui.updateDistances({ greenDist: 150 });
    ui.updateDistances({ greenDist: 140 });
    ui.updateDistances({ greenDist: 130 });

    expect(hmUI.getCreatedWidgets().length).toBe(initialWidgetCount);
  });

  runner.test('F8-5: Center positioning coordinates adhere to 454x454 round screen bounds', () => {
    const hmUI = createMockHmUI();
    const ui = new WatchUIController(hmUI);
    ui.initWidgets();

    const p = ui.greenWidget._props;
    expect(p.w).toBe(454);
    expect(p.y).toBeGreaterThanOrEqual(100);
    expect(p.y + p.h).toBeLessThanOrEqual(350);
  });
});

// ─── Feature 9: Obstacle & Bunker Distance List UI ──────────────────────────

runner.describe('Feature 9: Obstacle & Bunker Distance List UI', () => {
  runner.test('F9-1: Pre-allocates 3 secondary bunker list widgets', () => {
    const hmUI = createMockHmUI();
    const ui = new WatchUIController(hmUI);
    ui.initWidgets();

    expect(ui.bunkerWidgets.length).toBe(3);
    for (const bw of ui.bunkerWidgets) {
      expect(bw._props.text_size).toBe(24);
    }
  });

  runner.test('F9-2: Displays formatted bunker distances for hole with 2 bunkers', () => {
    const hmUI = createMockHmUI();
    const ui = new WatchUIController(hmUI);
    ui.initWidgets();

    ui.updateDistances({ greenDist: 200, bunkerDists: [85, 110] });
    expect(ui.bunkerWidgets[0].getProperty('TEXT')).toBe('B1: 85m');
    expect(ui.bunkerWidgets[1].getProperty('TEXT')).toBe('B2: 110m');
    expect(ui.bunkerWidgets[2].getProperty('TEXT')).toBe('');
  });

  runner.test('F9-3: Clears bunker widgets when hole has no bunkers', () => {
    const hmUI = createMockHmUI();
    const ui = new WatchUIController(hmUI);
    ui.initWidgets();

    ui.updateDistances({ greenDist: 150, bunkerDists: [] });
    expect(ui.bunkerWidgets[0].getProperty('TEXT')).toBe('');
    expect(ui.bunkerWidgets[1].getProperty('TEXT')).toBe('');
    expect(ui.bunkerWidgets[2].getProperty('TEXT')).toBe('');
  });

  runner.test('F9-4: In-place update maintains widget pool without UI flicker', () => {
    const hmUI = createMockHmUI();
    const ui = new WatchUIController(hmUI);
    ui.initWidgets();

    const initialCount = hmUI.getCreatedWidgets().length;
    ui.updateDistances({ greenDist: 180, bunkerDists: [90, 120, 140] });
    ui.updateDistances({ greenDist: 170, bunkerDists: [80, 110, 130] });

    expect(hmUI.getCreatedWidgets().length).toBe(initialCount);
  });

  runner.test('F9-5: Handles 3 bunkers gracefully with full labels', () => {
    const hmUI = createMockHmUI();
    const ui = new WatchUIController(hmUI);
    ui.initWidgets();

    ui.updateDistances({ greenDist: 250, bunkerDists: [75, 95, 130] });
    expect(ui.bunkerWidgets[0].getProperty('TEXT')).toBe('B1: 75m');
    expect(ui.bunkerWidgets[1].getProperty('TEXT')).toBe('B2: 95m');
    expect(ui.bunkerWidgets[2].getProperty('TEXT')).toBe('B3: 130m');
  });
});

// ─── Feature 10: Bidirectional peerSocket Protocol ──────────────────────────

runner.describe('Feature 10: Bidirectional peerSocket Protocol', () => {
  runner.test('F10-1: Dispatches REQUEST_OSM message with lat/lon payload', () => {
    const peerSocket = createMockPeerSocket();
    peerSocket.send(JSON.stringify({ type: 'REQUEST_OSM', lat: 42.7912, lon: 0.6017 }));

    const msgs = peerSocket.getSentMessages();
    expect(msgs.length).toBe(1);
    const parsed = JSON.parse(msgs[0]);
    expect(parsed.type).toBe('REQUEST_OSM');
    expect(parsed.lat).toBe(42.7912);
  });

  runner.test('F10-2: Phone service receives REQUEST_OSM and responds with COURSE_DATA', () => {
    const peerSocket = createMockPeerSocket();

    // Simulate companion listener
    peerSocket.addEventListener('message', (evt) => {
      const data = JSON.parse(evt.data);
      if (data.type === 'REQUEST_OSM') {
        const payload = serializeCoursePayload(FIXTURE_LUCHON_OSM).payload;
        peerSocket.send(JSON.stringify(payload));
      }
    });

    // Watch triggers request
    peerSocket.simulateReceive(JSON.stringify({ type: 'REQUEST_OSM', lat: 42.791202, lon: 0.601721 }));
    
    const sent = peerSocket.getSentMessages();
    expect(sent.length).toBe(1);
    const receivedPayload = JSON.parse(sent[0]);
    expect(receivedPayload.type).toBe('COURSE_DATA');
    expect(receivedPayload.course.name).toBe('Golf de Luchon');
  });

  runner.test('F10-3: peerSocket throws when sending while not OPEN', () => {
    const peerSocket = createMockPeerSocket();
    peerSocket.setReadyState(peerSocket.CLOSED);

    expect(() => {
      peerSocket.send(JSON.stringify({ type: 'REQUEST_OSM', lat: 0, lon: 0 }));
    }).toThrow('peerSocket is not OPEN');
  });

  runner.test('F10-4: Event listeners can be registered and unregistered safely', () => {
    const peerSocket = createMockPeerSocket();
    let callCount = 0;
    const listener = () => { callCount++; };

    peerSocket.addEventListener('message', listener);
    peerSocket.simulateReceive(JSON.stringify({ test: 1 }));
    expect(callCount).toBe(1);

    peerSocket.removeEventListener('message', listener);
    peerSocket.simulateReceive(JSON.stringify({ test: 2 }));
    expect(callCount).toBe(1);
  });

  runner.test('F10-5: Handles empty or invalid payload without throwing uncaught error', () => {
    const peerSocket = createMockPeerSocket();
    let handled = false;

    peerSocket.addEventListener('message', (evt) => {
      try {
        JSON.parse(evt.data);
      } catch (e) {
        handled = true;
      }
    });

    peerSocket.simulateReceive('{invalid_json}');
    expect(handled).toBe(true);
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
