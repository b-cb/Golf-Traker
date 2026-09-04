// ─── setting/index.js ─────────────────────────────────────────────────────
// Composants disponibles en Zepp OS 1.x settings :
//   Section({ key, title, children: [...] })
//   Select({ key, label, options: [{label, value}], value, onChange })
//   Toggle({ key, label, value, onChange })
//   TextInput({ key, label, subLabel, value, placeholder, onChange })

var ALL_CLUBS = [
  'Driver', '5-Bois',
  '5-Fer', '6-Fer', '7-Fer', '8-Fer', '9-Fer', '10-Fer',
  'Pitch', 'Approche', '52°', 'Sand Wedge', 'Putter'
]

// Parcours disponibles pour la recherche OSM
var COURSE_PRESETS = [
  { label: 'Golf de Luchon',        value: 'Golf de Luchon' },
  { label: 'Golf du Totche',        value: 'Totche' },
  { label: 'Golf Toulouse Seilh',   value: 'Toulouse Seilh' },
  { label: 'Golf Bordeaux Lac',     value: 'Bordeaux Lac' },
  { label: 'Golf de Pau',           value: 'Pau' },
  { label: 'Golf Tarbes Laloubère', value: 'Tarbes' }
]

AppSettingsPage({
  build: function (props) {
    var s              = props.settingsStorage
    var bagClubs       = JSON.parse(s.getItem('bagClubs') || 'null') || ALL_CLUBS.slice()
    var selectedCourse = s.getItem('selectedCourse') || COURSE_PRESETS[0].value
    var searchStatus   = s.getItem('searchStatus')   || ''
    var webhookUrl     = s.getItem('webhookUrl')     || ''

    // ── Statut intégré dans le libellé de l'option sélectionnée ──────────
    var courseOptions = COURSE_PRESETS.map(function (p) {
      var suffix = ''
      if (p.value === selectedCourse) {
        if      (searchStatus === 'loading') suffix = ' ⏳'
        else if (searchStatus === 'done')    suffix = ' ✅'
        else if (searchStatus.indexOf('error') === 0) suffix = ' ❌'
      }
      return { label: p.label + suffix, value: p.value }
    })

    // ── Toggles clubs (un par club) ──────────────────────────────────────
    var clubToggles = ALL_CLUBS.map(function (club) {
      return Toggle({
        key:   'toggle-' + club,
        label: club,
        value: bagClubs.indexOf(club) !== -1,
        onChange: function (checked) {
          var current = JSON.parse(s.getItem('bagClubs') || 'null') || ALL_CLUBS.slice()
          var updated
          if (checked) {
            if (current.indexOf(club) === -1) current.push(club)
            updated = ALL_CLUBS.filter(function (c) { return current.indexOf(c) !== -1 })
          } else {
            updated = current.filter(function (c) { return c !== club })
          }
          s.setItem('bagClubs', JSON.stringify(updated))
        }
      })
    })

    // ── Rendu ─────────────────────────────────────────────────────────────
    return [
      Section({
        key: 'section-parcours',
        title: '⛳ Parcours — Choisir déclenche la recherche OSM',
        children: [
          Select({
            key:     'course-select',
            label:   'Parcours',
            options: courseOptions,
            value:   selectedCourse,
            onChange: function (val) {
              if (!val || !val.value) return
              s.setItem('selectedCourse', val.value)
              s.setItem('searchStatus', 'loading')
              // Déclenche la recherche OSM dans app-side → auto-envoi montre
              s.setItem('searchTrigger', val.value + '_' + String(Date.now()))
            }
          })
        ]
      }),
      Section({
        key: 'section-clubs',
        title: '🎒 Clubs dans le sac',
        children: clubToggles
      }),
      Section({
        key: 'section-webhook',
        title: '🔗 Webhook — Archivage des scores',
        children: [
          TextInput({
            key: 'webhook-input',
            label: 'URL Webhook (POST JSON)',
            value: webhookUrl,
            placeholder: 'https://mon-site.com/api/golf-score',
            onChange: function (val) {
              s.setItem('webhookUrl', val || '')
            }
          })
        ]
      })
    ]
  }
})