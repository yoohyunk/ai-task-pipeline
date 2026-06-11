const config = require('./config');
const { ingest } = require('./ingestion');
const { extractWithRetry } = require('./extraction/extractor');
const { runGate1 } = require('./gates/gate1');
const { dedupAndCreate } = require('./dedup/dedup');
const { runGate2 } = require('./gates/gate2');

const { assignAgent } = require('./agent/assign');
const { runGate3 } = require('./gates/gate3');
const { executeTask, canHandle } = require('./agent/executor');
const { generateSummary } = require('./agent/summarizer');
const { createPR } = require('./github/pr');
const { runGate4 } = require('./gates/gate4');

function log(type, msg) {
  const icons = { step: '🔵', gate: '🔑', info: '   ', stub: '⬜', agent: '🤖', error: '🔴' };
  console.log(`${icons[type] || '  '} ${msg}`);
}

// Build the agent's view of a confirmed ticket (carries original task hints).
function toTicket(result) {
  const t = result._task || {};
  return {
    key: result.issue.key,
    title: result.issue.summary,
    description: result.issue.descriptionText || t.description || '',
    assignee_hint: t.assignee_hint || null,
    priority: t.priority || 'medium',
  };
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
    allTasks.push(...(await extractWithRetry(packet)));
  }
  log('info', `  → ${allTasks.length} tasks extracted`);

  // ── Gate 1 ──────────────────────────────────────────────────────
  log('gate', '▶  Gate 1: task list review');
  const approvedTasks = await runGate1(allTasks);
  log('info', `  → ${approvedTasks.length} tasks approved`);

  // ── Step 3: Dedup + Jira ─────────────────────────────────────────
  log('step', '3/10  Running dedup + creating Jira tickets...');
  const dedupResults = [];
  for (const task of approvedTasks) {
    const result = await dedupAndCreate(task);
    result._task = task; // keep original hints for the agent
    dedupResults.push(result);
    log('info', `  → [${result.status}] ${task.title}`);
  }

  // ── Gate 2 ──────────────────────────────────────────────────────
  log('gate', '▶  Gate 2: ticket review');
  const confirmedTickets = await runGate2(dedupResults);
  log('info', `  → ${confirmedTickets.length} tickets confirmed`);

  // ── Steps 4–10: agent → PR → Gate 4 ──────────────────────────────
  // Process up to AGENT_TASK_LIMIT tickets, preferring ones the agent can act on.
  const actionable = confirmedTickets.filter((r) => canHandle(r.issue.summary));
  const chosen = (actionable.length ? actionable : confirmedTickets).slice(
    0,
    config.agent.taskLimit
  );
  log('step', `4/10  Agent processing ${chosen.length} ticket(s) (mode=${config.agent.mode})...`);

  const prs = [];
  for (const result of chosen) {
    const ticket = toTicket(result);

    // Step 5: assign
    const assignment = await assignAgent(ticket);
    log('agent', `  ${ticket.key}  assign → ${assignment.assignee} (conf ${assignment.confidence})`);

    // Gate 3: assignment review
    await runGate3(ticket, assignment);

    // Step 6: execute
    const work = await executeTask(ticket, assignment);
    log('agent', `  ${ticket.key}  changed: ${work.changedFiles.join(', ')}`);

    // Step 7: summarize
    const summary = await generateSummary(ticket, work.changedFiles, work.diffSummary, work.log);

    // Step 8: PR
    const pr = await createPR({
      branch: work.branch,
      ticket,
      summary,
      testResults: 'not run (demo)',
      changedFiles: work.changedFiles,
    });
    log('agent', `  ${ticket.key}  PR → ${pr.prUrl}`);
    prs.push(pr);

    // Gate 4: assignee review
    const decision = await runGate4(ticket, pr, summary);
    log('agent', `  ${ticket.key}  Gate 4 → ${decision}`);
  }

  return { packets, allTasks, approvedTasks, dedupResults, confirmedTickets, prs };
}

module.exports = { run };
