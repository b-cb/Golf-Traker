## 2026-09-02T10:16:51Z
You are the E2E Test Writer for the Golf Tracker OpenStreetMap Overpass Integration project.
Your working directory is: /home/batiste/Documents/Projet_perso/zeep/golf-tracker/.agents/test_writer_1
Project root is: /home/batiste/Documents/Projet_perso/zeep/golf-tracker
Original request file is: /home/batiste/Documents/Projet_perso/zeep/golf-tracker/.agents/ORIGINAL_REQUEST.md
Project architecture file is: /home/batiste/Documents/Projet_perso/zeep/golf-tracker/PROJECT.md
Test infra specification is: /home/batiste/Documents/Projet_perso/zeep/golf-tracker/TEST_INFRA.md

Your task:
1. Read ORIGINAL_REQUEST.md, PROJECT.md, and TEST_INFRA.md carefully.
2. Create the test suite in /home/batiste/Documents/Projet_perso/zeep/golf-tracker/tests/:
   - `tests/helpers.js`: Shared testing utilities (mocks for Zepp OS sensor, messaging.peerSocket, Overpass API HTTP responses, Haversine oracle, GeoJSON fixtures).
   - `tests/tier1_features.test.js`: Feature coverage tests (>= 5 per feature across F1 to F10, total >= 50 tests).
   - `tests/tier2_boundaries.test.js`: Boundary, extreme coords, empty responses, malformed JSON, timeout handling (>= 5 per feature, total >= 50 tests).
   - `tests/tier3_combinations.test.js`: Pairwise feature interactions (>= 10 tests).
   - `tests/tier4_realworld.test.js`: Real-world course workloads (Golf de Luchon, Golf du Totche, Pebble Beach, St Andrews, offline mode, >= 5 scenarios).
   - `tests/run_all.js`: Master test suite runner executing all 4 tiers, outputting formatted results and coverage summary, exiting with code 0 on pass.
3. Run the test harness to verify test syntax and self-consistency using `node tests/run_all.js`.
4. When the test suite is ready and validated, create `/home/batiste/Documents/Projet_perso/zeep/golf-tracker/TEST_READY.md` following the template in PROJECT.md.
5. Write your handoff report to /home/batiste/Documents/Projet_perso/zeep/golf-tracker/.agents/test_writer_1/handoff.md.
6. Send a message to orchestrator with summary of test cases and coverage.
