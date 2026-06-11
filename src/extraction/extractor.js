const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config');
const { extractTasksTool } = require('./tool-schema');
const { mockExtract } = require('./mock');

const SYSTEM_PROMPT = `You are an expert at extracting action items from team conversations.
Recognize not only explicit requests ("please do X") but also:
- Unfinished work mentioned in passing ("we haven't done X yet", "still pending")
- Problem statements (a situation someone needs to resolve)
- Implicit follow-ups after a decision ("let's go with X" → someone needs to execute)
- Soft commitments ("I think we should check X", "probably need to look into Y")
- Question-form tasks ("shouldn't we verify X before shipping?")

If no assignee is explicitly named, infer from conversational context.
If a task has no clear owner, set assignee_hint to null.`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Mock when explicitly enabled, or when no real key is available.
const shouldMock = config.demo.mockExternal || !config.claude.apiKey;

let client = null;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: config.claude.apiKey });
  return client;
}

/**
 * Extract tasks from a single context packet.
 * Real path uses forced tool use (no JSON-parse fragility). Mock path returns
 * deterministic tasks so the pipeline runs offline.
 *
 * @param {object} packet - context packet from ingestion
 * @returns {Promise<object[]>} tasks with chunkId + source attached
 */
async function extract(packet) {
  let tasks;

  if (shouldMock) {
    tasks = mockExtract(packet);
  } else {
    const response = await getClient().messages.create({
      model: config.claude.model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [extractTasksTool],
      tool_choice: { type: 'tool', name: 'extract_tasks' }, // force tool use
      messages: [
        {
          role: 'user',
          content: `Extract action items from this conversation:\n\n${packet.rawText}`,
        },
      ],
    });

    // tool_use block is guaranteed by tool_choice: forced
    const toolBlock = response.content.find((b) => b.type === 'tool_use');
    if (!toolBlock) throw new Error('Claude returned no tool_use block');
    tasks = toolBlock.input.tasks || [];
  }

  return tasks.map((t) => ({
    ...t,
    source: t.source || packet.source,
    chunkId: packet.chunkId,
  }));
}

/**
 * Extract with retry/backoff around every Claude call.
 * @param {object} packet
 * @param {number} retries
 */
async function extractWithRetry(packet, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await extract(packet);
    } catch (err) {
      if (i === retries - 1) throw err;
      await sleep(1000 * (i + 1)); // 1s, 2s, 3s
    }
  }
}

module.exports = { extract, extractWithRetry, shouldMock };

// `node src/extraction/extractor.js` — run against all fixtures and print tasks.
if (require.main === module) {
  const { ingest } = require('../ingestion');
  (async () => {
    console.log(`Extraction mode: ${shouldMock ? 'MOCK' : 'LIVE (Claude)'}\n`);
    const packets = await ingest();
    const all = [];
    for (const packet of packets) {
      const tasks = await extractWithRetry(packet);
      all.push(...tasks);
    }
    console.log(`${all.length} tasks extracted:\n`);
    all.forEach((t, i) => {
      console.log(
        `${i + 1}. [${t.priority}/${t.confidence}] ${t.title}\n` +
          `   assignee: ${t.assignee_hint || 'TBD'} · due: ${t.due_hint || '—'} · source: ${t.source}\n` +
          `   why: ${t.reasoning}\n`
      );
    });
  })().catch((err) => {
    console.error('Extraction error:', err.message);
    process.exit(1);
  });
}
