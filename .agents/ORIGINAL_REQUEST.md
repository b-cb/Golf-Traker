# Original User Request

## 2026-09-02T10:09:20Z

Teamwork Project Prompt — Final
Goal: Intégrer l'API Overpass d'OpenStreetMap dans l'application Golf Tracker (Zepp OS / Amazfit T-Rex 2) pour récupérer dynamiquement les éléments de terrain (greens, bunkers, départs) au lancement de l'app. Maintenir les données statiques actuelles (game.js) en fallback, et afficher les distances en temps réel sur la montre via le GPS natif.

Working directory: /home/batiste/Documents/Projet_perso/zeep/golf-tracker
Integrity mode: development

Requirements

R1. Service app-side de récupération OSM
Au lancement de l'application, le code côté téléphone (app-side/) doit interroger l'Overpass API avec une requête ciblant les tags leisure=golf_course, golf=hole, golf=green, golf=bunker, golf=tee dans un rayon de 3000m autour de la coordonnée GPS initiale de la montre. La requête n'est déclenchée qu'une seule fois par session.

R2. Allègement et envoi des données
Les données brutes OSM doivent être simplifiées (polygones convertis en centroïdes lat/lon) avant l'envoi Bluetooth. Le JSON transmis doit être ultra-minimaliste : uniquement des tableaux de coordonnées, sans aucune métadonnée OSM inutile. Objectif : < 2 Ko par message.

R3. Réception, Fallback et Calcul GPS (montre)
Le code page/ doit lire le GPS via @zos/sensor. À la réception du JSON OSM, l'application bascule en mode dynamique. Si la requête OSM échoue (timeout, pas de réseau), le code DOIT conserver et utiliser les données statiques de game.js. Le calcul des distances s'effectue avec la formule de Haversine.

R4. Interface montre (hmUI)
Afficher via hmUI.createWidget la distance au green (grande police, au centre) et les distances aux bunkers/obstacles (police plus petite, en liste). L'UI se met à jour dynamiquement, sans scintillement, à chaque nouveau callback du capteur GPS.

R5. Protocole de communication bidirectionnel
Au démarrage : la montre attend son premier fix GPS, puis envoie ses coordonnées au téléphone via messaging.peerSocket. Le téléphone appelle l'API et répond avec le JSON.

Acceptance Criteria

Communication
- La montre envoie un message { type: 'REQUEST_OSM', lat, lon } au téléphone au démarrage.
- Le téléphone appelle Overpass API et répond avec un JSON < 2 Ko structuré.
- En cas d'échec réseau ou timeout, l'application catch l'erreur et charge game.js silencieusement.

Calcul
- L'implémentation de la fonction Haversine est mathématiquement exacte.
- Les distances sont recalculées uniquement lorsque le callback GPS de @zos/sensor retourne de nouvelles coordonnées.

UI
- La distance au green principal est l'élément visuel le plus proéminent.
- L'UI compile sans erreur et peut être déployée sur la montre physique (Amazfit T-Rex 2) via zeus preview (aucun test sur simulateur local requis).

Code
- Syntaxe ES6 native Zepp OS. Utilisation autorisée des import UNIQUEMENT pour les modules natifs (@zos/...). Aucune librairie NPM externe côté page/.
- Aucun appel réseau (fetch) dans le code page/ — strictement confiné à app-side/.
