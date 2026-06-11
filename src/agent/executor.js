/**
 * TODO: Implement agent task execution.
 *
 * Uses Claude with 3-layer memory context to execute the work described
 * in the Jira ticket. Produces file changes / commits.
 *
 * Memory layers injected at execution time:
 *   Layer 1: fixed project context (system prompt)
 *   Layer 2: relevant past lessons retrieved from vector DB (memory.js)
 *   Layer 3: current task log — appended to every LLM call for continuity
 *
 * Emits events: 'progress', 'complete', 'error'
 *
 * @param {object} ticket
 * @param {object} assignment   - output of assignAgent()
 * @returns {Promise<{ branch: string, changedFiles: string[], log: string[] }>}
 */
async function executeTask(ticket, assignment) {
  // TODO: implement
  throw new Error('executeTask not implemented');
}

module.exports = { executeTask };
