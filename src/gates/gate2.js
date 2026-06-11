/**
 * Gate 2 — ticket review.
 *
 * After Jira tickets are created, send them to Slack for confirmation.
 * Duplicates are info-only (no approval). created_with_warning tickets offer
 * a side-by-side comparison with keep-separate / merge / delete. Blocks until
 * approved; 4h timeout (or demo auto-approve) resolves it.
 */
const { randomUUID } = require('crypto');
const config = require('../config');
const store = require('../state/gateStore');
const notifier = require('../slack/notifier');
const jira = require('../jira/jira');

const FOUR_HOURS = 4 * 60 * 60 * 1000;
const key = (gateId) => `gate2:${gateId}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function checkTimeout(gateId) {
  const state = await store.get(key(gateId));
  if (!state || state.status !== 'pending') return;
  const now = Date.now();

  if (config.demo.gateAutoApprove && now >= new Date(state.autoApproveAt).getTime()) {
    await store.update(key(gateId), { status: 'approved', approvedBy: 'auto-approve' });
    await notifier.sendTimeoutNotice(state.channelId, gateId, 'auto-approve');
    return;
  }
  if (now > new Date(state.timeoutAt).getTime()) {
    await store.update(key(gateId), { status: 'approved', approvedBy: 'timeout' });
    await notifier.sendTimeoutNotice(state.channelId, gateId, 'timeout');
  }
}

// Tickets that remain after the gate: exclude skipped duplicates and any
// ticket the operator merged or deleted.
function confirmedFrom(state) {
  return state.tickets.filter((t) => t.status !== 'duplicate' && !t._removed);
}

/**
 * Apply a "Merge → existing" action: delete the new ticket and comment on the
 * existing one. Exported so it can be invoked by the Slack handler or directly.
 */
async function applyMerge(gateId, idx) {
  const state = await store.get(key(gateId));
  if (!state) return null;
  const t = state.tickets[idx];
  if (!t || !t.similarTo) return state;

  await jira.deleteIssue(t.issue.key);
  await jira.addComment(
    t.similarTo.key,
    `[AI pipeline] Similar task merged into this ticket:\n` +
      `Original: "${t.issue.summary}" (similarity: ${Math.round(t.similarTo.score * 100)}%)\n` +
      `Source: AI task pipeline`
  );

  t._removed = true;
  t._mergedInto = t.similarTo.key;
  await store.set(key(gateId), state);
  return state;
}

async function waitForGate(gateId, pollIntervalMs) {
  for (;;) {
    await checkTimeout(gateId);
    const state = await store.get(key(gateId));
    if (!state) throw new Error(`Gate ${gateId} state missing`);
    if (state.status === 'approved') return state;
    if (state.status === 'rejected') throw new Error(`Gate ${gateId} rejected`);
    await sleep(pollIntervalMs);
  }
}

/**
 * Run Gate 2 for a batch of dedup results.
 * @param {object[]} results - array from dedupAndCreate()
 * @returns {Promise<object[]>} confirmed results (merges/deletes applied)
 */
async function runGate2(results) {
  const gateId = randomUUID();
  const now = Date.now();

  const sent = await notifier.sendGate2({
    gateId,
    tickets: results,
    channelId: config.slack.approvalChannel,
  });

  const state = {
    gateId,
    type: 'gate2',
    status: 'pending',
    tickets: results,
    createdAt: new Date(now).toISOString(),
    timeoutAt: new Date(now + FOUR_HOURS).toISOString(),
    autoApproveAt: new Date(now + config.demo.gateAutoApproveMs).toISOString(),
    approvedBy: null,
    messageTs: sent.ts,
    channelId: sent.channel,
  };
  await store.set(key(gateId), state);

  const pollMs = config.demo.gateAutoApprove ? 1000 : 5000;
  const finalState = await waitForGate(gateId, pollMs);
  return confirmedFrom(finalState);
}

module.exports = { runGate2, applyMerge, checkTimeout, confirmedFrom };

// `node src/gates/gate2.js` — exercise all three render branches + merge.
if (require.main === module) {
  (async () => {
    const results = [
      { status: 'created', issue: { id: '1', key: 'TASK-1', summary: 'Fix session TTL and add keep-alive ping' }, issueUrl: 'https://mock/browse/TASK-1', similarTo: null },
      { status: 'created_with_warning', issue: { id: '2', key: 'TASK-2', summary: 'Session timeout on mobile' }, issueUrl: 'https://mock/browse/TASK-2', similarTo: { key: 'TASK-1', score: 0.87 } },
      { status: 'duplicate', issue: { id: '1', key: 'TASK-1', summary: 'Fix session TTL and add keep-alive ping' }, score: 0.93 },
    ];
    console.log(`Running Gate 2 with ${results.length} results (auto-approve=${config.demo.gateAutoApprove})...`);
    const confirmed = await runGate2(results);
    console.log(`\n✅ Gate 2 resolved — ${confirmed.length} tickets confirmed.`);

    // Demonstrate merge handler directly (delete new + comment on existing)
    console.log('\nDemonstrating merge handler:');
    const { randomUUID } = require('crypto');
    const gid = randomUUID();
    await store.set(`gate2:${gid}`, { gateId: gid, type: 'gate2', status: 'pending', tickets: [results[1]] });
    await applyMerge(gid, 0);
    const after = await store.get(`gate2:${gid}`);
    console.log(`   ticket ${after.tickets[0].issue.key} -> merged into ${after.tickets[0]._mergedInto}, removed=${after.tickets[0]._removed}`);

    await store.close();
  })().catch((err) => {
    console.error('Gate 2 error:', err.message);
    process.exit(1);
  });
}
