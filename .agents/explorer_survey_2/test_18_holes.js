const https = require('https');

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
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
      // next
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

function processCourse(osmData, decimals = 5, maxBunkersPerHole = 3) {
  const greens = [];
  const tees = [];
  const bunkers = [];
  let name = 'Golf Course';

  for (const el of osmData.elements) {
    if (el.tags?.leisure === 'golf_course' && el.tags.name) name = el.tags.name;
    else if (el.tags?.golf === 'green') {
      const c = el.type === 'way' && el.geometry ? polygonCentroid(el.geometry) : { lat: el.lat, lon: el.lon };
      if (c && c.lat) greens.push({ ...c, ref: el.tags?.ref || el.tags?.hole });
    } else if (el.tags?.golf === 'tee') {
      const c = el.type === 'way' && el.geometry ? polygonCentroid(el.geometry) : { lat: el.lat, lon: el.lon };
      if (c && c.lat) tees.push({ ...c, ref: el.tags?.ref || el.tags?.hole });
    } else if (el.tags?.golf === 'bunker') {
      const c = el.type === 'way' && el.geometry ? polygonCentroid(el.geometry) : { lat: el.lat, lon: el.lon };
      if (c && c.lat) bunkers.push({ ...c, ref: el.tags?.ref || el.tags?.hole });
    }
  }

  const holeElements = osmData.elements.filter(el => el.tags?.golf === 'hole');
  const holes = [];

  const round = (val) => Number(val.toFixed(decimals));

  holeElements.forEach((h, idx) => {
    const ref = h.tags?.ref || String(idx + 1);
    const par = parseInt(h.tags?.par, 10) || 4;
    let teePt = null, flagPt = null;

    if (h.type === 'way' && h.geometry && h.geometry.length > 0) {
      teePt = { lat: h.geometry[0].lat, lon: h.geometry[0].lon };
      flagPt = { lat: h.geometry[h.geometry.length - 1].lat, lon: h.geometry[h.geometry.length - 1].lon };
    } else if (h.type === 'node') {
      flagPt = { lat: h.lat, lon: h.lon };
    }

    let matchedGreen = null;
    let minDistG = 80;
    greens.forEach(g => {
      if (g.ref === ref) matchedGreen = g;
      else if (flagPt) {
        const d = haversine(flagPt.lat, flagPt.lon, g.lat, g.lon);
        if (d < minDistG) { minDistG = d; matchedGreen = g; }
      }
    });

    const finalGreen = matchedGreen || flagPt;
    if (!finalGreen) return;

    // Nearest bunkers to the green or hole path
    const holeBunkers = [];
    bunkers.forEach(b => {
      const dGreen = haversine(b.lat, b.lon, finalGreen.lat, finalGreen.lon);
      if (dGreen < 60) {
        holeBunkers.push({ lat: b.lat, lon: b.lon, dist: dGreen });
      }
    });
    holeBunkers.sort((a, b) => a.dist - b.dist);
    const selectedBunkers = holeBunkers.slice(0, maxBunkersPerHole);

    holes.push({
      num: parseInt(ref, 10) || (idx + 1),
      p: par,
      g: [round(finalGreen.lat), round(finalGreen.lon)],
      t: teePt ? [round(teePt.lat), round(teePt.lon)] : undefined,
      b: selectedBunkers.map(b => [round(b.lat), round(b.lon)])
    });
  });

  holes.sort((a, b) => a.num - b.num);

  return {
    type: 'COURSE_DATA',
    course: {
      name: name,
      par: holes.reduce((s, h) => s + h.p, 0),
      holes: holes
    }
  };
}

async function test18Holes() {
  console.log('Querying 18-hole course: Golf de Toulouse Seilh...');
  const ql = `[out:json][timeout:25];
(
  nwr["leisure"="golf_course"](around:3000, 43.6897, 1.3432);
  nwr["golf"~"^(hole|green|bunker|tee)$"](around:3000, 43.6897, 1.3432);
);
out geom;`;

  const data = await queryOverpass(ql);
  console.log(`Elements returned: ${data.elements.length}`);

  // Test with 5 decimals (approx 1.1m precision) vs 6 decimals (0.11m)
  const c5 = processCourse(data, 5, 3);
  const c6 = processCourse(data, 6, 3);
  const cNoTee5 = JSON.parse(JSON.stringify(c5));
  cNoTee5.course.holes.forEach(h => delete h.t);

  const json5 = JSON.stringify(c5);
  const json6 = JSON.stringify(c6);
  const jsonNoTee5 = JSON.stringify(cNoTee5);

  console.log(`Course: "${c5.course.name}", Total Holes: ${c5.course.holes.length}`);
  console.log(`Size (6 decimals, with tee & 3 bunkers): ${Buffer.byteLength(json6)} bytes (${(Buffer.byteLength(json6)/1024).toFixed(2)} KB)`);
  console.log(`Size (5 decimals, with tee & 3 bunkers): ${Buffer.byteLength(json5)} bytes (${(Buffer.byteLength(json5)/1024).toFixed(2)} KB)`);
  console.log(`Size (5 decimals, no tee, 3 bunkers):   ${Buffer.byteLength(jsonNoTee5)} bytes (${(Buffer.byteLength(jsonNoTee5)/1024).toFixed(2)} KB)`);
}

test18Holes().catch(console.error);
