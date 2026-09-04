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

function parseOSMToCompactPayload(osmData, decimals = 5, maxBunkersPerHole = 3) {
  let courseName = 'Golf Course';
  for (const el of osmData.elements) {
    if (el.tags?.leisure === 'golf_course' && el.tags.name) {
      courseName = el.tags.name;
      break;
    }
  }

  const greens = [];
  const tees = [];
  const bunkers = [];

  for (const el of osmData.elements) {
    if (el.tags?.golf === 'green') {
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
  const r = (v) => (v != null ? Number(v.toFixed(decimals)) : null);

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

    // Filter bunkers within 50m of green or hole line
    const holeBunkers = [];
    bunkers.forEach(b => {
      let dMin = haversine(b.lat, b.lon, finalGreen.lat, finalGreen.lon);
      if (h.type === 'way' && h.geometry) {
        for (const p of h.geometry) {
          const d = haversine(b.lat, b.lon, p.lat, p.lon);
          if (d < dMin) dMin = d;
        }
      }
      if (dMin < 50) {
        holeBunkers.push({ lat: b.lat, lon: b.lon, dist: dMin });
      }
    });
    holeBunkers.sort((a, b) => a.dist - b.dist);
    const selectedBunkers = holeBunkers.slice(0, maxBunkersPerHole);

    holes.push({
      num: parseInt(ref, 10) || (idx + 1),
      p: par,
      g: [r(finalGreen.lat), r(finalGreen.lon)],
      t: teePt ? [r(teePt.lat), r(teePt.lon)] : null,
      b: selectedBunkers.map(b => [r(b.lat), r(b.lon)])
    });
  });

  // Deduplicate and sort holes 1..18
  holes.sort((a, b) => a.num - b.num);
  // Keep first 18 if more
  const finalHoles = holes.slice(0, 18);

  const payload = {
    type: 'COURSE_DATA',
    course: {
      name: courseName,
      par: finalHoles.reduce((s, h) => s + h.p, 0),
      holes: finalHoles.map(h => ({
        num: h.num,
        par: h.p,
        flag: { lat: h.g[0], lon: h.g[1] },
        greenEntry: { lat: h.g[0], lon: h.g[1] },
        tee: h.t ? { lat: h.t[0], lon: h.t[1] } : null,
        bunkers: h.b.map(b => ({ lat: b[0], lon: b[1] }))
      }))
    }
  };

  const compactPayload = {
    type: 'COURSE_DATA',
    course: {
      name: courseName,
      par: finalHoles.reduce((s, h) => s + h.p, 0),
      holes: finalHoles.map(h => ({
        p: h.p,
        g: h.g,
        t: h.t,
        b: h.b
      }))
    }
  };

  return { payload, compactPayload, holeCount: finalHoles.length };
}

async function benchmarkCourse(name, lat, lon) {
  console.log(`\n========================================`);
  console.log(`Benchmarking: ${name} (${lat}, ${lon})`);
  const ql = `[out:json][timeout:25];
(
  nwr["leisure"="golf_course"](around:3000, ${lat}, ${lon});
  nwr["golf"~"^(hole|green|bunker|tee)$"](around:3000, ${lat}, ${lon});
);
out geom;`;

  const data = await queryOverpass(ql);
  const { payload, compactPayload, holeCount } = parseOSMToCompactPayload(data);

  const rawVerbose = JSON.stringify(payload);
  const rawCompact = JSON.stringify(compactPayload);

  console.log(`Holes extracted: ${holeCount}`);
  console.log(`Verbose payload size: ${Buffer.byteLength(rawVerbose)} bytes (${(Buffer.byteLength(rawVerbose)/1024).toFixed(2)} KB)`);
  console.log(`Compact payload size: ${Buffer.byteLength(rawCompact)} bytes (${(Buffer.byteLength(rawCompact)/1024).toFixed(2)} KB)`);
  console.log(`Fits in 2 KB limit? ${Buffer.byteLength(rawCompact) < 2048 ? 'YES (< 2 KB)' : 'NO (>= 2 KB)'}`);
}

async function main() {
  await benchmarkCourse('Golf de Luchon (9 holes)', 42.7912, 0.6017);
  await benchmarkCourse('Golf du Totche (9 holes)', 44.3438, 2.0025);
  await benchmarkCourse('Golf de Saint-Cloud (18 holes)', 48.8597, 2.1966);
}

main().catch(console.error);
