// ─── Golf Tracker - Page Jeu avec carte ──────────────────────────────────
// ES5 strict (JerryScript / Zepp OS 1.0)
// Pas de fetch() côté montre, pas de librairie externe

var DEFAULT_CLUBS = [
  'Driver', '5-Bois', '5-Fer', '6-Fer', '7-Fer', '8-Fer',
  '9-Fer', '10-Fer', 'Pitch', 'Approche', '52°', '56°', 'Sand Wedge', 'Putter'
]

// ─── Parcours statiques de secours (Fallback) ──────────────────────────────
// Fix trou 3 et structures de bunkers intégrées
var GAME_COURSES = [
  {
    name: 'Golf de Luchon',
    par: 33,
    holes: [
      {
        par: 4,
        tee: { lat: 42.791202, lon: 0.601721 },
        greenEntry: { lat: 42.788392, lon: 0.601717 },
        flag: { lat: 42.788272, lon: 0.601729 },
        bunkers: [
          { name: 'Bunker G', lat: 42.78828, lon: 0.60189 },
          { name: 'Bunker D', lat: 42.78822, lon: 0.60158 }
        ],
        map: {
          src: 'luchon_01.png',
          bounds: { topLat: 42.791254, bottomLat: 42.787938, leftLon: 0.601439, rightLon: 0.602214 }
        }
      },
      {
        par: 4,
        tee: { lat: 42.788068, lon: 0.602869 },
        greenEntry: { lat: 42.787802, lon: 0.601444 },
        flag: { lat: 42.787785, lon: 0.601307 },
        bunkers: [
          { name: 'Bunker Front', lat: 42.78773, lon: 0.60122 }
        ],
        map: {
          src: 'luchon_02.png',
          bounds: { topLat: 42.788205, bottomLat: 42.787638, leftLon: 0.601188, rightLon: 0.602970 }
        }
      },
      {
        par: 3,
        tee: { lat: 42.788115, lon: 0.601357 },
        greenEntry: { lat: 42.790955, lon: 0.601436 },
        flag: { lat: 42.791080, lon: 0.601465 },
        bunkers: [],
        map: {
          src: 'luchon_03.png',
          bounds: { topLat: 42.791227, bottomLat: 42.787995, leftLon: 0.601195, rightLon: 0.601613 }
        }
      },
      {
        par: 4,
        tee: null,
        greenEntry: { lat: 42.7948, lon: 0.6012 },
        flag: { lat: 42.7950, lon: 0.6013 },
        bunkers: [],
        map: {
          src: 'luchon_04.png',
          bounds: { topLat: 42.7965, bottomLat: 42.7930, leftLon: 0.5987, rightLon: 0.6037 }
        }
      },
      {
        par: 3,
        tee: null,
        greenEntry: { lat: 42.7940, lon: 0.6008 },
        flag: { lat: 42.7941, lon: 0.6009 },
        bunkers: [],
        map: {
          src: 'luchon_05.png',
          bounds: { topLat: 42.7957, bottomLat: 42.7922, leftLon: 0.5983, rightLon: 0.6033 }
        }
      },
      {
        par: 4,
        tee: null,
        greenEntry: { lat: 42.7933, lon: 0.6004 },
        flag: { lat: 42.7934, lon: 0.6006 },
        bunkers: [],
        map: {
          src: 'luchon_06.png',
          bounds: { topLat: 42.7950, bottomLat: 42.7915, leftLon: 0.5979, rightLon: 0.6029 }
        }
      },
      {
        par: 4,
        tee: null,
        greenEntry: { lat: 42.7926, lon: 0.6010 },
        flag: { lat: 42.7928, lon: 0.6011 },
        bunkers: [],
        map: {
          src: 'luchon_07.png',
          bounds: { topLat: 42.7943, bottomLat: 42.7908, leftLon: 0.5985, rightLon: 0.6035 }
        }
      },
      {
        par: 4,
        tee: null,
        greenEntry: { lat: 42.7920, lon: 0.6018 },
        flag: { lat: 42.7921, lon: 0.6020 },
        bunkers: [],
        map: {
          src: 'luchon_08.png',
          bounds: { topLat: 42.7937, bottomLat: 42.7902, leftLon: 0.5993, rightLon: 0.6043 }
        }
      },
      {
        par: 3,
        tee: null,
        greenEntry: { lat: 42.7915, lon: 0.6025 },
        flag: { lat: 42.7916, lon: 0.6026 },
        bunkers: [],
        map: {
          src: 'luchon_09.png',
          bounds: { topLat: 42.7932, bottomLat: 42.7897, leftLon: 0.6000, rightLon: 0.6050 }
        }
      }
    ]
  }
]

var MIN_DELTA_METERS = 1.5

// ─── Haversine exact (R = 6,371,000 m) ─────────────────────────────────────
function haversineDistance(lat1, lon1, lat2, lon2) {
  var R = 6371000, rad = Math.PI / 180
  var dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad
  var sinLat = Math.sin(dLat / 2), sinLon = Math.sin(dLon / 2)
  var a = sinLat * sinLat + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * sinLon * sinLon
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

// ─── Cap (bearing) Tee → Flag ──────────────────────────────────────────────
function calculateBearing(lat1, lon1, lat2, lon2) {
  var rad = Math.PI / 180
  var dLon = (lon2 - lon1) * rad
  var lat1r = lat1 * rad, lat2r = lat2 * rad
  var x = Math.sin(dLon) * Math.cos(lat2r)
  var y = Math.cos(lat1r) * Math.sin(lat2r) - Math.sin(lat1r) * Math.cos(lat2r) * Math.cos(dLon)
  return ((Math.atan2(x, y) * 180 / Math.PI) + 360) % 360
}

// ─── Extraction uniforme des coordonnées (Static & OSM) ────────────────────
function isValidCoordinate(lat, lon) {
  return lat !== null && lon !== null &&
         typeof lat === 'number' && typeof lon === 'number' &&
         !isNaN(lat) && !isNaN(lon) &&
         (lat !== 0 || lon !== 0) &&
         lat >= -90 && lat <= 90 &&
         lon >= -180 && lon <= 180
}

function getGreenCoord(hole) {
  if (!hole) return null
  if (hole.green) {
    if (Array.isArray(hole.green) && hole.green.length >= 2) return { lat: hole.green[0], lon: hole.green[1] }
    if (typeof hole.green.lat === 'number') return { lat: hole.green.lat, lon: hole.green.lon }
  }
  if (hole.flag) {
    if (Array.isArray(hole.flag) && hole.flag.length >= 2) return { lat: hole.flag[0], lon: hole.flag[1] }
    if (typeof hole.flag.lat === 'number') return { lat: hole.flag.lat, lon: hole.flag.lon }
  }
  return null
}

function getGreenEntryCoord(hole) {
  if (!hole) return null
  if (hole.greenEntry) {
    if (Array.isArray(hole.greenEntry) && hole.greenEntry.length >= 2) return { lat: hole.greenEntry[0], lon: hole.greenEntry[1] }
    if (typeof hole.greenEntry.lat === 'number') return { lat: hole.greenEntry.lat, lon: hole.greenEntry.lon }
  }
  return getGreenCoord(hole)
}

function getTeeCoord(hole) {
  if (!hole || !hole.tee) return null
  if (Array.isArray(hole.tee) && hole.tee.length >= 2) return { lat: hole.tee[0], lon: hole.tee[1] }
  if (typeof hole.tee.lat === 'number') return { lat: hole.tee.lat, lon: hole.tee.lon }
  return null
}

function getBunkerCoords(hole) {
  if (!hole || !hole.bunkers || !Array.isArray(hole.bunkers)) return []
  var list = []
  for (var i = 0; i < hole.bunkers.length; i++) {
    var b = hole.bunkers[i]
    if (!b) continue
    if (Array.isArray(b) && b.length >= 2) {
      list.push({ name: 'B' + (i + 1), lat: b[0], lon: b[1] })
    } else if (typeof b.lat === 'number' && typeof b.lon === 'number') {
      list.push({ name: b.name || ('B' + (i + 1)), lat: b.lat, lon: b.lon })
    }
  }
  return list
}

// ─── Projection GPS → Pixel (synchronisée 1-to-1 avec l'image satellite) ─────
function projectOnMap(lat, lon, hole) {
  if (!hole || !hole.map || !hole.map.bounds) return null
  var b = hole.map.bounds
  var widthLon = b.rightLon - b.leftLon
  var heightLat = b.topLat - b.bottomLat
  if (widthLon <= 0 || heightLat <= 0) return null

  // Position brute dans l'image 225x454
  var px = ((lon - b.leftLon) / widthLon) * 225
  var py = ((b.topLat - lat) / heightLat) * 454

  // Rotation Course-Up si le départ (tee) et le drapeau (flag/green) sont tous deux définis
  var tee = getTeeCoord(hole)
  var flag = getGreenCoord(hole)
  if (tee && flag) {
    var bearing = calculateBearing(tee.lat, tee.lon, flag.lat, flag.lon)
    var rad = bearing * Math.PI / 180
    var cos = Math.cos(rad), sin = Math.sin(rad)
    var cx = 112.5, cy = 227  // centre de l'image 225x454
    var dx = px - cx, dy = py - cy
    px = cx + dx * cos + dy * sin
    py = cy - dx * sin + dy * cos
  }

  return {
    x: Math.round(px) + 229,  // décalage vers la moitié droite de l'écran
    y: Math.round(py)
  }
}

// ─── Stockage ──────────────────────────────────────────────────────────────
function loadState() {
  try {
    var r = hmStorage.getItem('golfState')
    return r ? JSON.parse(r) : null
  } catch (e) { return null }
}

function saveState(st) {
  try {
    hmStorage.setItem('golfState', JSON.stringify({
      courseIndex: st.courseIndex,
      selectedCourse: st.course,
      bagClubs: st.clubs,
      holeIndex: st.holeIndex,
      shots: st.shots,
      isDynamic: st.isDynamic
    }))
  } catch (e) {}
}

// ─── Vibration ─────────────────────────────────────────────────────────────
function vibrateShort() {
  try {
    hmSensor.createSensor(hmSensor.id.VIBRATE).start({ repeat: 1, repeat_pause: 0 })
  } catch (e) {
    try { hmApp.vibrate() } catch (e2) {}
  }
}

// ─── Envoi sécurisé via peerSocket ─────────────────────────────────────────
function sendWatchMessage(msgObj) {
  try {
    var str = JSON.stringify(msgObj)
    if (typeof messaging !== 'undefined' && messaging.peerSocket) {
      if (messaging.peerSocket.readyState === messaging.peerSocket.OPEN) {
        messaging.peerSocket.send(str)
      } else {
        var onOpen = function () {
          try {
            if (messaging.peerSocket.removeEventListener) {
              messaging.peerSocket.removeEventListener('open', onOpen)
            }
            messaging.peerSocket.send(str)
          } catch (errSend) {}
        }
        messaging.peerSocket.addEventListener('open', onOpen)
      }
    }
  } catch (e) {
    console.log('[WATCH_MSG_ERR]', e)
  }
}

var pageInstance = null

// ─── Page ──────────────────────────────────────────────────────────────────
if (typeof Page !== 'undefined') {
Page({
  build: function () {
    pageInstance = this
    var self = this

    this._osmTimeout = null
    this._gpsInterval = null
    this._gpsBlinkTimer = null

    var state = {
      courseIndex: 0,
      holeIndex: 0,
      lat: null,
      lon: null,
      lastLat: null,
      lastLon: null,
      gpsActive: false,
      hasRequestedOsm: false,
      isDynamic: false,
      clubIndex: 0,
      course: null,
      clubs: DEFAULT_CLUBS,
      shots: []
    }

    var saved = loadState()
    if (saved) {
      if (saved.selectedCourse) {
        state.course = saved.selectedCourse
      } else if (saved.receivedCourse) {
        state.course = saved.receivedCourse
        state.isDynamic = true
      } else if (typeof saved.courseIndex === 'number' && saved.courseIndex >= 0) {
        state.courseIndex = saved.courseIndex
        state.course = GAME_COURSES[saved.courseIndex] || GAME_COURSES[0]
      }
      if (saved.bagClubs && saved.bagClubs.length > 0) state.clubs = saved.bagClubs
      if (saved.holeIndex != null) state.holeIndex = saved.holeIndex
      if (saved.shots) state.shots = saved.shots
      if (saved.isDynamic) state.isDynamic = saved.isDynamic
    }
    if (!state.course) {
      state.course = GAME_COURSES[0]
    }

    // ── Fond principal (sombre) ────────────────────────────────────────────
    hmUI.createWidget(hmUI.widget.FILL_RECT, { x: 0, y: 0, w: 454, h: 454, color: 0x000000 })

    // ── Image carte du trou (fond en dessous sur la moitié droite) ──────────
    var hole0 = state.course ? state.course.holes[state.holeIndex] : null
    var mapImg = hmUI.createWidget(hmUI.widget.IMG, {
      x: 229, y: 0, w: 225, h: 454,
      src: (hole0 && hole0.map && hole0.map.src) ? hole0.map.src : ''
    })

    // ── Icône drapeau (positionnée dynamiquement) ───────────────────────────
    var flagPin = hmUI.createWidget(hmUI.widget.TEXT, {
      x: -30, y: -30, w: 24, h: 24, text: '🚩', color: 0xef4444, text_size: 18,
      align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V
    })

    // ── Point joueur (cercle rouge 14×14) ───────────────────────────────────
    var playerDot = hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: -20, y: -20, w: 14, h: 14, color: 0xff2020, radius: 7
    })

    // ── Cache Gauche (Split Screen Garmin) ──────────────────────────────────
    hmUI.createWidget(hmUI.widget.FILL_RECT, { x: 0, y: 0, w: 227, h: 454, color: 0x000000 })
    // Ligne de séparation verticale
    hmUI.createWidget(hmUI.widget.FILL_RECT, { x: 225, y: 0, w: 2, h: 454, color: 0x333333 })

    // Bouton < : trou précédent, ou retour accueil si trou 1
    var btnHome = hmUI.createWidget(hmUI.widget.TEXT, {
      x: 20, y: 30, w: 35, h: 35, text: '<',
      color: 0x888888, text_size: 20,
      align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V
    })

    // "#1 Par 4"
    var txtHolePar = hmUI.createWidget(hmUI.widget.TEXT, {
      x: 55, y: 30, w: 115, h: 35, text: '#1 Par 4',
      color: 0xffffff, text_size: 20,
      align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V
    })

    // Trou suivant (T>)
    var btnNext = hmUI.createWidget(hmUI.widget.TEXT, {
      x: 170, y: 30, w: 45, h: 35, text: 'T>', color: 0x888888, text_size: 18,
      align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V
    })

    // Distance Drapeau / Green (Très gros font 58px, Jaune / Vert vif) - R4 Prominent Central Green
    var txtDistFlag = hmUI.createWidget(hmUI.widget.TEXT, {
      x: 10, y: 68, w: 205, h: 65, text: '---',
      color: 0xfacc15, text_size: 58,
      align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V
    })

    // Distance Green Entrée (Plus petit, Blanc) avec chevron bas
    var txtDistGreen = hmUI.createWidget(hmUI.widget.TEXT, {
      x: 10, y: 135, w: 205, h: 28, text: 'v ---',
      color: 0xffffff, text_size: 22,
      align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V
    })

    // ── Liste des obstacles / bunkers (3 rangées pré-instanciées) ───────────
    var txtBunker0 = hmUI.createWidget(hmUI.widget.TEXT, {
      x: 10, y: 165, w: 205, h: 24, text: '',
      color: 0xfbbf24, text_size: 15,
      align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V
    })
    var txtBunker1 = hmUI.createWidget(hmUI.widget.TEXT, {
      x: 10, y: 189, w: 205, h: 24, text: '',
      color: 0xfbbf24, text_size: 15,
      align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V
    })
    var txtBunker2 = hmUI.createWidget(hmUI.widget.TEXT, {
      x: 10, y: 213, w: 205, h: 24, text: '',
      color: 0xfbbf24, text_size: 15,
      align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V
    })

    // ── Club - Badge pilule en zone sûre (y=245) ───────────────────────────
    var btnClubL = hmUI.createWidget(hmUI.widget.TEXT, {
      x: 10, y: 245, w: 30, h: 38, text: '<', color: 0x666666, text_size: 20,
      align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V
    })
    var clubPillBg = hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: 42, y: 246, w: 140, h: 36, color: 0x1e293b, radius: 18
    })
    var txtClub = hmUI.createWidget(hmUI.widget.TEXT, {
      x: 42, y: 245, w: 140, h: 38, text: state.clubs[0] || '-',
      color: 0x93c5fd, text_size: 19,
      align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V
    })
    var btnClubR = hmUI.createWidget(hmUI.widget.TEXT, {
      x: 184, y: 245, w: 30, h: 38, text: '>', color: 0x666666, text_size: 20,
      align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V
    })

    // Infos Score & GPS (y=295 en zone sûre)
    var txtShotCount = hmUI.createWidget(hmUI.widget.TEXT, {
      x: 15, y: 295, w: 95, h: 24, text: '0 coup',
      color: 0xaaaaaa, text_size: 14,
      align_h: hmUI.align.LEFT, align_v: hmUI.align.CENTER_V
    })
    var txtGps = hmUI.createWidget(hmUI.widget.TEXT, {
      x: 115, y: 295, w: 95, h: 24, text: 'GPS .',
      color: 0xaaaaaa, text_size: 14,
      align_h: hmUI.align.RIGHT, align_v: hmUI.align.CENTER_V
    })

    // ── Bouton Action (Rouge "+", centré dans la zone écran droite) ─────────
    var btnRecordBg = hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: 295, y: 325, w: 68, h: 68, color: 0xcc0000, radius: 34
    })
    var btnRecord = hmUI.createWidget(hmUI.widget.TEXT, {
      x: 295, y: 325, w: 68, h: 68, text: '+',
      color: 0xffffff, text_size: 34,
      align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V
    })

    // ── Calcul des distances & obstacles ───────────────────────────────────
    function currentHoleShots() {
      var result = []
      for (var i = 0; i < state.shots.length; i++) {
        if (state.shots[i].hole === state.holeIndex) result.push(state.shots[i])
      }
      return result
    }

    function computeDistances() {
      if (!state.gpsActive || state.lat === null || state.lon === null || !state.course) {
        return { flagText: '---', greenText: 'v ---', bunkerTexts: ['', '', ''] }
      }
      var hole = state.course.holes[state.holeIndex]
      if (!hole) {
        return { flagText: '---', greenText: 'v ---', bunkerTexts: ['', '', ''] }
      }

      var green = getGreenCoord(hole)
      var greenDist = green ? haversineDistance(state.lat, state.lon, green.lat, green.lon) : null

      var entry = getGreenEntryCoord(hole)
      var entryDist = entry ? haversineDistance(state.lat, state.lon, entry.lat, entry.lon) : null

      var bunkers = getBunkerCoords(hole)
      var bTexts = ['', '', '']
      for (var i = 0; i < Math.min(bunkers.length, 3); i++) {
        var bd = haversineDistance(state.lat, state.lon, bunkers[i].lat, bunkers[i].lon)
        bTexts[i] = bunkers[i].name + ': ' + bd + 'm'
      }

      return {
        flagText: greenDist !== null ? String(greenDist) : '---',
        greenText: entryDist !== null ? ('v ' + entryDist) : 'v ---',
        bunkerTexts: bTexts
      }
    }

    // Mise à jour du point joueur sur la carte
    function updatePlayerDot() {
      if (!state.gpsActive || state.lat === null || !state.course) {
        playerDot.setProperty(hmUI.prop.MORE, { x: -20, y: -20 })
        return
      }
      var hole = state.course.holes[state.holeIndex]
      if (!hole || !hole.map || !hole.map.bounds) {
        playerDot.setProperty(hmUI.prop.MORE, { x: -20, y: -20 })
        return
      }
      var pos = projectOnMap(state.lat, state.lon, hole)
      if (!pos) { playerDot.setProperty(hmUI.prop.MORE, { x: -20, y: -20 }); return }
      var dotX = Math.max(229, Math.min(440, pos.x - 7))
      var dotY = Math.max(10,  Math.min(440, pos.y - 7))
      playerDot.setProperty(hmUI.prop.MORE, { x: dotX, y: dotY })
    }

    // Positionnement automatique du drapeau sur la carte
    function updateFlagPin() {
      var hole = state.course ? state.course.holes[state.holeIndex] : null
      var green = getGreenCoord(hole)
      if (!hole || !green || !hole.map || !hole.map.bounds) {
        flagPin.setProperty(hmUI.prop.MORE, { x: -30, y: -30 })
        return
      }
      var pos = projectOnMap(green.lat, green.lon, hole)
      if (!pos) { flagPin.setProperty(hmUI.prop.MORE, { x: -30, y: -30 }); return }
      var pinX = Math.max(229, Math.min(430, pos.x - 12))
      var pinY = Math.max(10,  Math.min(440, pos.y - 12))
      flagPin.setProperty(hmUI.prop.MORE, { x: pinX, y: pinY })
    }

    function refreshUI() {
      var hole = state.course ? state.course.holes[state.holeIndex] : null
      var holeNum = hole && hole.num ? hole.num : (state.holeIndex + 1)
      var d = computeDistances()

      txtHolePar.setProperty(hmUI.prop.MORE,   { text: '#' + holeNum + ' Par ' + (hole ? hole.par : '-') })
      txtClub.setProperty(hmUI.prop.MORE,      { text: state.clubs[state.clubIndex] || '-' })
      txtDistFlag.setProperty(hmUI.prop.MORE,  { text: d.flagText })
      txtDistGreen.setProperty(hmUI.prop.MORE, { text: d.greenText })
      txtBunker0.setProperty(hmUI.prop.MORE,   { text: d.bunkerTexts[0] })
      txtBunker1.setProperty(hmUI.prop.MORE,   { text: d.bunkerTexts[1] })
      txtBunker2.setProperty(hmUI.prop.MORE,   { text: d.bunkerTexts[2] })
      txtShotCount.setProperty(hmUI.prop.MORE, { text: currentHoleShots().length + ' coup(s)' })

      if (state.gpsActive) {
        txtGps.setProperty(hmUI.prop.MORE, { text: state.isDynamic ? 'GPS OSM' : 'GPS OK' })
      }

      var hasMapSrc = hole && hole.map && hole.map.src && hole.map.src.length > 0
      mapImg.setProperty(hmUI.prop.MORE, { src: hasMapSrc ? hole.map.src : '' })

      updatePlayerDot()
      updateFlagPin()
    }

    // ── Animation GPS en attente de fix ────────────────────────────────────
    var gpsAnim = ['GPS .  ', 'GPS .. ', 'GPS ...', 'GPS    ']
    var gpsAnimIdx = 0
    this._gpsBlinkTimer = setInterval(function () {
      if (!state.gpsActive) {
        txtGps.setProperty(hmUI.prop.MORE, { text: gpsAnim[gpsAnimIdx % 4] })
        gpsAnimIdx++
      }
    }, 450)

    // ── Changement de Club ──────────────────────────────────────────────────
    this._changeClub = function (delta) {
      state.clubIndex = (state.clubIndex + delta + state.clubs.length) % state.clubs.length
      txtClub.setProperty(hmUI.prop.MORE, { text: state.clubs[state.clubIndex] })
    }
    btnClubL.addEventListener(hmUI.event.CLICK_UP, function () { pageInstance._changeClub(-1) })
    btnClubR.addEventListener(hmUI.event.CLICK_UP, function () { pageInstance._changeClub(1) })

    // ── Boîte de Dialogue Validation Fin de Partie ─────────────────────────
    var confirmOverlay = hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: -500, y: -500, w: 454, h: 454, color: 0xdd000000
    })
    var confirmBox = hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: -500, y: -500, w: 334, h: 210, color: 0x1e293b, radius: 16
    })
    var confirmTxt = hmUI.createWidget(hmUI.widget.TEXT, {
      x: -500, y: -500, w: 314, h: 50, text: 'Terminer la partie ?',
      color: 0xffffff, text_size: 22,
      align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V
    })
    var btnCancelBg = hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: -500, y: -500, w: 130, h: 48, color: 0x475569, radius: 24
    })
    var btnCancelTxt = hmUI.createWidget(hmUI.widget.TEXT, {
      x: -500, y: -500, w: 130, h: 48, text: 'Annuler',
      color: 0xffffff, text_size: 18,
      align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V
    })
    var btnConfirmBg = hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: -500, y: -500, w: 130, h: 48, color: 0xd97706, radius: 24
    })
    var btnConfirmTxt = hmUI.createWidget(hmUI.widget.TEXT, {
      x: -500, y: -500, w: 130, h: 48, text: 'Oui, Fin',
      color: 0xffffff, text_size: 18,
      align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V
    })

    function hideConfirmDialog() {
      confirmOverlay.setProperty(hmUI.prop.MORE, { x: -500, y: -500 })
      confirmBox.setProperty(hmUI.prop.MORE, { x: -500, y: -500 })
      confirmTxt.setProperty(hmUI.prop.MORE, { x: -500, y: -500 })
      btnCancelBg.setProperty(hmUI.prop.MORE, { x: -500, y: -500 })
      btnCancelTxt.setProperty(hmUI.prop.MORE, { x: -500, y: -500 })
      btnConfirmBg.setProperty(hmUI.prop.MORE, { x: -500, y: -500 })
      btnConfirmTxt.setProperty(hmUI.prop.MORE, { x: -500, y: -500 })
    }

    function showFinishConfirmDialog() {
      vibrateShort()
      confirmOverlay.setProperty(hmUI.prop.MORE, { x: 0, y: 0 })
      confirmBox.setProperty(hmUI.prop.MORE, { x: 60, y: 120 })
      confirmTxt.setProperty(hmUI.prop.MORE, { x: 70, y: 140 })
      btnCancelBg.setProperty(hmUI.prop.MORE, { x: 80, y: 240 })
      btnCancelTxt.setProperty(hmUI.prop.MORE, { x: 80, y: 240 })
      btnConfirmBg.setProperty(hmUI.prop.MORE, { x: 244, y: 240 })
      btnConfirmTxt.setProperty(hmUI.prop.MORE, { x: 244, y: 240 })
    }

    btnCancelTxt.addEventListener(hmUI.event.CLICK_UP, hideConfirmDialog)
    btnCancelBg.addEventListener(hmUI.event.CLICK_UP, hideConfirmDialog)
    btnConfirmTxt.addEventListener(hmUI.event.CLICK_UP, function () { finishRound() })
    btnConfirmBg.addEventListener(hmUI.event.CLICK_UP, function () { finishRound() })

    // Masqué par défaut
    hideConfirmDialog()

    // Expose finish confirmation dialog to instance for physical key handling
    this._showFinishConfirmDialog = showFinishConfirmDialog

    // ── Fin de Partie Helper ───────────────────────────────────────────────
    function finishRound() {
      if (!state.course) return
      var round = {
        course: state.course.name,
        date: Date.now(),
        totalPar: state.course.par,
        totalShots: 0,
        holes: []
      }
      for (var h = 0; h < state.course.holes.length; h++) {
        var hShots = []
        for (var s = 0; s < state.shots.length; s++) {
          if (state.shots[s].hole === h) hShots.push(state.shots[s])
        }
        var holePar = state.course.holes[h].par
        round.holes.push({
          hole: h + 1,
          par: holePar,
          shots: hShots.length,
          score: hShots.length - holePar
        })
        round.totalShots += hShots.length
      }

      // Sauvegarde dans l'historique local (golfHistory)
      try {
        var history = []
        var rawHist = hmStorage.getItem('golfHistory')
        if (rawHist) history = JSON.parse(rawHist)
        history.unshift(round)
        hmStorage.setItem('golfHistory', JSON.stringify(history))
      } catch (errHist) {}

      try {
        hmStorage.removeItem('golfState')
      } catch (eState) {}

      sendWatchMessage({
        type: 'ROUND_COMPLETE',
        round: round
      })
      vibrateShort()
      hmApp.goBack()
    }

    // ── Enregistrer Coup (Bouton rouge +) ──────────────────────────────────
    var onRecordClick = function () {
      var shot = {
        hole: state.holeIndex,
        shotNum: currentHoleShots().length + 1,
        club: state.clubs[state.clubIndex] || '-',
        lat: state.gpsActive ? state.lat : null,
        lon: state.gpsActive ? state.lon : null,
        ts: Date.now()
      }
      state.shots.push(shot)
      saveState(state)
      vibrateShort()
      txtShotCount.setProperty(hmUI.prop.MORE, { text: currentHoleShots().length + ' coup(s)' })
    }
    btnRecord.addEventListener(hmUI.event.CLICK_UP, onRecordClick)
    btnRecordBg.addEventListener(hmUI.event.CLICK_UP, onRecordClick)

    // ── Navigation trous ──────────────────────────────────────────────────
    btnHome.addEventListener(hmUI.event.CLICK_UP, function () {
      if (state.holeIndex > 0) {
        state.holeIndex--
        saveState(state)
        vibrateShort()
        refreshUI()
      } else {
        hmApp.goBack()
      }
    })
    btnNext.addEventListener(hmUI.event.CLICK_UP, function () {
      var max = state.course ? state.course.holes.length - 1 : 8
      if (state.holeIndex < max) {
        state.holeIndex++
        saveState(state)
        vibrateShort()
        refreshUI()
      } else {
        showFinishConfirmDialog()
      }
    })

    // ── Transition dynamique OSM & Réception COURSE_DATA ───────────────────
    try {
      if (typeof messaging !== 'undefined' && messaging.peerSocket) {
        this._onMessage = function (evt) {
          try {
            var data = typeof evt.data === 'string' ? JSON.parse(evt.data) : evt.data
            if (data && data.type === 'COURSE_DATA' && data.course && Array.isArray(data.course.holes) && data.course.holes.length > 0) {
              if (self._osmTimeout) {
                clearTimeout(self._osmTimeout)
                self._osmTimeout = null
              }
              state.course = data.course
              state.isDynamic = true
              state.courseIndex = -1
              if (data.bagClubs && data.bagClubs.length > 0) state.clubs = data.bagClubs
              saveState(state)
              refreshUI()
              console.log('[game] Parcours OSM reçu:', data.course.name, data.course.holes.length + ' trous')
            }
          } catch (e) {
            console.log('[game] Erreur traitement COURSE_DATA:', e)
          }
        }
        messaging.peerSocket.addEventListener('message', this._onMessage)
      }
    } catch (e) {}

    // ── Déclencheur one-shot REQUEST_OSM ───────────────────────────────────
    function triggerOsmRequest(lat, lon) {
      if (state.hasRequestedOsm) return
      state.hasRequestedOsm = true

      sendWatchMessage({
        type: 'REQUEST_OSM',
        lat: Number(lat.toFixed(6)),
        lon: Number(lon.toFixed(6))
      })

      // Timeout 10s : repli silencieux sur le parcours statique
      if (self._osmTimeout) clearTimeout(self._osmTimeout)
      self._osmTimeout = setTimeout(function () {
        if (!state.isDynamic) {
          console.log('[game] Timeout OSM (10s), maintien silencieux du parcours statique')
        }
      }, 10000)
    }

    // ── GPS Sensor Lifecycle & Coordinate Delta Filtering ──────────────────
    function handleGpsUpdate(lat, lon) {
      if (!isValidCoordinate(lat, lon)) return

      var isFirstFix = !state.gpsActive
      var shouldUpdate = false

      if (isFirstFix) {
        state.gpsActive = true
        state.lat = lat
        state.lon = lon
        state.lastLat = lat
        state.lastLon = lon
        shouldUpdate = true
        if (self._gpsBlinkTimer) {
          clearInterval(self._gpsBlinkTimer)
          self._gpsBlinkTimer = null
        }
        // One-shot REQUEST_OSM au premier fix
        triggerOsmRequest(lat, lon)
      } else {
        var delta = haversineDistance(state.lastLat, state.lastLon, lat, lon)
        if (delta >= MIN_DELTA_METERS) {
          state.lat = lat
          state.lon = lon
          state.lastLat = lat
          state.lastLon = lon
          shouldUpdate = true
        }
      }

      if (shouldUpdate) {
        refreshUI()
      }
    }

    try {
      if (typeof hmSensor !== 'undefined' && hmSensor.createSensor && hmSensor.id && hmSensor.id.GEOLOCATION) {
        this._geo = hmSensor.createSensor(hmSensor.id.GEOLOCATION)
        this._onGpsChange = function () {
          if (self._geo) {
            handleGpsUpdate(self._geo.latitude, self._geo.longitude)
          }
        }

        this._geo.addEventListener(hmSensor.event.CHANGE, this._onGpsChange)

        // Polling backup (2000ms) pour garantir la réactivité
        this._gpsInterval = setInterval(function () {
          if (self._geo && self._geo.latitude && self._geo.longitude) {
            handleGpsUpdate(self._geo.latitude, self._geo.longitude)
          }
        }, 2000)

        this._geo.start()
      }
    } catch (e) {
      console.log('[game] Erreur initialisation GPS:', e)
    }

    // ── Simulation GPS pour le Simulateur PC (clic sur "GPS") ─────────────
    function setSimulatedGPS() {
      var hole = state.course ? state.course.holes[state.holeIndex] : null
      var green = getGreenCoord(hole)
      if (green) {
        handleGpsUpdate(green.lat - 0.0007, green.lon - 0.0005)
      }
    }
    txtGps.addEventListener(hmUI.event.CLICK_UP, setSimulatedGPS)

    refreshUI()
  },

  onDestroy: function () {
    try {
      if (typeof hmApp !== 'undefined' && hmApp.setScreenKeep) {
        hmApp.setScreenKeep(false)
      }
    } catch (e) {}
    try {
      var displayModule = require('@zos/display')
      if (displayModule && displayModule.resumePageOff) {
        displayModule.resumePageOff()
      }
    } catch (e) {}

    // Teardown complet : arrêt du capteur et libération des timers
    if (this._gpsInterval) {
      clearInterval(this._gpsInterval)
    }
    this._gpsInterval = null
    if (this._gpsBlinkTimer) {
      clearInterval(this._gpsBlinkTimer)
    }
    this._gpsBlinkTimer = null
    if (this._osmTimeout) {
      clearTimeout(this._osmTimeout)
    }
    this._osmTimeout = null
    if (this._geo) {
      if (this._onGpsChange) {
        this._geo.removeEventListener(hmSensor.event.CHANGE, this._onGpsChange)
        this._onGpsChange = null
      }
      this._geo.stop()
      this._geo = null
    }
    if (this._onMessage && typeof messaging !== 'undefined' && messaging.peerSocket) {
      if (messaging.peerSocket.removeEventListener) {
        messaging.peerSocket.removeEventListener('message', this._onMessage)
      }
      this._onMessage = null
    }
    pageInstance = null
  },

  // ── Boutons physiques T-Rex 2 ──────────────────────────────────────────
  onKey: function (keyObj) {
    var key = keyObj.key
    var action = keyObj.action
    console.log('[KEY] key=' + key + ' action=' + action)
    if (action !== 0) return false
    var target = (this && this._changeClub) ? this : pageInstance
    if (target) {
      if (key === 2 && target._changeClub) { target._changeClub(-1); return true }
      if (key === 3 && target._changeClub) { target._changeClub(1);  return true }
      // Bouton SELECT : Demander la fin de la partie avec confirmation
      if (key === 1 || key === 0 || key === 4) {
        if (target && target._showFinishConfirmDialog) {
          target._showFinishConfirmDialog()
          return true
        }
      }
    }
    return false
  }
})
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEFAULT_CLUBS: DEFAULT_CLUBS,
    GAME_COURSES: GAME_COURSES,
    MIN_DELTA_METERS: MIN_DELTA_METERS,
    haversineDistance: haversineDistance,
    calculateBearing: calculateBearing,
    isValidCoordinate: isValidCoordinate,
    getGreenCoord: getGreenCoord,
    getGreenEntryCoord: getGreenEntryCoord,
    getTeeCoord: getTeeCoord,
    getBunkerCoords: getBunkerCoords,
    projectOnMap: projectOnMap
  }
}
