# E2E Test Infra: Golf Tracker OpenStreetMap Overpass Integration

## Test Philosophy
- Opaque-box, requirement-driven. Derived strictly from `ORIGINAL_REQUEST.md`.
- Methodology: Category-Partition + Boundary Value Analysis (BVA) + Pairwise Combinatorial Testing + Real-World Workload Testing.

## Feature Inventory
| # | Feature | Source (requirement) | Tier 1 | Tier 2 | Tier 3 |
|---|---------|---------------------|:------:|:------:|:------:|
| 1 | Overpass QL Query Construction | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 2 | Multi-Endpoint Failover & Session Cache | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 3 | Polygon Centroid Math (Green's Theorem) | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 4 | Payload Size (< 2 KB) & Quantization | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 5 | Watch GPS Sensor Lifecycle & Request Trigger | ORIGINAL_REQUEST §R3, R5 | 5 | 5 | ✓ |
| 6 | Exact Haversine Distance Engine | ORIGINAL_REQUEST §R3, AC | 5 | 5 | ✓ |
| 7 | Dynamic Transition & Silent Static Fallback | ORIGINAL_REQUEST §R3, AC | 5 | 5 | ✓ |
| 8 | Central Prominent Green Distance UI | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ |
| 9 | Bunker Distance List & Flicker-Free Refresh | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ |
| 10 | Bidirectional peerSocket Protocol | ORIGINAL_REQUEST §R5, AC | 5 | 5 | ✓ |

## Test Architecture
- Test runner: Node.js runner executing test suites in `tests/`.
- Directory layout:
  - `tests/tier1_features.test.js`: Feature coverage tests (>=5 per feature).
  - `tests/tier2_boundaries.test.js`: Boundary and edge case tests (>=5 per feature).
  - `tests/tier3_combinations.test.js`: Pairwise cross-feature interactions.
  - `tests/tier4_realworld.test.js`: Realistic multi-hole application scenarios.
  - `tests/run_all.js`: Master test suite runner returning exit code 0 on full pass.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Normal Round on OSM-Mapped Course (Golf de Luchon) | F1, F2, F3, F4, F5, F6, F7, F8, F9, F10 | High |
| 2 | Minimalist Course without Bunker Tags (Golf du Totche) | F1, F2, F3, F4, F5, F6, F7, F8, F10 | Medium |
| 3 | Offline / Out-of-Cellular Range Round (Static Fallback) | F5, F6, F7, F8, F9, F10 | Medium |
| 4 | Network Latency & Mid-Round Dynamic Upgrade | F1, F2, F3, F4, F5, F6, F7, F8, F9, F10 | High |
| 5 | Rapid GPS Movement / Cart Ride Across Multiple Holes | F5, F6, F8, F9 | Medium |

## Coverage Thresholds
- Tier 1: >=5 per feature (50+ tests)
- Tier 2: >=5 per feature (50+ tests)
- Tier 3: >=10 pairwise combination tests
- Tier 4: >=5 realistic application scenario tests
- Total minimum: >= 115 test cases
