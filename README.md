# Golf Tracker - Zepp OS (Amazfit T-Rex 2)

Application de suivi de golf autonome pour montres connectées Amazfit (Zepp OS 1.0 / API 1.0), développée sous les contraintes strictes d'ES5 (moteur JerryScript).

---

## 🚀 Guide d'Utilisation Rapide

```
  [Téléphone : Paramètres]          [Montre : Accueil]             [Montre : Jeu]
 ┌────────────────────────┐      ┌─────────────────────┐      ┌──────────────────────┐
 │ 🔍 Chercher parcours   │ ───> │ ⛳ Choisir parcours │ ───> │ 🗺️ Voir la carte      │
 │ 🎒 Configurer son sac  │      │ 🎒 Consulter son sac│      │ 📏 Distances GPS     │
 │ 🔗 Configurer Webhook  │      └─────────────────────┘      │ 🏌️ Enregistrer coups │
 └────────────────────────┘                                   └──────────┬───────────┘
             ▲                                                           │
             │                                                           ▼
             └─────────────────── [Envoi Automatique] ───────────────────┘
                                  (Webhook fin de partie)
```

### 1. Préparation (Sur le Téléphone)
1. Ouvrez l'application **Zepp** sur votre téléphone.
2. Allez dans les **Paramètres de l'application Golf Tracker** :
   - **Recherche de parcours (OSM) :** Saisissez le nom du golf (ex: `Luchon`) et cliquez sur *Rechercher sur OSM*. Dès que le parcours est trouvé, cliquez sur *Envoyer sur la montre*.
   - **Sac de clubs :** Activez ou désactivez les clubs présents dans votre sac de golf pour la partie.
   - **Webhook :** Saisissez l'URL de votre serveur personnel ou webhook (ex: `https://mon-site.com/api/golf-score`) pour y archiver vos parties automatiquement.

### 2. Lancer une Partie (Sur la Montre)
1. Démarrez l'application sur votre montre.
2. L'écran d'accueil affiche les parcours disponibles (soit ceux par défaut, soit le parcours synchronisé depuis le téléphone) ainsi que la liste des clubs de votre sac.
3. Appuyez sur la carte du parcours choisi pour démarrer la partie.

### 3. Pendant la Partie
- **Visualisation de la carte :** L'écran de jeu affiche en arrière-plan l'image satellite du trou. Un **point rouge** superposé indique votre position GPS en temps réel sur la carte.
- **Distances :** En haut de l'écran, vous voyez en temps réel la distance restante jusqu'à l'**Entrée du green** (en bleu) et au **Drapeau** (en vert).
- **Changement de Club :** 
  - Touchez les flèches `<` et `>` à l'écran.
  - **OU** utilisez les boutons physiques gauches de la montre (Bouton Haut = club précédent, Bouton Bas = club suivant).
- **Enregistrement des coups :** Appuyez sur **Enregistrer coup** pour mémoriser la position et le club utilisé.
- **Navigation entre les trous :** Utilisez les boutons `< Trou` et `Trou >` en bas de l'écran. La montre émet une courte vibration à chaque changement de trou.

### 4. Fin de Partie
Sur le dernier trou, le bouton de coup se transforme en bouton rouge **"Terminer la partie"**. 
En cliquant dessus :
1. La partie se ferme et vous ramène à l'accueil.
2. Les scores de chaque trou sont compilés et envoyés au téléphone.
3. Le téléphone transmet immédiatement ces données à votre Webhook personnel.

---

## 🛠️ Configuration Technique (Cartographie)

Pour afficher l'image satellite de chaque trou en arrière-plan :
1. Créez des images PNG de dimensions exactes **454x454** pixels.
2. Nommez-les selon le format défini dans le parcours (ex: `luchon_01.png` à `luchon_09.png`).
3. Déposez-les dans le dossier du projet : `assets/454x454-amazfit-t-rex-2/`.
4. Ajustez les coordonnées GPS limites de l'image (`bounds`) dans le tableau `GAME_COURSES` du fichier `page/game.js` pour calibrer le positionnement du point rouge.

---

## 📊 Format du Webhook (JSON)

À la fin de la partie, votre webhook reçoit une requête HTTP **POST** avec le payload JSON suivant :

```json
{
  "course": "Golf de Luchon",
  "date": 1780829000000,
  "totalPar": 33,
  "totalShots": 35,
  "holes": [
    { "hole": 1, "par": 4, "shots": 4, "score": 0 },
    { "hole": 2, "par": 4, "shots": 5, "score": 1 },
    { "hole": 3, "par": 3, "shots": 2, "score": -1 }
  ]
}
```
