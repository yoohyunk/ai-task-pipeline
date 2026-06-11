/**
 * Apply a natural-language edit instruction to a task list via Claude tool use.
 * Used by the Slack thread conversation feature: a human replies "lower the
 * priority of #3" / "remove the figma task" / "assign rate limiting to bob"
 * and Claude returns the full updated list.
 */
const config = require('../config');
const { withRetry } = require('../util/retry');
const { extractTasksTool } = require('../extraction/tool-schema');

const EDIT_TOOL = {
  name: 'apply_edits',
  description:
    'Apply the user instruction to the task list. Return the FULL updated list ' +
    '(every task, edited where asked, removed if requested, added if requested) ' +
    'plus a one-line summary of what changed.',
  input_schema: {
    type: 'object',
    properties: {
      tasks: extractTasksTool.input_schema.properties.tasks,
      summary: { type: 'string', description: 'one short line describing what changed' },
    },
    required: ['tasks', 'summary'],
  },
};

/**
 * @param {object[]} tasks - current task list
 * @param {string} instruction - natural-language edit request
 * @returns {Promise<{tasks: object[], summary: string}>}
 */
async function applyTaskEdits(tasks, instruction) {
  if (config.demo.mockExternal || !config.claude.apiKey) {
    return { tasks, summary: 'conversational editing needs live Claude (MOCK_EXTERNAL=false)' };
  }

  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: config.claude.apiKey });

  return withRetry(async () => {
    const res = await client.messages.create({
      model: config.claude.model,
      max_tokens: 2048,
      tools: [EDIT_TOOL],
      tool_choice: { type: 'tool', name: 'apply_edits' },
      messages: [
        {
          role: 'user',
          content:
            `Current task list (JSON):\n${JSON.stringify(tasks, null, 2)}\n\n` +
            `User instruction: "${instruction}"\n\n` +
            `Apply it and return the full updated list. Leave tasks that aren't ` +
            `mentioned unchanged. Task numbers are 1-based in list order.`,
        },
      ],
    });
    const block = res.content.find((b) => b.type === 'tool_use');
    if (!block) return { tasks, summary: 'no change' };

    // Re-attach fields Claude may have dropped (chunkId/sourceChannel), matched
    // by title for tasks that weren't renamed.
    const updated = (block.input.tasks || []).map((t) => {
      const orig = tasks.find((o) => o.title === t.title) || {};
      return { chunkId: orig.chunkId, sourceChannel: orig.sourceChannel, sourceTime: orig.sourceTime, ...t };
    });
    return { tasks: updated, summary: block.input.summary || 'updated' };
  });
}

module.exports = { applyTaskEdits };
