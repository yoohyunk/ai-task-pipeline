#!/usr/bin/env node
require('dotenv').config();
const { run } = require('./orchestrator');
const store = require('./state/gateStore');
const ui = require('./ui');

ui.banner('AI Task Pipeline');

run()
  .then(async (result) => {
    ui.blank();
    console.log(ui.green(ui.bold('  ✓ Core path complete')));
    ui.blank();
    const created = result.dedupResults.filter((r) => r.status !== 'duplicate').length;
    console.log(`    Packets   ${result.packets.length}`);
    console.log(`    Tasks     ${result.allTasks.length} extracted · ${result.approvedTasks.length} approved`);
    console.log(`    Tickets   ${created} created`);
    console.log(`    PRs       ${result.prs.length} opened`);
    result.prs.forEach((p) => console.log(ui.dim(`              ${p.prUrl}`)));
    ui.blank();
    await store.close();
    try { require('./gates/cli').closeCli(); } catch { /* not in cli mode */ }
  })
  .catch(async (err) => {
    ui.blank();
    console.error(ui.bold('  ✗ Pipeline error:'), err.message);
    await store.close();
    try { require('./gates/cli').closeCli(); } catch { /* not in cli mode */ }
    process.exit(1);
  });
