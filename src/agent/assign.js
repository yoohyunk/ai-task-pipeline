/**
 * Agent auto-assignment.
 *
 * Simple rule-based assignment for the demo: trust the assignee hint extracted
 * from the conversation. High confidence when a hint exists so Gate 3 auto-skips.
 *
 * (A fuller version would use Claude to weigh skill tags + Jira workload —
 * see the original spec. Kept rule-based here to stay offline.)
 *
 * @param {object} ticket  - { title, assignee_hint, priority }
 * @param {object[]} [team] - optional [{ username, skills, openIssues }]
 * @returns {Promise<{ assignee, reason, confidence }>}
 */
async function assignAgent(ticket, team) {
  const hint = ticket.assignee_hint;
  if (hint) {
    return {
      assignee: hint,
      reason: `Named/implied in the source conversation as the owner of "${ticket.title}".`,
      confidence: 0.9,
    };
  }
  return {
    assignee: 'unassigned',
    reason: 'No owner could be inferred from the conversation.',
    confidence: 0.4,
  };
}

module.exports = { assignAgent };
