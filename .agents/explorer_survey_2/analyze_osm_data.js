const https = require('https');

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];

async function queryOverpassWithFailover(ql) {
  const postData = 'data=' + encodeURIComponent(ql);
  let lastErr = null;

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
            if (resp.statusCode === 200) {
              try {
                resolve(JSON.parse(body));
              } catch (e) {
                reject(new Error(`JSON parse error on ${endpoint}: ${body.slice(0, 100)}`));
              }
            } else {
              reject(new Error(`HTTP ${resp.statusCode} on ${endpoint}`));
            }
          });
        });
        req.on('timeout', () => {
          req.destroy(new Error(`Timeout on ${endpoint}`));
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
      });
      return { data: res, endpoint };
    } catch (err) {
      lastErr = err;
      console.log(`Endpoint ${endpoint} failed: ${err.message}. Trying next...`);
    }
  }
  throw lastErr || new Error('All Overpass endpoints failed');
}

// Distance Haversine in meters
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Polygon Centroid (Shoelace / Green's theorem)
function polygonCentroid(coords) {
  let a = 0, cx = 0, cy = 0;
  const n = coords.length;
  const pts = coords.slice();
  if (pts[0].lat !== pts[n - 1].lat || pts[0].lon !== pts[n - 1].lon) {
    pts.push(pts[0]);
  }
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
    for (let i = 0; i < coords.length; i++) {
      sumLat += coords[i].lat;
      sumLon += coords[i].lon;
    }
    return { lat: sumLat / coords.length, lon: sumLon / coords.length, area: 0 };
  }
  const factor = 1 / (6 * a);
  return { lat: cy * factor, lon: cx * factor, area: Math.abs(a) };
}

// Arithmetic Mean
function arithmeticMean(coords) {
  let sumLat = 0, sumLon = 0;
  for (let i = 0; i < coords.length; i++) {
    sumLat += coords[i].lat;
    sumLon += coords[i].lon;
  }
  return { lat: sumLat / coords.length, lon: sumLon / coords.length };
}

async function analyzeCourse(name, lat, lon) {
  console.log(`\n========================================`);
  console.log(`Analyzing: ${name} (${lat}, ${lon})`);
  console.log(`========================================`);

  const qlGeom = `[out:json][timeout:25];
(
  nwr["leisure"="golf_course"](around:3000, ${lat}, ${lon});
  nwr["golf"~"^(hole|green|bunker|tee)$"](around:3000, ${lat}, ${lon});
);
out geom;`;

  const { data: resGeom, endpoint } = await queryOverpassWithFailover(qlGeom);
  console.log(`Success via ${endpoint}. Elements: ${resGeom.elements.length}`);
  console.log(`Raw JSON size: ${(JSON.stringify(resGeom).length / 1024).toFixed(1)} KB`);

  const courseElements = resGeom.elements.filter(e => e.tags?.leisure === 'golf_course');
  const holes = resGeom.elements.filter(e => e.tags?.golf === 'hole');
  const greens = resGeom.elements.filter(e => e.tags?.golf === 'green');
  const tees = resGeom.elements.filter(e => e.tags?.golf === 'tee');
  const bunkers = resGeom.elements.filter(e => e.tags?.golf === 'bunker');

  console.log(`Breakdown: courses=${courseElements.length}, holes=${holes.length}, greens=${greens.length}, tees=${tees.length}, bunkers=${bunkers.length}`);
  console.log('Course names:', courseElements.map(c => c.tags?.name).filter(Boolean));

  // Inspect centroid differences between Shoelace and Arithmetic Mean
  let totalDiff = 0, countDiff = 0, maxDiff = 0;
  resGeom.elements.forEach(el => {
    if (el.type === 'way' && el.geometry && el.geometry.length > 2) {
      const isClosed = el.geometry[0].lat === el.geometry[el.geometry.length - 1].lat &&
                       el.geometry[0].lon === el.geometry[el.geometry.length - 1].lon;
      if (isClosed) {
        const c1 = polygonCentroid(el.geometry);
        const c2 = arithmeticMean(el.geometry.slice(0, -1));
        const d = haversine(c1.lat, c1.lon, c2.lat, c2.lon);
        totalDiff += d;
        countDiff++;
        if (d > maxDiff) maxDiff = d;
      }
    }
  });

  console.log(`Centroid arithmetic mean vs Shoelace (${countDiff} closed ways): avg=${(totalDiff / (countDiff || 1)).toFixed(3)}m, max=${maxDiff.toFixed(3)}m`);

  // Print sample holes and how they relate to greens, tees, bunkers
  console.log('\n--- HOLES DETAIL ---');
  holes.forEach(h => {
    const ref = h.tags?.ref || h.tags?.name || 'no-ref';
    const par = h.tags?.par || 'unknown';
    let geomSummary = '';
    if (h.type === 'way' && h.geometry) {
      geomSummary = `way with ${h.geometry.length} pts: start=(${h.geometry[0].lat.toFixed(5)},${h.geometry[0].lon.toFixed(5)}) end=(${h.geometry[h.geometry.length-1].lat.toFixed(5)},${h.geometry[h.geometry.length-1].lon.toFixed(5)})`;
    } else if (h.type === 'node') {
      geomSummary = `node (${h.lat.toFixed(5)}, ${h.lon.toFixed(5)})`;
    }
    console.log(`Hole ref=${ref} par=${par} [${h.type}] -> ${geomSummary}`);
  });

  console.log('\n--- GREENS DETAIL ---');
  greens.forEach(g => {
    const ref = g.tags?.ref || g.tags?.hole || 'no-ref';
    let pos = '';
    if (g.type === 'way' && g.geometry) {
      const c = polygonCentroid(g.geometry);
      pos = `centroid (${c.lat.toFixed(5)}, ${c.lon.toFixed(5)}) [${g.geometry.length} pts]`;
    } else if (g.type === 'node') {
      pos = `node (${g.lat.toFixed(5)}, ${g.lon.toFixed(5)})`;
    }
    console.log(`Green ref=${ref} [${g.type}] -> ${pos}`);
  });

  console.log('\n--- TEES DETAIL ---');
  tees.forEach(t => {
    const ref = t.tags?.ref || t.tags?.hole || 'no-ref';
    let pos = '';
    if (t.type === 'way' && t.geometry) {
      const c = polygonCentroid(t.geometry);
      pos = `centroid (${c.lat.toFixed(5)}, ${c.lon.toFixed(5)})`;
    } else if (t.type === 'node') {
      pos = `node (${t.lat.toFixed(5)}, ${t.lon.toFixed(5)})`;
    }
    console.log(`Tee ref=${ref} [${t.type}] -> ${pos}`);
  });

  console.log('\n--- BUNKERS SAMPLE (first 5) ---');
  bunkers.slice(0, 5).forEach(b => {
    const ref = b.tags?.ref || b.tags?.hole || 'no-ref';
    let pos = '';
    if (b.type === 'way' && b.geometry) {
      const c = polygonCentroid(b.geometry);
      pos = `centroid (${c.lat.toFixed(5)}, ${c.lon.toFixed(5)})`;
    } else if (b.type === 'node') {
      pos = `node (${b.lat.toFixed(5)}, ${b.lon.toFixed(5)})`;
    }
    console.log(`Bunker ref=${ref} [${b.type}] -> ${pos}`);
  });
}

async function main() {
  await analyzeCourse('Golf de Luchon', 42.7912, 0.6017);
  // Wait 1s
  await new Promise(r => setTimeout(r, 1000));
  await analyzeCourse('Golf du Totche', 44.3438, 2.0025);
}

main().catch(console.error);
