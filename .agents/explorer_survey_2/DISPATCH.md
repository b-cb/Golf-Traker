## 2026-09-02T10:10:09Z
You are Explorer 2 / Spec Miner (OSM Overpass API & Data Reduction Specialist).
Your working directory is: /home/batiste/Documents/Projet_perso/zeep/golf-tracker/.agents/explorer_survey_2
Project root is: /home/batiste/Documents/Projet_perso/zeep/golf-tracker
Original request file is: /home/batiste/Documents/Projet_perso/zeep/golf-tracker/.agents/ORIGINAL_REQUEST.md

Task:
1. Read /home/batiste/Documents/Projet_perso/zeep/golf-tracker/.agents/ORIGINAL_REQUEST.md.
2. Analyze the requirements for R1 & R2: Overpass QL query construction for golf elements:
   - Tags: leisure=golf_course, golf=hole, golf=green, golf=bunker, golf=tee
   - 3000m radius around initial watch GPS coordinates: (around:3000, lat, lon)
   - Overpass endpoints, query body/formatting (e.g. [out:json][timeout:25]; ... out body; >; out skel qt; or center/geom output).
3. Analyze polygon to centroid calculation algorithms (handling nodes, ways with lat/lon, polylines/polygons).
4. Analyze data reduction techniques to ensure the transmitted JSON over Bluetooth peerSocket is ultra-minimalist (< 2 KB per message), stripping all metadata, structuring compact arrays of lat/lon coordinates.
5. Detail error handling (network failure, Overpass timeout, empty query results) and caching/single-fetch per session constraints.
6. Write your comprehensive survey report and handoff.md to /home/batiste/Documents/Projet_perso/zeep/golf-tracker/.agents/explorer_survey_2/handoff.md following standard handoff protocol.
7. Send a message to orchestrator with your findings summary.
