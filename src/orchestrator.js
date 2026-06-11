const config = require('./config');
const ui = require('./ui');
const { ingest } = require('./ingestion');
const { extractWithRetry } = require('./extraction/extractor');
const { runGate1 } = require('./gates/gate1');
const { dedupAndCreate } = require('./dedup/dedup');
const { runGate2 } = require('./gates/gate2');

const { assignAgent } = require('./agent/assign');
const { runGate3 } = require('./gates/gate3');
const { executeTask, reviseTask, canHandle } = require('./agent/executor');
const { generateSummary } = require('./agent/summarizer');
const { createPR, mergePR } = require('./github/pr');
const { runGate4, MAX_REWORK_CYCLES } = require('./gates/gate4');
const { newTaskLog, logAppend, logCompressIfNeeded, searchMemory, extractLessons, saveLesson } = require('./agent/memory');
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

  // Nothing new (common on a scheduled tick) — skip the gates entirely.
  if (allTasks.length === 0) {
    ui.note('no new tasks — nothing to review');
    return { packets, allTasks: [], approvedTasks: [], dedupResults: [], confirmedTickets: [], prs: [] };
  }

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

  // ── Steps 4–10: agent → PR → Gate 4, run per ticket IN PARALLEL ──────
  // Each ticket works in its own git worktree, so they don't conflict. Gate 4
  // messages all post at once; approve each in Slack and they merge independently.
  const actionable = confirmedTickets.filter((r) => canHandle(r.issue.summary));
  const chosen = (actionable.length ? actionable : confirmedTickets).slice(0, config.agent.taskLimit);
  ui.step('4', `Agent works ${chosen.length} ticket(s) in parallel  ${ui.dim(`(mode=${config.agent.mode})`)}`);

  async function processTicket(result) {
    const ticket = toTicket(result);
    try {
      const assignment = await assignAgent(ticket);
      ui.agent(`${ticket.key}  assign → ${assignment.assignee}`);
      await runGate3(ticket, assignment);

      // Layer 2 — retrieve lessons from past similar tasks and feed them in.
      const lessons = await searchMemory(`${ticket.title} ${ticket.description}`);
      if (lessons.length) ui.note(`${ticket.key} recalled ${lessons.length} past lesson(s)`);

      await jira.transitionIssue(ticket.key, 'In Progress');
      const work = await executeTask(ticket, assignment, lessons);
      ui.agent(`${ticket.key}  edited ${work.changedFiles.join(', ')}`);

      // Layer 3 — running log of what was tried and the feedback so far.
      const taskLog = newTaskLog(ticket);
      logAppend(taskLog, `Initial change: ${work.diffSummary}`);

      let summary = await generateSummary(ticket, work.changedFiles, work.diffSummary, work.log);
      const pr = await createPR({
        branch: work.branch,
        ticket,
        summary,
        testResults: 'not run (demo)',
        changedFiles: work.changedFiles,
      });
      await jira.transitionIssue(ticket.key, 'In Review');
      ui.agent(`${ticket.key}  PR → ${pr.prUrl}  · In Review`);

      // Gate 4 with a rework loop: approve → merge; request changes → agent
      // revises on the same branch (using the Layer 3 log) and re-posts.
      let cycle = 0;
      for (;;) {
        const decision = await runGate4(ticket, pr, summary, assignment);
        if (decision.action === 'approved') {
          await mergePR(pr.prNumber);
          await jira.transitionIssue(ticket.key, 'Done');
          ui.ok(`${ticket.key} approved → PR merged → Jira Done`);
          // Layer 2 — remember lessons from this task for next time.
          try {
            const learned = await extractLessons(ticket, taskLog);
            for (const l of learned) await saveLesson(ticket.key, ticket.key, l);
            if (learned.length) ui.note(`${ticket.key} saved ${learned.length} lesson(s) to memory`);
          } catch { /* non-fatal */ }
          break;
        }
        cycle += 1;
        if (cycle > MAX_REWORK_CYCLES) {
          ui.note(`${ticket.key} hit ${MAX_REWORK_CYCLES} rework cycles — PR left open`);
          break;
        }
        ui.agent(`${ticket.key}  rework ${cycle}/${MAX_REWORK_CYCLES}: ${decision.feedback}`);
        logAppend(taskLog, `Feedback ${cycle}: ${decision.feedback}`);
        await logCompressIfNeeded(taskLog);
        const rev = await reviseTask(ticket, pr.branch, decision.feedback, taskLog);
        logAppend(taskLog, `Revision ${cycle}: ${rev.diffSummary}`);
        summary = await generateSummary(ticket, rev.changedFiles, rev.diffSummary, taskLog.entries);
      }
      return pr;
    } catch (err) {
      ui.note(`${ticket.key} failed: ${err.message}`);
      return null;
    }
  }

  const prs = (await Promise.all(chosen.map(processTicket))).filter(Boolean);

  return { packets, allTasks, approvedTasks, dedupResults, confirmedTickets, prs };
}

module.exports = { run };
