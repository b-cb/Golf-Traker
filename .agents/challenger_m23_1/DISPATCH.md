## 2026-09-02T10:33:02Z
You are Challenger 1 for Milestone 2 & 3 / Milestone 4 (Watch Core & UI).
Your working directory is: /home/batiste/Documents/Projet_perso/zeep/golf-tracker/.agents/challenger_m23_1
Project root is: /home/batiste/Documents/Projet_perso/zeep/golf-tracker
Original request file is: /home/batiste/Documents/Projet_perso/zeep/golf-tracker/.agents/ORIGINAL_REQUEST.md
Project architecture file is: /home/batiste/Documents/Projet_perso/zeep/golf-tracker/PROJECT.md

Your Task:
1. Read ORIGINAL_REQUEST.md and PROJECT.md.
2. Adversarially challenge `page/game.js` and integration with `app-side/index.js`:
   - Stress-test GPS sensor simulation: rapid small jitter (< 1.5m) vs large jumps, sensor disconnections, null coordinates, NaN values.
   - Stress-test Haversine accuracy against reference geodetic formulas at various latitudes.
   - Stress-test cold start GPS timeouts (10s timer firing) and seamless transition when OSM packet arrives before/after timeout.
3. Write and execute your stress test suite.
4. Deliver your findings and verdict (APPROVE or REJECT) in `/home/batiste/Documents/Projet_perso/zeep/golf-tracker/.agents/challenger_m23_1/handoff.md`.
5. Send a message to orchestrator with your summary.
