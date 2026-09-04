## 2026-09-02T10:16:57Z

You are Worker 1 for Milestone 1 (App-side Overpass Service & Data Reducer).
Your working directory is: /home/batiste/Documents/Projet_perso/zeep/golf-tracker/.agents/worker_m1
Project root is: /home/batiste/Documents/Projet_perso/zeep/golf-tracker
Original request file is: /home/batiste/Documents/Projet_perso/zeep/golf-tracker/.agents/ORIGINAL_REQUEST.md
Project architecture file is: /home/batiste/Documents/Projet_perso/zeep/golf-tracker/PROJECT.md
Survey 2 spec report is: /home/batiste/Documents/Projet_perso/zeep/golf-tracker/.agents/explorer_survey_2/handoff.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

File Ownership:
You own exclusively: `/home/batiste/Documents/Projet_perso/zeep/golf-tracker/app-side/index.js` (and companion utilities if needed).

Your Task:
1. Read ORIGINAL_REQUEST.md, PROJECT.md, and .agents/explorer_survey_2/handoff.md.
2. Implement the complete App-Side companion service in `app-side/index.js` satisfying requirements R1, R2, R5:
   - Handle `REQUEST_OSM` messages from `messaging.peerSocket` with `{ type: 'REQUEST_OSM', lat, lon }`.
   - Single-fetch session cache to guarantee the Overpass query is triggered only once per session.
   - Overpass QL query builder querying within 3000m radius:
     `[out:json][timeout:25];(nwr["leisure"="golf_course"](around:3000, ${lat}, ${lon});nwr["golf"~"^(hole|green|bunker|tee)$"](around:3000, ${lat}, ${lon}););out geom;`
   - Multi-endpoint failover POST requests (`https://overpass-api.de/api/interpreter`, `https://lz4.overpass-api.de/api/interpreter`, `https://z.overpass-api.de/api/interpreter`, `https://overpass.kumi.systems/api/interpreter`) with timeout.
   - Polygon centroid calculation using Green's Theorem (Shoelace formula) for closed polygon ways (`golf=green`, `golf=bunker`, `golf=tee`), falling back to coordinate mean on degenerate lines.
   - Hole path & feature extraction: identify tee (vertex 0 or `golf=tee`), green (polygon centroid or end vertex), and nearest bunkers (max 3 per hole).
   - Coordinate quantization to 5 decimal places (~1.1m precision) and complete metadata stripping to ensure payload is ultra-compact (< 2 KB).
   - Structure the response payload strictly according to the Interface Contract:
     `{ type: 'COURSE_DATA', course: { name, par, holes: [{ num, par, green: [lat, lon], tee: [lat, lon], bunkers: [[lat, lon], ...] }] } }`
   - Send response back to watch over `messaging.peerSocket`.
   - Maintain existing `ROUND_COMPLETE` webhook handler and settings handlers.
3. Test your implementation with unit/integration scripts (e.g. running mock node scripts or tests) to verify build validity and JSON payload size < 2048 bytes.
4. Write your handoff report to /home/batiste/Documents/Projet_perso/zeep/golf-tracker/.agents/worker_m1/handoff.md.
5. Send a message to orchestrator with summary of changes and verification results.
