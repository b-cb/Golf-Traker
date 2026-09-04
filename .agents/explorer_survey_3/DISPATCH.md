## 2026-09-02T10:10:09Z

<USER_REQUEST>
You are Explorer 3 (Zepp OS Architecture & UI/Sensor Specialist).
Your working directory is: /home/batiste/Documents/Projet_perso/zeep/golf-tracker/.agents/explorer_survey_3
Project root is: /home/batiste/Documents/Projet_perso/zeep/golf-tracker
Original request file is: /home/batiste/Documents/Projet_perso/zeep/golf-tracker/.agents/ORIGINAL_REQUEST.md

Task:
1. Read /home/batiste/Documents/Projet_perso/zeep/golf-tracker/.agents/ORIGINAL_REQUEST.md.
2. Analyze requirements R3, R4, R5:
   - Zepp OS native sensor APIs (@zos/sensor - Geolocation / GPS sensor lifecycle, callbacks, checking for coordinate delta).
   - Zepp OS messaging protocol (messaging.peerSocket or @zos/ble / @zos/communication for watch <-> app-side bidirectional messaging: { type: 'REQUEST_OSM', lat, lon } and response).
   - Haversine distance formula implementation (mathematical exactness, radius of Earth in meters, bearing/distance).
   - hmUI widget hierarchy on Amazfit T-Rex 2 (454x454 round screen): prominent central Green distance, smaller list for bunkers/obstacles, flicker-free updates (e.g., updating existing widget properties or efficient redraw).
   - Fallback state machine (game.js fallback on timeout/network error, seamless switch to dynamic OSM when available).
   - Native ES6 Zepp OS constraints (only native @zos/... imports in page/, no external NPM packages, no fetch in page/).
3. Write your comprehensive survey report and handoff.md to /home/batiste/Documents/Projet_perso/zeep/golf-tracker/.agents/explorer_survey_3/handoff.md following standard handoff protocol.
4. Send a message to orchestrator with your findings summary.
</USER_REQUEST>
