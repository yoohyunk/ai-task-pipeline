/**
 * Post-task work summary. Used in the PR body and the Gate 4 review.
 *
 * Symbolic mode builds the summary from the agent's diff summary; live mode
 * asks Claude to write it.
 *
 * @param {object} ticket
 * @param {string[]} changedFiles
 * @param {string} diffSummary
 * @param {string[]} agentLog
 * @returns {Promise<{ what, why, how, checkPoints, remaining }>}
 */
const config = require('../config');

async function generateSummary(ticket, changedFiles, diffSummary, agentLog) {
  if (config.agent.mode === 'live' && config.claude.apiKey) {
    return liveSummary(ticket, changedFiles, diffSummary, agentLog);
  }
  return {
    what: `Implemented "${ticket.title}".`,
    why: ticket.description || 'Addresses the issue raised in the source conversation.',
    how: diffSummary,
    checkPoints: `Review ${changedFiles.join(', ')} and confirm the new values are sensible.`,
    remaining: 'Add/adjust tests for the changed behavior before merging.',
  };
}

async function liveSummary(ticket, changedFiles, diffSummary, agentLog) {
  const Anthropic = require('@anthropic-ai/sdk');
  const { withRetry } = require('../util/retry');
  const client = new Anthropic({ apiKey: config.claude.apiKey });
  const tool = {
    name: 'work_summary',
    description: 'Summarize the agent work for a PR body and assignee review.',
    input_schema: {
      type: 'object',
      properties: {
        what: { type: 'string' },
        why: { type: 'string' },
        how: { type: 'string' },
        checkPoints: { type: 'string' },
        remaining: { type: 'string' },
      },
      required: ['what', 'why', 'how', 'checkPoints', 'remaining'],
    },
  };
  return withRetry(async () => {
    const res = await client.messages.create({
      model: config.claude.model,
      max_tokens: 1024,
      tools: [tool],
      tool_choice: { type: 'tool', name: 'work_summary' },
      messages: [
        {
          role: 'user',
          content:
            `Ticket: ${ticket.title}\n${ticket.description}\n\n` +
            `Changed files: ${changedFiles.join(', ')}\n` +
            `Change: ${diffSummary}\nLog:\n${(agentLog || []).join('\n')}`,
        },
      ],
    });
    return res.content.find((b) => b.type === 'tool_use').input;
  });
}

module.exports = { generateSummary };
