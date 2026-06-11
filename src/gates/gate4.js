/**
 * TODO: Implement Gate 4 — assignee PR review.
 *
 * Triggered when agent completes work and PR is created.
 *
 * Flow:
 *   1. Send DM to assignee: work summary + PR link + changed files
 *      Summary must be good enough to judge "looks right / doesn't" from Slack alone
 *   2. Actions:
 *      - Approve → PR merges → Jira auto-Done
 *      - Request changes (Case 1) → agent reads PR comments, revises, re-notifies
 *      - Take over manually (Case 2) → branch ownership transferred to assignee
 *      - Reject → agent reworks from scratch
 *
 * Rework cycle limit: MAX_REWORK_CYCLES = 3
 *   If exceeded: agent gives up, transfers branch, notifies assignee.
 *   Notification: "The agent attempted 3 times but could not resolve the feedback.
 *                  Manual intervention required."
 *
 * Rework notification format: [Rework N/3] Agent applied feedback: {summary of changes}
 *
 * Timeout: 48h → auto-approve
 *
 * @param {object} ticket
 * @param {object} pr         - output of createPR()
 * @param {object} summary    - output of generateSummary()
 * @returns {Promise<'approved' | 'taken_over'>}
 */
const MAX_REWORK_CYCLES = 3;

async function runGate4(ticket, pr, summary) {
  // TODO: implement
  console.log('[Gate 4 STUB] Auto-approving PR:', pr?.prUrl || 'no PR');
  return 'approved';
}

module.exports = { runGate4, MAX_REWORK_CYCLES };
