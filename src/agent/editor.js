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

// ── Gate 2: edit created tickets / their PRDs ────────────────────────────
const { PRD_SCHEMA } = require('../extraction/prd');

const TICKET_EDIT_TOOL = {
  name: 'apply_ticket_edits',
  description:
    'Apply the user instruction to the listed tickets (title, priority, and/or ' +
    'PRD body). Return ONLY the tickets that changed, each with its key and the ' +
    'updated fields, plus a one-line summary.',
  input_schema: {
    type: 'object',
    properties: {
      changed: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'the ticket key, e.g. KAN-28' },
            title: { type: 'string' },
            priority: { type: 'string', enum: ['high', 'medium', 'low'] },
            prd: PRD_SCHEMA,
          },
          required: ['key'],
        },
      },
      summary: { type: 'string', description: 'one short line describing what changed' },
    },
    required: ['changed', 'summary'],
  },
};

/**
 * Apply a natural-language edit to a set of tickets (and their PRDs).
 * @param {object[]} tickets - [{ key, title, priority, prd }]
 * @param {string} instruction
 * @returns {Promise<{changed: object[], summary: string}>}
 */
async function applyTicketEdits(tickets, instruction) {
  if (config.demo.mockExternal || !config.claude.apiKey) {
    return { changed: [], summary: 'conversational editing needs live Claude' };
  }
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: config.claude.apiKey });
  return withRetry(async () => {
    const res = await client.messages.create({
      model: config.claude.model,
      max_tokens: 2048,
      tools: [TICKET_EDIT_TOOL],
      tool_choice: { type: 'tool', name: 'apply_ticket_edits' },
      messages: [
        {
          role: 'user',
          content:
            `Tickets (JSON):\n${JSON.stringify(tickets, null, 2)}\n\n` +
            `User instruction: "${instruction}"\n\n` +
            `Identify which ticket(s) the instruction targets (by key, title, or ` +
            `description) and return only those, with their full updated fields. ` +
            `When editing a PRD, return the complete updated PRD, not a diff.`,
        },
      ],
    });
    const block = res.content.find((b) => b.type === 'tool_use');
    if (!block) return { changed: [], summary: 'no change' };
    return { changed: block.input.changed || [], summary: block.input.summary || 'updated' };
  });
}

module.exports = { applyTaskEdits, applyTicketEdits };
