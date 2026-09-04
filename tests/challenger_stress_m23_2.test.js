/**
 * tests/challenger_stress_m23_2.test.js
 * Challenger 2 Adversarial Stress Test Suite for Milestone 2 & 3 / Milestone 4 (Watch Core & UI).
 * 
 * Comprehensive empirical testing of:
 *   1. Robustness against malformed, truncated, corrupt, and boundary Bluetooth messages (COURSE_DATA).
 *   2. Degenerate course/hole structures (0-hole courses, holes without greens/tees/bunkers/maps, corrupted coords, NaN bounds).
 *   3. Rapid UI button spam (next/prev, club cycling, score recording, confirm dialog) concurrent with GPS streams.
 *   4. Zero widget allocation & memory churn in continuous GPS update loop (10,000 updates).
 *   5. GPS coordinate delta thresholding (1.5m) and coordinate validation.
 *   6. Dynamic course shrinking mid-game & state transition resilience.
 *   7. Sensor & timer lifecycle teardown completeness (onDestroy).
 *   8. T-Rex 2 physical key handling & round completion history serialization.
 */

const req = typeof require !== 'undefined' ? eval('require') : null;

const {
  TestRunner,
  expect,
  haversineOracle,
  FIXTURE_LUCHON_OSM,
  FIXTURE_TOTCHE_OSM,
  FIXTURE_PEBBLE_BEACH_OSM,
  FIXTURE_ST_ANDREWS_OSM,
  FIXTURE_STATIC_LUCHON
} = req ? req('./helpers') : {};

const runner = new TestRunner('Challenger 2: Watch Core & UI Stress Suite (page/game.js)');

// ─── Zepp OS Mock Environment Factory ──────────────────────────────────────

function createWatchEnvironment() {
  let widgetCounter = 1;
  const createdWidgets = [];
  const activeTimers = new Set();
  const activeIntervals = new Set();
  let appGoBackCalls = 0;
  let appVibrateCalls = 0;
  let storageMap = new Map();

  // Mock hmUI
  const hmUI = {
    widget: {
      FILL_RECT: 1,
      IMG: 2,
      TEXT: 3,
      BUTTON: 4,
      STROKE_RECT: 5
    },
    prop: {
      MORE: 1,
      TEXT: 2,
      COLOR: 3,
      X: 4,
      Y: 5,
      W: 6,
      H: 7,
      VISIBLE: 8,
      SRC: 9
    },
    align: {
      CENTER_H: 1,
      CENTER_V: 2,
      LEFT: 3,
      RIGHT: 4
    },
    event: {
      CLICK_UP: 1,
      CLICK_DOWN: 2
    },
    createWidget(type, props) {
      const id = widgetCounter++;
      const eventListeners = {};
      const currentProps = { ...props };
      const propUpdates = [];

      const widget = {
        _id: id,
        _type: type,
        _props: currentProps,
        _propUpdates: propUpdates,
        setProperty(propKey, value) {
          if (propKey === hmUI.prop.MORE && typeof value === 'object') {
            Object.assign(currentProps, value);
          } else {
            currentProps[propKey] = value;
          }
          propUpdates.push({ propKey, value, time: Date.now() });
        },
        getProperty(propKey) {
          return currentProps[propKey];
        },
        addEventListener(evt, handler) {
          if (!eventListeners[evt]) eventListeners[evt] = [];
          eventListeners[evt].push(handler);
        },
        removeEventListener(evt, handler) {
          if (eventListeners[evt]) {
            eventListeners[evt] = eventListeners[evt].filter(h => h !== handler);
          }
        },
        // Test helper: simulate user click
        click() {
          const handlers = eventListeners[hmUI.event.CLICK_UP] || [];
          for (const h of handlers) h();
        }
      };

      createdWidgets.push(widget);
      return widget;
    },
    deleteWidget(widget) {
      const idx = createdWidgets.findIndex(w => w._id === widget._id);
      if (idx !== -1) createdWidgets.splice(idx, 1);
    },
    getCreatedWidgets() {
      return createdWidgets;
    },
    getWidgetCount() {
      return createdWidgets.length;
    }
  };

  // Mock hmSensor
  let geoListeners = [];
  let geoActive = false;
  let vibrateCount = 0;

  const mockGeoSensor = {
    latitude: 42.791202,
    longitude: 0.601721,
    addEventListener(event, cb) {
      if (event === 1) geoListeners.push(cb);
    },
    removeEventListener(event, cb) {
      if (event === 1) geoListeners = geoListeners.filter(fn => fn !== cb);
    },
    start() {
      geoActive = true;
    },
    stop() {
      geoActive = false;
    },
    emitCoords(lat, lon) {
      this.latitude = lat;
      this.longitude = lon;
      for (const cb of geoListeners) cb();
    }
  };

  const mockVibrateSensor = {
    start() {
      vibrateCount++;
    }
  };

  const hmSensor = {
    id: {
      GEOLOCATION: 1,
      VIBRATE: 2
    },
    event: {
      CHANGE: 1
    },
    createSensor(id) {
      if (id === 1) return mockGeoSensor;
      if (id === 2) return mockVibrateSensor;
      return {};
    }
  };

  // Mock hmStorage
  const hmStorage = {
    getItem(k) {
      return storageMap.has(k) ? storageMap.get(k) : null;
    },
    setItem(k, v) {
      storageMap.set(k, String(v));
    },
    clear() {
      storageMap.clear();
    }
  };

  // Mock hmApp
  const hmApp = {
    goBack() {
      appGoBackCalls++;
    },
    vibrate() {
      appVibrateCalls++;
    }
  };

  // Mock messaging
  let peerSocketListeners = { message: [], open: [], close: [] };
  const sentWatchMessages = [];

  const messaging = {
    peerSocket: {
      OPEN: 1,
      CONNECTING: 0,
      CLOSED: 3,
      readyState: 1,
      send(msg) {
        sentWatchMessages.push(typeof msg === 'string' ? JSON.parse(msg) : msg);
      },
      addEventListener(event, cb) {
        if (peerSocketListeners[event]) peerSocketListeners[event].push(cb);
      },
      removeEventListener(event, cb) {
        if (peerSocketListeners[event]) {
          peerSocketListeners[event] = peerSocketListeners[event].filter(fn => fn !== cb);
        }
      },
      simulateMessage(data) {
        const evt = { data: typeof data === 'object' ? JSON.stringify(data) : data };
        for (const cb of peerSocketListeners.message) cb(evt);
      }
    }
  };

  // Timer tracking
  const realSetInterval = setInterval;
  const realClearInterval = clearInterval;
  const realSetTimeout = setTimeout;
  const realClearTimeout = clearTimeout;

  const trackedSetInterval = (fn, ms) => {
    const id = realSetInterval(fn, ms);
    activeIntervals.add(id);
    return id;
  };
  const trackedClearInterval = (id) => {
    activeIntervals.delete(id);
    realClearInterval(id);
  };
  const trackedSetTimeout = (fn, ms) => {
    const id = realSetTimeout(fn, ms);
    activeTimers.add(id);
    return id;
  };
  const trackedClearTimeout = (id) => {
    activeTimers.delete(id);
    realClearTimeout(id);
  };

  let pageConfig = null;
  const PageMock = (config) => {
    pageConfig = config;
  };

  return {
    hmUI,
    hmSensor,
    mockGeoSensor,
    mockVibrateSensor,
    hmStorage,
    hmApp,
    messaging,
    trackedSetInterval,
    trackedClearInterval,
    trackedSetTimeout,
    trackedClearTimeout,
    PageMock,
    getPageConfig: () => pageConfig,
    getSentMessages: () => [...sentWatchMessages],
    getGoBackCalls: () => appGoBackCalls,
    getVibrateCalls: () => vibrateCount + appVibrateCalls,
    getActiveTimersCount: () => activeTimers.size,
    getActiveIntervalsCount: () => activeIntervals.size,
    cleanup() {
      for (const id of activeTimers) realClearTimeout(id);
      for (const id of activeIntervals) realClearInterval(id);
      activeTimers.clear();
      activeIntervals.clear();
    }
  };
}

/**
 * Helper to instantiate page/game.js with mocked environment.
 */
function setupGameInstance(savedState = null) {
  const env = createWatchEnvironment();

  if (savedState) {
    env.hmStorage.setItem('golfState', JSON.stringify(savedState));
  }

  // Set globals
  global.Page = env.PageMock;
  global.hmUI = env.hmUI;
  global.hmSensor = env.hmSensor;
  global.hmStorage = env.hmStorage;
  global.hmApp = env.hmApp;
  global.messaging = env.messaging;
  global.setInterval = env.trackedSetInterval;
  global.clearInterval = env.trackedClearInterval;
  global.setTimeout = env.trackedSetTimeout;
  global.clearTimeout = env.trackedClearTimeout;

  // Clear module cache to re-evaluate
  if (req) {
    delete req.cache[req.resolve('../page/game.js')];
  }
  const gameExports = req ? req('../page/game.js') : {};

  const pageConfig = env.getPageConfig();
  const pageInstance = Object.create(pageConfig);
  pageConfig.build.call(pageInstance);

  return {
    env,
    gameExports,
    pageConfig,
    pageInstance,
    mockGeoSensor: env.mockGeoSensor,
    widgets: env.hmUI.getCreatedWidgets()
  };
}

// ─── Suite 1: Malformed, Truncated & Corrupted Bluetooth Messages ───────────

runner.describe('Suite 1: Bluetooth Protocol & Message Ingestion Robustness', () => {
  runner.test('CH2-BT-1: Malformed non-JSON strings received on peerSocket do not crash watch', () => {
    const { env, pageInstance } = setupGameInstance();
    try {
      const malformedPayloads = [
        '{ "type": "COURSE_DATA", ', // Truncated JSON
        '<html><body>502 Bad Gateway</body></html>',
        'undefined',
        '',
        '{ key: without_quotes }',
        'NaN',
        'null'
      ];

      for (const payload of malformedPayloads) {
        expect(() => {
          env.messaging.peerSocket.simulateMessage(payload);
        }).not.toThrow();
      }
    } finally {
      pageInstance.onDestroy();
      env.cleanup();
    }
  });

  runner.test('CH2-BT-2: Non-string / unexpected evt.data types handled gracefully', () => {
    const { env, pageInstance } = setupGameInstance();
    try {
      const badTypes = [
        null,
        undefined,
        12345,
        true,
        false,
        [],
        { unexpected: 'structure' },
        { type: 'UNKNOWN_TYPE', course: null }
      ];

      for (const item of badTypes) {
        expect(() => {
          env.messaging.peerSocket.simulateMessage(item);
        }).not.toThrow();
      }
    } finally {
      pageInstance.onDestroy();
      env.cleanup();
    }
  });

  runner.test('CH2-BT-3: COURSE_DATA with empty course or null/empty holes retains static course', () => {
    const { env, pageInstance, widgets } = setupGameInstance();
    try {
      const txtHolePar = widgets.find(w => w._props.text && w._props.text.includes('#1 Par'));
      expect(txtHolePar).toBeDefined();
      expect(txtHolePar._props.text).toBe('#1 Par 4');

      // Send COURSE_DATA with empty holes array
      env.messaging.peerSocket.simulateMessage({
        type: 'COURSE_DATA',
        course: { name: 'Empty Course', par: 0, holes: [] }
      });

      // Static course retained (#1 Par 4)
      expect(txtHolePar._props.text).toBe('#1 Par 4');

      // Send COURSE_DATA with holes: null
      env.messaging.peerSocket.simulateMessage({
        type: 'COURSE_DATA',
        course: { name: 'Null Holes', holes: null }
      });
      expect(txtHolePar._props.text).toBe('#1 Par 4');

      // Send COURSE_DATA with holes: "not-an-array"
      env.messaging.peerSocket.simulateMessage({
        type: 'COURSE_DATA',
        course: { name: 'Bad Holes', holes: 'invalid' }
      });
      expect(txtHolePar._props.text).toBe('#1 Par 4');
    } finally {
      pageInstance.onDestroy();
      env.cleanup();
    }
  });

  runner.test('CH2-BT-4: Dynamic OSM COURSE_DATA switch updates UI and stores state', () => {
    const { env, pageInstance, widgets } = setupGameInstance();
    try {
      const txtHolePar = widgets.find(w => w._props.text && w._props.text.includes('#1 Par'));
      const txtClub = widgets.find(w => w._props.text === 'Driver');

      // Simulate valid dynamic course
      const dynamicCourse = {
        name: 'Pebble Beach OSM',
        par: 72,
        holes: [
          { num: 1, par: 5, green: [36.5710, -121.9460], tee: [36.5690, -121.9480], bunkers: [[36.5709, -121.9461]] },
          { num: 2, par: 4, green: [36.5720, -121.9450], tee: [36.5700, -121.9470], bunkers: [] }
        ]
      };

      env.messaging.peerSocket.simulateMessage({
        type: 'COURSE_DATA',
        course: dynamicCourse,
        bagClubs: ['Driver', '7-Fer', 'Putter']
      });

      // UI updated to #1 Par 5
      expect(txtHolePar._props.text).toBe('#1 Par 5');
      expect(txtClub._props.text).toBe('Driver');

      // State saved to storage
      const saved = JSON.parse(env.hmStorage.getItem('golfState'));
      expect(saved.isDynamic).toBe(true);
      expect(saved.selectedCourse.name).toBe('Pebble Beach OSM');
      expect(saved.bagClubs.length).toBe(3);
    } finally {
      pageInstance.onDestroy();
      env.cleanup();
    }
  });
});

// ─── Suite 2: Degenerate Hole Structures & Boundary Coordinates ─────────────

runner.describe('Suite 2: Degenerate Holes & Boundary Coordinates', () => {
  runner.test('CH2-DEG-1: Hole without green or flag returns placeholder distance without NaN or crash', () => {
    const { env, pageInstance, widgets, mockGeoSensor } = setupGameInstance();
    try {
      // Dynamic course with hole lacking green and flag
      env.messaging.peerSocket.simulateMessage({
        type: 'COURSE_DATA',
        course: {
          name: 'Greenless Golf',
          par: 36,
          holes: [
            { num: 1, par: 4, green: null, flag: null, tee: [42.791, 0.601], bunkers: [] }
          ]
        }
      });

      // Trigger GPS update
      mockGeoSensor.emitCoords(42.791202, 0.601721);

      const txtDistFlag = widgets.find(w => w._props.text_size === 58);
      const txtDistGreen = widgets.find(w => w._props.text && (w._props.text.startsWith('v ') || w._props.text === 'v ---'));

      expect(txtDistFlag._props.text).toBe('---');
      expect(txtDistGreen._props.text).toBe('v ---');
    } finally {
      pageInstance.onDestroy();
      env.cleanup();
    }
  });

  runner.test('CH2-DEG-2: Hole with corrupted bunker coordinates (nulls, empty arrays, bad types) handled cleanly', () => {
    const { env, pageInstance, widgets, mockGeoSensor } = setupGameInstance();
    try {
      env.messaging.peerSocket.simulateMessage({
        type: 'COURSE_DATA',
        course: {
          name: 'Messy Bunkers Club',
          par: 36,
          holes: [
            {
              num: 1,
              par: 4,
              green: [42.78827, 0.60173],
              tee: [42.79119, 0.60176],
              bunkers: [
                null,
                [42.78828, 0.60189],
                'invalid-bunker',
                [],
                { name: 'Named Bunker', lat: 42.78822, lon: 0.60158 }
              ]
            }
          ]
        }
      });

      mockGeoSensor.emitCoords(42.791202, 0.601721);

      const bunkerWidgets = widgets.filter(w => w._props.text_size === 15);
      expect(bunkerWidgets.length).toBe(3);
      // Valid bunkers extracted: B2 (the array [42.78828, 0.60189] at index 1) and Named Bunker
      expect(bunkerWidgets[0]._props.text).toContain('B2:');
      expect(bunkerWidgets[1]._props.text).toContain('Named Bunker:');
      expect(bunkerWidgets[2]._props.text).toBe('');
    } finally {
      pageInstance.onDestroy();
      env.cleanup();
    }
  });

  runner.test('CH2-DEG-3: Coordinate boundary cases: Null Island (0,0), NaN, out-of-range lat/lon ignored', () => {
    const { env, pageInstance, widgets, mockGeoSensor } = setupGameInstance();
    try {
      const txtDistFlag = widgets.find(w => w._props.text_size === 58);

      // Null Island (0, 0)
      mockGeoSensor.emitCoords(0, 0);
      expect(txtDistFlag._props.text).toBe('---'); // Ignored, GPS not marked active

      // NaN coordinates
      mockGeoSensor.emitCoords(NaN, 0.6017);
      expect(txtDistFlag._props.text).toBe('---');

      // Latitude > 90
      mockGeoSensor.emitCoords(95.0, 0.6017);
      expect(txtDistFlag._props.text).toBe('---');

      // Longitude > 180
      mockGeoSensor.emitCoords(42.7912, 195.0);
      expect(txtDistFlag._props.text).toBe('---');

      // Valid coordinates activate GPS
      mockGeoSensor.emitCoords(42.791202, 0.601721);
      expect(txtDistFlag._props.text).toBe('326');
    } finally {
      pageInstance.onDestroy();
      env.cleanup();
    }
  });

  runner.test('CH2-DEG-4: Hole with degenerate map bounds (zero width/height, inverted) does not crash projection', () => {
    const { env, pageInstance, widgets, mockGeoSensor } = setupGameInstance();
    try {
      env.messaging.peerSocket.simulateMessage({
        type: 'COURSE_DATA',
        course: {
          name: 'Flat Earth Golf',
          par: 36,
          holes: [
            {
              num: 1,
              par: 4,
              green: [42.78827, 0.60173],
              map: {
                src: 'flat.png',
                bounds: { topLat: 42.790, bottomLat: 42.790, leftLon: 0.600, rightLon: 0.600 } // Zero dimensions
              }
            }
          ]
        }
      });

      mockGeoSensor.emitCoords(42.791202, 0.601721);

      const playerDot = widgets.find(w => w._type === env.hmUI.widget.FILL_RECT && w._props.w === 14);
      // Dot remains safely offscreen (-20, -20)
      expect(playerDot._props.x).toBe(-20);
      expect(playerDot._props.y).toBe(-20);
    } finally {
      pageInstance.onDestroy();
      env.cleanup();
    }
  });
});

// ─── Suite 3: Rapid UI Interaction & Button Spam during GPS Streams ─────────

runner.describe('Suite 3: Rapid UI Button Spam & High-Frequency GPS Updates', () => {
  runner.test('CH2-SPAM-1: Rapid Next/Prev button spam (500 clicks) clamps holeIndex within valid bounds', () => {
    const { env, pageInstance, widgets } = setupGameInstance();
    try {
      const btnNext = widgets.find(w => w._props.text === 'T>');
      const btnHome = widgets.find(w => w._props.text === '<' && w._props.x === 20);
      const txtHolePar = widgets.find(w => w._props.text && w._props.text.includes('#1 Par'));

      expect(btnNext).toBeDefined();
      expect(btnHome).toBeDefined();

      // Click Next 50 times (more than 9 holes in static Luchon)
      for (let i = 0; i < 50; i++) {
        btnNext.click();
      }

      // Should be clamped on Hole 9 (#9 Par 3)
      expect(txtHolePar._props.text).toBe('#9 Par 3');

      // Click Prev 50 times
      for (let i = 0; i < 50; i++) {
        btnHome.click();
      }

      // First click at hole 0 calls hmApp.goBack()
      expect(env.getGoBackCalls()).toBeGreaterThanOrEqual(40);
      expect(txtHolePar._props.text).toBe('#1 Par 4');
    } finally {
      pageInstance.onDestroy();
      env.cleanup();
    }
  });

  runner.test('CH2-SPAM-2: Rapid club selector spam (500 clicks) wraps around cleanly without out-of-bounds', () => {
    const { env, pageInstance, widgets } = setupGameInstance();
    try {
      const btnClubL = widgets.find(w => w._props.text === '<' && w._props.y === 245);
      const btnClubR = widgets.find(w => w._props.text === '>' && w._props.y === 245);
      const txtClub = widgets.find(w => w._props.text === 'Driver');

      expect(btnClubL).toBeDefined();
      expect(btnClubR).toBeDefined();

      // Cycle right 30 times
      for (let i = 0; i < 30; i++) {
        btnClubR.click();
      }
      expect(typeof txtClub._props.text).toBe('string');
      expect(txtClub._props.text.length).toBeGreaterThan(0);

      // Cycle left 45 times
      for (let i = 0; i < 45; i++) {
        btnClubL.click();
      }
      expect(typeof txtClub._props.text).toBe('string');
      expect(txtClub._props.text.length).toBeGreaterThan(0);
    } finally {
      pageInstance.onDestroy();
      env.cleanup();
    }
  });

  runner.test('CH2-SPAM-3: Interleaved burst: 200 GPS updates streamed concurrently with 100 button clicks', () => {
    const { env, pageInstance, widgets, mockGeoSensor } = setupGameInstance();
    try {
      const btnNext = widgets.find(w => w._props.text === 'T>');
      const btnRecord = widgets.find(w => w._props.text === '+');
      const txtDistFlag = widgets.find(w => w._props.text_size === 58);
      const txtShotCount = widgets.find(w => w._props.text && w._props.text.includes('coup'));

      // Interleaved loop
      for (let i = 0; i < 100; i++) {
        // GPS move (~2m step)
        const lat = 42.791202 + (i * 0.00003);
        const lon = 0.601721 + (i * 0.00002);
        mockGeoSensor.emitCoords(lat, lon);

        // Record a shot
        btnRecord.click();

        // Advance hole every 10 steps
        if (i % 10 === 0) {
          btnNext.click();
        }
      }

      // No crash, UI is fully responsive
      expect(txtDistFlag._props.text).not.toBe('---');
      expect(txtShotCount._props.text).toContain('coup');

      // State saved correctly
      const saved = JSON.parse(env.hmStorage.getItem('golfState'));
      expect(saved.shots.length).toBe(100);
    } finally {
      pageInstance.onDestroy();
      env.cleanup();
    }
  });

  runner.test('CH2-SPAM-4: Dynamic course shrinking mid-game (user on Hole 9, incoming course has 6 holes)', () => {
    const { env, pageInstance, widgets, mockGeoSensor } = setupGameInstance();
    try {
      const btnNext = widgets.find(w => w._props.text === 'T>');
      const btnHome = widgets.find(w => w._props.text === '<' && w._props.x === 20);
      const txtHolePar = widgets.find(w => w._props.text && w._props.text.includes('#1 Par'));

      // Advance to Hole 9 in static course
      for (let i = 0; i < 8; i++) btnNext.click();
      expect(txtHolePar._props.text).toBe('#9 Par 3');

      // Dynamic OSM course arrives with ONLY 6 holes
      env.messaging.peerSocket.simulateMessage({
        type: 'COURSE_DATA',
        course: {
          name: '6-Hole Quick Course',
          par: 24,
          holes: Array.from({ length: 6 }, (_, idx) => ({
            num: idx + 1,
            par: 4,
            green: [42.788 + idx * 0.001, 0.601],
            tee: [42.791 + idx * 0.001, 0.601],
            bunkers: []
          }))
        }
      });

      // GPS update arrives while on out-of-range holeIndex
      mockGeoSensor.emitCoords(42.791202, 0.601721);

      // User presses Prev button to navigate back into valid range
      btnHome.click(); // holeIndex goes from 8 to 7
      btnHome.click(); // 7 to 6
      btnHome.click(); // 6 to 5 (#6 Par 4)

      expect(txtHolePar._props.text).toBe('#6 Par 4');

      // Pressing Next from Hole 6 triggers finish dialog
      btnNext.click();
      const confirmTxt = widgets.find(w => w._props.text === 'Terminer la partie ?');
      expect(confirmTxt._props.x).toBe(70); // Visible dialog
    } finally {
      pageInstance.onDestroy();
      env.cleanup();
    }
  });
});

// ─── Suite 4: Memory Leak & Zero Widget Allocation in GPS Loop ───────────────

runner.describe('Suite 4: Memory Churn & Zero Widget Allocations in GPS Loop', () => {
  runner.test('CH2-MEM-1: Exactly 0 widgets allocated during 10,000 continuous GPS coordinate updates', () => {
    const { env, pageInstance, mockGeoSensor } = setupGameInstance();
    try {
      const initialWidgetCount = env.hmUI.getWidgetCount();
      expect(initialWidgetCount).toBeGreaterThan(15); // Pre-allocated widget pool

      // Emit 10,000 GPS updates (each exceeding 1.5m delta)
      for (let i = 0; i < 10000; i++) {
        const lat = 42.791202 + (i * 0.00005);
        const lon = 0.601721 + (i * 0.00003);
        mockGeoSensor.emitCoords(lat, lon);
      }

      const postUpdateWidgetCount = env.hmUI.getWidgetCount();
      // HARD CONSTRAINT: ZERO new widgets allocated during GPS updates
      expect(postUpdateWidgetCount).toBe(initialWidgetCount);
    } finally {
      pageInstance.onDestroy();
      env.cleanup();
    }
  });

  runner.test('CH2-MEM-2: Exactly 0 widgets allocated during rapid hole navigation and club changes', () => {
    const { env, pageInstance, widgets } = setupGameInstance();
    try {
      const initialWidgetCount = env.hmUI.getWidgetCount();

      const btnNext = widgets.find(w => w._props.text === 'T>');
      const btnHome = widgets.find(w => w._props.text === '<' && w._props.x === 20);
      const btnClubR = widgets.find(w => w._props.text === '>' && w._props.y === 245);

      for (let i = 0; i < 1000; i++) {
        if (i % 2 === 0) btnNext.click();
        else btnHome.click();
        btnClubR.click();
      }

      const postNavWidgetCount = env.hmUI.getWidgetCount();
      expect(postNavWidgetCount).toBe(initialWidgetCount);
    } finally {
      pageInstance.onDestroy();
      env.cleanup();
    }
  });

  runner.test('CH2-MEM-3: GPS delta filter (< 1.5m) prevents unnecessary UI computation and property sets', () => {
    const { env, pageInstance, widgets, mockGeoSensor } = setupGameInstance();
    try {
      const txtDistFlag = widgets.find(w => w._props.text_size === 58);
      mockGeoSensor.emitCoords(42.791202, 0.601721); // First fix

      const initialPropUpdates = txtDistFlag._propUpdates.length;

      // Jitter movements under 1.5m (approx < 0.000013 deg)
      mockGeoSensor.emitCoords(42.791204, 0.601721); // ~0.2m
      mockGeoSensor.emitCoords(42.791207, 0.601721); // ~0.5m
      mockGeoSensor.emitCoords(42.791210, 0.601721); // ~0.8m

      // Prop updates count did not increase
      expect(txtDistFlag._propUpdates.length).toBe(initialPropUpdates);

      // Move >= 1.5m (~5m)
      mockGeoSensor.emitCoords(42.791250, 0.601721);
      expect(txtDistFlag._propUpdates.length).toBe(initialPropUpdates + 1);
    } finally {
      pageInstance.onDestroy();
      env.cleanup();
    }
  });

  runner.test('CH2-MEM-4: onDestroy cleanly deallocates all timers, sensor listeners and peerSocket listeners', () => {
    const { env, pageInstance } = setupGameInstance();
    expect(env.getActiveIntervalsCount()).toBeGreaterThan(0); // GPS polling & blink timer

    // Invoke onDestroy
    pageInstance.onDestroy();

    // Verify all interval timers cleared
    expect(pageInstance._gpsInterval).toBeNull();
    expect(pageInstance._gpsBlinkTimer).toBeNull();
    expect(pageInstance._osmTimeout == null).toBe(true);
    expect(pageInstance._geo).toBeNull();
    expect(pageInstance._onGpsChange).toBeNull();
    expect(pageInstance._onMessage).toBeNull();
    expect(env.getActiveIntervalsCount()).toBe(0);
    env.cleanup();
  });
});

// ─── Suite 5: Hardware Physical Keys & Round Completion Protocol ────────────

runner.describe('Suite 5: T-Rex 2 Physical Keys & Round Completion', () => {
  runner.test('CH2-HW-1: Physical keys: UP (2) cycles club prev, DOWN (3) cycles club next', () => {
    const { env, pageInstance, widgets } = setupGameInstance();
    try {
      const txtClub = widgets.find(w => w._props.text === 'Driver');

      // Key 3 (DOWN) -> Next club (5-Bois)
      const handledDown = pageInstance.onKey({ key: 3, action: 0 });
      expect(handledDown).toBe(true);
      expect(txtClub._props.text).toBe('5-Bois');

      // Key 2 (UP) -> Prev club (Driver)
      const handledUp = pageInstance.onKey({ key: 2, action: 0 });
      expect(handledUp).toBe(true);
      expect(txtClub._props.text).toBe('Driver');

      // Key release action (action = 1) is ignored
      const ignored = pageInstance.onKey({ key: 3, action: 1 });
      expect(ignored).toBe(false);
      expect(txtClub._props.text).toBe('Driver');
    } finally {
      pageInstance.onDestroy();
      env.cleanup();
    }
  });

  runner.test('CH2-HW-2: Physical key SELECT (1/0/4) attempts to open finish dialog (Bug detection: showFinishConfirmDialog reference in onKey)', () => {
    const { env, pageInstance, widgets } = setupGameInstance();
    try {
      // NOTE: This test asserts whether calling onKey for SELECT throws a ReferenceError due to showFinishConfirmDialog scope issue
      let threwRefError = false;
      try {
        pageInstance.onKey({ key: 1, action: 0 });
      } catch (err) {
        if (err instanceof ReferenceError && err.message.includes('showFinishConfirmDialog')) {
          threwRefError = true;
        } else {
          throw err;
        }
      }

      // If page/game.js has the bug, threwRefError is true
      if (threwRefError) {
        throw new Error('CRITICAL BUG DETECTED: onKey calls showFinishConfirmDialog() which is not in scope (ReferenceError). Must bind to this._showFinishConfirmDialog.');
      }
    } finally {
      pageInstance.onDestroy();
      env.cleanup();
    }
  });

  runner.test('CH2-HW-3: Finish round dialog workflow saves round to golfHistory and transmits ROUND_COMPLETE', () => {
    const { env, pageInstance, widgets, mockGeoSensor } = setupGameInstance();
    try {
      const btnRecord = widgets.find(w => w._props.text === '+');
      const btnConfirmTxt = widgets.find(w => w._props.text === 'Oui, Fin');
      const btnCancelTxt = widgets.find(w => w._props.text === 'Annuler');
      const confirmTxt = widgets.find(w => w._props.text === 'Terminer la partie ?');

      mockGeoSensor.emitCoords(42.791202, 0.601721);

      // Record 4 shots on hole 1
      btnRecord.click();
      btnRecord.click();
      btnRecord.click();
      btnRecord.click();

      // Advance to Hole 9 and click Next to open finish confirmation dialog
      const btnNext = widgets.find(w => w._props.text === 'T>');
      for (let i = 0; i < 8; i++) btnNext.click(); // Advance to Hole 9
      btnNext.click(); // Triggers showFinishConfirmDialog() from Hole 9
      expect(confirmTxt._props.x).toBe(70);

      // Click Cancel -> dialog hides
      btnCancelTxt.click();
      expect(confirmTxt._props.x).toBe(-500);

      // Re-open and Confirm Finish
      btnNext.click();
      btnConfirmTxt.click();

      // Transmitted ROUND_COMPLETE message over peerSocket
      const sentMsgs = env.getSentMessages();
      const roundCompleteMsg = sentMsgs.find(m => m.type === 'ROUND_COMPLETE');
      expect(roundCompleteMsg).toBeDefined();
      expect(roundCompleteMsg.round.course).toBe('Golf de Luchon');
      expect(roundCompleteMsg.round.totalShots).toBe(4);
      expect(roundCompleteMsg.round.holes[0].shots).toBe(4);
      expect(roundCompleteMsg.round.holes[0].score).toBe(0); // 4 shots on par 4 = 0

      // Saved in golfHistory storage
      const rawHist = env.hmStorage.getItem('golfHistory');
      expect(rawHist).toBeTruthy();
      const hist = JSON.parse(rawHist);
      expect(hist.length).toBe(1);
      expect(hist[0].course).toBe('Golf de Luchon');

      // Returned to previous page
      expect(env.getGoBackCalls()).toBe(1);
    } finally {
      pageInstance.onDestroy();
      env.cleanup();
    }
  });
});

if (require.main === module) {
  runner.run().then(summary => {
    console.log(`\n=== ${summary.suiteName} ===`);
    console.log(`Passed: ${summary.passed}/${summary.total} (Failed: ${summary.failed})`);
    if (summary.failed > 0) {
      summary.results.filter(r => r.status === 'FAILED').forEach(r => {
        console.error(`- ${r.name}: ${r.error}`);
      });
      process.exit(1);
    }
  });
}

module.exports = runner;
