/**
 * TODO: Implement automatic PR creation.
 *
 * Branch naming: agent/{TICKET_KEY}-{slug}
 * PR title: [{TICKET_KEY}] {ticket.title}
 * PR body: summary (from summarizer.js) + test results + Jira link
 * Always includes: "> This PR was created by an AI agent."
 *
 * On PR approve + merge:
 *   - Jira webhook automatically marks ticket as Done
 *   - Triggers Gate 4 resolution
 *
 * @param {object} opts
 * @param {string} opts.branch
 * @param {object} opts.ticket
 * @param {object} opts.summary    - output of generateSummary()
 * @param {string} opts.testResults
 * @returns {Promise<{ prNumber, prUrl, branch }>}
 */
async function createPR({ branch, ticket, summary, testResults }) {
  // TODO: implement
  throw new Error('createPR not implemented');
}

module.exports = { createPR };
