/**
 * Generate a concise PRD (product requirements doc) for an approved task, used
 * as the Jira ticket body. Claude tool use for real output; deterministic
 * template in mock mode.
 */
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { withRetry } = require('../util/retry');

const REPO_ROOT = path.resolve(__dirname, '../..');
const shouldMock = config.demo.mockExternal || !config.claude.apiKey;

// Ground the PRD in the actual codebase: find the file(s) the task most likely
// touches, read them, and hand the current contents to Claude.
function gatherCodeContext(task) {
  try {
    const { selectChange } = require('../agent/executor');
    const change = selectChange(task.title);
    if (!change) return '';
    const abs = path.join(REPO_ROOT, change.file);
    if (!fs.existsSync(abs)) return '';
    const content = fs.readFileSync(abs, 'utf8').slice(0, 2000);
    return `Relevant existing file — ${change.file}:\n\`\`\`\n${content}\n\`\`\``;
  } catch {
    return '';
  }
}

const PRD_TOOL = {
  name: 'write_prd',
  description: 'Write a short, concrete product requirements doc for one task ticket.',
  input_schema: {
    type: 'object',
    properties: {
      background: { type: 'string', description: '1–2 sentences of context from the conversation' },
      problem: { type: 'string', description: 'the problem this task solves' },
      requirements: { type: 'array', items: { type: 'string' }, description: '3–5 concrete requirements' },
      acceptanceCriteria: { type: 'array', items: { type: 'string' }, description: '2–4 testable acceptance criteria' },
      outOfScope: { type: 'string', description: 'what is explicitly not included (optional)' },
    },
    required: ['background', 'problem', 'requirements', 'acceptanceCriteria'],
  },
};

function mockPRD(task) {
  return {
    background: task.description || `Raised in ${task.source}.`,
    problem: `"${task.title}" is needed but not yet addressed.`,
    requirements: [
      `Implement: ${task.title}`,
      'Follow existing code patterns and conventions',
      'Add error handling for external/edge cases',
    ],
    acceptanceCriteria: [
      `${task.title} works as described`,
      'No regressions in related functionality',
    ],
    outOfScope: 'Unrelated refactors or broader redesigns.',
  };
}

async function generatePRD(task) {
  if (shouldMock) return mockPRD(task);

  const codeContext = gatherCodeContext(task);

  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: config.claude.apiKey });
  return withRetry(async () => {
    const res = await client.messages.create({
      model: config.claude.model,
      max_tokens: 1024,
      tools: [PRD_TOOL],
      tool_choice: { type: 'tool', name: 'write_prd' },
      messages: [
        {
          role: 'user',
          content:
            `Write a short PRD for this task ticket. Ground it in the actual ` +
            `codebase shown below — reference the real file and current values ` +
            `where relevant, and make requirements concrete to this code.\n\n` +
            `Title: ${task.title}\n` +
            `Context: ${task.description}\n` +
            `Source: ${task.source}${task.sourceChannel ? ` (${task.sourceChannel})` : ''}\n` +
            `Priority: ${task.priority}\n\n` +
            `${codeContext || '(no matching source file found in the codebase)'}`,
        },
      ],
    });
    const block = res.content.find((b) => b.type === 'tool_use');
    return block ? block.input : mockPRD(task);
  });
}

module.exports = { generatePRD, PRD_SCHEMA: PRD_TOOL.input_schema };
