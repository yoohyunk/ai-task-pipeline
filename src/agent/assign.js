/**
 * TODO: Implement AI agent auto-assignment.
 *
 * Uses Claude to select the most appropriate assignee based on:
 * - Team member skill tags
 * - Current workload (Jira open issue count)
 * - Ticket priority
 *
 * Returns { assignee, reason, confidence (0–1) }
 * Gate 3 is skipped if confidence > 0.85 AND workload < 70% AND priority != critical.
 *
 * @param {object} ticket  - Jira ticket object
 * @param {object[]} team  - Array of { username, skills, openIssues }
 * @returns {Promise<{ assignee: string, reason: string, confidence: number }>}
 */
async function assignAgent(ticket, team) {
  // TODO: implement
  throw new Error('assignAgent not implemented');
}

module.exports = { assignAgent };
