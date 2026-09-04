# BRIEFING — 2026-09-02T10:14:00Z

## Mission
Analyze Zepp OS native sensor APIs, messaging protocols, UI widget hierarchy (Amazfit T-Rex 2, 454x454 round screen), Haversine formula, fallback state machine, and ES6 runtime constraints to provide a comprehensive architecture report.

## 🔒 My Identity
- Archetype: explorer
- Roles: Zepp OS Architecture & UI/Sensor Specialist
- Working directory: /home/batiste/Documents/Projet_perso/zeep/golf-tracker/.agents/explorer_survey_3
- Original parent: f95834fb-3e90-4f99-b2b8-e1d2b7b8f9ec
- Milestone: Survey & Architecture Analysis (R3, R4, R5)

## 🔒 Key Constraints
- Read-only investigation — do NOT implement in project source code
- ES6 Zepp OS native syntax only (@zos/... imports only in page/, no external NPM packages in page/, no fetch in page/)
- Focus on Amazfit T-Rex 2 target (454x454 round screen)

## Current Parent
- Conversation ID: f95834fb-3e90-4f99-b2b8-e1d2b7b8f9ec
- Updated: not yet

## Investigation State
- **Explored paths**: `app.json`, `package.json`, `app.js`, `page/index.js`, `page/game.js`, `app-side/index.js`, `setting/index.js`, `node_modules/@zeppos/device-types`, `.agents/explorer_survey_1/handoff.md`.
- **Key findings**:
  - Validated Zeus v1.9.1 build toolchain producing `.zab` targets.
  - Formulated exact Geolocation lifecycle, permission (`data:user.hd.location`), and delta filtering ($d \ge 1.5\text{m}$).
  - Designed zero-flicker hmUI widget pool architecture tailored for 454x454 circular AMOLED layout.
  - Specified exact Haversine mathematical algorithm ($R=6371000\text{m}$) and bearing formula.
  - Defined robust 5-state fallback state machine (Static Initial -> GPS Fix -> OSM Request -> Dynamic Switch / Silent Timeout Fallback).
  - Specified watch <-> phone `messaging.peerSocket` handshake (`REQUEST_OSM` $\rightarrow$ `OSM_DATA`).
- **Unexplored areas**: None. Ready to generate handoff report.

## Key Decisions Made
- Confirmed zero-flicker UI requires widget pooling + `widget.setProperty(hmUI.prop.MORE, ...)`.
- Clarified Zepp OS 1.0 vs 2.0+ sensor & messaging compatibility for T-Rex 2.

## Artifact Index
- handoff.md — Comprehensive Survey & Architecture Report (5-Component protocol)
- progress.md — Liveness heartbeat & progress log
