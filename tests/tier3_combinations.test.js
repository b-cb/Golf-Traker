/**
 * tests/tier3_combinations.test.js
 * Tier 3 Pairwise Combinatorial & Cross-Feature Interaction Tests (>= 10 tests).
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
  FIXTURE_STATIC_LUCHON
} = req ? req('./helpers') : {};

const runner = new TestRunner('Tier 3: Pairwise Combinatorial Tests');

// ─── Combination 1: F1 (Query Builder) + F2 (Failover) + F4 (Serializer) ─────

runner.test('Combo 1: Query Builder -> Failover Fetch -> Payload Serializer pipeline', async () => {
  const lat = 42.791202;
  const lon = 0.601721;
  const query = buildOverpassQuery(lat, lon);
  expect(query).toContain('around:3000,42.791202,0.601721');

  let callCount = 0;
  const mockFetch = async (url) => {
    callCount++;
    if (callCount === 1) return { ok: false, status: 503 }; // primary mirror fails
    return { ok: true, status: 200, json: async () => FIXTURE_LUCHON_OSM };
  };

  const fetcher = new OverpassFetcherEngine(OVERPASS_ENDPOINTS, mockFetch);
  const fetchResult = await fetcher.fetchWithFailover(query, lat, lon);
  expect(fetchResult.endpointUsed).toBe(OVERPASS_ENDPOINTS[1]);

  const serialized = serializeCoursePayload(fetchResult.data);
  expect(serialized.payload.course.name).toBe('Golf de Luchon');
  expect(serialized.payload.course.holes.length).toBe(9);
  expect(serialized.isUnder2KB).toBe(true);
});

// ─── Combination 2: F3 (Shoelace Centroids) + F4 (5-Dec Quantization & Size) ─

runner.test('Combo 2: Shoelace Centroid Math -> 5-Decimal Quantization -> Size Budget', () => {
  // Extract green polygon from OSM fixture
  const greenEl = FIXTURE_LUCHON_OSM.elements.find(e => e.tags && e.tags.golf === 'green' && e.tags.ref === '1');
  const centroid = calculateCentroid(greenEl);
  expect(centroid).not.toBeNull();

  const serialized = serializeCoursePayload(FIXTURE_LUCHON_OSM);
  const hole1 = serialized.payload.course.holes[0];
  expect(hole1.green[0]).toBeCloseTo(centroid.lat, 4);
  expect(hole1.green[1]).toBeCloseTo(centroid.lon, 4);
  expect(serialized.sizeBytes).toBeLessThan(2048);
});

// ─── Combination 3: F5 (GPS Fix) + F10 (peerSocket) + F7 (Dynamic Transition) ─

runner.test('Combo 3: First GPS Fix dispatches REQUEST_OSM -> Receives COURSE_DATA -> Transitions to Dynamic', () => {
  const sensor = createMockGeolocationSensor({ lat: 42.791202, lon: 0.601721 });
  const peerSocket = createMockPeerSocket();
  const stateManager = new CourseStateManager({ staticCourse: FIXTURE_STATIC_LUCHON });

  // Companion app mock handler
  peerSocket.addEventListener('message', (evt) => {
    const data = JSON.parse(evt.data);
    if (data.type === 'REQUEST_OSM') {
      const payload = serializeCoursePayload(FIXTURE_LUCHON_OSM).payload;
      // Phone responds with COURSE_DATA
      peerSocket.simulateReceive(JSON.stringify(payload));
    }
  });

  // Watch companion response listener
  peerSocket.addEventListener('message', (evt) => {
    const data = JSON.parse(evt.data);
    if (data.type === 'COURSE_DATA') {
      stateManager.onCompanionMessage(data);
    }
  });

  // GPS controller triggers request on first fix
  const gpsCtrl = new WatchGPSController({
    sensor,
    onFirstFix: (coords) => {
      stateManager.onGPSFixSent(peerSocket, coords.lat, coords.lon);
    }
  });

  gpsCtrl.start();
  expect(stateManager.state).toBe(FallbackState.DYNAMIC_ACTIVE);
  expect(stateManager.isDynamic).toBe(true);
  expect(stateManager.currentCourse.name).toBe('Golf de Luchon');
  expect(stateManager.currentCourse.holes.length).toBe(9);
});

// ─── Combination 4: F5 (GPS Delta < 1.5m) + F6 (Haversine) + F8/F9 (UI Stability) ─

runner.test('Combo 4: GPS movement < 1.5m delta does NOT trigger distance recalculation or UI change', () => {
  const sensor = createMockGeolocationSensor({ lat: 42.791200, lon: 0.601700 });
  const hmUI = createMockHmUI();
  const ui = new WatchUIController(hmUI);
  ui.initWidgets();

  let haversineCalculations = 0;
  const targetGreen = { lat: 42.788272, lon: 0.601729 };

  const gpsCtrl = new WatchGPSController({
    sensor,
    onLocationUpdate: ({ lat, lon }) => {
      haversineCalculations++;
      const dist = haversineOracle(lat, lon, targetGreen.lat, targetGreen.lon);
      ui.updateDistances({ greenDist: dist });
    },
    deltaThreshold: 1.5
  });

  gpsCtrl.start();
  expect(haversineCalculations).toBe(1);
  const initialGreenText = ui.greenWidget.getProperty('TEXT');

  // Move 0.8m north (under 1.5m threshold)
  const subThresholdLat = 42.791200 + (0.8 / 6371000) * (180 / Math.PI);
  sensor.emitCoords(subThresholdLat, 0.601700);

  expect(haversineCalculations).toBe(1); // No recalculation
  expect(ui.greenWidget.getProperty('TEXT')).toBe(initialGreenText);
});

// ─── Combination 5: F5 (GPS Delta >= 1.5m) + F6 (Haversine) + F8/F9 (In-Place UI Updates) ─

runner.test('Combo 5: GPS movement >= 1.5m triggers Haversine and updates UI in-place', () => {
  const sensor = createMockGeolocationSensor({ lat: 42.791200, lon: 0.601700 });
  const hmUI = createMockHmUI();
  const ui = new WatchUIController(hmUI);
  ui.initWidgets();

  const targetGreen = { lat: 42.788272, lon: 0.601729 };
  const targetBunkers = [
    { lat: 42.788280, lon: 0.601890 },
    { lat: 42.788220, lon: 0.601580 }
  ];

  const gpsCtrl = new WatchGPSController({
    sensor,
    onLocationUpdate: ({ lat, lon }) => {
      const gDist = haversineOracle(lat, lon, targetGreen.lat, targetGreen.lon);
      const bDists = targetBunkers.map(b => haversineOracle(lat, lon, b.lat, b.lon));
      ui.updateDistances({ greenDist: gDist, bunkerDists: bDists });
    },
    deltaThreshold: 1.5
  });

  gpsCtrl.start();
  const initialDist = haversineOracle(42.791200, 0.601700, targetGreen.lat, targetGreen.lon);
  expect(ui.greenWidget.getProperty('TEXT')).toBe(`${initialDist}m`);

  // Walk 50m south towards green
  const stepLat = 42.791200 - (50 / 6371000) * (180 / Math.PI);
  sensor.emitCoords(stepLat, 0.601700);

  const updatedDist = haversineOracle(stepLat, 0.601700, targetGreen.lat, targetGreen.lon);
  expect(ui.greenWidget.getProperty('TEXT')).toBe(`${updatedDist}m`);
  expect(ui.bunkerWidgets[0].getProperty('TEXT')).toContain('B1:');
  expect(ui.bunkerWidgets[1].getProperty('TEXT')).toContain('B2:');
});

// ─── Combination 6: F7 (Timeout Fallback) + F6 (Haversine on Static) + F8 (UI) ─

runner.test('Combo 6: Timeout Fallback retains static course and calculates distance from static coordinates', () => {
  let timeoutCallback = null;
  const stateManager = new CourseStateManager({
    staticCourse: FIXTURE_STATIC_LUCHON,
    timerEngine: (cb) => { timeoutCallback = cb; return 1; }
  });

  const peerSocket = createMockPeerSocket();
  const hmUI = createMockHmUI();
  const ui = new WatchUIController(hmUI);
  ui.initWidgets();

  // Watch sends request
  stateManager.onGPSFixSent(peerSocket, 42.791202, 0.601721);
  expect(stateManager.state).toBe(FallbackState.WAITING_OSM);

  // 10s timeout triggers fallback
  timeoutCallback();
  expect(stateManager.state).toBe(FallbackState.FALLBACK_STATIC);

  // Compute distance to Hole 1 static green
  const currentHole = stateManager.getCurrentHole();
  const distToStaticGreen = haversineOracle(42.791202, 0.601721, currentHole.flag.lat, currentHole.flag.lon);
  ui.updateDistances({ greenDist: distToStaticGreen });

  expect(ui.greenWidget.getProperty('TEXT')).toBe(`${distToStaticGreen}m`);
});

// ─── Combination 7: F10 (peerSocket Reconnect Queue) + F7 (Dynamic Transition) ─

runner.test('Combo 7: peerSocket CONNECTING -> OPEN transitions state to Dynamic once connected', () => {
  const peerSocket = createMockPeerSocket();
  peerSocket.setReadyState(peerSocket.CONNECTING);

  const stateManager = new CourseStateManager({ staticCourse: FIXTURE_STATIC_LUCHON });

  // Simulate queued message on open
  let queuedMessage = null;
  const safeSend = (msg) => {
    if (peerSocket.readyState === peerSocket.OPEN) {
      peerSocket.send(msg);
    } else {
      queuedMessage = msg;
      const onOpen = () => {
        peerSocket.send(queuedMessage);
        peerSocket.removeEventListener('open', onOpen);
      };
      peerSocket.addEventListener('open', onOpen);
    }
  };

  safeSend(JSON.stringify({ type: 'REQUEST_OSM', lat: 42.7912, lon: 0.6017 }));
  expect(peerSocket.getSentMessages().length).toBe(0);

  // Connect socket
  peerSocket.setReadyState(peerSocket.OPEN);
  expect(peerSocket.getSentMessages().length).toBe(1);

  // Companion responds
  const payload = serializeCoursePayload(FIXTURE_LUCHON_OSM).payload;
  stateManager.onCompanionMessage(payload);
  expect(stateManager.state).toBe(FallbackState.DYNAMIC_ACTIVE);
});

// ─── Combination 8: F10 (Malformed Message) + F7 (Silent Fallback) + F8/F9 (UI) ─

runner.test('Combo 8: Corrupted JSON over peerSocket silently triggers static fallback without UI disruption', () => {
  const stateManager = new CourseStateManager({ staticCourse: FIXTURE_STATIC_LUCHON });
  const hmUI = createMockHmUI();
  const ui = new WatchUIController(hmUI);
  ui.initWidgets();

  // Initial distance from static
  const hole1 = stateManager.getCurrentHole();
  const d = haversineOracle(42.791202, 0.601721, hole1.flag.lat, hole1.flag.lon);
  ui.updateDistances({ greenDist: d });

  // Receive malformed JSON from peerSocket
  stateManager.onCompanionMessage('{corrupted:true, "broken');

  expect(stateManager.state).toBe(FallbackState.FALLBACK_STATIC);
  expect(stateManager.isDynamic).toBe(false);
  // UI still reflects static course
  expect(ui.greenWidget.getProperty('TEXT')).toBe(`${d}m`);
});

// ─── Combination 9: F7 (Hole Switch) + F6 (Haversine) + F8/F9 (UI New Hole) ──

runner.test('Combo 9: Switching hole index dynamically recalculates distance for Hole 2 targets', () => {
  const stateManager = new CourseStateManager({ staticCourse: FIXTURE_STATIC_LUCHON });
  const payload = serializeCoursePayload(FIXTURE_LUCHON_OSM).payload;
  stateManager.onCompanionMessage(payload);

  const hmUI = createMockHmUI();
  const ui = new WatchUIController(hmUI);
  ui.initWidgets();

  // Golfer at Hole 2 tee
  const golferPos = { lat: 42.788068, lon: 0.602869 };
  stateManager.setHoleIndex(1); // Hole 2

  const hole2 = stateManager.getCurrentHole();
  const greenDist = haversineOracle(golferPos.lat, golferPos.lon, hole2.green[0], hole2.green[1]);
  const bunkerDists = hole2.bunkers.map(b => haversineOracle(golferPos.lat, golferPos.lon, b[0], b[1]));

  ui.updateDistances({ greenDist, bunkerDists });
  expect(ui.greenWidget.getProperty('TEXT')).toBe(`${greenDist}m`);
  if (bunkerDists.length > 0) {
    expect(ui.bunkerWidgets[0].getProperty('TEXT')).toContain('B1:');
  }
});

// ─── Combination 10: F7 (Static Course Fix) + F6 (Haversine) + F9 (Static Bunkers) ─

runner.test('Combo 10: Static fallback course renders fixed Hole 3 and defined static bunkers', () => {
  const stateManager = new CourseStateManager({ staticCourse: FIXTURE_STATIC_LUCHON });
  const hmUI = createMockHmUI();
  const ui = new WatchUIController(hmUI);
  ui.initWidgets();

  // Hole 1 has 2 static bunkers
  const hole1 = stateManager.currentCourse.holes[0];
  expect(hole1.bunkers.length).toBe(2);

  const golfer = { lat: 42.791202, lon: 0.601721 };
  const bDists = hole1.bunkers.map(b => haversineOracle(golfer.lat, golfer.lon, b.lat, b.lon));
  ui.updateDistances({ greenDist: 326, bunkerDists: bDists });

  expect(ui.bunkerWidgets[0].getProperty('TEXT')).toContain('B1:');
  expect(ui.bunkerWidgets[1].getProperty('TEXT')).toContain('B2:');
  expect(ui.bunkerWidgets[2].getProperty('TEXT')).toBe('');

  // Hole 3 is fixed (valid bounds & geometry, not duplicate of Hole 2)
  stateManager.setHoleIndex(2);
  const hole3 = stateManager.getCurrentHole();
  expect(hole3.par).toBe(3);
  expect(hole3.map.src).toBe('luchon_03.png');
  expect(hole3.flag.lat).toBe(42.791080);
});

// ─── Combination 11: F2 (Session Cache) + F4 (Serializer) + F10 (Roundtrip) ──

runner.test('Combo 11: Multi-request session caching avoids duplicate network calls', async () => {
  let networkFetches = 0;
  const mockFetch = async () => {
    networkFetches++;
    return { ok: true, status: 200, json: async () => FIXTURE_LUCHON_OSM };
  };

  const fetcher = new OverpassFetcherEngine(OVERPASS_ENDPOINTS, mockFetch);
  const q = buildOverpassQuery(42.7912, 0.6017);

  // First round
  const res1 = await fetcher.fetchWithFailover(q, 42.7912, 0.6017);
  const payload1 = serializeCoursePayload(res1.data);
  expect(networkFetches).toBe(1);

  // Second round with same coordinates
  const res2 = await fetcher.fetchWithFailover(q, 42.7912, 0.6017);
  const payload2 = serializeCoursePayload(res2.data);
  expect(networkFetches).toBe(1); // Cached
  expect(payload2.jsonString).toBe(payload1.jsonString);
});

// ─── Combination 12: F5 (Sensor Cleanup) + F7 (Timer Cleanup) on Destroy ─────

runner.test('Combo 12: Watch onDestroy stops GPS sensor and clears pending fallback timer', () => {
  const sensor = createMockGeolocationSensor();
  let timerCleared = false;

  const stateManager = new CourseStateManager({
    staticCourse: FIXTURE_STATIC_LUCHON,
    timerEngine: () => 12345,
    clearTimerEngine: (id) => {
      if (id === 12345) timerCleared = true;
    }
  });

  const gpsCtrl = new WatchGPSController({ sensor });
  gpsCtrl.start();
  expect(sensor.isActive()).toBe(true);

  stateManager.onGPSFixSent(createMockPeerSocket(), 42.7912, 0.6017);
  expect(stateManager.timeoutHandle).toBe(12345);

  // Simulate onDestroy
  gpsCtrl.stop();
  if (stateManager.timeoutHandle) {
    stateManager.clearTimerEngine(stateManager.timeoutHandle);
    stateManager.timeoutHandle = null;
  }

  expect(sensor.isActive()).toBe(false);
  expect(timerCleared).toBe(true);
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
