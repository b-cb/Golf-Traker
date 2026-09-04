# BRIEFING — 2026-09-02T10:16:00Z

## Mission
Probe, analyze, and document the authoritative specification for OSM Overpass API querying, centroid reduction algorithms, ultra-compact Bluetooth payload formatting (< 2 KB), error resilience, and single-fetch caching for the Golf Tracker Zepp OS companion app.

## 🔒 My Identity
- Archetype: Specification Miner / Explorer Specialist
- Roles: OSM Overpass API & Data Reduction Specialist
- Working directory: /home/batiste/Documents/Projet_perso/zeep/golf-tracker/.agents/explorer_survey_2
- Original parent: f95834fb-3e90-4f99-b2b8-e1d2b7b8f9ec
- Milestone: Survey & Specification Phase (R1 & R2)

## 🔒 Key Constraints
- Sole job is to discover and document features by probing authoritative specification. Read-only (no implementation changes to app code).
- Target payload < 2 KB per Bluetooth peerSocket message.
- Target Overpass query: leisure=golf_course, golf=hole, golf=green, golf=bunker, golf=tee within 3000m radius of watch GPS (around:3000, lat, lon).
- Single-fetch per session caching on companion side.
- Fallback to game.js static course if Overpass query fails or returns empty.

## Current Parent
- Conversation ID: f95834fb-3e90-4f99-b2b8-e1d2b7b8f9ec
- Updated: 2026-09-02T10:16:00Z

## Task Summary
- **What to build**: Specification report on Overpass QL, polygon centroids, data compression/reduction, peerSocket messaging format, error handling.
- **Success criteria**: Comprehensive handoff.md with verified Overpass queries, payload size calculations, centroid algorithms, error flows, and exact JSON schemas.
- **Interface contracts**: ORIGINAL_REQUEST.md R1 & R2.

## Key Decisions Made
- Confirmed single Overpass QL query template with `(around:3000, lat, lon)` and `out geom;`.
- Implemented and benchmarked Shoelace (Green's theorem) centroid calculation (accurate to <0.1m, average 0.738m improvement over arithmetic vertex mean).
- Established 5-decimal coordinate quantization (~1.1m resolution) yielding ~1.20 KB payload for 9-hole course (Luchon) and ~1.61 KB for 18-hole course, safely below the 2048-byte (2 KB) limit.
- Documented 4-endpoint failover mechanism (`overpass-api.de`, `lz4`, `z`, `kumi.systems`) with in-memory session caching.
- Handoff report generated in `.agents/explorer_survey_2/handoff.md`.

## Artifact Index
- /home/batiste/Documents/Projet_perso/zeep/golf-tracker/.agents/explorer_survey_2/DISPATCH.md — Agent dispatch instructions
- /home/batiste/Documents/Projet_perso/zeep/golf-tracker/.agents/explorer_survey_2/progress.md — Agent heartbeat and progress tracking
- /home/batiste/Documents/Projet_perso/zeep/golf-tracker/.agents/explorer_survey_2/handoff.md — Comprehensive survey report and handoff
- /home/batiste/Documents/Projet_perso/zeep/golf-tracker/.agents/explorer_survey_2/overpass_probe.js — Endpoint probe and HTTP test script
- /home/batiste/Documents/Projet_perso/zeep/golf-tracker/.agents/explorer_survey_2/analyze_osm_data.js — OSM geometry and centroid analysis tool
- /home/batiste/Documents/Projet_perso/zeep/golf-tracker/.agents/explorer_survey_2/benchmark_courses.js — Multi-course payload benchmark tool
