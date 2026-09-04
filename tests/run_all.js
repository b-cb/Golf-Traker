/**
 * tests/run_all.js
 * Master Test Suite Runner for Golf Tracker OpenStreetMap Overpass Integration.
 * 
 * Executes all 4 Test Tiers:
 *   - Tier 1: Feature Coverage Tests (F1 to F10)
 *   - Tier 2: Boundary, Extreme Coords & Malformed JSON Tests
 *   - Tier 3: Pairwise Combinatorial & Cross-Feature Interaction Tests
 *   - Tier 4: Real-World Course Workloads & Application Scenarios
 * 
 * Exits with code 0 on full pass, or code 1 on any failure.
 */

const req = typeof require !== 'undefined' ? eval('require') : null;

const tier1Runner = req ? req('./tier1_features.test') : null;
const tier2Runner = req ? req('./tier2_boundaries.test') : null;
const tier3Runner = req ? req('./tier3_combinations.test') : null;
const tier4Runner = req ? req('./tier4_realworld.test') : null;
const tier5Runner = req ? req('./tier5_m1_adversarial.test') : null;
const tier6Runner = req ? req('./tier6_m2_3_core.test') : null;
const challengerM12Runner = req ? req('./challenger_stress_m1_2.test') : null;
const challengerM231Runner = req ? req('./challenger_stress_m23_1.test') : null;
const challengerM232Runner = req ? req('./challenger_stress_m23_2.test') : null;

async function runMasterSuite() {
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║       GOLF TRACKER OPENSTREETMAP OVERPASS INTEGRATION TEST SUITE           ║');
  console.log('║                  Zepp OS / Amazfit T-Rex 2 Verification                    ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');

  const startTime = Date.now();
  const runners = [
    tier1Runner,
    tier2Runner,
    tier3Runner,
    tier4Runner,
    tier5Runner,
    tier6Runner,
    challengerM12Runner,
    challengerM231Runner,
    challengerM232Runner
  ];
  const summaries = [];

  let grandTotal = 0;
  let grandPassed = 0;
  let grandFailed = 0;
  const allFailures = [];

  for (const runner of runners) {
    process.stdout.write(`► Running ${runner.suiteName}... `);
    const tierStart = Date.now();
    const summary = await runner.run();
    const tierDuration = Date.now() - tierStart;
    summaries.push({ ...summary, tierDuration });

    grandTotal += summary.total;
    grandPassed += summary.passed;
    grandFailed += summary.failed;

    if (summary.failed === 0) {
      console.log(`\x1b[32mPASSED\x1b[0m (${summary.passed}/${summary.total} tests, ${tierDuration}ms)`);
    } else {
      console.log(`\x1b[31mFAILED\x1b[0m (${summary.passed}/${summary.total} tests passed, ${summary.failed} failed, ${tierDuration}ms)`);
      summary.results
        .filter(r => r.status === 'FAILED')
        .forEach(r => allFailures.push({ tier: summary.suiteName, ...r }));
    }
  }

  const totalDuration = Date.now() - startTime;

  console.log('\n────────────────────────────────────────────────────────────────────────────');
  console.log('                           TEST EXECUTION SUMMARY                           ');
  console.log('────────────────────────────────────────────────────────────────────────────');
  console.log(`  Tier 1 (Feature Coverage):     ${summaries[0].passed}/${summaries[0].total} passed (${summaries[0].tierDuration}ms)`);
  console.log(`  Tier 2 (Boundary & Edges):     ${summaries[1].passed}/${summaries[1].total} passed (${summaries[1].tierDuration}ms)`);
  console.log(`  Tier 3 (Pairwise Combos):      ${summaries[2].passed}/${summaries[2].total} passed (${summaries[2].tierDuration}ms)`);
  console.log(`  Tier 4 (Real-World Scenarios): ${summaries[3].passed}/${summaries[3].total} passed (${summaries[3].tierDuration}ms)`);
  console.log(`  Tier 5 (Adversarial M1):       ${summaries[4].passed}/${summaries[4].total} passed (${summaries[4].tierDuration}ms)`);
  console.log(`  Tier 6 (Watch M2 & M3 Core):   ${summaries[5].passed}/${summaries[5].total} passed (${summaries[5].tierDuration}ms)`);
  console.log('────────────────────────────────────────────────────────────────────────────');
  console.log(`  Grand Total: ${grandPassed}/${grandTotal} tests passed (${grandFailed} failures) in ${totalDuration}ms`);
  console.log('────────────────────────────────────────────────────────────────────────────');

  // Feature Coverage Matrix
  console.log('\n┌──────────────────────────────────────────────────────────────────────────┐');
  console.log('│ Feature Coverage Matrix (F1 to F10)                                      │');
  console.log('├────┬────────────────────────────────────────────┬──────┬──────┬──────┬──────┤');
  console.log('│ #  │ Feature Name                               │ T1   │ T2   │ T3   │ T4   │');
  console.log('├────┼────────────────────────────────────────────┼──────┼──────┼──────┼──────┤');
  console.log('│ F1 │ Overpass QL Query Construction (R1)        │  5   │  5   │  ✓   │  ✓   │');
  console.log('│ F2 │ Multi-Endpoint Failover & Cache (R1)       │  5   │  5   │  ✓   │  ✓   │');
  console.log('│ F3 │ Polygon Centroid Math / Shoelace (R2)      │  5   │  5   │  ✓   │  ✓   │');
  console.log('│ F4 │ Ultra-Compact Payload Serializer < 2KB (R2)│  5   │  5   │  ✓   │  ✓   │');
  console.log('│ F5 │ Watch GPS Lifecycle & Delta Trigger (R3,R5)│  5   │  5   │  ✓   │  ✓   │');
  console.log('│ F6 │ Exact Haversine Distance Engine (R3)       │  5   │  5   │  ✓   │  ✓   │');
  console.log('│ F7 │ Dynamic Transition & Static Fallback (R3)  │  5   │  5   │  ✓   │  ✓   │');
  console.log('│ F8 │ Central Prominent Green Distance UI (R4)   │  5   │  5   │  ✓   │  ✓   │');
  console.log('│ F9 │ Obstacle & Bunker Distance List UI (R4)    │  5   │  5   │  ✓   │  ✓   │');
  console.log('│ F10│ Bidirectional peerSocket Protocol (R5)    │  5   │  5   │  ✓   │  ✓   │');
  console.log('└────┴────────────────────────────────────────────┴──────┴──────┴──────┴──────┘\n');

  if (grandFailed > 0) {
    console.error('\x1b[31mFAILURES DETECTED:\x1b[0m');
    allFailures.forEach(f => {
      console.error(`\n  [${f.tier}] ${f.name}`);
      console.error(`  Error: ${f.error}`);
    });
    process.exit(1);
  } else {
    console.log('\x1b[32m✔ ALL TEST TIERS PASSED WITH 100% SUCCESS RATE.\x1b[0m\n');
    process.exit(0);
  }
}

if (require.main === module) {
  runMasterSuite().catch(err => {
    console.error('Fatal error running test suite:', err);
    process.exit(1);
  });
}

module.exports = { runMasterSuite };
