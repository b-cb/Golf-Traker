const https = require('https');

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter'
];

async function queryOverpass(ql) {
  const postData = 'data=' + encodeURIComponent(ql);
  for (const endpoint of ENDPOINTS) {
    try {
      const url = new URL(endpoint);
      const res = await new Promise((resolve, reject) => {
        const req = https.request({
          hostname: url.hostname,
          port: 443,
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postData),
            'User-Agent': 'ZeppGolfTracker/1.0'
          },
          timeout: 10000
        }, (resp) => {
          let body = '';
          resp.on('data', chunk => body += chunk);
          resp.on('end', () => {
            if (resp.statusCode === 200) resolve(JSON.parse(body));
            else reject(new Error(`HTTP ${resp.statusCode}`));
          });
        });
        req.on('timeout', () => req.destroy(new Error('Timeout')));
        req.on('error', reject);
        req.write(postData);
        req.end();
      });
      return res;
    } catch (e) {
      // try next
    }
  }
  throw new Error('Overpass failed');
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function polygonCentroid(coords) {
  let a = 0, cx = 0, cy = 0;
  const n = coords.length;
  const pts = coords.slice();
  if (pts[0].lat !== pts[n - 1].lat || pts[0].lon !== pts[n - 1].lon) pts.push(pts[0]);
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i], p2 = pts[i + 1];
    const cross = (p1.lon * p2.lat - p2.lon * p1.lat);
    a += cross;
    cx += (p1.lon + p2.lon) * cross;
    cy += (p1.lat + p2.lat) * cross;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-12) {
    let sumLat = 0, sumLon = 0;
    for (let i = 0; i < coords.length; i++) { sumLat += coords[i].lat; sumLon += coords[i].lon; }
    return { lat: sumLat / coords.length, lon: sumLon / coords.length };
  }
  const factor = 1 / (6 * a);
  return { lat: cy * factor, lon: cx * factor };
}

function processOSM(osmData, courseNameFallback = 'Golf Course') {
  // 1. Find course name
  let courseName = courseNameFallback;
  for (const el of osmData.elements) {
    if (el.tags?.leisure === 'golf_course' && el.tags.name) {
      courseName = el.tags.name;
      break;
    }
  }

  // 2. Extract greens with centroids
  const greens = [];
  for (const el of osmData.elements) {
    if (el.tags?.golf === 'green') {
      let pt = null;
      if (el.type === 'way' && el.geometry) pt = polygonCentroid(el.geometry);
      else if (el.type === 'node') pt = { lat: el.lat, lon: el.lon };
      if (pt) greens.push({ ...pt, ref: el.tags?.ref || el.tags?.hole });
    }
  }

  // 3. Extract tees
  const tees = [];
  for (const el of osmData.elements) {
    if (el.tags?.golf === 'tee') {
      let pt = null;
      if (el.type === 'way' && el.geometry) pt = polygonCentroid(el.geometry);
      else if (el.type === 'node') pt = { lat: el.lat, lon: el.lon };
      if (pt) tees.push({ ...pt, ref: el.tags?.ref || el.tags?.hole });
    }
  }

  // 4. Extract bunkers with centroids
  const bunkers = [];
  for (const el of osmData.elements) {
    if (el.tags?.golf === 'bunker') {
      let pt = null;
      if (el.type === 'way' && el.geometry) pt = polygonCentroid(el.geometry);
      else if (el.type === 'node') pt = { lat: el.lat, lon: el.lon };
      if (pt) bunkers.push({ ...pt, ref: el.tags?.ref || el.tags?.hole });
    }
  }

  // 5. Extract holes and match greens/tees/bunkers
  const holeElements = osmData.elements.filter(el => el.tags?.golf === 'hole');
  const holes = [];

  holeElements.forEach((h, idx) => {
    const ref = h.tags?.ref || String(idx + 1);
    const par = parseInt(h.tags?.par, 10) || 4;
    let teePt = null;
    let flagPt = null;

    if (h.type === 'way' && h.geometry && h.geometry.length > 0) {
      teePt = { lat: h.geometry[0].lat, lon: h.geometry[0].lon };
      flagPt = { lat: h.geometry[h.geometry.length - 1].lat, lon: h.geometry[h.geometry.length - 1].lon };
    } else if (h.type === 'node') {
      flagPt = { lat: h.lat, lon: h.lon };
    }

    // Match nearest green if flag not exact
    let matchedGreen = null;
    let minDistG = 80; // max 80m from hole end
    greens.forEach(g => {
      if (g.ref === ref) {
        matchedGreen = g;
      } else if (flagPt) {
        const d = haversine(flagPt.lat, flagPt.lon, g.lat, g.lon);
        if (d < minDistG) {
          minDistG = d;
          matchedGreen = g;
        }
      }
    });

    const finalGreen = matchedGreen ? { lat: matchedGreen.lat, lon: matchedGreen.lon } : flagPt;

    // Match nearest tee if not from hole line
    if (!teePt) {
      let minDistT = 100;
      tees.forEach(t => {
        if (t.ref === ref) teePt = t;
        else if (finalGreen) {
          // not preferred
        }
      });
    }

    // Match bunkers within proximity of this hole (e.g., within 50m of fairway line or green)
    const holeBunkers = [];
    if (h.type === 'way' && h.geometry) {
      bunkers.forEach(b => {
        // Distance to any point on hole way or green
        let minBunkDist = haversine(b.lat, b.lon, finalGreen.lat, finalGreen.lon);
        for (const pt of h.geometry) {
          const d = haversine(b.lat, b.lon, pt.lat, pt.lon);
          if (d < minBunkDist) minBunkDist = d;
        }
        if (minBunkDist < 45) {
          holeBunkers.push({ lat: b.lat, lon: b.lon });
        }
      });
    }

    if (finalGreen) {
      holes.push({
        num: parseInt(ref, 10) || (idx + 1),
        par: par,
        tee: teePt ? { lat: Number(teePt.lat.toFixed(6)), lon: Number(teePt.lon.toFixed(6)) } : null,
        green: { lat: Number(finalGreen.lat.toFixed(6)), lon: Number(finalGreen.lon.toFixed(6)) },
        bunkers: holeBunkers.map(b => ({ lat: Number(b.lat.toFixed(6)), lon: Number(b.lon.toFixed(6)) }))
      });
    }
  });

  // Sort holes by hole number
  holes.sort((a, b) => a.num - b.num);

  return {
    name: courseName,
    par: holes.reduce((sum, h) => sum + h.par, 0),
    holes: holes
  };
}

// Schemas evaluation
function testSchemas(course) {
  console.log(`\n--- Schema Size Evaluation for "${course.name}" (${course.holes.length} holes) ---`);

  // Schema 1: Standard Object Format (verbose)
  // { type: 'COURSE_DATA', course: { name: '...', par: 36, holes: [{ par: 4, green: {lat, lon}, flag: {lat, lon}, bunkers: [{lat, lon}] }] } }
  const s1 = {
    type: 'COURSE_DATA',
    course: {
      name: course.name,
      par: course.par,
      holes: course.holes.map(h => ({
        par: h.par,
        greenEntry: h.green,
        flag: h.green,
        tee: h.tee,
        bunkers: h.bunkers
      }))
    }
  };
  const json1 = JSON.stringify(s1);

  // Schema 2: Compact Object Format (R1/R2 optimized)
  // { type: 'OSM_DATA', name: '...', holes: [{ p: 4, g: [lat, lon], t: [lat, lon], b: [[lat, lon], ...] }] }
  const s2 = {
    type: 'OSM_DATA',
    name: course.name,
    holes: course.holes.map(h => ({
      p: h.par,
      g: [h.green.lat, h.green.lon],
      t: h.tee ? [h.tee.lat, h.tee.lon] : null,
      b: h.bunkers.map(b => [b.lat, b.lon])
    }))
  };
  const json2 = JSON.stringify(s2);

  // Schema 3: Ultra-compact Array Format
  // { t: 'OSM', n: '...', h: [[par, gLat, gLon, tLat, tLon, [bLat1, bLon1, ...]], ...] }
  const s3 = {
    t: 'OSM',
    n: course.name,
    h: course.holes.map(h => [
      h.par,
      h.green.lat,
      h.green.lon,
      h.tee ? h.tee.lat : 0,
      h.tee ? h.tee.lon : 0,
      h.bunkers.flatMap(b => [b.lat, b.lon])
    ])
  };
  const json3 = JSON.stringify(s3);

  // Schema 4: Legacy-compatible Clean Format
  // Same structure as game.js GAME_COURSES[0], stripped of map images/bounds
  // { type: 'COURSE_DATA', course: { name: '...', par: 36, holes: [{ par: 4, greenEntry: {lat, lon}, flag: {lat, lon}, bunkers: [...] }] } }
  const s4 = {
    type: 'COURSE_DATA',
    course: {
      name: course.name,
      par: course.par,
      holes: course.holes.map(h => ({
        par: h.par,
        flag: h.green,
        greenEntry: h.green,
        tee: h.tee,
        bunkers: h.bunkers
      }))
    }
  };
  const json4 = JSON.stringify(s4);

  console.log(`Schema 1 (Verbose Object):     ${Buffer.byteLength(json1)} bytes (${(Buffer.byteLength(json1)/1024).toFixed(2)} KB)`);
  console.log(`Schema 2 (Compact Object):     ${Buffer.byteLength(json2)} bytes (${(Buffer.byteLength(json2)/1024).toFixed(2)} KB)`);
  console.log(`Schema 3 (Ultra-compact Array): ${Buffer.byteLength(json3)} bytes (${(Buffer.byteLength(json3)/1024).toFixed(2)} KB)`);
  console.log(`Schema 4 (Legacy Compatible):  ${Buffer.byteLength(json4)} bytes (${(Buffer.byteLength(json4)/1024).toFixed(2)} KB)`);
  console.log(`Target is < 2048 bytes (2 KB). All meet target? S1=${Buffer.byteLength(json1)<2048}, S2=${Buffer.byteLength(json2)<2048}, S3=${Buffer.byteLength(json3)<2048}, S4=${Buffer.byteLength(json4)<2048}`);

  console.log('\nSample Schema 2 payload:\n', json2.slice(0, 300) + '...');
}

async function run() {
  const qlLuchon = `[out:json][timeout:25];
(
  nwr["leisure"="golf_course"](around:3000, 42.7912, 0.6017);
  nwr["golf"~"^(hole|green|bunker|tee)$"](around:3000, 42.7912, 0.6017);
);
out geom;`;

  const osmData = await queryOverpass(qlLuchon);
  const course = processOSM(osmData, 'Golf de Luchon');
  testSchemas(course);
}

run().catch(console.error);
