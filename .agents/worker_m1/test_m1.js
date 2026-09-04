// test_m1.js - Comprehensive Unit & Integration Verification for Milestone 1

const {
  OVERPASS_ENDPOINTS,
  safeSend,
  haversineDistance,
  polygonCentroid,
  getElementCentroid,
  round5,
  buildOverpassQuery,
  parseOSMToCourseData,
  fetchWithTimeout,
  fetchOverpassWithFailover,
  handleOsmRequest,
  resetSessionCache,
  postRoundToWebhook,
  searchCourseOnOSM
} = require('../../app-side/index.js');

const {
  FIXTURE_LUCHON_OSM,
  FIXTURE_TOTCHE_OSM
} = require('../../tests/helpers.js');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

async function runTests() {
  console.log('=== Milestone 1: App-side Overpass Service & Data Reducer Tests ===\n');

  // ─── Test Group 1: Overpass Query Builder (R1) ───────────────────────────
  console.log('1. Overpass Query Builder:');
  const q1 = buildOverpassQuery(42.791202, 0.601721);
  assert(q1.includes('around:3000,42.791202,0.601721'), 'Contains 3000m radius with exact lat/lon');
  assert(q1.startsWith('[out:json][timeout:25];'), 'Starts with [out:json][timeout:25];');
  assert(q1.endsWith('out geom;'), 'Ends with out geom;');
  assert(q1.includes('nwr["leisure"="golf_course"]'), 'Queries leisure=golf_course');
  assert(q1.includes('nwr["golf"~"^(hole|green|bunker|tee)$"]'), 'Queries hole|green|bunker|tee');

  let threwOnInvalid = false;
  try {
    buildOverpassQuery(NaN, 0.6017);
  } catch (e) {
    threwOnInvalid = true;
  }
  assert(threwOnInvalid, 'Throws on invalid coordinates (NaN)');

  // ─── Test Group 2: Centroid Math & Green\'s Theorem (R2) ──────────────────
  console.log('\n2. Polygon Centroid Math (Shoelace / Green\'s Theorem):');
  const square = [
    { lat: 10, lon: 10 },
    { lat: 10, lon: 20 },
    { lat: 20, lon: 20 },
    { lat: 20, lon: 10 }
  ];
  const cSquare = polygonCentroid(square);
  assert(Math.abs(cSquare.lat - 15) < 1e-4 && Math.abs(cSquare.lon - 15) < 1e-4, 'Square centroid is (15, 15)');

  const triangle = [
    { lat: 0, lon: 0 },
    { lat: 0, lon: 6 },
    { lat: 6, lon: 0 }
  ];
  const cTri = polygonCentroid(triangle);
  assert(Math.abs(cTri.lat - 2) < 1e-4 && Math.abs(cTri.lon - 2) < 1e-4, 'Triangle centroid is (2, 2)');

  const collinear = [
    { lat: 10, lon: 10 },
    { lat: 20, lon: 20 },
    { lat: 30, lon: 30 }
  ];
  const cCollinear = polygonCentroid(collinear);
  assert(Math.abs(cCollinear.lat - 20) < 1e-4 && Math.abs(cCollinear.lon - 20) < 1e-4, 'Degenerate collinear fallback to mean (20, 20)');

  const singleNode = { type: 'node', lat: 42.7912, lon: 0.6017 };
  const cNode = getElementCentroid(singleNode);
  assert(cNode.lat === 42.7912 && cNode.lon === 0.6017, 'Single node element returns exact point');

  // ─── Test Group 3: Data Reducer & Serialization (< 2 KB) (R2) ────────────
  console.log('\n3. Data Reducer & Payload Serialization (< 2 KB):');
  const luchonResult = parseOSMToCourseData(FIXTURE_LUCHON_OSM);
  assert(luchonResult.type === 'COURSE_DATA', 'Payload type is COURSE_DATA');
  assert(luchonResult.course.name === 'Golf de Luchon', 'Course name is Golf de Luchon');
  assert(luchonResult.course.holes.length === 9, 'Extracted 9 holes for Golf de Luchon');
  assert(luchonResult.course.par === 33, 'Course par is 33');

  const jsonLuchon = JSON.stringify(luchonResult);
  const sizeLuchon = Buffer.byteLength(jsonLuchon, 'utf8');
  assert(sizeLuchon < 2048, `Luchon payload size is ${sizeLuchon} bytes (< 2048 bytes)`);

  // Hole 1 structure check
  const h1 = luchonResult.course.holes[0];
  assert(h1.num === 1, 'Hole 1 num is 1');
  assert(h1.par === 4, 'Hole 1 par is 4');
  assert(Array.isArray(h1.green) && h1.green.length === 2, 'Hole 1 green is [lat, lon]');
  assert(Array.isArray(h1.tee) && h1.tee.length === 2, 'Hole 1 tee is [lat, lon]');
  assert(Array.isArray(h1.bunkers), 'Hole 1 bunkers is an array');
  assert(h1.bunkers.length <= 3, 'Hole 1 bunkers capped to max 3');

  // Check 5 decimal places quantization
  const latDecimals = h1.green[0].toString().split('.')[1] || '';
  const lonDecimals = h1.green[1].toString().split('.')[1] || '';
  assert(latDecimals.length <= 5, 'Green latitude quantized to <= 5 decimals');
  assert(lonDecimals.length <= 5, 'Green longitude quantized to <= 5 decimals');

  // Check no OSM metadata leak
  assert(!jsonLuchon.includes('"tags":'), 'Strips OSM tags');
  assert(!jsonLuchon.includes('"id":'), 'Strips OSM IDs');
  assert(!jsonLuchon.includes('"generator":'), 'Strips OSM generator');

  // Test Totche course
  const totcheResult = parseOSMToCourseData(FIXTURE_TOTCHE_OSM);
  assert(totcheResult.course.name === 'Golf du Totche', 'Totche course name parsed');
  assert(totcheResult.course.holes.length === 9, 'Totche extracted 9 holes');
  const sizeTotche = Buffer.byteLength(JSON.stringify(totcheResult), 'utf8');
  assert(sizeTotche < 1500, `Totche payload size is ${sizeTotche} bytes (< 1.5 KB)`);

  // Test heavy 18-hole synthetic course with 4 bunkers on every hole
  const heavy18Elements = [
    { type: 'way', id: 1, tags: { leisure: 'golf_course', name: 'Golf National Albatros', par: '72' } }
  ];
  for (let i = 1; i <= 18; i++) {
    const lat = 48.75 + (i * 0.002);
    const lon = 2.07 + (i * 0.002);
    heavy18Elements.push({
      type: 'way',
      id: 100 + i,
      tags: { golf: 'hole', ref: String(i), par: '4' },
      geometry: [
        { lat: lat, lon: lon },
        { lat: lat + 0.001, lon: lon + 0.001 },
        { lat: lat + 0.002, lon: lon + 0.002 }
      ]
    });
    heavy18Elements.push({
      type: 'way',
      id: 200 + i,
      tags: { golf: 'green', ref: String(i) },
      geometry: [
        { lat: lat + 0.002, lon: lon + 0.002 },
        { lat: lat + 0.0021, lon: lon + 0.002 },
        { lat: lat + 0.0021, lon: lon + 0.0021 },
        { lat: lat + 0.002, lon: lon + 0.0021 }
      ]
    });
    for (let b = 1; b <= 4; b++) {
      heavy18Elements.push({
        type: 'node',
        id: 3000 + i * 10 + b,
        tags: { golf: 'bunker' },
        lat: lat + 0.0019 + (b * 0.00005),
        lon: lon + 0.0019 + (b * 0.00005)
      });
    }
  }

  const heavy18Result = parseOSMToCourseData({ elements: heavy18Elements });
  assert(heavy18Result.course.holes.length === 18, '18-hole course parsed with 18 holes');
  const heavy18Size = Buffer.byteLength(JSON.stringify(heavy18Result), 'utf8');
  assert(heavy18Size < 2048, `18-hole heavy course payload size is ${heavy18Size} bytes (< 2048 bytes)`);

  // ─── Test Group 4: Multi-Endpoint Failover (R1) ──────────────────────────
  console.log('\n4. Multi-Endpoint Failover & Timeouts:');
  assert(OVERPASS_ENDPOINTS.length === 4, '4 redundant Overpass endpoints configured');

  // Test failover simulation
  const originalFetch = global.fetch;
  let attempts = 0;
  global.fetch = async (url, opts) => {
    attempts++;
    if (attempts === 1) {
      return { ok: false, status: 500 }; // 1st fails with 500
    }
    if (attempts === 2) {
      throw new Error('Network timeout'); // 2nd fails with network error
    }
    // 3rd succeeds
    return {
      ok: true,
      status: 200,
      json: async () => FIXTURE_LUCHON_OSM
    };
  };

  const failoverData = await fetchOverpassWithFailover('dummy_ql');
  assert(attempts === 3, 'Tried 3 endpoints before success');
  assert(failoverData.elements.length === FIXTURE_LUCHON_OSM.elements.length, 'Successfully fetched data on 3rd endpoint');

  // Test all fail
  attempts = 0;
  global.fetch = async () => ({ ok: false, status: 503 });
  let allFailedThrew = false;
  try {
    await fetchOverpassWithFailover('dummy_ql');
  } catch (e) {
    allFailedThrew = true;
    assert(e.message.includes('All Overpass endpoints failed'), 'Threw error when all endpoints fail');
  }
  assert(allFailedThrew, 'All endpoints failing handled gracefully');

  // ─── Test Group 5: Session Cache & Message Handling (R1, R5) ─────────────
  console.log('\n5. Session Cache & REQUEST_OSM Handling:');
  resetSessionCache();

  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls++;
    return {
      ok: true,
      status: 200,
      json: async () => FIXTURE_LUCHON_OSM
    };
  };

  const sentMessages = [];
  global.messaging = {
    peerSocket: {
      OPEN: 1,
      readyState: 1,
      send: (str) => {
        sentMessages.push(str);
      },
      addEventListener: () => {},
      removeEventListener: () => {}
    }
  };

  // 1st request triggers Overpass fetch
  await new Promise((resolve) => {
    handleOsmRequest(42.791202, 0.601721, (err, res) => {
      assert(!err, '1st request succeeded without error');
      assert(res.course.name === 'Golf de Luchon', 'Course data returned');
      resolve();
    });
  });
  assert(fetchCalls === 1, '1st request called Overpass API (fetchCalls = 1)');
  assert(sentMessages.length === 1, 'Dispatched 1 COURSE_DATA message to peerSocket');

  // 2nd request uses session cache (0 extra network calls)
  await new Promise((resolve) => {
    handleOsmRequest(42.791202, 0.601721, (err, res) => {
      assert(!err, '2nd request succeeded without error');
      assert(res.course.name === 'Golf de Luchon', 'Cached course returned');
      resolve();
    });
  });
  assert(fetchCalls === 1, '2nd request served from cache with ZERO new network calls (fetchCalls = 1)');
  assert(sentMessages.length === 2, 'Dispatched cached COURSE_DATA to peerSocket');

  // Test invalid coordinates rejection
  let invalidCoordsHandled = false;
  handleOsmRequest(0, 0, (err, res) => {
    if (err) invalidCoordsHandled = true;
  });
  assert(invalidCoordsHandled, 'Rejects (0, 0) uninitialized GPS fix');

  // Restore fetch
  global.fetch = originalFetch;

  // ─── Summary ─────────────────────────────────────────────────────────────
  console.log(`\n========================================`);
  console.log(`Tests Passed: ${passed}`);
  console.log(`Tests Failed: ${failed}`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
