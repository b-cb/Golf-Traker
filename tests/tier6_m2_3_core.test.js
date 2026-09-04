/**
 * tests/tier6_m2_3_core.test.js
 * Comprehensive Unit and Integration Test Suite for Milestone 2 & 3:
 * Watch GPS, Haversine Engine, Fallback, and Watch hmUI Display (page/game.js, page/index.js).
 */

const req = typeof require !== 'undefined' ? eval('require') : null;

const {
  TestRunner,
  expect,
  haversineOracle,
  createMockGeolocationSensor,
  createMockPeerSocket,
  createMockHmUI,
  FIXTURE_LUCHON_OSM,
  FIXTURE_TOTCHE_OSM,
  FIXTURE_STATIC_LUCHON
} = req ? req('./helpers') : {};

// Setup minimal Zepp OS globals for module import
if (typeof global.Page === 'undefined') {
  global.Page = function (cfg) { return cfg; };
}
if (typeof global.hmUI === 'undefined') {
  global.hmUI = {
    widget: { FILL_RECT: 1, TEXT: 2, IMG: 3, BUTTON: 4 },
    prop: { MORE: 1, TEXT: 2 },
    align: { CENTER_H: 1, CENTER_V: 2, LEFT: 3, RIGHT: 4 },
    event: { CLICK_UP: 1 },
    createWidget: function () {
      return { setProperty: function () {}, addEventListener: function () {} };
    }
  };
}
if (typeof global.hmSensor === 'undefined') {
  global.hmSensor = {
    id: { GEOLOCATION: 1, VIBRATE: 2 },
    event: { CHANGE: 1 },
    createSensor: function () {
      return { start: function () {}, stop: function () {}, addEventListener: function () {} };
    }
  };
}
if (typeof global.hmStorage === 'undefined') {
  global.hmStorage = { getItem: function () { return null; }, setItem: function () {} };
}
if (typeof global.hmApp === 'undefined') {
  global.hmApp = { goBack: function () {}, gotoPage: function () {}, vibrate: function () {} };
}

const gamePage = req ? req('../page/game.js') : {};
const indexPage = req ? req('../page/index.js') : {};

const runner = new TestRunner('Milestone 2 & 3: Watch Core & UI Suite');

// ─── Suite 1: Static Fallback Courses & Hole 3 Fix ──────────────────────────

runner.describe('Suite 1: Static Fallback Courses & Hole 3 Bugfix', () => {
  runner.test('M2-STAT-1: GAME_COURSES has exactly 9 holes for Golf de Luchon with par 33', () => {
    expect(gamePage.GAME_COURSES.length).toBeGreaterThanOrEqual(1);
    const luchon = gamePage.GAME_COURSES[0];
    expect(luchon.name).toBe('Golf de Luchon');
    expect(luchon.par).toBe(33);
    expect(luchon.holes.length).toBe(9);
  });

  runner.test('M2-STAT-2: Hole 3 bugfix: No duplicate hole, correct par 3, valid bounds and map', () => {
    const luchon = gamePage.GAME_COURSES[0];
    const hole3 = luchon.holes[2]; // 0-indexed Hole 3
    expect(hole3.par).toBe(3);
    expect(hole3.tee.lat).toBe(42.788115);
    expect(hole3.tee.lon).toBe(0.601357);
    expect(hole3.greenEntry.lat).toBe(42.790955);
    expect(hole3.greenEntry.lon).toBe(0.601436);
    expect(hole3.flag.lat).toBe(42.791080);
    expect(hole3.flag.lon).toBe(0.601465);
    expect(hole3.map.src).toBe('luchon_03.png');
    expect(hole3.map.bounds.topLat).toBe(42.791227);
    expect(hole3.map.bounds.bottomLat).toBe(42.787995);
  });

  runner.test('M2-STAT-3: Static fallback courses contain bunker coordinate structures', () => {
    const luchon = gamePage.GAME_COURSES[0];
    const hole1 = luchon.holes[0];
    expect(Array.isArray(hole1.bunkers)).toBe(true);
    expect(hole1.bunkers.length).toBe(2);
    expect(hole1.bunkers[0].name).toBe('Bunker G');
    expect(hole1.bunkers[0].lat).toBe(42.78828);
    expect(hole1.bunkers[0].lon).toBe(0.60189);
    expect(hole1.bunkers[1].name).toBe('Bunker D');
    expect(hole1.bunkers[1].lat).toBe(42.78822);
    expect(hole1.bunkers[1].lon).toBe(0.60158);

    const hole2 = luchon.holes[1];
    expect(hole2.bunkers.length).toBe(1);
    expect(hole2.bunkers[0].name).toBe('Bunker Front');
  });

  runner.test('M2-STAT-4: page/index.js COURSES matches 9-hole Luchon definition', () => {
    expect(indexPage.COURSES.length).toBeGreaterThanOrEqual(1);
    const luchon = indexPage.COURSES[0];
    expect(luchon.name).toBe('Golf de Luchon');
    expect(luchon.par).toBe(33);
    expect(luchon.holes.length).toBe(9);
    expect(luchon.holes[2].par).toBe(3);
  });
});

// ─── Suite 2: Coordinate Extraction & Normalization ─────────────────────────

runner.describe('Suite 2: Coordinate Extraction & Normalization', () => {
  runner.test('M2-NORM-1: getGreenCoord extracts from both flag and green properties', () => {
    // Static format
    const staticHole = { flag: { lat: 42.788272, lon: 0.601729 } };
    const g1 = gamePage.getGreenCoord(staticHole);
    expect(g1.lat).toBe(42.788272);
    expect(g1.lon).toBe(0.601729);

    // Dynamic OSM array format
    const osmHole = { green: [42.78827, 0.60173] };
    const g2 = gamePage.getGreenCoord(osmHole);
    expect(g2.lat).toBe(42.78827);
    expect(g2.lon).toBe(0.60173);

    // Dynamic OSM object format
    const objHole = { green: { lat: 42.78827, lon: 0.60173 } };
    const g3 = gamePage.getGreenCoord(objHole);
    expect(g3.lat).toBe(42.78827);

    expect(gamePage.getGreenCoord(null)).toBeNull();
    expect(gamePage.getGreenCoord({})).toBeNull();
  });

  runner.test('M2-NORM-2: getGreenEntryCoord falls back to green if greenEntry missing', () => {
    const holeWithEntry = { greenEntry: { lat: 42.788392, lon: 0.601717 }, flag: { lat: 42.788272, lon: 0.601729 } };
    const e1 = gamePage.getGreenEntryCoord(holeWithEntry);
    expect(e1.lat).toBe(42.788392);

    const holeWithoutEntry = { green: [42.78827, 0.60173] };
    const e2 = gamePage.getGreenEntryCoord(holeWithoutEntry);
    expect(e2.lat).toBe(42.78827);
  });

  runner.test('M2-NORM-3: getTeeCoord extracts tee coordinates from objects and arrays', () => {
    const staticHole = { tee: { lat: 42.791202, lon: 0.601721 } };
    expect(gamePage.getTeeCoord(staticHole)).toEqual({ lat: 42.791202, lon: 0.601721 });

    const osmHole = { tee: [42.79119, 0.60176] };
    expect(gamePage.getTeeCoord(osmHole)).toEqual({ lat: 42.79119, lon: 0.60176 });

    expect(gamePage.getTeeCoord({ tee: null })).toBeNull();
    expect(gamePage.getTeeCoord({})).toBeNull();
  });

  runner.test('M2-NORM-4: getBunkerCoords extracts list from both object array and 2D coordinate array', () => {
    // Static format
    const staticHole = {
      bunkers: [
        { name: 'Bunker G', lat: 42.78828, lon: 0.60189 },
        { name: 'Bunker D', lat: 42.78822, lon: 0.60158 }
      ]
    };
    const b1 = gamePage.getBunkerCoords(staticHole);
    expect(b1.length).toBe(2);
    expect(b1[0].name).toBe('Bunker G');
    expect(b1[0].lat).toBe(42.78828);
    expect(b1[1].name).toBe('Bunker D');

    // OSM format
    const osmHole = {
      bunkers: [
        [42.78828, 0.60189],
        [42.78822, 0.60158]
      ]
    };
    const b2 = gamePage.getBunkerCoords(osmHole);
    expect(b2.length).toBe(2);
    expect(b2[0].name).toBe('B1');
    expect(b2[0].lat).toBe(42.78828);
    expect(b2[1].name).toBe('B2');

    expect(gamePage.getBunkerCoords(null)).toEqual([]);
    expect(gamePage.getBunkerCoords({})).toEqual([]);
  });

  runner.test('M2-NORM-5: isValidCoordinate validates latitude, longitude, non-zero and non-NaN', () => {
    expect(gamePage.isValidCoordinate(42.7912, 0.6017)).toBe(true);
    expect(gamePage.isValidCoordinate(0, 0)).toBe(false); // Null Island / uninitialized
    expect(gamePage.isValidCoordinate(NaN, 0.6017)).toBe(false);
    expect(gamePage.isValidCoordinate(42.7912, NaN)).toBe(false);
    expect(gamePage.isValidCoordinate(null, 0.6017)).toBe(false);
    expect(gamePage.isValidCoordinate(95, 0.6017)).toBe(false); // Out of bounds lat
    expect(gamePage.isValidCoordinate(42.7912, 190)).toBe(false); // Out of bounds lon
  });
});

// ─── Suite 3: Haversine, Bearing & Map Projection Math ─────────────────────

runner.describe('Suite 3: Haversine, Bearing & Map Projection Math', () => {
  runner.test('M2-MATH-1: haversineDistance matches exact oracle value (R = 6,371,000 m)', () => {
    const d1 = gamePage.haversineDistance(42.791202, 0.601721, 42.788272, 0.601729);
    const oracle1 = haversineOracle(42.791202, 0.601721, 42.788272, 0.601729);
    expect(d1).toBe(oracle1);
    expect(d1).toBe(326);

    const d2 = gamePage.haversineDistance(0, 0, 0, 1);
    expect(d2).toBe(111195);
  });

  runner.test('M2-MATH-2: calculateBearing computes heading 0-360 deg', () => {
    // Due North
    const bNorth = gamePage.calculateBearing(0, 0, 1, 0);
    expect(bNorth).toBeCloseTo(0, 2);

    // Due East
    const bEast = gamePage.calculateBearing(0, 0, 0, 1);
    expect(bEast).toBeCloseTo(90, 2);

    // Due South
    const bSouth = gamePage.calculateBearing(1, 0, 0, 0);
    expect(bSouth).toBeCloseTo(180, 2);

    // Due West
    const bWest = gamePage.calculateBearing(0, 1, 0, 0);
    expect(bWest).toBeCloseTo(270, 2);
  });

  runner.test('M2-MATH-3: projectOnMap projects lat/lon into right half of 454x454 screen', () => {
    const hole = gamePage.GAME_COURSES[0].holes[0];
    const flag = hole.flag;

    const pos = gamePage.projectOnMap(flag.lat, flag.lon, hole);
    expect(pos).not.toBeNull();
    // Right half x is >= 229 and <= 454
    expect(pos.x).toBeGreaterThanOrEqual(229);
    expect(pos.x).toBeLessThanOrEqual(454);
    expect(pos.y).toBeGreaterThanOrEqual(0);
    expect(pos.y).toBeLessThanOrEqual(454);
  });

  runner.test('M2-MATH-4: projectOnMap returns null gracefully for invalid bounds', () => {
    const invalidHole = { map: { bounds: { topLat: 0, bottomLat: 0, leftLon: 0, rightLon: 0 } } };
    expect(gamePage.projectOnMap(42.7912, 0.6017, invalidHole)).toBeNull();
    expect(gamePage.projectOnMap(42.7912, 0.6017, null)).toBeNull();
  });
});

// ─── Suite 4: Thresholding & Constants ──────────────────────────────────────

runner.describe('Suite 4: Delta Thresholding & Constants', () => {
  runner.test('M2-CONST-1: MIN_DELTA_METERS is set to exactly 1.5 meters', () => {
    expect(gamePage.MIN_DELTA_METERS).toBe(1.5);
  });

  runner.test('M2-CONST-2: DEFAULT_CLUBS contains standard 14 clubs', () => {
    expect(gamePage.DEFAULT_CLUBS.length).toBe(14);
    expect(gamePage.DEFAULT_CLUBS).toContain('Driver');
    expect(gamePage.DEFAULT_CLUBS).toContain('Putter');
  });
});

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
