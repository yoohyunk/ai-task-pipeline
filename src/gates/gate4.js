/**
 * Gate 4 — assignee PR review.
 *
 * Triggered after the agent creates a PR. The assignee reviews the work summary
 * and approves (or rejects). CLI mode prompts in the terminal; otherwise it
 * auto-approves for a hands-off demo.
 *
 * A full implementation would handle request-changes / take-over / rework
 * cycles (MAX_REWORK_CYCLES). Kept to approve/reject here.
 *
 * @param {object} ticket
 * @param {object} pr       - output of createPR()
 * @param {object} summary  - output of generateSummary()
 * @returns {Promise<'approved' | 'rejected'>}
 */
const config = require('../config');
const notifier = require('../slack/notifier');

const MAX_REWORK_CYCLES = 3;

async function runGate4(ticket, pr, summary, assignment) {
  // Post the "agent finished — review needed" message (real Slack when live).
  await notifier.sendAgentReview(ticket, pr, summary, assignment);

  if (config.demo.gateMode === 'cli') {
    const { askGate4 } = require('./cli');
    return askGate4(ticket, pr, summary);
  }

  // Slack mode — wait for the Approve / Request changes button.
  if (config.demo.gateMode === 'slack') {
    const store = require('../state/gateStore');
    const key = `gate4:${ticket.key}`;
    await store.set(key, { status: 'pending' });
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (;;) {
      const s = await store.get(key);
      if (s && s.status === 'approved') return 'approved';
      if (s && s.status === 'rejected') return 'rejected';
      await sleep(2000);
    }
  }

  console.log(`✅ [Gate 4] auto-approved PR: ${pr?.prUrl || 'no PR'}`);
  return 'approved';
}

module.exports = { runGate4, MAX_REWORK_CYCLES };
