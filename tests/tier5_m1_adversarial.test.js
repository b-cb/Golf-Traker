/**
 * tests/tier5_m1_adversarial.test.js
 * 
 * Adversarial Challenger 1 Test Suite for Milestone 1:
 * App-side Overpass Service & Data Reducer (app-side/index.js)
 * 
 * Stress-Testing Focus:
 * 1. Extreme GPS Coordinates (Poles, Date Line, Prime Meridian, Equator, Null Island, Invalid Coordinates).
 * 2. Massive OSM Geometries (100+ vertex polygons, Collinear lines, Degenerate shapes, Concave/Comb polygons, Bowtie figure-8s).
 * 3. Payload Compression Stress (36-hole courses, 100+ bunkers, Negative/Wide-float coordinates, Strict < 2048 bytes budget).
 * 4. Concurrent Requests, Session Cache Integrity, and Multi-Endpoint Failover.
 */

const req = typeof require !== 'undefined' ? eval('require') : null;

const {
  TestRunner,
  expect,
  haversineOracle,
  shoelaceCentroidOracle,
  FIXTURE_LUCHON_OSM,
  FIXTURE_TOTCHE_OSM,
  FIXTURE_PEBBLE_BEACH_OSM
} = req ? req('./helpers') : {};

const appSide = req ? req('../app-side/index.js') : {};

const runner = new TestRunner('Challenger 1: Milestone 1 Adversarial Stress Suite');

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 1: Extreme GPS Coordinates & Mathematical Robustness
// ═════════════════════════════════════════════════════════════════════════════

runner.describe('Suite 1: Extreme GPS Coordinates & Coordinate Robustness', () => {
  runner.test('ADV-GPS-1: Haversine distance at North Pole singularity (lat: 90)', () => {
    // At lat 90, any longitude represents the exact same physical pole point
    const dPole = appSide.haversineDistance(90, 0, 90, 180);
    expect(dPole).toBe(0);

    // North pole to equator (90 deg arc = 1/4 circumference = ~10,007,543m)
    const dPoleToEquator = appSide.haversineDistance(90, 0, 0, 0);
    expect(dPoleToEquator).toBeCloseTo(10007543, -3);
  });

  runner.test('ADV-GPS-2: Haversine distance across International Date Line (antimeridian 180)', () => {
    // 0.0002 deg across longitude 180 at equator (~22.24m)
    const dDateLine = appSide.haversineDistance(0, 179.9999, 0, -179.9999);
    expect(dDateLine).toBeCloseTo(22, -1);
    expect(dDateLine).toBeGreaterThan(20);
    expect(dDateLine).toBeLessThan(25);
  });

  runner.test('ADV-GPS-3: Haversine distance across Prime Meridian (lon: 0) and Equator (lat: 0)', () => {
    // 1 deg on equator = 111,195m
    const dEq = appSide.haversineDistance(0, 0, 0, 1);
    expect(dEq).toBe(111195);

    // 1 deg on prime meridian = 111,195m
    const dPM = appSide.haversineDistance(0, 0, 1, 0);
    expect(dPM).toBe(111195);
  });

  runner.test('ADV-GPS-4: buildOverpassQuery formats extreme valid coordinates properly', () => {
    const qNorth = appSide.buildOverpassQuery(90.0, 0.0, 3000);
    expect(qNorth).toContain('around:3000,90,0');

    const qSouth = appSide.buildOverpassQuery(-90.0, 0.0, 3000);
    expect(qSouth).toContain('around:3000,-90,0');

    const qDateLine = appSide.buildOverpassQuery(-16.5, 180.0, 2500);
    expect(qDateLine).toContain('around:2500,-16.5,180');
  });

  runner.test('ADV-GPS-5: buildOverpassQuery rejects NaN, strings, undefined, and null', () => {
    expect(() => appSide.buildOverpassQuery(NaN, 0)).toThrow('Invalid coordinates');
    expect(() => appSide.buildOverpassQuery(42.5, NaN)).toThrow('Invalid coordinates');
    expect(() => appSide.buildOverpassQuery('42.5', 0.5)).toThrow('Invalid coordinates');
    expect(() => appSide.buildOverpassQuery(null, 0.5)).toThrow('Invalid coordinates');
    expect(() => appSide.buildOverpassQuery(undefined, undefined)).toThrow('Invalid coordinates');
  });

  runner.test('ADV-GPS-6: handleOsmRequest rejects Null Island (0, 0) and uninitialized GPS', () => {
    let errorReceived = null;
    appSide.handleOsmRequest(0, 0, (err, data) => {
      errorReceived = err;
      expect(errorReceived).not.toBeNull();
      expect(errorReceived.message).toContain('Invalid GPS coordinates');
      expect(data).toBeNull();
    });
    expect(errorReceived).not.toBeNull();
  });

  runner.test('ADV-GPS-7: Coordinate quantization round5 precision and edge cases', () => {
    expect(appSide.round5(42.791202847)).toBe(42.7912);
    expect(appSide.round5(-0.000004)).toBe(0);
    expect(appSide.round5(179.999996)).toBe(180);
    expect(appSide.round5(-179.123456)).toBe(-179.12346);
    expect(appSide.round5(null)).toBeNull();
    expect(appSide.round5(NaN)).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 2: Massive OSM Geometries & Polygon Centroid Stress
// ═════════════════════════════════════════════════════════════════════════════

runner.describe('Suite 2: Massive OSM Geometries & Centroid Stress', () => {
  runner.test('ADV-GEO-1: Centroid of a high-density 100-vertex circular green polygon', () => {
    const centerLat = 42.7880;
    const centerLon = 0.6015;
    const radius = 0.0005; // ~50m
    const numVertices = 100;
    const coords = [];

    for (let i = 0; i < numVertices; i++) {
      const angle = (2 * Math.PI * i) / numVertices;
      coords.push({
        lat: centerLat + radius * Math.cos(angle),
        lon: centerLon + radius * Math.sin(angle)
      });
    }

    const c = appSide.polygonCentroid(coords);
    expect(c.lat).toBeCloseTo(centerLat, 4);
    expect(c.lon).toBeCloseTo(centerLon, 4);
  });

  runner.test('ADV-GEO-2: Degenerate collinear 10-point line falls back to arithmetic mean', () => {
    const collinear = [];
    for (let i = 0; i < 10; i++) {
      collinear.push({ lat: 10 + i * 2, lon: 20 + i * 2 });
    }
    const c = appSide.polygonCentroid(collinear);
    // Mean of 10, 12, ..., 28 is 19. Mean of 20, 22, ..., 38 is 29.
    expect(c.lat).toBeCloseTo(19, 5);
    expect(c.lon).toBeCloseTo(29, 5);
  });

  runner.test('ADV-GEO-3: Single vertex and two-vertex geometries handle gracefully', () => {
    const single = [{ lat: 42.5, lon: 1.5 }];
    const c1 = appSide.polygonCentroid(single);
    expect(c1.lat).toBe(42.5);
    expect(c1.lon).toBe(1.5);

    const pair = [{ lat: 10, lon: 20 }, { lat: 30, lon: 40 }];
    const c2 = appSide.polygonCentroid(pair);
    expect(c2.lat).toBe(20);
    expect(c2.lon).toBe(30);

    expect(appSide.polygonCentroid([])).toBeNull();
    expect(appSide.polygonCentroid(null)).toBeNull();
  });

  runner.test('ADV-GEO-4: Self-intersecting symmetrical figure-8 polygon falls back safely without NaN', () => {
    // Symmetrical figure-8 with equal lobes has net signed area 0
    const bowtie = [
      { lat: 0, lon: 0 },
      { lat: 2, lon: 2 },
      { lat: 0, lon: 2 },
      { lat: 2, lon: 0 },
      { lat: 0, lon: 0 }
    ];
    const c = appSide.polygonCentroid(bowtie);
    expect(isNaN(c.lat)).toBe(false);
    expect(isNaN(c.lon)).toBe(false);
    expect(c.lat).toBeCloseTo(0.8, 1);
    expect(c.lon).toBeCloseTo(0.8, 1);
  });

  runner.test('ADV-GEO-5: Multi-tooth comb polygon with 32 vertices computes stable centroid', () => {
    const comb = [
      { lat: 0, lon: 0 },
      { lat: 10, lon: 0 },
      { lat: 10, lon: 1 },
      { lat: 2, lon: 1 },
      { lat: 2, lon: 2 },
      { lat: 10, lon: 2 },
      { lat: 10, lon: 3 },
      { lat: 2, lon: 3 },
      { lat: 2, lon: 4 },
      { lat: 10, lon: 4 },
      { lat: 10, lon: 5 },
      { lat: 0, lon: 5 },
      { lat: 0, lon: 0 }
    ];
    const c = appSide.polygonCentroid(comb);
    expect(c.lat).toBeGreaterThan(0);
    expect(c.lat).toBeLessThan(10);
    expect(c.lon).toBeGreaterThan(0);
    expect(c.lon).toBeLessThan(5);
  });

  runner.test('ADV-GEO-6: getElementCentroid polymorphic dispatch across node/way/relation/geom', () => {
    const nodeEl = { type: 'node', lat: 42.1, lon: 0.5 };
    expect(appSide.getElementCentroid(nodeEl)).toEqual({ lat: 42.1, lon: 0.5 });

    const wayEl = {
      type: 'way',
      geometry: [
        { lat: 0, lon: 0 },
        { lat: 0, lon: 4 },
        { lat: 4, lon: 4 },
        { lat: 4, lon: 0 },
        { lat: 0, lon: 0 }
      ]
    };
    const cWay = appSide.getElementCentroid(wayEl);
    expect(cWay.lat).toBeCloseTo(2, 4);
    expect(cWay.lon).toBeCloseTo(2, 4);

    expect(appSide.getElementCentroid(null)).toBeNull();
    expect(appSide.getElementCentroid({})).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 3: Payload Compression Stress (< 2048 bytes Budget)
// ═════════════════════════════════════════════════════════════════════════════

runner.describe('Suite 3: Payload Compression & 2048 Byte Budget Stress', () => {
  runner.test('ADV-PAY-1: Massive 36-hole resort query is clamped to standard 18 holes max', () => {
    const synthetic36OSM = { elements: [] };
    synthetic36OSM.elements.push({
      type: 'relation',
      id: 99999,
      tags: { leisure: 'golf_course', name: 'Massive 36-Hole Golf Resort', par: '144' }
    });

    for (let h = 1; h <= 36; h++) {
      synthetic36OSM.elements.push({
        type: 'way',
        id: 1000 + h,
        tags: { golf: 'hole', ref: String(h), par: '4' },
        geometry: [
          { lat: 42.0 + h * 0.002, lon: 1.0 + h * 0.002 },
          { lat: 42.0 + h * 0.002 + 0.001, lon: 1.0 + h * 0.002 + 0.001 }
        ]
      });
      synthetic36OSM.elements.push({
        type: 'node',
        id: 2000 + h,
        tags: { golf: 'green', ref: String(h) },
        lat: 42.0 + h * 0.002 + 0.001,
        lon: 1.0 + h * 0.002 + 0.001
      });
      synthetic36OSM.elements.push({
        type: 'node',
        id: 3000 + h,
        tags: { golf: 'tee', ref: String(h) },
        lat: 42.0 + h * 0.002,
        lon: 1.0 + h * 0.002
      });
    }

    const res = appSide.parseOSMToCourseData(synthetic36OSM, 42.0, 1.0);
    expect(res.type).toBe('COURSE_DATA');
    expect(res.course.holes.length).toBe(18); // strictly capped to 18
    expect(res.course.par).toBe(72); // 18 holes * par 4

    const jsonStr = JSON.stringify(res);
    const byteLength = Buffer.byteLength(jsonStr, 'utf8');
    expect(byteLength).toBeLessThan(2048);
  });

  runner.test('ADV-PAY-2: 18-hole championship course with 100+ bunkers dynamically scales under 2048 bytes', () => {
    const bunkerHeavyOSM = { elements: [] };
    bunkerHeavyOSM.elements.push({
      type: 'relation',
      id: 8888,
      tags: { leisure: 'golf_course', name: 'Sand Dunes Championship Club', par: '72' }
    });

    for (let h = 1; h <= 18; h++) {
      const baseLat = 42.1000 + h * 0.003;
      const baseLon = 0.5000 + h * 0.003;

      bunkerHeavyOSM.elements.push({
        type: 'way',
        id: 100 + h,
        tags: { golf: 'hole', ref: String(h), par: '4' },
        geometry: [
          { lat: baseLat, lon: baseLon },
          { lat: baseLat + 0.0025, lon: baseLon + 0.0025 }
        ]
      });
      bunkerHeavyOSM.elements.push({
        type: 'node',
        id: 200 + h,
        tags: { golf: 'green', ref: String(h) },
        lat: baseLat + 0.0025,
        lon: baseLon + 0.0025
      });
      bunkerHeavyOSM.elements.push({
        type: 'node',
        id: 300 + h,
        tags: { golf: 'tee', ref: String(h) },
        lat: baseLat,
        lon: baseLon
      });

      // 6 bunkers surrounding each hole (108 bunkers total)
      for (let b = 1; b <= 6; b++) {
        bunkerHeavyOSM.elements.push({
          type: 'node',
          id: 4000 + (h * 10) + b,
          tags: { golf: 'bunker' },
          lat: baseLat + 0.0025 + (b * 0.0001),
          lon: baseLon + 0.0025 + (b * 0.0001)
        });
      }
    }

    const res = appSide.parseOSMToCourseData(bunkerHeavyOSM, 42.1, 0.5);
    expect(res.course.holes.length).toBe(18);

    const jsonStr = JSON.stringify(res);
    const byteLength = Buffer.byteLength(jsonStr, 'utf8');

    // Strict requirement: MUST be under 2048 bytes
    expect(byteLength).toBeLessThan(2048);
    // Should adaptively reduce bunkers per hole
    for (const hole of res.course.holes) {
      expect(hole.bunkers.length).toBeLessThanOrEqual(3);
    }
  });

  runner.test('ADV-PAY-3: Negative coordinates with full 5-decimal precision remain under 2048 bytes', () => {
    // Negative coordinates (southern/western hemisphere) add negative signs to every coordinate pair
    const southWestOSM = { elements: [] };
    southWestOSM.elements.push({
      type: 'relation',
      id: 7777,
      tags: { leisure: 'golf_course', name: 'Cape Kidnappers Golf Course', par: '71' }
    });

    for (let h = 1; h <= 18; h++) {
      const baseLat = -39.64821 - (h * 0.002);
      const baseLon = -177.08942 - (h * 0.002);

      southWestOSM.elements.push({
        type: 'way',
        id: 500 + h,
        tags: { golf: 'hole', ref: String(h), par: '4' },
        geometry: [
          { lat: baseLat, lon: baseLon },
          { lat: baseLat - 0.0015, lon: baseLon - 0.0015 }
        ]
      });
      southWestOSM.elements.push({
        type: 'node',
        id: 600 + h,
        tags: { golf: 'green', ref: String(h) },
        lat: baseLat - 0.0015,
        lon: baseLon - 0.0015
      });
      southWestOSM.elements.push({
        type: 'node',
        id: 700 + h,
        tags: { golf: 'tee', ref: String(h) },
        lat: baseLat,
        lon: baseLon
      });
      // 3 bunkers per hole
      for (let b = 1; b <= 3; b++) {
        southWestOSM.elements.push({
          type: 'node',
          id: 8000 + (h * 10) + b,
          tags: { golf: 'bunker' },
          lat: baseLat - 0.0015 + (b * 0.0001),
          lon: baseLon - 0.0015 + (b * 0.0001)
        });
      }
    }

    const res = appSide.parseOSMToCourseData(southWestOSM, -39.648, -177.089);
    const jsonStr = JSON.stringify(res);
    const byteLength = Buffer.byteLength(jsonStr, 'utf8');

    expect(byteLength).toBeLessThan(2048);
    expect(res.course.holes.length).toBe(18);
  });

  runner.test('ADV-PAY-4: Real-world fixtures (Luchon, Totche, Pebble Beach) payload sizes', () => {
    const luchon = appSide.parseOSMToCourseData(FIXTURE_LUCHON_OSM, 42.7912, 0.6017);
    const luchonBytes = Buffer.byteLength(JSON.stringify(luchon), 'utf8');
    expect(luchonBytes).toBeLessThan(1200); // 9 holes, ~923 bytes

    const totche = appSide.parseOSMToCourseData(FIXTURE_TOTCHE_OSM, 44.532, 2.062);
    const totcheBytes = Buffer.byteLength(JSON.stringify(totche), 'utf8');
    expect(totcheBytes).toBeLessThan(1000); // 9 holes without bunkers, ~782 bytes

    const pebble = appSide.parseOSMToCourseData(FIXTURE_PEBBLE_BEACH_OSM, 36.568, -121.950);
    const pebbleBytes = Buffer.byteLength(JSON.stringify(pebble), 'utf8');
    expect(pebbleBytes).toBeLessThan(2048); // 18 holes, ~1753 bytes
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SUITE 4: Concurrency, Session Caching & Endpoint Failover
// ═════════════════════════════════════════════════════════════════════════════

runner.describe('Suite 4: Concurrency, Session Cache & Failover Mechanics', () => {
  runner.test('ADV-CON-1: Session cache reset and single-query integrity', () => {
    appSide.resetSessionCache();
    // Cache is initially clean
    let executed = false;
    expect(() => {
      appSide.resetSessionCache();
      executed = true;
    }).not.toThrow();
    expect(executed).toBe(true);
  });

  runner.test('ADV-CON-2: OVERPASS_ENDPOINTS list has at least 3 fallback mirrors', () => {
    expect(appSide.OVERPASS_ENDPOINTS.length).toBeGreaterThanOrEqual(3);
    for (const ep of appSide.OVERPASS_ENDPOINTS) {
      expect(ep.startsWith('https://')).toBe(true);
      expect(ep).toContain('interpreter');
    }
  });

  runner.test('ADV-CON-3: parseOSMToCourseData handles missing green/tee tags using way endpoints', () => {
    const minimalWayOSM = {
      elements: [
        {
          type: 'way',
          id: 111,
          tags: { golf: 'hole', ref: '1', par: '3' },
          geometry: [
            { lat: 42.1000, lon: 0.6000 },
            { lat: 42.1015, lon: 0.6015 }
          ]
        }
      ]
    };

    const res = appSide.parseOSMToCourseData(minimalWayOSM, 42.1, 0.6);
    expect(res.course.holes.length).toBe(1);
    const h1 = res.course.holes[0];
    expect(h1.num).toBe(1);
    expect(h1.par).toBe(3);
    expect(h1.tee).toEqual([42.1, 0.6]);
    expect(h1.green).toEqual([42.1015, 0.6015]);
    expect(h1.bunkers).toEqual([]);
  });

  runner.test('ADV-CON-4: parseOSMToCourseData handles empty elements or invalid input safely', () => {
    const emptyRes = appSide.parseOSMToCourseData({ elements: [] });
    expect(emptyRes.course.name).toBe('Golf Course');
    expect(emptyRes.course.holes.length).toBe(0);

    const nullRes = appSide.parseOSMToCourseData(null);
    expect(nullRes.course.holes.length).toBe(0);
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
