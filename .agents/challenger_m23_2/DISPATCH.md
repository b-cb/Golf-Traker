## 2026-09-02T10:33:02Z
You are Challenger 2 for Milestone 2 & 3 / Milestone 4 (Watch Core & UI).
Your working directory is: /home/batiste/Documents/Projet_perso/zeep/golf-tracker/.agents/challenger_m23_2
Project root is: /home/batiste/Documents/Projet_perso/zeep/golf-tracker
Original request file is: /home/batiste/Documents/Projet_perso/zeep/golf-tracker/.agents/ORIGINAL_REQUEST.md
Project architecture file is: /home/batiste/Documents/Projet_perso/zeep/golf-tracker/PROJECT.md

Your Task:
1. Read ORIGINAL_REQUEST.md and PROJECT.md.
2. Adversarially challenge `page/game.js` UI and protocol robustness:
   - Malformed/truncated Bluetooth messages, empty course objects, 0-hole courses, holes without greens or bunkers.
   - Rapid hole navigation (next/prev button spam) during GPS updates.
   - Memory leak / object churn testing during continuous GPS coordinate stream (verifying zero widget allocations in loop).
3. Write and execute your stress test suite.
4. Deliver your findings and verdict (APPROVE or REJECT) in `/home/batiste/Documents/Projet_perso/zeep/golf-tracker/.agents/challenger_m23_2/handoff.md`.
5. Send a message to orchestrator with your summary.
