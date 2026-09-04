const https = require('https');

async function testOverpass(endpoint, ql) {
  return new Promise((resolve, reject) => {
    const postData = 'data=' + encodeURIComponent(ql);
    const url = new URL(endpoint);
    const req = https.request({
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'ZeppGolfTracker/1.0 (Testing)'
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve({ status: res.statusMessage, statusCode: res.statusCode, headers: res.headers, body });
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function run() {
  const ql = `[out:json][timeout:25];
(
  nwr["leisure"="golf_course"](around:3000, 42.7912, 0.6017);
  nwr["golf"~"^(hole|green|bunker|tee)$"](around:3000, 42.7912, 0.6017);
);
out center;`;

  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://z.overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];

  for (const ep of endpoints) {
    console.log(`\nTesting endpoint: ${ep}`);
    try {
      const t0 = Date.now();
      const res = await testOverpass(ep, ql);
      const dt = Date.now() - t0;
      console.log(`Status: ${res.statusCode} (${dt}ms)`);
      if (res.statusCode === 200) {
        const json = JSON.parse(res.body);
        console.log(`Elements: ${json.elements?.length}`);
        console.log('Sample tags:', json.elements.slice(0, 3).map(e => e.tags));
        break;
      } else {
        console.log('Body snippet:', res.body.slice(0, 300));
      }
    } catch (e) {
      console.error(`Error with ${ep}:`, e.message);
    }
  }
}

run();
