/**
 * tests/challenger_stress_m1_2.test.js
 * Challenger 2 Adversarial Stress Test Suite for Milestone 1 (App-side Overpass Service & Data Reducer).
 * 
 * Verifies:
 *   1. Rapid concurrent REQUEST_OSM messages during active network fetch (race condition testing).
 *   2. Network failures, HTTP 429 rate limits, HTTP 504 gateway timeouts across all 4 mirrors.
 *   3. Cache invalidation and single-fetch session lock validation.
 *   4. Edge case resilience: Malformed JSON, HTML error pages, empty results, peerSocket queuing, payload < 2KB.
 */

const req = typeof require !== 'undefined' ? eval('require') : null;

const {
  TestRunner,
  expect,
  FIXTURE_LUCHON_OSM,
  FIXTURE_TOTCHE_OSM,
  FIXTURE_PEBBLE_BEACH_OSM,
  FIXTURE_ST_ANDREWS_OSM
} = req ? req('./helpers') : {};

const appSide = req ? req('../app-side/index') : {};

const runner = new TestRunner('Challenger 2: M1 Stress & Concurrency Suite');

// ─── Suite 1: Rapid Concurrent REQUEST_OSM Messages & Concurrency ───────────

runner.describe('Adversarial Concurrency: Rapid REQUEST_OSM Race Conditions', () => {
  runner.test('C1-1: 50 simultaneous REQUEST_OSM calls during active network fetch trigger exactly 1 network query', async () => {
    appSide.resetSessionCache();
    let networkFetches = 0;

    // Mock global.fetch with 50ms simulated network latency
    const originalFetch = global.fetch;
    global.fetch = async (url, options) => {
      networkFetches++;
      await new Promise(resolve => setTimeout(resolve, 50));
      return {
        ok: true,
        status: 200,
        json: async () => FIXTURE_LUCHON_OSM
      };
    };

    // Mock messaging peerSocket
    let sentMessages = [];
    global.messaging = {
      peerSocket: {
        readyState: 1, // OPEN
        OPEN: 1,
        send: (msg) => sentMessages.push(typeof msg === 'string' ? JSON.parse(msg) : msg)
      }
    };

    try {
      // Launch 50 concurrent requests simultaneously
      const promises = [];
      for (let i = 0; i < 50; i++) {
        promises.push(new Promise((resolve, reject) => {
          appSide.handleOsmRequest(42.791202, 0.601721, (err, data) => {
            if (err) reject(err);
            else resolve(data);
          });
        }));
      }

      const results = await Promise.all(promises);

      // Verify exactly 1 network fetch was launched
      expect(networkFetches).toBe(1);

      // Verify all 50 callers received the valid course payload
      expect(results.length).toBe(50);
      for (const res of results) {
        expect(res).toBeTruthy();
        expect(res.type).toBe('COURSE_DATA');
        expect(res.course.name).toBe('Golf de Luchon');
        expect(res.course.holes.length).toBe(9);
      }

      // Verify COURSE_DATA was sent to watch
      expect(sentMessages.length >= 1).toBe(true);
      expect(sentMessages[0].type).toBe('COURSE_DATA');
      expect(sentMessages[0].course.name).toBe('Golf de Luchon');
    } finally {
      global.fetch = originalFetch;
      appSide.resetSessionCache();
    }
  });

  runner.test('C1-2: 50 concurrent REQUEST_OSM calls during network failure all receive error & release lock', async () => {
    appSide.resetSessionCache();
    let networkAttempts = 0;

    const originalFetch = global.fetch;
    global.fetch = async () => {
      networkAttempts++;
      await new Promise(resolve => setTimeout(resolve, 10));
      return { ok: false, status: 500 };
    };

    try {
      const promises = [];
      for (let i = 0; i < 50; i++) {
        promises.push(new Promise((resolve, reject) => {
          appSide.handleOsmRequest(42.791202, 0.601721, (err, data) => {
            if (err) resolve({ err: err.message });
            else reject(new Error('Should not succeed'));
          });
        }));
      }

      const results = await Promise.all(promises);

      // All 50 received errors
      expect(results.length).toBe(50);
      for (const res of results) {
        expect(res.err).toContain('All Overpass endpoints failed');
      }

      // Network attempts = 4 mirrors (1 query across 4 mirrors)
      expect(networkAttempts).toBe(4);

      // Verify session cache was not corrupted (remains null)
      // Now a new request should be able to try again immediately (lock was released)
      let retryCalled = false;
      global.fetch = async () => {
        retryCalled = true;
        return {
          ok: true,
          status: 200,
          json: async () => FIXTURE_LUCHON_OSM
        };
      };

      const retryResult = await new Promise((resolve, reject) => {
        appSide.handleOsmRequest(42.791202, 0.601721, (err, data) => {
          if (err) reject(err);
          else resolve(data);
        });
      });

      expect(retryCalled).toBe(true);
      expect(retryResult.course.name).toBe('Golf de Luchon');
    } finally {
      global.fetch = originalFetch;
      appSide.resetSessionCache();
    }
  });

  runner.test('C1-3: Interleaved burst: 25 requests in-flight + 25 post-completion requests', async () => {
    appSide.resetSessionCache();
    let fetchCount = 0;

    const originalFetch = global.fetch;
    global.fetch = async () => {
      fetchCount++;
      await new Promise(resolve => setTimeout(resolve, 30));
      return { ok: true, status: 200, json: async () => FIXTURE_LUCHON_OSM };
    };

    try {
      // First wave: 25 requests during fetch
      const wave1Promises = Array.from({ length: 25 }, () => {
        return new Promise((resolve, reject) => {
          appSide.handleOsmRequest(42.791202, 0.601721, (err, data) => {
            if (err) reject(err);
            else resolve(data);
          });
        });
      });

      const wave1Results = await Promise.all(wave1Promises);
      expect(fetchCount).toBe(1);
      expect(wave1Results.length).toBe(25);

      // Second wave: 25 requests after cache is established
      const wave2Promises = Array.from({ length: 25 }, () => {
        return new Promise((resolve, reject) => {
          appSide.handleOsmRequest(42.791202, 0.601721, (err, data) => {
            if (err) reject(err);
            else resolve(data);
          });
        });
      });

      const wave2Results = await Promise.all(wave2Promises);
      // Fetch count should STILL be 1 (0 network queries in wave 2)
      expect(fetchCount).toBe(1);
      expect(wave2Results.length).toBe(25);
      expect(wave2Results[0].course.name).toBe('Golf de Luchon');
    } finally {
      global.fetch = originalFetch;
      appSide.resetSessionCache();
    }
  });
});

// ─── Suite 2: Multi-Mirror Failover (429, 504, 500, Disconnects, Timeouts) ──

runner.describe('Adversarial Failover: HTTP 429, 504, 500, Timeouts across 4 Mirrors', () => {
  runner.test('C2-1: HTTP 429 Rate Limit on Mirror 1 immediately fails over to Mirror 2 and succeeds', async () => {
    appSide.resetSessionCache();
    const calledUrls = [];

    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      calledUrls.push(url);
      if (url.includes('overpass-api.de/api/interpreter') && !url.includes('lz4') && !url.includes('z.')) {
        return { ok: false, status: 429, statusText: 'Too Many Requests' };
      }
      return { ok: true, status: 200, json: async () => FIXTURE_LUCHON_OSM };
    };

    try {
      const result = await new Promise((resolve, reject) => {
        appSide.handleOsmRequest(42.791202, 0.601721, (err, data) => {
          if (err) reject(err);
          else resolve(data);
        });
      });

      expect(calledUrls.length).toBe(2);
      expect(calledUrls[0]).toContain('overpass-api.de');
      expect(calledUrls[1]).toContain('lz4.overpass-api.de');
      expect(result.course.name).toBe('Golf de Luchon');
    } finally {
      global.fetch = originalFetch;
      appSide.resetSessionCache();
    }
  });

  runner.test('C2-2: Cascading failures: 504 (Mirror 1) -> 502 (Mirror 2) -> 429 (Mirror 3) -> 200 OK (Mirror 4)', async () => {
    appSide.resetSessionCache();
    const calledUrls = [];

    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      calledUrls.push(url);
      if (calledUrls.length === 1) return { ok: false, status: 504, statusText: 'Gateway Timeout' };
      if (calledUrls.length === 2) return { ok: false, status: 502, statusText: 'Bad Gateway' };
      if (calledUrls.length === 3) return { ok: false, status: 429, statusText: 'Too Many Requests' };
      return { ok: true, status: 200, json: async () => FIXTURE_TOTCHE_OSM };
    };

    try {
      const result = await new Promise((resolve, reject) => {
        appSide.handleOsmRequest(44.550, 2.100, (err, data) => {
          if (err) reject(err);
          else resolve(data);
        });
      });

      expect(calledUrls.length).toBe(4);
      expect(calledUrls[0]).toContain(appSide.OVERPASS_ENDPOINTS[0]);
      expect(calledUrls[1]).toContain(appSide.OVERPASS_ENDPOINTS[1]);
      expect(calledUrls[2]).toContain(appSide.OVERPASS_ENDPOINTS[2]);
      expect(calledUrls[3]).toContain(appSide.OVERPASS_ENDPOINTS[3]);
      expect(result.course.name).toBe('Golf du Totche');
      expect(result.course.holes.length).toBe(9);
    } finally {
      global.fetch = originalFetch;
      appSide.resetSessionCache();
    }
  });

  runner.test('C2-3: Complete outage: All 4 mirrors fail (HTTP 503) -> Graceful error without unhandled crash', async () => {
    appSide.resetSessionCache();
    let callCount = 0;

    const originalFetch = global.fetch;
    global.fetch = async () => {
      callCount++;
      return { ok: false, status: 503, statusText: 'Service Unavailable' };
    };

    try {
      let caughtErr = null;
      await new Promise((resolve) => {
        appSide.handleOsmRequest(42.791202, 0.601721, (err, data) => {
          caughtErr = err;
          resolve();
        });
      });

      expect(callCount).toBe(4);
      expect(caughtErr).toBeTruthy();
      expect(caughtErr.message).toContain('All Overpass endpoints failed');
    } finally {
      global.fetch = originalFetch;
      appSide.resetSessionCache();
    }
  });

  runner.test('C2-4: Malformed response handling: HTML 200 OK error page fails over to valid mirror', async () => {
    appSide.resetSessionCache();
    let callCount = 0;

    const originalFetch = global.fetch;
    global.fetch = async () => {
      callCount++;
      if (callCount === 1) {
        // Returns 200 OK with HTML error page (simulating captive portal or proxy error)
        return {
          ok: true,
          status: 200,
          json: async () => { throw new SyntaxError('Unexpected token < in JSON at position 0'); }
        };
      }
      return { ok: true, status: 200, json: async () => FIXTURE_LUCHON_OSM };
    };

    try {
      const result = await new Promise((resolve, reject) => {
        appSide.handleOsmRequest(42.791202, 0.601721, (err, data) => {
          if (err) reject(err);
          else resolve(data);
        });
      });

      expect(callCount).toBe(2);
      expect(result.course.name).toBe('Golf de Luchon');
    } finally {
      global.fetch = originalFetch;
      appSide.resetSessionCache();
    }
  });

  runner.test('C2-5: Overpass runtime error response: { remark: "Query timed out" } (no elements) fails over', async () => {
    appSide.resetSessionCache();
    let callCount = 0;

    const originalFetch = global.fetch;
    global.fetch = async () => {
      callCount++;
      if (callCount === 1) {
        // Overpass returns 200 OK with remark error and missing elements
        return {
          ok: true,
          status: 200,
          json: async () => ({ version: 0.6, remark: 'runtime error: Query timed out' })
        };
      }
      return { ok: true, status: 200, json: async () => FIXTURE_LUCHON_OSM };
    };

    try {
      const result = await new Promise((resolve, reject) => {
        appSide.handleOsmRequest(42.791202, 0.601721, (err, data) => {
          if (err) reject(err);
          else resolve(data);
        });
      });

      expect(callCount).toBe(2);
      expect(result.course.name).toBe('Golf de Luchon');
    } finally {
      global.fetch = originalFetch;
      appSide.resetSessionCache();
    }
  });
});

// ─── Suite 3: Cache Invalidation, GPS Validation & Single-Fetch Lock ────────

runner.describe('Cache Invalidation, GPS Validation & Session Lock', () => {
  runner.test('C3-1: 100 consecutive handleOsmRequest calls hit cache after initial fetch (0 network requests)', async () => {
    appSide.resetSessionCache();
    let fetchCount = 0;

    const originalFetch = global.fetch;
    global.fetch = async () => {
      fetchCount++;
      return { ok: true, status: 200, json: async () => FIXTURE_LUCHON_OSM };
    };

    try {
      // Initial fetch
      await new Promise((resolve) => appSide.handleOsmRequest(42.7912, 0.6017, resolve));
      expect(fetchCount).toBe(1);

      // 100 consecutive calls
      for (let i = 0; i < 100; i++) {
        let resData = null;
        await new Promise((resolve) => {
          appSide.handleOsmRequest(42.7912, 0.6017, (err, data) => {
            resData = data;
            resolve();
          });
        });
        expect(resData.course.name).toBe('Golf de Luchon');
      }

      // Fetch count must remain 1
      expect(fetchCount).toBe(1);
    } finally {
      global.fetch = originalFetch;
      appSide.resetSessionCache();
    }
  });

  runner.test('C3-2: resetSessionCache() invalidates cache and enables fresh network fetch', async () => {
    appSide.resetSessionCache();
    let fetchCount = 0;

    const originalFetch = global.fetch;
    global.fetch = async () => {
      fetchCount++;
      return { ok: true, status: 200, json: async () => FIXTURE_LUCHON_OSM };
    };

    try {
      // First session fetch
      await new Promise((resolve) => appSide.handleOsmRequest(42.7912, 0.6017, resolve));
      expect(fetchCount).toBe(1);

      // Invalidate cache (simulating new game session or onDestroy)
      appSide.resetSessionCache();

      // Second session fetch
      await new Promise((resolve) => appSide.handleOsmRequest(42.7912, 0.6017, resolve));
      expect(fetchCount).toBe(2);
    } finally {
      global.fetch = originalFetch;
      appSide.resetSessionCache();
    }
  });

  runner.test('C3-3: Invalid GPS coordinates rejected synchronously without triggering network fetch', async () => {
    appSide.resetSessionCache();
    let fetchCount = 0;

    const originalFetch = global.fetch;
    global.fetch = async () => {
      fetchCount++;
      return { ok: true, status: 200, json: async () => FIXTURE_LUCHON_OSM };
    };

    try {
      const invalidCoords = [
        [0, 0], // Null Island
        [NaN, 0.6017],
        [42.7912, NaN],
        [null, null],
        [undefined, undefined],
        ['42.7912', '0.6017'] // String types
      ];

      for (const [lat, lon] of invalidCoords) {
        let caughtErr = null;
        appSide.handleOsmRequest(lat, lon, (err) => {
          caughtErr = err;
        });
        expect(caughtErr).toBeTruthy();
        expect(caughtErr.message).toBe('Invalid GPS coordinates');
      }

      // No network calls made
      expect(fetchCount).toBe(0);
    } finally {
      global.fetch = originalFetch;
      appSide.resetSessionCache();
    }
  });

  runner.test('C3-4: Empty OSM response elements: [] does not cache empty data and allows retry', async () => {
    appSide.resetSessionCache();
    let callCount = 0;

    const originalFetch = global.fetch;
    global.fetch = async () => {
      callCount++;
      if (callCount === 1) {
        // First call: Empty elements in OSM
        return { ok: true, status: 200, json: async () => ({ version: 0.6, elements: [] }) };
      }
      // Second call: Valid OSM
      return { ok: true, status: 200, json: async () => FIXTURE_LUCHON_OSM };
    };

    try {
      let firstErr = null;
      await new Promise((resolve) => {
        appSide.handleOsmRequest(42.7912, 0.6017, (err) => {
          firstErr = err;
          resolve();
        });
      });

      expect(firstErr).toBeTruthy();
      expect(firstErr.message).toBe('No golf holes extracted from OSM data');

      // Next request should NOT be cached and should retry network fetch
      let secondData = null;
      await new Promise((resolve) => {
        appSide.handleOsmRequest(42.7912, 0.6017, (err, data) => {
          secondData = data;
          resolve();
        });
      });

      expect(callCount).toBe(2);
      expect(secondData.course.name).toBe('Golf de Luchon');
    } finally {
      global.fetch = originalFetch;
      appSide.resetSessionCache();
    }
  });
});

// ─── Suite 4: Messaging Resilience & Payload Size Limits (< 2 KB) ───────────

runner.describe('Messaging Resilience & Payload Size Boundaries', () => {
  runner.test('C4-1: Safe messaging buffers and delivers when peerSocket is in CONNECTING state', async () => {
    let queuedOpenListener = null;
    let deliveredMessage = null;

    global.messaging = {
      peerSocket: {
        readyState: 0, // CONNECTING (not OPEN)
        OPEN: 1,
        addEventListener: (event, handler) => {
          if (event === 'open') queuedOpenListener = handler;
        },
        removeEventListener: () => {},
        send: (msg) => { deliveredMessage = msg; }
      }
    };

    let sendErr = null;
    appSide.safeSend({ type: 'TEST', value: 123 }, null, (err) => {
      sendErr = err;
    });

    // Initial call reports queued error
    expect(sendErr).toBeTruthy();
    expect(sendErr.message).toContain('Watch not connected. Message queued.');

    // Listener was registered
    expect(typeof queuedOpenListener).toBe('function');

    // Simulate socket opening
    queuedOpenListener();

    // Message delivered on open
    expect(deliveredMessage).toBeTruthy();
    const parsed = JSON.parse(deliveredMessage);
    expect(parsed.type).toBe('TEST');
    expect(parsed.value).toBe(123);
  });

  runner.test('C4-2: Real-world 18-hole courses with numerous bunkers serialized strictly under 2048 bytes', () => {
    // 1. Pebble Beach (18 holes, 36 bunkers)
    const pebblePayload = appSide.parseOSMToCourseData(FIXTURE_PEBBLE_BEACH_OSM);
    const pebbleJson = JSON.stringify(pebblePayload);
    const pebbleBytes = Buffer.byteLength(pebbleJson, 'utf8');

    expect(pebblePayload.course.holes.length).toBe(18);
    expect(pebbleBytes).toBeLessThan(2048);

    // 2. St Andrews Old Course (18 holes, pot bunkers)
    const stAndrewsPayload = appSide.parseOSMToCourseData(FIXTURE_ST_ANDREWS_OSM);
    const stAndrewsJson = JSON.stringify(stAndrewsPayload);
    const stAndrewsBytes = Buffer.byteLength(stAndrewsJson, 'utf8');

    expect(stAndrewsPayload.course.holes.length).toBe(18);
    expect(stAndrewsBytes).toBeLessThan(2048);

    // 3. Golf de Luchon (9 holes)
    const luchonPayload = appSide.parseOSMToCourseData(FIXTURE_LUCHON_OSM);
    const luchonJson = JSON.stringify(luchonPayload);
    const luchonBytes = Buffer.byteLength(luchonJson, 'utf8');

    expect(luchonPayload.course.holes.length).toBe(9);
    expect(luchonBytes).toBeLessThan(2048);
  });
});

module.exports = runner;

if (require.main === module) {
  runner.run().then(summary => {
    console.log(`\nStress Test Results: ${summary.passed}/${summary.total} passed (${summary.failed} failed)`);
    if (summary.failed > 0) {
      summary.results.filter(r => r.status === 'FAILED').forEach(f => console.error('FAILED:', f.name, f.error));
      process.exit(1);
    }
  });
}
