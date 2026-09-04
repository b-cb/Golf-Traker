// ─── app-side/index.js ────────────────────────────────────────────────────
// Exécuté sur le téléphone (companion service).
// Responsabilités (Milestone 1 / R1, R2, R5) :
//   1. Réception du message REQUEST_OSM émis par la montre lors du premier fix GPS
//   2. Construction de la requête Overpass QL (rayon 3000m autour de lat/lon)
//   3. Requête HTTP POST avec bascule multi-endpoints (failover) et timeout
//   4. Cache de session unique pour garantir 1 seule requête Overpass par session
//   5. Calcul des centroïdes de polygones via le théorème de Green (formule Shoelace)
//   6. Extraction spatiale des trous, greens, départs (tees) et bunkers (max 3/trou)
//   7. Réduction et quantification à 5 décimales pour payload compact < 2 Ko
//   8. Transmission du payload COURSE_DATA à la montre via messaging.peerSocket
//   9. Maintien des gestionnaires webhook de fin de parcours et paramètres

// ─── Endpoints Overpass avec bascule (Failover) ────────────────────────────

var OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
]

// ─── Safe Messaging ───────────────────────────────────────────────────────

function safeSend(payloadObj, onSuccess, onError) {
  try {
    var payloadStr = typeof payloadObj === 'string' ? payloadObj : JSON.stringify(payloadObj)
    if (typeof messaging !== 'undefined' && messaging.peerSocket && messaging.peerSocket.readyState === messaging.peerSocket.OPEN) {
      messaging.peerSocket.send(payloadStr)
      if (onSuccess) onSuccess()
    } else if (typeof messaging !== 'undefined' && messaging.peerSocket) {
      var onOpen = function () {
        try {
          if (messaging.peerSocket && messaging.peerSocket.removeEventListener) {
            messaging.peerSocket.removeEventListener('open', onOpen)
          }
          messaging.peerSocket.send(payloadStr)
          if (onSuccess) onSuccess()
        } catch (err) {
          if (onError) onError(err)
        }
      }
      if (messaging.peerSocket.addEventListener) {
        messaging.peerSocket.addEventListener('open', onOpen)
      }
      if (onError) onError(new Error('Watch not connected. Message queued.'))
    } else {
      if (onError) onError(new Error('Messaging peerSocket unavailable.'))
    }
  } catch (e) {
    if (onError) onError(e)
  }
}

// ─── Formule Haversine Exacte ──────────────────────────────────────────────

function haversineDistance(lat1, lon1, lat2, lon2) {
  var R = 6371000
  var rad = Math.PI / 180
  var dLat = (lat2 - lat1) * rad
  var dLon = (lon2 - lon1) * rad
  var lat1Rad = lat1 * rad
  var lat2Rad = lat2 * rad
  var sinLat = Math.sin(dLat / 2)
  var sinLon = Math.sin(dLon / 2)
  var a = sinLat * sinLat + Math.cos(lat1Rad) * Math.cos(lat2Rad) * sinLon * sinLon
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

// ─── Calcul de Centroïde de Polygone (Théorème de Green / Shoelace) ──────────

function polygonCentroid(coords) {
  if (!coords || coords.length === 0) return null
  if (coords.length === 1) return { lat: coords[0].lat, lon: coords[0].lon }
  if (coords.length === 2) {
    return {
      lat: (coords[0].lat + coords[1].lat) / 2,
      lon: (coords[0].lon + coords[1].lon) / 2
    }
  }

  var pts = coords.slice()
  var n = pts.length
  // Fermer le polygone si le premier et le dernier point diffèrent
  if (pts[0].lat !== pts[n - 1].lat || pts[0].lon !== pts[n - 1].lon) {
    pts.push(pts[0])
  }

  var a = 0
  var cx = 0
  var cy = 0
  var m = pts.length

  for (var i = 0; i < m - 1; i++) {
    var p1 = pts[i]
    var p2 = pts[i + 1]
    var cross = (p1.lon * p2.lat) - (p2.lon * p1.lat)
    a += cross
    cx += (p1.lon + p2.lon) * cross
    cy += (p1.lat + p2.lat) * cross
  }
  a *= 0.5

  // Si l'aire est quasi-nulle (ligne dégénérée / points colinéaires), moyenne arithmétique
  if (Math.abs(a) < 1e-12) {
    var sumLat = 0
    var sumLon = 0
    for (var j = 0; j < coords.length; j++) {
      sumLat += coords[j].lat
      sumLon += coords[j].lon
    }
    return {
      lat: sumLat / coords.length,
      lon: sumLon / coords.length
    }
  }

  var factor = 1 / (6 * a)
  return {
    lat: cy * factor,
    lon: cx * factor
  }
}

function getElementCentroid(el) {
  if (!el) return null
  if (el.type === 'node' && el.lat !== undefined && el.lon !== undefined) {
    return { lat: el.lat, lon: el.lon }
  }
  if (el.geometry && el.geometry.length > 0) {
    return polygonCentroid(el.geometry)
  }
  if (el.lat !== undefined && el.lon !== undefined) {
    return { lat: el.lat, lon: el.lon }
  }
  return null
}

// ─── Quantification des Coordonnées (5 décimales ~1.1m) ─────────────────────

function round5(v) {
  if (v == null || isNaN(v)) return null
  return Number(Number(v).toFixed(5))
}

// ─── Constructeur de Requête Overpass QL (R1) ──────────────────────────────

function buildOverpassQuery(lat, lon, radius) {
  if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) {
    throw new Error('Invalid coordinates for Overpass query')
  }
  var r = (typeof radius === 'number' && !isNaN(radius)) ? Math.round(radius) : 3000
  var latNum = Number(lat)
  var lonNum = Number(lon)
  return '[out:json][timeout:25];(nwr["leisure"="golf_course"](around:' + r + ',' + latNum + ',' + lonNum + ');nwr["golf"~"^(hole|green|bunker|tee)$"](around:' + r + ',' + latNum + ',' + lonNum + '););out geom;'
}

// ─── Extraction & Réduction des Données OSM vers Format Compact (R2) ─────────

function parseOSMToCourseData(osmData, queryLat, queryLon) {
  if (!osmData || !Array.isArray(osmData.elements)) {
    return {
      type: 'COURSE_DATA',
      course: { name: 'Golf Course', par: 0, holes: [] }
    }
  }

  var elements = osmData.elements
  var courseName = null
  var courseParTag = null
  var greens = []
  var tees = []
  var bunkers = []
  var holeElements = []

  for (var i = 0; i < elements.length; i++) {
    var el = elements[i]
    if (!el.tags) continue

    if (el.tags.leisure === 'golf_course') {
      if (el.tags.name && !courseName) courseName = el.tags.name
      if (el.tags.par && !courseParTag) courseParTag = parseInt(el.tags.par, 10)
    }

    var golf = el.tags.golf
    if (!golf) continue

    var centroid = getElementCentroid(el)
    var refStr = el.tags.ref || el.tags.hole
    var refNum = refStr ? parseInt(refStr, 10) : null

    if (golf === 'hole') {
      holeElements.push({ el: el, centroid: centroid, refNum: refNum })
    } else if (golf === 'green' && centroid) {
      greens.push({ centroid: centroid, refNum: refNum, el: el })
    } else if (golf === 'tee' && centroid) {
      tees.push({ centroid: centroid, refNum: refNum, el: el })
    } else if (golf === 'bunker' && centroid) {
      bunkers.push({ centroid: centroid, refNum: refNum, el: el })
    }
  }

  if (!courseName) courseName = 'Golf Course'

  var rawHoles = []

  if (holeElements.length > 0) {
    for (var hIdx = 0; hIdx < holeElements.length; hIdx++) {
      var hObj = holeElements[hIdx]
      var hEl = hObj.el
      var holeNum = (hObj.refNum !== null && !isNaN(hObj.refNum)) ? hObj.refNum : (hIdx + 1)
      var par = parseInt(hEl.tags.par, 10) || 4

      var teePt = null
      var flagPt = null
      var pathGeometry = null

      if (hEl.type === 'way' && hEl.geometry && hEl.geometry.length > 0) {
        pathGeometry = hEl.geometry
        teePt = { lat: hEl.geometry[0].lat, lon: hEl.geometry[0].lon }
        flagPt = { lat: hEl.geometry[hEl.geometry.length - 1].lat, lon: hEl.geometry[hEl.geometry.length - 1].lon }
      } else if (hEl.type === 'node' && hEl.lat !== undefined) {
        flagPt = { lat: hEl.lat, lon: hEl.lon }
        pathGeometry = [flagPt]
      } else if (hObj.centroid) {
        flagPt = hObj.centroid
        pathGeometry = [flagPt]
      }

      // Appariement du Green :
      // 1. Priorité au tag ref/hole correspondant
      var matchedGreen = null
      for (var gIdx = 0; gIdx < greens.length; gIdx++) {
        if (greens[gIdx].refNum === holeNum) {
          matchedGreen = greens[gIdx].centroid
          break
        }
      }
      // 2. Proximité avec le dernier point du tracé du trou (flagPt, < 80m)
      if (!matchedGreen && flagPt) {
        var minGDist = 80
        for (var gIdx2 = 0; gIdx2 < greens.length; gIdx2++) {
          var gDist = haversineDistance(flagPt.lat, flagPt.lon, greens[gIdx2].centroid.lat, greens[gIdx2].centroid.lon)
          if (gDist < minGDist) {
            minGDist = gDist
            matchedGreen = greens[gIdx2].centroid
          }
        }
      }
      var finalGreen = matchedGreen || flagPt || { lat: 0, lon: 0 }

      // Appariement du Départ (Tee) :
      // 1. Priorité au tag ref/hole correspondant
      var matchedTee = null
      for (var tIdx = 0; tIdx < tees.length; tIdx++) {
        if (tees[tIdx].refNum === holeNum) {
          matchedTee = tees[tIdx].centroid
          break
        }
      }
      // 2. Proximité avec le premier point du tracé du trou (teePt, < 80m)
      if (!matchedTee && teePt) {
        var minTDist = 80
        for (var tIdx2 = 0; tIdx2 < tees.length; tIdx2++) {
          var tDist = haversineDistance(teePt.lat, teePt.lon, tees[tIdx2].centroid.lat, tees[tIdx2].centroid.lon)
          if (tDist < minTDist) {
            minTDist = tDist
            matchedTee = tees[tIdx2].centroid
          }
        }
      }
      var finalTee = matchedTee || teePt || null

      // Appariement des Bunkers (à moins de 60m du green ou du tracé du trou)
      var matchedBunkers = []
      for (var bIdx = 0; bIdx < bunkers.length; bIdx++) {
        var bCentroid = bunkers[bIdx].centroid
        var dGreen = haversineDistance(bCentroid.lat, bCentroid.lon, finalGreen.lat, finalGreen.lon)
        var dMin = dGreen
        if (pathGeometry && pathGeometry.length > 0) {
          for (var pIdx = 0; pIdx < pathGeometry.length; pIdx++) {
            var p = pathGeometry[pIdx]
            var dPath = haversineDistance(bCentroid.lat, bCentroid.lon, p.lat, p.lon)
            if (dPath < dMin) dMin = dPath
          }
        }
        if (dMin <= 60) {
          matchedBunkers.push({ centroid: bCentroid, dist: dMin })
        }
      }
      matchedBunkers.sort(function (a, b) { return a.dist - b.dist })

      rawHoles.push({
        num: holeNum,
        par: par,
        green: finalGreen,
        tee: finalTee,
        bunkers: matchedBunkers.map(function (b) { return b.centroid })
      })
    }
  } else if (greens.length > 0) {
    // Si aucun trou n'est tracé en tant que golf=hole mais des greens existent
    greens.sort(function (a, b) { return (a.refNum || 99) - (b.refNum || 99) })
    for (var gIndex = 0; gIndex < greens.length; gIndex++) {
      var gObj = greens[gIndex]
      var hNum = gObj.refNum !== null ? gObj.refNum : (gIndex + 1)
      var matchedT = null
      for (var tI = 0; tI < tees.length; tI++) {
        if (tees[tI].refNum === hNum) {
          matchedT = tees[tI].centroid
          break
        }
      }
      var holeBunkersList = []
      for (var bI = 0; bI < bunkers.length; bI++) {
        var bDist = haversineDistance(bunkers[bI].centroid.lat, bunkers[bI].centroid.lon, gObj.centroid.lat, gObj.centroid.lon)
        if (bDist <= 60) {
          holeBunkersList.push({ centroid: bunkers[bI].centroid, dist: bDist })
        }
      }
      holeBunkersList.sort(function (a, b) { return a.dist - b.dist })
      rawHoles.push({
        num: hNum,
        par: 4,
        green: gObj.centroid,
        tee: matchedT,
        bunkers: holeBunkersList.map(function (b) { return b.centroid })
      })
    }
  }

  // Tri des trous par numéro 1..18
  rawHoles.sort(function (a, b) { return a.num - b.num })

  // Déduplication si même numéro de trou répété
  var uniqueHolesMap = {}
  for (var u = 0; u < rawHoles.length; u++) {
    var cur = rawHoles[u]
    if (!uniqueHolesMap[cur.num]) {
      uniqueHolesMap[cur.num] = cur
    }
  }
  var sortedUniqueHoles = Object.keys(uniqueHolesMap).map(function (k) {
    return uniqueHolesMap[k]
  }).sort(function (a, b) { return a.num - b.num })

  // Limitation à 18 trous max par parcours
  if (sortedUniqueHoles.length > 18) {
    sortedUniqueHoles = sortedUniqueHoles.slice(0, 18)
  }

  // Calcul du par total
  var totalPar = 0
  for (var pI = 0; pI < sortedUniqueHoles.length; pI++) {
    totalPar += sortedUniqueHoles[pI].par
  }
  if (totalPar === 0 && courseParTag) {
    totalPar = courseParTag
  }

  // Fonction de construction et sérialisation compacte
  function buildPayload(holesArray, maxBunkersPerHole) {
    var formattedHoles = holesArray.map(function (h) {
      var bunkersArr = (h.bunkers || []).slice(0, maxBunkersPerHole).map(function (b) {
        return [round5(b.lat), round5(b.lon)]
      })
      return {
        num: h.num,
        par: h.par,
        green: [round5(h.green.lat), round5(h.green.lon)],
        tee: h.tee ? [round5(h.tee.lat), round5(h.tee.lon)] : null,
        bunkers: bunkersArr
      }
    })

    return {
      type: 'COURSE_DATA',
      course: {
        name: courseName,
        par: totalPar,
        holes: formattedHoles
      }
    }
  }

  // Réduction adaptative garantissant une taille < 2048 octets
  var maxB = 3
  var payload = buildPayload(sortedUniqueHoles, maxB)
  var jsonStr = JSON.stringify(payload)

  while (jsonStr.length > 2000 && maxB > 0) {
    maxB--
    payload = buildPayload(sortedUniqueHoles, maxB)
    jsonStr = JSON.stringify(payload)
  }

  return payload
}

// ─── Fetch HTTP Multi-Endpoints avec Timeout (R1) ──────────────────────────

function fetchWithTimeout(url, options, timeoutMs) {
  var timeout = timeoutMs || 10000
  var timeoutPromise = new Promise(function (_, reject) {
    setTimeout(function () {
      reject(new Error('Fetch timeout after ' + timeout + 'ms'))
    }, timeout)
  })
  return Promise.race([fetch(url, options), timeoutPromise])
}

function fetchOverpassWithFailover(ql, callback) {
  var postBody = 'data=' + encodeURIComponent(ql)
  var options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
    },
    body: postBody
  }

  var endpointIndex = 0

  function tryEndpoint() {
    if (endpointIndex >= OVERPASS_ENDPOINTS.length) {
      var err = new Error('All Overpass endpoints failed')
      console.log('[app-side]', err.message)
      if (callback) {
        callback(err, null)
        return Promise.resolve(null)
      }
      return Promise.reject(err)
    }

    var endpoint = OVERPASS_ENDPOINTS[endpointIndex]
    endpointIndex++
    console.log('[app-side] Querying Overpass endpoint (' + endpointIndex + '/' + OVERPASS_ENDPOINTS.length + '):', endpoint)

    return fetchWithTimeout(endpoint, options, 10000)
      .then(function (res) {
        if (!res || !res.ok) {
          throw new Error('HTTP ' + (res ? res.status : 'unknown') + ' from ' + endpoint)
        }
        return res.json()
      })
      .then(function (data) {
        if (!data || !Array.isArray(data.elements)) {
          throw new Error('Malformed Overpass response from ' + endpoint)
        }
        console.log('[app-side] Overpass success from ' + endpoint + ', elements: ' + data.elements.length)
        if (callback) callback(null, data)
        return data
      })
      .catch(function (err) {
        console.log('[app-side] Endpoint failure (' + endpoint + '):', err.message)
        return tryEndpoint()
      })
  }

  var p = tryEndpoint()
  if (callback) {
    p.catch(function () {})
  }
  return p
}

// ─── Gestionnaire de Requête OSM & Cache de Session (R1, R5) ────────────────

var sessionCache = null
var isFetching = false
var pendingFetchCallbacks = []

function resetSessionCache() {
  sessionCache = null
  isFetching = false
  pendingFetchCallbacks = []
}

function handleOsmRequest(lat, lon, callback) {
  if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon) || (lat === 0 && lon === 0)) {
    var errCoords = new Error('Invalid GPS coordinates')
    console.log('[app-side]', errCoords.message, lat, lon)
    if (callback) callback(errCoords, null)
    return
  }

  // Cache de session : 1 seule requête Overpass par session
  if (sessionCache) {
    console.log('[app-side] Serving course from session cache:', sessionCache.course.name)
    safeSend(sessionCache, function () {
      console.log('[app-side] Cached COURSE_DATA sent to watch')
    })
    if (callback) callback(null, sessionCache)
    return
  }

  if (isFetching) {
    console.log('[app-side] Overpass fetch already in progress, queuing callback')
    if (callback) pendingFetchCallbacks.push(callback)
    return
  }

  isFetching = true
  if (callback) pendingFetchCallbacks.push(callback)

  var ql = buildOverpassQuery(lat, lon, 3000)
  fetchOverpassWithFailover(ql, function (err, osmData) {
    isFetching = false
    var callbacks = pendingFetchCallbacks.slice()
    pendingFetchCallbacks = []

    if (err || !osmData) {
      console.log('[app-side] Overpass fetch failed:', err ? err.message : 'no data')
      for (var i = 0; i < callbacks.length; i++) {
        try { callbacks[i](err || new Error('Overpass failed'), null) } catch (e) {}
      }
      return
    }

    var coursePayload = parseOSMToCourseData(osmData, lat, lon)
    if (!coursePayload || !coursePayload.course || coursePayload.course.holes.length === 0) {
      var noHolesErr = new Error('No golf holes extracted from OSM data')
      console.log('[app-side]', noHolesErr.message)
      for (var j = 0; j < callbacks.length; j++) {
        try { callbacks[j](noHolesErr, null) } catch (e) {}
      }
      return
    }

    sessionCache = coursePayload
    try {
      if (typeof settingsStorage !== 'undefined') {
        settingsStorage.setItem('lastFoundCourse', JSON.stringify(coursePayload.course))
      }
    } catch (e) {}

    console.log('[app-side] Sending COURSE_DATA to watch:', coursePayload.course.name, coursePayload.course.holes.length + ' holes')
    safeSend(coursePayload, function () {
      console.log('[app-side] COURSE_DATA successfully transmitted to watch')
    }, function (sendErr) {
      console.log('[app-side] Error sending COURSE_DATA:', sendErr.message)
    })

    for (var k = 0; k < callbacks.length; k++) {
      try { callbacks[k](null, coursePayload) } catch (e) {}
    }
  }).catch(function () {})
}

// ─── Envoi Webhook Fin de Partie ───────────────────────────────────────────

function postRoundToWebhook(webhookUrl, round) {
  if (!webhookUrl) {
    console.log('[app-side] No webhook configured')
    return
  }
  console.log('[app-side] Posting round to webhook:', webhookUrl)
  fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(round)
  })
    .then(function (res) {
      console.log('[app-side] Webhook response:', res.status)
    })
    .catch(function (err) {
      console.log('[app-side] Webhook error:', err)
    })
}

// ─── Recherche Overpass par Nom (depuis paramètres de l'application) ────────

function searchCourseOnOSM(rawName, callback) {
  var name = rawName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  var query = '[out:json][timeout:30];' +
    'area["leisure"="golf_course"]["name"~"' + name + '",i]->.c;' +
    '(way["golf"="hole"](area.c);node["golf"="hole"](area.c);' +
    'way["golf"="green"](area.c);node["golf"="green"](area.c);' +
    'way["golf"="bunker"](area.c);node["golf"="bunker"](area.c);' +
    'way["golf"="tee"](area.c);node["golf"="tee"](area.c););' +
    'out geom;'

  fetchOverpassWithFailover(query, function (err, data) {
    if (err) {
      callback(err, null)
      return
    }
    if (!data.elements || data.elements.length === 0) {
      callback(new Error('No elements found for "' + rawName + '"'), null)
      return
    }
    var coursePayload = parseOSMToCourseData(data)
    if (!coursePayload || !coursePayload.course || coursePayload.course.holes.length === 0) {
      callback(new Error('No valid holes extracted for "' + rawName + '"'), null)
    } else {
      callback(null, coursePayload.course)
    }
  })
}

// ─── Service Zepp OS Companion ─────────────────────────────────────────────

if (typeof AppSideService !== 'undefined') {
  AppSideService({
    onInit: function () {
      if (typeof settingsStorage !== 'undefined') {
        settingsStorage.addListener('change', function (evt) {
          var key = evt.key
          var val = evt.newValue

          if (key === 'searchTrigger' && val) {
            var courseQueryName = val.split('_')[0] || val
            console.log('[app-side] Settings search OSM:', courseQueryName)
            settingsStorage.setItem('searchStatus', 'loading')
            settingsStorage.setItem('searchResults', '')

            searchCourseOnOSM(courseQueryName, function (err, course) {
              if (err) {
                settingsStorage.setItem('searchStatus', 'error:' + err.message)
                console.log('[app-side] OSM search error:', err.message)
              } else {
                settingsStorage.setItem('searchResults', JSON.stringify([course]))
                settingsStorage.setItem('lastFoundCourse', JSON.stringify(course))
                console.log('[app-side] Course found:', course.name, '- holes:', course.holes.length)

                var bagClubs = JSON.parse(settingsStorage.getItem('bagClubs') || '[]')
                safeSend({
                  type: 'COURSE_DATA',
                  course: course,
                  bagClubs: bagClubs.length > 0 ? bagClubs : []
                }, function () {
                  settingsStorage.setItem('searchStatus', 'done')
                  console.log('[app-side] Course sent to watch from settings search')
                }, function (sendErr) {
                  settingsStorage.setItem('searchStatus', 'error:' + (sendErr.message || 'Watch not connected'))
                  console.log('[app-side] Messaging error on settings send:', sendErr)
                })
              }
            })
          }

          if (key === 'sendTrigger' && val) {
            var raw = settingsStorage.getItem('lastFoundCourse')
            if (!raw) {
              console.log('[app-side] No course to send')
              return
            }
            var bagClubs = JSON.parse(settingsStorage.getItem('bagClubs') || '[]')
            safeSend({
              type: 'COURSE_DATA',
              course: JSON.parse(raw),
              bagClubs: bagClubs
            }, function () {
              console.log('[app-side] Course data sent to watch from settings trigger')
            })
          }
        })
      }

      try {
        if (typeof messaging !== 'undefined' && messaging.peerSocket) {
          messaging.peerSocket.addEventListener('message', function (evt) {
            try {
              var data = typeof evt.data === 'string' ? JSON.parse(evt.data) : evt.data
              if (!data) return

              if (data.type === 'REQUEST_OSM') {
                console.log('[app-side] Received REQUEST_OSM from watch:', data.lat, data.lon)
                handleOsmRequest(data.lat, data.lon)
              } else if (data.type === 'ROUND_COMPLETE') {
                console.log('[app-side] Received ROUND_COMPLETE from watch:', data.round ? data.round.course : '')
                var webhookUrl = (typeof settingsStorage !== 'undefined') ? (settingsStorage.getItem('webhookUrl') || '') : ''
                postRoundToWebhook(webhookUrl, data.round)
              }
            } catch (e) {
              console.log('[app-side] Message parsing error:', e)
            }
          })
        }
      } catch (e) {
        console.log('[app-side] Messaging init error:', e)
      }
    },

    onRun: function () {
      if (typeof settingsStorage !== 'undefined') {
        var raw = settingsStorage.getItem('lastFoundCourse')
        if (!raw) return
        var bagClubs = JSON.parse(settingsStorage.getItem('bagClubs') || '[]')
        safeSend({
          type: 'COURSE_DATA',
          course: JSON.parse(raw),
          bagClubs: bagClubs
        }, function () {
          console.log('[app-side] Resent course on reconnect')
        })
      }
    },

    onDestroy: function () {
      resetSessionCache()
    }
  })
}

// ─── Exports CommonJS pour Tests Node.js ────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    OVERPASS_ENDPOINTS: OVERPASS_ENDPOINTS,
    safeSend: safeSend,
    haversineDistance: haversineDistance,
    polygonCentroid: polygonCentroid,
    getElementCentroid: getElementCentroid,
    round5: round5,
    buildOverpassQuery: buildOverpassQuery,
    parseOSMToCourseData: parseOSMToCourseData,
    fetchWithTimeout: fetchWithTimeout,
    fetchOverpassWithFailover: fetchOverpassWithFailover,
    handleOsmRequest: handleOsmRequest,
    resetSessionCache: resetSessionCache,
    postRoundToWebhook: postRoundToWebhook,
    searchCourseOnOSM: searchCourseOnOSM
  }
}
