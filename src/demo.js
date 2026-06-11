#!/usr/bin/env node
require('dotenv').config();
const { run } = require('./orchestrator');
const store = require('./state/gateStore');

console.log('\n┌─────────────────────────────────────────┐');
console.log('│        AI Task Pipeline — Demo          │');
console.log('└─────────────────────────────────────────┘\n');

run()
  .then(async (result) => {
    console.log('\n✅  Core path complete.');
    console.log(`   Packets:   ${result.packets.length}`);
    console.log(
      `   Tasks:     ${result.allTasks.length} extracted, ${result.approvedTasks.length} approved`
    );
    console.log(
      `   Tickets:   ${result.dedupResults.filter((r) => r.status !== 'duplicate').length} created`
    );
    await store.close();
  })
  .catch(async (err) => {
    console.error('\n❌  Pipeline error:', err.message);
    await store.close();
    process.exit(1);
  });
