# Phase 8 — Orchestrator + `npm run demo`

## Goal
Wire all phases into a single runnable pipeline. One command runs the full
core path (phases 1–6) on synthetic fixtures and prints each step to stdout
so it can be screen-recorded.

## Deliverables
- `src/orchestrator.js`
- `src/demo.js`             (thin wrapper for demo output)
- `package.json` scripts updated

## src/orchestrator.js
```js
const { ingest }         = require('./ingestion');
const { extractWithRetry } = require('./extraction/extractor');
const { runGate1 }       = require('./gates/gate1');
const { dedupAndCreate } = require('./dedup/dedup');
const { runGate2 }       = require('./gates/gate2');
const { assignAgent }    = require('./agent/assign');
const { runGate3 }       = require('./gates/gate3');
const { executeTask }    = require('./agent/executor');
const { generateSummary } = require('./agent/summarizer');
const { createPR }       = require('./github/pr');
const { runGate4 }       = require('./gates/gate4');

async function run() {
  // ── Step 1: Ingest ──────────────────────────────────────────────
  log('step', '1/10  Ingesting data sources...');
  const packets = await ingest();
  log('info', `  → ${packets.length} context packets`);

  // ── Step 2: Extract ─────────────────────────────────────────────
  log('step', '2/10  Extracting tasks with Claude...');
  const allTasks = [];
  for (const packet of packets) {
    const tasks = await extractWithRetry(packet);
    allTasks.push(...tasks);
  }
  log('info', `  → ${allTasks.length} tasks extracted`);

  // ── Gate 1 ──────────────────────────────────────────────────────
  log('gate', '▶  Gate 1: task list review (Slack)');
  const approvedTasks = await runGate1(allTasks);
  log('info', `  → ${approvedTasks.length} tasks approved`);

  // ── Step 3: Dedup + Jira ─────────────────────────────────────────
  log('step', '3/10  Running dedup + creating Jira tickets...');
  const dedupResults = [];
  for (const task of approvedTasks) {
    const result = await dedupAndCreate(task);
    dedupResults.push(result);
    log('info', `  → [${result.status}] ${task.title}`);
  }

  // ── Gate 2 ──────────────────────────────────────────────────────
  log('gate', '▶  Gate 2: ticket review (Slack)');
  const confirmedTickets = await runGate2(dedupResults);
  log('info', `  → ${confirmedTickets.length} tickets confirmed`);

  // ── Steps 4–10: STUBBED ──────────────────────────────────────────
  log('stub', '4–10  Agent assignment, execution, PR, Gates 3/4 — STUBBED');
  log('stub', '      (Architecture visible in src/agent/, src/github/, src/gates/gate3.js, src/gates/gate4.js)');

  return { packets, allTasks, approvedTasks, dedupResults, confirmedTickets };
}

function log(type, msg) {
  const icons = { step: '🔵', gate: '🔑', info: '   ', stub: '⬜', error: '🔴' };
  console.log(`${icons[type] || '  '} ${msg}`);
}

module.exports = { run };
```

## src/demo.js
```js
#!/usr/bin/env node
require('dotenv').config();
const { run } = require('./orchestrator');

console.log('\n┌─────────────────────────────────────────┐');
console.log('│        AI Task Pipeline — Demo          │');
console.log('└─────────────────────────────────────────┘\n');

run()
  .then(result => {
    console.log('\n✅  Core path complete.');
    console.log(`   Packets:   ${result.packets.length}`);
    console.log(`   Tasks:     ${result.allTasks.length} extracted, ${result.approvedTasks.length} approved`);
    console.log(`   Tickets:   ${result.dedupResults.filter(r => r.status !== 'duplicate').length} created`);
  })
  .catch(err => {
    console.error('\n❌  Pipeline error:', err.message);
    process.exit(1);
  });
```

## package.json scripts
```json
{
  "scripts": {
    "demo":  "node src/demo.js",
    "dev":   "nodemon src/demo.js",
    "start": "node src/orchestrator.js"
  }
}
```

## Expected demo output
```
┌─────────────────────────────────────────┐
│        AI Task Pipeline — Demo          │
└─────────────────────────────────────────┘

🔵 1/10  Ingesting data sources...
      → 6 context packets

🔵 2/10  Extracting tasks with Claude...
      → 8 tasks extracted

🔑 ▶  Gate 1: task list review (Slack)
      [Slack message sent — waiting for approval...]
      → 7 tasks approved

🔵 3/10  Running dedup + creating Jira tickets...
      → [created]              Fix session TTL and add keep-alive ping
      → [created]              Clean up staging DB snapshots + set 80% alert
      → [created]              Bump staging DB volume before next release
      → [created]              Merge auth service refactor PR
      → [created]              Implement API rate limiting
      → [created]              Fix error monitoring dashboard config
      → [created_with_warning] Update Figma specs for onboarding v2

🔑 ▶  Gate 2: ticket review (Slack)
      [Slack message sent — waiting for approval...]
      → 7 tickets confirmed

⬜ 4–10  Agent assignment, execution, PR, Gates 3/4 — STUBBED
⬜       (Architecture visible in src/agent/, src/github/, src/gates/)

✅  Core path complete.
   Packets:   6
   Tasks:     8 extracted, 7 approved
   Tickets:   7 created
```

## Acceptance criteria
- [ ] `npm run demo` exits 0 on first run
- [ ] All 6 phases run in sequence with visible output per step
- [ ] Gate 1 and Gate 2 Slack messages are sent (visible in Slack)
- [ ] Created Jira tickets are visible in the project board
- [ ] Stub steps print clearly without crashing
- [ ] No hardcoded secrets anywhere
- [ ] Demo takes < 3 min to run end-to-end (excluding gate wait time)
