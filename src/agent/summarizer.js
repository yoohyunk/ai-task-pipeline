/**
 * TODO: Implement post-task work summary generation.
 *
 * Uses Claude to produce a human-readable summary of what the agent did.
 * Output is used in:
 *   - PR body
 *   - Gate 4 Slack DM to assignee
 *
 * Summary must cover:
 *   1. What was done? (non-technical, 1–2 sentences)
 *   2. Why this approach? (decision rationale, alternatives considered)
 *   3. How was it done? (technical changes)
 *   4. What to check? (specific spots assignee should review)
 *   5. What's left? (things agent couldn't do, needs human)
 *
 * @param {object} ticket
 * @param {string[]} changedFiles
 * @param {string} diffSummary
 * @param {string[]} agentLog
 * @returns {Promise<{ what, why, how, checkPoints, remaining }>}
 */
async function generateSummary(ticket, changedFiles, diffSummary, agentLog) {
  // TODO: implement
  throw new Error('generateSummary not implemented');
}

module.exports = { generateSummary };
