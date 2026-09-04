/**
 * tests/tier4_realworld.test.js
 * Tier 4 Real-World Application Course Scenarios (>= 5 scenarios).
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
  FIXTURE_PEBBLE_BEACH_OSM,
  FIXTURE_ST_ANDREWS_OSM,
  FIXTURE_STATIC_LUCHON
} = req ? req('./helpers') : {};

const runner = new TestRunner('Tier 4: Real-World Course Workloads');

// ─── Scenario 1: Normal Round on OSM-Mapped Course (Golf de Luchon) ─────────

runner.test('Scenario 1: Normal Round on OSM-Mapped Course (Golf de Luchon 9 Holes)', async () => {
  // 1. Watch & Companion initialization
  const sensor = createMockGeolocationSensor({ lat: 42.791202, lon: 0.601721 });
  const peerSocket = createMockPeerSocket();
  const hmUI = createMockHmUI();
  const stateManager = new CourseStateManager({ staticCourse: FIXTURE_STATIC_LUCHON });
  const ui = new WatchUIController(hmUI);
  ui.initWidgets();

  // Initial state is static
  expect(stateManager.state).toBe(FallbackState.STATIC_INIT);

  // 2. Companion Overpass fetcher setup
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => FIXTURE_LUCHON_OSM
  });
  const fetcher = new OverpassFetcherEngine(OVERPASS_ENDPOINTS, mockFetch);

  // Companion peerSocket handler
  peerSocket.addEventListener('message', async (evt) => {
    const msg = JSON.parse(evt.data);
    if (msg.type === 'REQUEST_OSM') {
      const q = buildOverpassQuery(msg.lat, msg.lon);
      const res = await fetcher.fetchWithFailover(q, msg.lat, msg.lon);
      const serialized = serializeCoursePayload(res.data);
      expect(serialized.isUnder2KB).toBe(true);
      peerSocket.simulateReceive(serialized.jsonString);
    }
  });

  // Watch companion message handler
  peerSocket.addEventListener('message', (evt) => {
    const msg = JSON.parse(evt.data);
    if (msg.type === 'COURSE_DATA') {
      stateManager.onCompanionMessage(msg);
    }
  });

  // 3. Watch GPS Controller setup
  const gpsCtrl = new WatchGPSController({
    sensor,
    onFirstFix: (coords) => {
      stateManager.onGPSFixSent(peerSocket, coords.lat, coords.lon);
    },
    onLocationUpdate: ({ lat, lon }) => {
      const currentHole = stateManager.getCurrentHole();
      if (!currentHole) return;

      const greenCoord = stateManager.isDynamic
        ? { lat: currentHole.green[0], lon: currentHole.green[1] }
        : { lat: currentHole.flag.lat, lon: currentHole.flag.lon };

      const greenDist = haversineOracle(lat, lon, greenCoord.lat, greenCoord.lon);
      const bunkerDists = (currentHole.bunkers || []).map(b => {
        const bLat = Array.isArray(b) ? b[0] : b.lat;
        const bLon = Array.isArray(b) ? b[1] : b.lon;
        return haversineOracle(lat, lon, bLat, bLon);
      });

      ui.updateDistances({ greenDist, bunkerDists });
    },
    deltaThreshold: 1.5
  });

  // 4. Start round on Hole 1
  gpsCtrl.start();
  await new Promise(resolve => setTimeout(resolve, 10));
  expect(stateManager.state).toBe(FallbackState.DYNAMIC_ACTIVE);
  expect(stateManager.isDynamic).toBe(true);
  expect(stateManager.currentCourse.name).toBe('Golf de Luchon');

  // Golfer at Hole 1 Tee -> Green distance is ~326m
  expect(ui.greenWidget.getProperty('TEXT')).toBe('326m');
  expect(ui.bunkerWidgets[0].getProperty('TEXT')).toContain('B1:');
  expect(ui.bunkerWidgets[1].getProperty('TEXT')).toContain('B2:');

  // Golfer approaches fairway (move 150m south towards green)
  const fairwayLat = 42.791202 - (150 / 6371000) * (180 / Math.PI);
  sensor.emitCoords(fairwayLat, 0.601721);
  expect(ui.greenWidget.getProperty('TEXT')).toBe('176m');

  // Golfer reaches green (within 10m of green centroid)
  sensor.emitCoords(42.788350, 0.601729);
  const nearGreenDist = haversineOracle(42.788350, 0.601729, 42.78827, 0.60173);
  expect(ui.greenWidget.getProperty('TEXT')).toBe(`${nearGreenDist}m`);

  // 5. Advance to Hole 2 (Par 4, Tee: 42.788068, 0.602869)
  stateManager.setHoleIndex(1);
  sensor.emitCoords(42.788068, 0.602869);
  expect(stateManager.currentHoleIndex).toBe(1);
  const hole2 = stateManager.getCurrentHole();
  const hole2GreenDist = haversineOracle(42.788068, 0.602869, hole2.green[0], hole2.green[1]);
  expect(ui.greenWidget.getProperty('TEXT')).toBe(`${hole2GreenDist}m`);

  // 6. Complete remaining holes up to Hole 9
  for (let hIdx = 2; hIdx < 9; hIdx++) {
    stateManager.setHoleIndex(hIdx);
    const hole = stateManager.getCurrentHole();
    expect(hole.num).toBe(hIdx + 1);
    expect(hole.green.length).toBe(2);
  }

  gpsCtrl.stop();
});

// ─── Scenario 2: Minimalist Course without Bunker Tags (Golf du Totche) ─────

runner.test('Scenario 2: Minimalist Course without Bunker Tags (Golf du Totche)', async () => {
  const sensor = createMockGeolocationSensor({ lat: 44.5510, lon: 2.1010 });
  const peerSocket = createMockPeerSocket();
  const hmUI = createMockHmUI();
  const stateManager = new CourseStateManager({ staticCourse: FIXTURE_STATIC_LUCHON });
  const ui = new WatchUIController(hmUI);
  ui.initWidgets();

  // Companion mock for Golf du Totche
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => FIXTURE_TOTCHE_OSM
  });
  const fetcher = new OverpassFetcherEngine(OVERPASS_ENDPOINTS, mockFetch);

  peerSocket.addEventListener('message', async (evt) => {
    const msg = JSON.parse(evt.data);
    if (msg.type === 'REQUEST_OSM') {
      const q = buildOverpassQuery(msg.lat, msg.lon);
      const res = await fetcher.fetchWithFailover(q, msg.lat, msg.lon);
      const serialized = serializeCoursePayload(res.data);
      peerSocket.simulateReceive(serialized.jsonString);
    }
  });

  peerSocket.addEventListener('message', (evt) => {
    const msg = JSON.parse(evt.data);
    if (msg.type === 'COURSE_DATA') {
      stateManager.onCompanionMessage(msg);
      const currentHole = stateManager.getCurrentHole();
      if (currentHole && currentHole.green) {
        const greenDist = haversineOracle(sensor.latitude, sensor.longitude, currentHole.green[0], currentHole.green[1]);
        const bunkerDists = (currentHole.bunkers || []).map(b => haversineOracle(sensor.latitude, sensor.longitude, b[0], b[1]));
        ui.updateDistances({ greenDist, bunkerDists });
      }
    }
  });

  const gpsCtrl = new WatchGPSController({
    sensor,
    onFirstFix: (coords) => {
      stateManager.onGPSFixSent(peerSocket, coords.lat, coords.lon);
    },
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
  expect(stateManager.currentCourse.name).toBe('Golf du Totche');
  expect(stateManager.currentCourse.holes.length).toBe(9);

  // Hole 1 has green distance displayed
  expect(ui.greenWidget.getProperty('TEXT')).not.toBe('---');
  // Zero bunkers on course -> All 3 bunker widgets are empty
  expect(ui.bunkerWidgets[0].getProperty('TEXT')).toBe('');
  expect(ui.bunkerWidgets[1].getProperty('TEXT')).toBe('');
  expect(ui.bunkerWidgets[2].getProperty('TEXT')).toBe('');

  gpsCtrl.stop();
});

// ─── Scenario 3: Offline / Out-of-Cellular Range Round (Static Fallback) ────

runner.test('Scenario 3: Offline / Out-of-Cellular Range Round (Silent Static Fallback)', () => {
  let timerCallback = null;
  const stateManager = new CourseStateManager({
    staticCourse: FIXTURE_STATIC_LUCHON,
    timerEngine: (cb) => { timerCallback = cb; return 999; }
  });

  const sensor = createMockGeolocationSensor({ lat: 42.791202, lon: 0.601721 });
  const peerSocket = createMockPeerSocket();
  const hmUI = createMockHmUI();
  const ui = new WatchUIController(hmUI);
  ui.initWidgets();

  const gpsCtrl = new WatchGPSController({
    sensor,
    onFirstFix: (coords) => {
      stateManager.onGPSFixSent(peerSocket, coords.lat, coords.lon);
    },
    onLocationUpdate: ({ lat, lon }) => {
      const hole = stateManager.getCurrentHole();
      const flagCoord = hole.flag ? hole.flag : { lat: hole.green[0], lon: hole.green[1] };
      const greenDist = haversineOracle(lat, lon, flagCoord.lat, flagCoord.lon);
      const bunkerDists = (hole.bunkers || []).map(b => haversineOracle(lat, lon, b.lat, b.lon));
      ui.updateDistances({ greenDist, bunkerDists });
    }
  });

  gpsCtrl.start();
  expect(stateManager.state).toBe(FallbackState.WAITING_OSM);

  // 10s timeout expires without network response
  timerCallback();
  expect(stateManager.state).toBe(FallbackState.FALLBACK_STATIC);
  expect(stateManager.isDynamic).toBe(false);
  expect(stateManager.currentCourse.name).toBe('Golf de Luchon');

  // Hole 1 distance computed from static course data
  expect(ui.greenWidget.getProperty('TEXT')).toBe('326m');
  expect(ui.bunkerWidgets[0].getProperty('TEXT')).toContain('B1:');

  // Move to Hole 3 (Fixed static hole)
  stateManager.setHoleIndex(2);
  sensor.emitCoords(42.788115, 0.601357); // Hole 3 Tee
  const hole3 = stateManager.getCurrentHole();
  const hole3Dist = haversineOracle(42.788115, 0.601357, hole3.flag.lat, hole3.flag.lon);
  expect(ui.greenWidget.getProperty('TEXT')).toBe(`${hole3Dist}m`);

  gpsCtrl.stop();
});

// ─── Scenario 4: Network Latency & Mid-Round Dynamic Upgrade ────────────────

runner.test('Scenario 4: Network Latency & Mid-Round Dynamic Upgrade at Hole 2', () => {
  let timerCallback = null;
  const stateManager = new CourseStateManager({
    staticCourse: FIXTURE_STATIC_LUCHON,
    timerEngine: (cb) => { timerCallback = cb; return 888; }
  });

  const sensor = createMockGeolocationSensor({ lat: 42.791202, lon: 0.601721 });
  const peerSocket = createMockPeerSocket();
  const hmUI = createMockHmUI();
  const ui = new WatchUIController(hmUI);
  ui.initWidgets();

  const gpsCtrl = new WatchGPSController({
    sensor,
    onFirstFix: (coords) => {
      stateManager.onGPSFixSent(peerSocket, coords.lat, coords.lon);
    },
    onLocationUpdate: ({ lat, lon }) => {
      const hole = stateManager.getCurrentHole();
      const greenCoord = stateManager.isDynamic
        ? { lat: hole.green[0], lon: hole.green[1] }
        : { lat: hole.flag.lat, lon: hole.flag.lon };

      const greenDist = haversineOracle(lat, lon, greenCoord.lat, greenCoord.lon);
      ui.updateDistances({ greenDist });
    }
  });

  gpsCtrl.start();
  // 10s timeout expires -> fallback to static
  timerCallback();
  expect(stateManager.state).toBe(FallbackState.FALLBACK_STATIC);

  // Golfer plays Hole 1, then advances to Hole 2
  stateManager.setHoleIndex(1);
  expect(stateManager.currentHoleIndex).toBe(1);

  // Late network response arrives while on Hole 2
  const payload = serializeCoursePayload(FIXTURE_LUCHON_OSM).payload;
  stateManager.onCompanionMessage(payload);

  // Course upgraded to dynamic, while maintaining current Hole index (Hole 2)
  expect(stateManager.state).toBe(FallbackState.DYNAMIC_ACTIVE);
  expect(stateManager.isDynamic).toBe(true);
  expect(stateManager.currentHoleIndex).toBe(1);

  // Hole 2 distance is computed from dynamic OSM coordinates
  sensor.emitCoords(42.788068, 0.602869);
  const h2 = stateManager.getCurrentHole();
  const h2Dist = haversineOracle(42.788068, 0.602869, h2.green[0], h2.green[1]);
  expect(ui.greenWidget.getProperty('TEXT')).toBe(`${h2Dist}m`);

  gpsCtrl.stop();
});

// ─── Scenario 5: Rapid GPS Movement / Cart Ride Across Multiple Holes ───────

runner.test('Scenario 5: Rapid GPS Movement & Cart Ride Delta Thresholding', () => {
  const sensor = createMockGeolocationSensor({ lat: 42.791202, lon: 0.601721 });
  const hmUI = createMockHmUI();
  const ui = new WatchUIController(hmUI);
  ui.initWidgets();

  const stateManager = new CourseStateManager({ staticCourse: FIXTURE_STATIC_LUCHON });
  let updateEvents = 0;

  const gpsCtrl = new WatchGPSController({
    sensor,
    onLocationUpdate: ({ lat, lon }) => {
      updateEvents++;
      const hole = stateManager.getCurrentHole();
      const gDist = haversineOracle(lat, lon, hole.flag.lat, hole.flag.lon);
      ui.updateDistances({ greenDist: gDist });
    },
    deltaThreshold: 1.5
  });

  gpsCtrl.start();
  expect(updateEvents).toBe(1);

  // Simulate cart ride: 50 successive GPS points with varying jumps
  let currentLat = 42.791202;
  let currentLon = 0.601721;

  for (let i = 0; i < 50; i++) {
    // Alternate between tiny jitter (< 1.5m) and large steps (> 10m)
    if (i % 2 === 0) {
      // 20m south
      currentLat -= (20 / 6371000) * (180 / Math.PI);
    } else {
      // 0.5m east (jitter)
      currentLon += (0.5 / 6371000) * (180 / Math.PI);
    }
    sensor.emitCoords(currentLat, currentLon);
  }

  // Large steps trigger updates, tiny jitters are filtered out
  expect(updateEvents).toBe(26); // 1 initial + 25 large steps
  expect(ui.greenWidget.getProperty('TEXT')).not.toBe('---');
  expect(hmUI.getCreatedWidgets().length).toBe(4); // No widget leak

  gpsCtrl.stop();
});

// ─── Scenario 6: 18-Hole Championship Course (St Andrews Old Course) ────────

runner.test('Scenario 6: 18-Hole Championship Course (St Andrews Old Course Links)', async () => {
  const sensor = createMockGeolocationSensor({ lat: 56.3410, lon: -2.8020 });
  const peerSocket = createMockPeerSocket();
  const hmUI = createMockHmUI();
  const stateManager = new CourseStateManager({ staticCourse: FIXTURE_STATIC_LUCHON });
  const ui = new WatchUIController(hmUI);
  ui.initWidgets();

  // Companion Overpass fetcher for St Andrews
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    json: async () => FIXTURE_ST_ANDREWS_OSM
  });
  const fetcher = new OverpassFetcherEngine(OVERPASS_ENDPOINTS, mockFetch);

  peerSocket.addEventListener('message', async (evt) => {
    const msg = JSON.parse(evt.data);
    if (msg.type === 'REQUEST_OSM') {
      const q = buildOverpassQuery(msg.lat, msg.lon);
      const res = await fetcher.fetchWithFailover(q, msg.lat, msg.lon);
      const serialized = serializeCoursePayload(res.data);
      expect(serialized.isUnder2KB).toBe(true);
      peerSocket.simulateReceive(serialized.jsonString);
    }
  });

  peerSocket.addEventListener('message', (evt) => {
    const msg = JSON.parse(evt.data);
    if (msg.type === 'COURSE_DATA') {
      stateManager.onCompanionMessage(msg);
      const hole = stateManager.getCurrentHole();
      if (hole && hole.green) {
        const greenDist = haversineOracle(sensor.latitude, sensor.longitude, hole.green[0], hole.green[1]);
        const bunkerDists = (hole.bunkers || []).map(b => haversineOracle(sensor.latitude, sensor.longitude, b[0], b[1]));
        ui.updateDistances({ greenDist, bunkerDists });
      }
    }
  });

  const gpsCtrl = new WatchGPSController({
    sensor,
    onFirstFix: (coords) => {
      stateManager.onGPSFixSent(peerSocket, coords.lat, coords.lon);
    },
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
  expect(stateManager.currentCourse.name).toBe('St Andrews Links (Old Course)');
  expect(stateManager.currentCourse.holes.length).toBe(18);
  expect(stateManager.currentCourse.par).toBe(72);

  // Play Hole 1 (Burn)
  expect(ui.greenWidget.getProperty('TEXT')).not.toBe('---');
  expect(ui.bunkerWidgets[0].getProperty('TEXT')).toContain('B1:');

  // Play Hole 14 (Long / Hell Bunker)
  stateManager.setHoleIndex(13); // Hole 14
  const hole14 = stateManager.getCurrentHole();
  expect(hole14.num).toBe(14);
  expect(hole14.par).toBe(5);

  // Play Hole 18 (Tom Morris)
  stateManager.setHoleIndex(17); // Hole 18
  const hole18 = stateManager.getCurrentHole();
  expect(hole18.num).toBe(18);

  gpsCtrl.stop();
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
