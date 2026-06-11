const { ingest } = require('./ingestion');
const { extractWithRetry } = require('./extraction/extractor');
const { runGate1 } = require('./gates/gate1');
const { dedupAndCreate } = require('./dedup/dedup');
const { runGate2 } = require('./gates/gate2');

// Downstream stubs — imported so the architecture is wired, not run for the demo.
const { assignAgent } = require('./agent/assign'); // eslint-disable-line no-unused-vars
const { runGate3 } = require('./gates/gate3'); // eslint-disable-line no-unused-vars
const { executeTask } = require('./agent/executor'); // eslint-disable-line no-unused-vars
const { generateSummary } = require('./agent/summarizer'); // eslint-disable-line no-unused-vars
const { createPR } = require('./github/pr'); // eslint-disable-line no-unused-vars
const { runGate4 } = require('./gates/gate4'); // eslint-disable-line no-unused-vars

function log(type, msg) {
  const icons = { step: '🔵', gate: '🔑', info: '   ', stub: '⬜', error: '🔴' };
  console.log(`${icons[type] || '  '} ${msg}`);
}

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

module.exports = { run };
