/**
 * Gate 1 — task list review.
 *
 * Sends extracted tasks to Slack and blocks the pipeline until approved.
 * Real interactive approval happens via src/slack/actions.js updating Redis.
 * For the demo, GATE_AUTO_APPROVE resolves the gate after a short delay so the
 * pipeline runs end-to-end without a human clicking buttons.
 */
const { randomUUID } = require('crypto');
const config = require('../config');
const store = require('../state/gateStore');
const notifier = require('../slack/notifier');

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
const key = (gateId) => `gate:${gateId}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class GateRejectedError extends Error {
  constructor(gateId) {
    super(`Gate ${gateId} was rejected`);
    this.name = 'GateRejectedError';
  }
}

// Resolve pending gates that have passed their auto-approve / timeout deadline.
async function checkTimeout(gateId) {
  const state = await store.get(key(gateId));
  if (!state || state.status !== 'pending') return;
  const now = Date.now();

  // In slack mode we wait for a real button click — no demo auto-approve.
  if (config.demo.gateMode !== 'slack' && config.demo.gateAutoApprove && now >= new Date(state.autoApproveAt).getTime()) {
    const next = await store.update(key(gateId), { status: 'approved', approvedBy: 'auto-approve' });
    await notifier.sendTimeoutNotice(state.channelId, gateId, 'auto-approve');
    return next;
  }

  if (now > new Date(state.timeoutAt).getTime()) {
    await store.update(key(gateId), { status: 'approved', approvedBy: 'timeout' });
    await notifier.sendTimeoutNotice(state.channelId, gateId, 'timeout');
  }
}

async function waitForGate(gateId, pollIntervalMs) {
  for (;;) {
    await checkTimeout(gateId);
    const state = await store.get(key(gateId));
    if (!state) throw new Error(`Gate ${gateId} state missing`);
    if (state.status === 'approved') return state.tasks;
    if (state.status === 'rejected') throw new GateRejectedError(gateId);
    await sleep(pollIntervalMs);
  }
}

/**
 * Run Gate 1. Resolves with the approved (possibly edited) task list.
 * @param {object[]} tasks
 * @returns {Promise<object[]>}
 */
async function runGate1(tasks) {
  // Interactive terminal mode — approve/edit/remove live, no Redis/Slack needed.
  if (config.demo.gateMode === 'cli') {
    const cli = require('./cli');
    const res = await cli.askGate1(tasks);
    if (res.decision === 'rejected') throw new GateRejectedError('gate1-cli');
    return res.tasks;
  }

  const gateId = randomUUID();
  const now = Date.now();

  const sent = await notifier.sendGate1({
    gateId,
    tasks,
    channelId: config.slack.approvalChannel,
  });

  const state = {
    gateId,
    type: 'gate1',
    status: 'pending',
    tasks,
    createdAt: new Date(now).toISOString(),
    timeoutAt: new Date(now + TWENTY_FOUR_HOURS).toISOString(),
    autoApproveAt: new Date(now + config.demo.gateAutoApproveMs).toISOString(),
    approvedBy: null,
    messageTs: sent.ts,
    channelId: sent.channel,
  };
  await store.set(key(gateId), state);

  // Let thread replies edit the gate conversationally.
  if (config.demo.gateMode === 'slack') {
    const converse = require('../slack/converse');
    const rootTs = require('../slack/runContext').rootTs();
    if (rootTs) await converse.setActiveGate(rootTs, 'gate1', gateId);
    else await converse.linkThread(sent.ts, gateId, 'gate1');
  }

  // Poll faster in auto-approve demo mode; slower for real human review.
  const pollMs = config.demo.gateAutoApprove ? 1000 : 5000;
  return waitForGate(gateId, pollMs);
}

module.exports = { runGate1, waitForGate, checkTimeout, GateRejectedError };

// `node src/gates/gate1.js` — run Gate 1 against mock-extracted tasks.
if (require.main === module) {
  (async () => {
    const { ingest } = require('../ingestion');
    const { extractWithRetry } = require('../extraction/extractor');
    const packets = await ingest();
    const tasks = [];
    for (const p of packets) tasks.push(...(await extractWithRetry(p)));
    console.log(`\nRunning Gate 1 with ${tasks.length} tasks (auto-approve=${config.demo.gateAutoApprove})...`);
    const approved = await runGate1(tasks);
    console.log(`\n✅ Gate 1 resolved — ${approved.length} tasks approved.`);
    await store.close();
  })().catch((err) => {
    console.error('Gate 1 error:', err.message);
    process.exit(1);
  });
}
