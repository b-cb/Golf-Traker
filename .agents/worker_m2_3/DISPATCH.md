## 2026-09-02T10:27:55Z
You are Worker 2 for Milestone 2 & 3 (Watch GPS, Haversine Engine, Fallback, and Watch hmUI Display).
Your working directory is: /home/batiste/Documents/Projet_perso/zeep/golf-tracker/.agents/worker_m2_3
Project root is: /home/batiste/Documents/Projet_perso/zeep/golf-tracker
Original request file is: /home/batiste/Documents/Projet_perso/zeep/golf-tracker/.agents/ORIGINAL_REQUEST.md
Project architecture file is: /home/batiste/Documents/Projet_perso/zeep/golf-tracker/PROJECT.md
Survey 3 architectural report is: /home/batiste/Documents/Projet_perso/zeep/golf-tracker/.agents/explorer_survey_3/handoff.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

File Ownership:
You own exclusively: `/home/batiste/Documents/Projet_perso/zeep/golf-tracker/page/game.js` and `/home/batiste/Documents/Projet_perso/zeep/golf-tracker/page/index.js`.

Your Task:
1. Read ORIGINAL_REQUEST.md, PROJECT.md, and .agents/explorer_survey_3/handoff.md.
2. Implement and refine `page/game.js` (and `page/index.js` if needed) according to requirements R3, R4, R5 and acceptance criteria:
   - Fix line 19 duplicate Hole 3 in `GAME_COURSES` in `page/game.js`.
   - Add bunker definitions to static fallback courses in `GAME_COURSES`.
   - Implement GPS sensor lifecycle: start on `build()`, listen for `hmSensor.event.CHANGE`, coordinate delta filtering ($d \ge 1.5\text{m}$), and stop sensor & clear intervals in `onDestroy()`.
   - Implement one-shot trigger sending `{ type: 'REQUEST_OSM', lat, lon }` to phone over `messaging.peerSocket` on first valid GPS fix.
   - Implement mathematically exact Haversine distance formula ($R = 6,371,000\text{ m}$).
   - Implement dynamic transition & fallback state machine: start with `GAME_COURSES`, listen for `COURSE_DATA`, seamlessly unpack compact OSM course data (`green: [lat, lon]`, `tee: [lat, lon]`, `bunkers: [[lat, lon], ...]`), set `state.course` and refresh UI; silently fallback to static `game.js` on timeout (10s) or error.
   - Implement hmUI layout for 454x454 round screen: prominent central Green distance (64px large font, centered), secondary list display for bunker/hazard distances (e.g. 3-row obstacle list), in-place property updates (`setProperty(hmUI.prop.MORE, ...)`) for 100% flicker-free rendering.
   - Ensure strict Zepp OS constraints: NO fetch in `page/`, NO external npm packages.
3. Test your changes against `node tests/run_all.js` and verify build with `npm run build` (or `zeus build`).
4. Write your handoff report to /home/batiste/Documents/Projet_perso/zeep/golf-tracker/.agents/worker_m2_3/handoff.md.
5. Send a message to orchestrator with summary of changes and verification results.
