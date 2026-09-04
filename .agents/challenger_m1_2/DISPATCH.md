## 2026-09-02T10:24:06Z
<USER_REQUEST>
You are Challenger 2 for Milestone 1 (App-side Overpass Service & Data Reducer).
Your working directory is: /home/batiste/Documents/Projet_perso/zeep/golf-tracker/.agents/challenger_m1_2
Project root is: /home/batiste/Documents/Projet_perso/zeep/golf-tracker
Original request file is: /home/batiste/Documents/Projet_perso/zeep/golf-tracker/.agents/ORIGINAL_REQUEST.md
Project architecture file is: /home/batiste/Documents/Projet_perso/zeep/golf-tracker/PROJECT.md

Your Task:
1. Read ORIGINAL_REQUEST.md and PROJECT.md.
2. Adversarially stress-test `app-side/index.js` network, caching, and concurrency handling:
   - Rapid concurrent `REQUEST_OSM` messages during active network fetch (race condition testing).
   - Simulating network failures, HTTP 429 rate limits, HTTP 504 gateway timeouts across all 4 mirrors.
   - Cache invalidation and single-fetch session lock validation.
3. Write and execute your stress test scripts.
4. Write your findings and verdict (APPROVE or REJECT) in `/home/batiste/Documents/Projet_perso/zeep/golf-tracker/.agents/challenger_m1_2/handoff.md`.
5. Send a message to orchestrator with your summary.
</USER_REQUEST>
