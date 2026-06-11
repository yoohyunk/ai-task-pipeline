const config = require('./config');
const ui = require('./ui');
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
const jira = require('./jira/jira');

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
  ui.step('1', 'Ingest data sources');
  const srcLabel =
    config.demo.ingestSource === 'slack'
      ? `LIVE Slack channel ${config.slack.ingestChannel}`
      : 'FIXTURES (synthetic JSON in fixtures/)';
  ui.detail(`ingest source: ${srcLabel}`);
  if (config.demo.ingestSource !== 'slack') {
    ui.note('(set INGEST_SOURCE=slack to read your real Slack channel instead)');
  }
  const packets = await ingest();
  const channels = [...new Set(packets.map((p) => `${p.source}:${p.channel}`))];
  ui.detail(`${packets.length} context packets from → ${channels.join(', ')}`);

  // ── Step 2: Extract ─────────────────────────────────────────────
  ui.step('2', 'Extract action items with Claude');
  const allTasks = [];
  for (const packet of packets) {
    allTasks.push(...(await extractWithRetry(packet)));
  }
  ui.detail(`${allTasks.length} tasks extracted`);
  // Show where each task came from (provenance).
  const byChannel = {};
  for (const t of allTasks) {
    const k = `${t.source}:${t.sourceChannel}`;
    byChannel[k] = (byChannel[k] || 0) + 1;
  }
  for (const [k, n] of Object.entries(byChannel)) ui.note(`${n} from ${k}`);

  // ── Gate 1 ──────────────────────────────────────────────────────
  ui.gate('Gate 1 · review extracted tasks');
  const approvedTasks = await runGate1(allTasks);
  ui.ok(`${approvedTasks.length} tasks approved`);

  // ── Step 3: Dedup + Jira ─────────────────────────────────────────
  ui.step('3', 'Dedup + create Jira tickets');
  const dedupResults = [];
  for (const task of approvedTasks) {
    const result = await dedupAndCreate(task);
    result._task = task; // keep original hints for the agent
    dedupResults.push(result);
    const tag = { created: '✓ created  ', created_with_warning: '⚠ warning  ', duplicate: '⊘ duplicate' }[result.status];
    ui.detail(`${tag}  ${result.issue.key}  ${task.title}`);
  }

  // ── Gate 2 ──────────────────────────────────────────────────────
  ui.gate('Gate 2 · review created tickets');
  const confirmedTickets = await runGate2(dedupResults);
  ui.ok(`${confirmedTickets.length} tickets confirmed`);

  // ── Steps 4–10: agent → PR → Gate 4 ──────────────────────────────
  const actionable = confirmedTickets.filter((r) => canHandle(r.issue.summary));
  const chosen = (actionable.length ? actionable : confirmedTickets).slice(0, config.agent.taskLimit);
  ui.step('4', `Agent works ${chosen.length} ticket(s)  ${ui.dim(`(mode=${config.agent.mode})`)}`);

  const prs = [];
  for (const result of chosen) {
    const ticket = toTicket(result);

    const assignment = await assignAgent(ticket);
    ui.agent(`${ticket.key}  assign → ${assignment.assignee}  ${ui.dim(`(confidence ${assignment.confidence})`)}`);

    await runGate3(ticket, assignment);

    await jira.transitionIssue(ticket.key, 'In Progress');
    const work = await executeTask(ticket, assignment);
    ui.agent(`${ticket.key}  In Progress · edited ${work.changedFiles.join(', ')}`);

    const summary = await generateSummary(ticket, work.changedFiles, work.diffSummary, work.log);

    const pr = await createPR({
      branch: work.branch,
      ticket,
      summary,
      testResults: 'not run (demo)',
      changedFiles: work.changedFiles,
    });
    ui.agent(`${ticket.key}  PR → ${pr.prUrl}`);
    prs.push(pr);

    // PR is up for review → move ticket to In Review.
    await jira.transitionIssue(ticket.key, 'In Review');
    ui.agent(`${ticket.key}  → In Review`);

    ui.gate('Gate 4 · review agent PR');
    const decision = await runGate4(ticket, pr, summary, assignment);

    if (decision === 'approved') {
      await jira.transitionIssue(ticket.key, 'Done');
      ui.ok(`${ticket.key} approved → merged → Jira Done`);
    } else {
      ui.note(`${ticket.key} ${decision}`);
    }
  }

  return { packets, allTasks, approvedTasks, dedupResults, confirmedTickets, prs };
}

module.exports = { run };
