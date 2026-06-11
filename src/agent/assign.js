/**
 * Agent auto-assignment.
 *
 * Assignment has two signals:
 *   - confidence: a proxy for whether the conversation named an owner (0.9 if the
 *     extractor pulled an assignee hint, 0.4 if not). Not a model probability.
 *   - load: the assignee's real current workload (open Jira issues, normalized),
 *     looked up live. 0 when we can't resolve the person or in mock mode.
 * Gate 3 uses both to decide whether to auto-skip the assignment review.
 *
 * (Skill-tag matching from the original spec is not built.)
 *
 * @param {object} ticket  - { title, assignee_hint, priority }
 * @returns {Promise<{ assignee, reason, confidence, load, openIssues }>}
 */
const jira = require('../jira/jira');

async function assignAgent(ticket) {
  const hint = ticket.assignee_hint;
  if (hint) {
    const { openIssues, load } = await jira.assigneeLoad(hint);
    return {
      assignee: hint,
      reason: `Named/implied as the owner of "${ticket.title}" (${openIssues} open issues now).`,
      confidence: 0.9,
      load,
      openIssues,
    };
  }
  return {
    assignee: 'unassigned',
    reason: 'No owner could be inferred from the conversation.',
    confidence: 0.4,
    load: 0,
    openIssues: 0,
  };
}

module.exports = { assignAgent };
