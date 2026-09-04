// ─── Page d'accueil — Golf Tracker ───────────────────────────────────────
// Ecran rond 454x454. Zone sûre : cercle de rayon 227, centre (227,227).
// Marges latérales : ~50px sur les côtés à mi-hauteur, ~20px en haut/bas.
// ES5 strict (JerryScript)

var COURSES = [
  {
    name: 'Golf de Luchon', par: 33,
    holes: [
      { par: 4, tee: { lat: 42.791202, lon: 0.601721 }, greenEntry: { lat: 42.788392, lon: 0.601717 }, flag: { lat: 42.788272, lon: 0.601729 } },
      { par: 4, tee: { lat: 42.788068, lon: 0.602869 }, greenEntry: { lat: 42.787802, lon: 0.601444 }, flag: { lat: 42.787785, lon: 0.601307 } },
      { par: 3, tee: { lat: 42.788115, lon: 0.601357 }, greenEntry: { lat: 42.790955, lon: 0.601436 }, flag: { lat: 42.791080, lon: 0.601465 } },
      { par: 4, greenEntry: { lat: 42.7948, lon: 0.6012 }, flag: { lat: 42.7950, lon: 0.6013 } },
      { par: 3, greenEntry: { lat: 42.7940, lon: 0.6008 }, flag: { lat: 42.7941, lon: 0.6009 } },
      { par: 4, greenEntry: { lat: 42.7933, lon: 0.6004 }, flag: { lat: 42.7934, lon: 0.6006 } },
      { par: 4, greenEntry: { lat: 42.7926, lon: 0.6010 }, flag: { lat: 42.7928, lon: 0.6011 } },
      { par: 4, greenEntry: { lat: 42.7920, lon: 0.6018 }, flag: { lat: 42.7921, lon: 0.6020 } },
      { par: 3, greenEntry: { lat: 42.7915, lon: 0.6025 }, flag: { lat: 42.7916, lon: 0.6026 } }
    ]
  },
  {
    name: 'Golf du Totche', par: 27,
    holes: [
      { par: 3, greenEntry: { lat: 44.3438, lon: 2.0025 }, flag: { lat: 44.3440, lon: 2.0027 } },
      { par: 3, greenEntry: { lat: 44.3445, lon: 2.0032 }, flag: { lat: 44.3446, lon: 2.0034 } },
      { par: 3, greenEntry: { lat: 44.3451, lon: 2.0028 }, flag: { lat: 44.3452, lon: 2.0029 } },
      { par: 3, greenEntry: { lat: 44.3456, lon: 2.0022 }, flag: { lat: 44.3457, lon: 2.0023 } },
      { par: 3, greenEntry: { lat: 44.3460, lon: 2.0015 }, flag: { lat: 44.3461, lon: 2.0016 } },
      { par: 3, greenEntry: { lat: 44.3455, lon: 2.0010 }, flag: { lat: 44.3456, lon: 2.0011 } },
      { par: 3, greenEntry: { lat: 44.3448, lon: 2.0008 }, flag: { lat: 44.3449, lon: 2.0009 } },
      { par: 3, greenEntry: { lat: 44.3442, lon: 2.0012 }, flag: { lat: 44.3443, lon: 2.0013 } },
      { par: 3, greenEntry: { lat: 44.3436, lon: 2.0018 }, flag: { lat: 44.3437, lon: 2.0019 } }
    ]
  }
]

var DEFAULT_CLUBS = [
  'Driver', '5-Bois', '5-Fer', '6-Fer', '7-Fer', '8-Fer',
  '9-Fer', '10-Fer', 'Pitch', 'Approche', '52°', 'Sand', 'Putter'
]

if (typeof Page !== 'undefined') {
Page({
  build: function () {
    // ── Chargement état ─────────────────────────────────────────────────
    var clubs = DEFAULT_CLUBS.slice()
    var courses = COURSES.slice()  // peut être enrichi par parcours OSM reçu
    var activeState = null
    try {
      var saved = hmStorage.getItem('golfState')
      if (saved) {
        var s = JSON.parse(saved)
        if (s.bagClubs && s.bagClubs.length > 0) clubs = s.bagClubs
        if (s.inProgress && s.selectedCourse) {
          activeState = s
        }
        // Parcours reçu via OSM (Bluetooth) : l'ajouter si pas déjà présent
        if (s.receivedCourse && s.receivedCourse.name) {
          var found = false
          for (var k = 0; k < courses.length; k++) {
            if (courses[k].name === s.receivedCourse.name) { found = true; break }
          }
          if (!found) courses.unshift(s.receivedCourse)
        }
      }
    } catch (e) {}

    // ── Fond noir ────────────────────────────────────────────────────────
    hmUI.createWidget(hmUI.widget.FILL_RECT, { x: 0, y: 0, w: 454, h: 454, color: 0x071407 })

    // ── Titre centré (zone sûre y=30-80) ─────────────────────────────────
    hmUI.createWidget(hmUI.widget.TEXT, {
      x: 60, y: 30, w: 334, h: 44,
      text: 'GOLF TRACKER',
      color: 0x4ade80, text_size: 24,
      align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V
    })

    // Ligne de séparation sous le titre
    hmUI.createWidget(hmUI.widget.FILL_RECT, { x: 80, y: 78, w: 294, h: 2, color: 0x1a4a1a })

    var cardStartY = 112
    var cardStep   = 74

    // ── Carte Reprendre Partie en cours (si existante) ────────────────────
    if (activeState && activeState.selectedCourse) {
      var rX = 40, rW = 374, rH = 58
      var rBg = hmUI.createWidget(hmUI.widget.FILL_RECT, {
        x: rX, y: cardStartY, w: rW, h: rH, color: 0x1e3a8a, radius: 8
      })
      hmUI.createWidget(hmUI.widget.FILL_RECT, {
        x: rX, y: cardStartY, w: 6, h: rH, color: 0x3b82f6, radius: 3
      })
      var rTxt1 = hmUI.createWidget(hmUI.widget.TEXT, {
        x: rX + 14, y: cardStartY + 6, w: 300, h: 24,
        text: '▶ Reprendre : ' + activeState.selectedCourse.name,
        color: 0xffffff, text_size: 17,
        align_h: hmUI.align.LEFT, align_v: hmUI.align.CENTER_V
      })
      var rHoleNum = (activeState.holeIndex || 0) + 1
      var rShotsCount = (activeState.shots || []).length
      var rTxt2 = hmUI.createWidget(hmUI.widget.TEXT, {
        x: rX + 14, y: cardStartY + 30, w: 300, h: 20,
        text: 'Trou #' + rHoleNum + ' · ' + rShotsCount + ' coup(s) enregistrés',
        color: 0x93c5fd, text_size: 13,
        align_h: hmUI.align.LEFT, align_v: hmUI.align.CENTER_V
      })
      var resumeHandler = function () {
        hmApp.gotoPage({ url: 'page/game', param: '' })
      }
      rBg.addEventListener(hmUI.event.CLICK_UP, resumeHandler)
      rTxt1.addEventListener(hmUI.event.CLICK_UP, resumeHandler)
      rTxt2.addEventListener(hmUI.event.CLICK_UP, resumeHandler)

      cardStartY += 66
    }

    // ── Sous-titre ────────────────────────────────────────────────────────
    hmUI.createWidget(hmUI.widget.TEXT, {
      x: 60, y: cardStartY - 22 > 84 ? (cardStartY - 20) : 84, w: 334, h: 18,
      text: 'Nouveau parcours',
      color: 0x5a8a5a, text_size: 13,
      align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V
    })

    // ── Cartes parcours ───────────────────────────────────────────────────
    function makeCourseCard(course, idx, yOffset) {
      var cardX = 40, cardW = 374, cardH = 62

      // Fond carte (cliquable directement)
      var cardBg = hmUI.createWidget(hmUI.widget.FILL_RECT, {
        x: cardX, y: yOffset, w: cardW, h: cardH,
        color: 0x0d2b0d, radius: 8
      })
      // Barre verte gauche
      hmUI.createWidget(hmUI.widget.FILL_RECT, {
        x: cardX, y: yOffset, w: 5, h: cardH,
        color: 0x4ade80, radius: 3
      })
      // Nom du parcours
      var txt1 = hmUI.createWidget(hmUI.widget.TEXT, {
        x: cardX + 14, y: yOffset + 6, w: 300, h: 26,
        text: course.name,
        color: 0xffffff, text_size: 18,
        align_h: hmUI.align.LEFT, align_v: hmUI.align.CENTER_V
      })
      // Sous-info
      var txt2 = hmUI.createWidget(hmUI.widget.TEXT, {
        x: cardX + 14, y: yOffset + 34, w: 280, h: 20,
        text: course.holes.length + ' trous · Par ' + course.par,
        color: 0x5a8a5a, text_size: 13,
        align_h: hmUI.align.LEFT, align_v: hmUI.align.CENTER_V
      })
      // Flèche droite
      var cardArr = hmUI.createWidget(hmUI.widget.TEXT, {
        x: cardX + cardW - 36, y: yOffset, w: 36, h: cardH,
        text: '>', color: 0x4ade80, text_size: 28,
        align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V
      })

      // Écoute du clic sur tous les éléments de la carte
      var clickHandler = function () {
        try {
          var currentSaved = {}
          try {
            var rawSaved = hmStorage.getItem('golfState')
            if (rawSaved) currentSaved = JSON.parse(rawSaved)
          } catch (errSaved) {}

          hmStorage.setItem('golfState', JSON.stringify({
            courseIndex: idx,
            selectedCourse: course,
            receivedCourse: currentSaved.receivedCourse || (idx === 0 && course.isOsm ? course : null),
            bagClubs: clubs,
            holeIndex: 0,
            shots: []
          }))
        } catch (e) {}
        hmApp.gotoPage({ url: 'page/game', param: '' })
      }

      cardBg.addEventListener(hmUI.event.CLICK_UP, clickHandler)
      txt1.addEventListener(hmUI.event.CLICK_UP, clickHandler)
      txt2.addEventListener(hmUI.event.CLICK_UP, clickHandler)
      cardArr.addEventListener(hmUI.event.CLICK_UP, clickHandler)
    }

    // Afficher les cartes (max 3 pour ne pas déborder)
    var maxCourses = Math.min(courses.length, 3)
    var cardStartY = 112
    var cardStep   = 76
    for (var c = 0; c < maxCourses; c++) {
      makeCourseCard(courses[c], c, cardStartY + c * cardStep)
    }

    // ── Séparateur + sac ──────────────────────────────────────────────────
    var bagY = cardStartY + maxCourses * cardStep + 8

    if (bagY < 360) {
      hmUI.createWidget(hmUI.widget.FILL_RECT, { x: 80, y: bagY, w: 294, h: 1, color: 0x1a3a1a })
      hmUI.createWidget(hmUI.widget.TEXT, {
        x: 60, y: bagY + 6, w: 334, h: 20,
        text: 'Sac : ' + clubs.length + ' clubs',
        color: 0x3a6a3a, text_size: 13,
        align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V
      })

      // Grille clubs — 3 colonnes (plus lisible que 4 sur écran rond)
      var colW = 110, rowH = 24, cols = 3
      var gridX = (454 - cols * colW) / 2   // centrage horizontal = 57
      var gridY = bagY + 30
      for (var i = 0; i < Math.min(clubs.length, 9); i++) {
        hmUI.createWidget(hmUI.widget.TEXT, {
          x: gridX + (i % cols) * colW,
          y: gridY + Math.floor(i / cols) * rowH,
          w: colW, h: rowH,
          text: clubs[i], color: 0x86c086, text_size: 12,
          align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V
        })
      }
    }

    // ── Bouton Historique / Carte des Scores (Zone sûre y=350) ─────────────
    var btnHistBg = hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: 80, y: 350, w: 294, h: 42, color: 0x1e293b, radius: 21
    })
    var btnHistTxt = hmUI.createWidget(hmUI.widget.TEXT, {
      x: 80, y: 350, w: 294, h: 42, text: '📋 Historique des Scores',
      color: 0x93c5fd, text_size: 16,
      align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V
    })

    // ── Modal d'affichage de la Carte des Scores (Masqué au départ) ────────
    var histOverlay = hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: -500, y: -500, w: 454, h: 454, color: 0xee000000
    })
    var histBox = hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: -500, y: -500, w: 384, h: 374, color: 0x0f172a, radius: 20
    })
    var histTitle = hmUI.createWidget(hmUI.widget.TEXT, {
      x: -500, y: -500, w: 364, h: 32, text: 'Cartes de Scores',
      color: 0xfacc15, text_size: 20,
      align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V
    })
    var histBody = hmUI.createWidget(hmUI.widget.TEXT, {
      x: -500, y: -500, w: 354, h: 250, text: 'Aucune partie enregistrée.',
      color: 0xffffff, text_size: 15,
      align_h: hmUI.align.CENTER_H, align_v: hmUI.align.TOP
    })
    var btnCloseHistBg = hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: -500, y: -500, w: 160, h: 40, color: 0x334155, radius: 20
    })
    var btnCloseHistTxt = hmUI.createWidget(hmUI.widget.TEXT, {
      x: -500, y: -500, w: 160, h: 40, text: 'Fermer',
      color: 0xffffff, text_size: 16,
      align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V
    })

    function hideHistModal() {
      histOverlay.setProperty(hmUI.prop.MORE, { x: -500, y: -500 })
      histBox.setProperty(hmUI.prop.MORE, { x: -500, y: -500 })
      histTitle.setProperty(hmUI.prop.MORE, { x: -500, y: -500 })
      histBody.setProperty(hmUI.prop.MORE, { x: -500, y: -500 })
      btnCloseHistBg.setProperty(hmUI.prop.MORE, { x: -500, y: -500 })
      btnCloseHistTxt.setProperty(hmUI.prop.MORE, { x: -500, y: -500 })
    }

    function showHistModal() {
      var txt = ''
      try {
        var rawHist = hmStorage.getItem('golfHistory')
        if (rawHist) {
          var history = JSON.parse(rawHist)
          if (history && history.length > 0) {
            for (var r = 0; r < Math.min(history.length, 3); r++) {
              var rd = history[r]
              var dt = new Date(rd.date)
              var dateStr = (dt.getDate()) + '/' + (dt.getMonth() + 1)
              var diff = rd.totalShots - rd.totalPar
              var scoreStr = diff > 0 ? ('+' + diff) : (diff === 0 ? 'E' : diff)
              txt += rd.course + ' (' + dateStr + ')\n'
              txt += 'Total: ' + rd.totalShots + ' coups (Par ' + rd.totalPar + ' | ' + scoreStr + ')\n'
              txt += '---------------------------------\n'
            }
          }
        }
      } catch (errH) {}

      if (!txt) txt = 'Aucune partie terminée pour le moment.'

      histBody.setProperty(hmUI.prop.MORE, { text: txt })

      histOverlay.setProperty(hmUI.prop.MORE, { x: 0, y: 0 })
      histBox.setProperty(hmUI.prop.MORE, { x: 35, y: 40 })
      histTitle.setProperty(hmUI.prop.MORE, { x: 45, y: 55 })
      histBody.setProperty(hmUI.prop.MORE, { x: 50, y: 95 })
      btnCloseHistBg.setProperty(hmUI.prop.MORE, { x: 147, y: 355 })
      btnCloseHistTxt.setProperty(hmUI.prop.MORE, { x: 147, y: 355 })
    }

    btnHistTxt.addEventListener(hmUI.event.CLICK_UP, showHistModal)
    btnHistBg.addEventListener(hmUI.event.CLICK_UP, showHistModal)
    btnCloseHistTxt.addEventListener(hmUI.event.CLICK_UP, hideHistModal)
    btnCloseHistBg.addEventListener(hmUI.event.CLICK_UP, hideHistModal)

    // Masqué par défaut
    hideHistModal()

    // ── Message bas (zone sûre y=418-440) ────────────────────────────────
    hmUI.createWidget(hmUI.widget.TEXT, {
      x: 80, y: 418, w: 294, h: 22,
      text: 'Configs dans Zepp > Golf Tracker',
      color: 0x2a4a2a, text_size: 11,
      align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V
    })
  }
})
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    COURSES: COURSES,
    DEFAULT_CLUBS: DEFAULT_CLUBS
  }
}