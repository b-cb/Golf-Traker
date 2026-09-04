## 2026-09-02T10:24:06Z
You are Challenger 1 for Milestone 1 (App-side Overpass Service & Data Reducer).
Your working directory is: /home/batiste/Documents/Projet_perso/zeep/golf-tracker/.agents/challenger_m1_1
Project root is: /home/batiste/Documents/Projet_perso/zeep/golf-tracker
Original request file is: /home/batiste/Documents/Projet_perso/zeep/golf-tracker/.agents/ORIGINAL_REQUEST.md
Project architecture file is: /home/batiste/Documents/Projet_perso/zeep/golf-tracker/PROJECT.md

Your Task:
1. Read ORIGINAL_REQUEST.md and PROJECT.md.
2. Adversarially stress-test `app-side/index.js`:
   - Test extreme GPS coordinates (Poles, Prime Meridian, Date Line, Equator, invalid lat/lon).
   - Test massive OSM geometries (complex polygons with 50+ vertices, collinear vertices, self-intersecting polygons).
   - Test payload compression stress (36-hole courses, 100+ bunkers) to guarantee payload remains strictly under 2048 bytes.
3. Write and execute your stress test scripts.
4. Write your findings and verdict (APPROVE or REJECT) in `/home/batiste/Documents/Projet_perso/zeep/golf-tracker/.agents/challenger_m1_1/handoff.md`.
5. Send a message to orchestrator with your summary.
