/**
 * TODO: Implement 3-layer agent memory system.
 *
 * Layer 1 — Project context (fixed system prompt, never changes between tasks)
 *   Returns a static string describing the project, stack, patterns.
 *
 * Layer 2 — Accumulated lessons (vector DB)
 *   After each completed task, Claude extracts "things to remember next time"
 *   and stores them as embeddings. On new task start, search for relevant
 *   lessons and inject into context.
 *   Schema: { taskId, ticketKey, lesson, tags, embedding, createdAt }
 *
 * Layer 3 — Current task log (in-task continuity)
 *   Append previous log entries to every LLM call within the same task.
 *   If approaching token limit, generate a mid-task summary and compress.
 */

const config = require('../config');

// ── Layer 1 — fixed project context ──────────────────────────────────────
function getProjectContext() {
  return [
    'Project: AI Task Pipeline (generic web app).',
    'Stack: Node.js services, REST APIs, Jira for tracking, Slack for review gates.',
    'Patterns: every external call has try/catch + retry; secrets via env only;',
    'structured tool use for LLM extraction; embeddings for dedup.',
  ].join(' ');
}

// ── Layer 2 — accumulated lessons (vector search) ─────────────────────────
// After a task is done, extract reusable lessons, embed them, and store them.
// On a new task, retrieve the most similar lessons and inject them. Reuses the
// same Gemini embedding + cosine + Redis the dedup layer uses. (lazy requires
// avoid a load-time cycle: dedup → prd → executor → memory)
const store = require('../state/gateStore');
const LESSONS_KEY = 'lessons';

const embed = (t) => require('../dedup/dedup').getEmbedding(t);
const cosine = (a, b) => require('../dedup/dedup').cosineSimilarity(a, b);

async function saveLesson(taskId, ticketKey, lesson) {
  if (!lesson) return;
  const embedding = await embed(lesson);
  const all = (await store.get(LESSONS_KEY)) || [];
  all.push({ taskId, ticketKey, lesson, embedding });
  await store.set(LESSONS_KEY, all);
}

async function searchMemory(query, k = 3) {
  const all = (await store.get(LESSONS_KEY)) || [];
  if (!all.length) return [];
  const q = await embed(query);
  return all
    .map((l) => ({ lesson: l.lesson, ticketKey: l.ticketKey, score: cosine(q, l.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

// Pull 1–3 reusable lessons out of a finished task (Claude, or a template offline).
async function extractLessons(ticket, taskLog) {
  if (config.demo.mockExternal || !config.claude.apiKey) {
    return [`For "${ticket.title}"-type work, confirm exact config values with the reviewer before finalizing.`];
  }
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: config.claude.apiKey });
  const tool = {
    name: 'lessons',
    description: 'Extract 1–3 short, reusable lessons for future similar tasks.',
    input_schema: {
      type: 'object',
      properties: { lessons: { type: 'array', items: { type: 'string' } } },
      required: ['lessons'],
    },
  };
  const res = await client.messages.create({
    model: config.claude.model,
    max_tokens: 512,
    tools: [tool],
    tool_choice: { type: 'tool', name: 'lessons' },
    messages: [
      {
        role: 'user',
        content:
          `Task: ${ticket.title}\n${ticket.description || ''}\n\n` +
          `What happened (attempts + reviewer feedback):\n${logRender(taskLog)}\n\n` +
          `Extract 1–3 short reusable lessons for future similar tasks (reviewer ` +
          `preferences, gotchas). One sentence each.`,
      },
    ],
  });
  return res.content.find((b) => b.type === 'tool_use')?.input.lessons || [];
}

// ── Layer 3 — in-task continuity (running log + compression) ──────────────
// Used across rework cycles: the running log of what the agent tried and the
// feedback it got is injected into every revision call. When it grows past a
// budget it is summarized so the context stays bounded.
const TASKLOG_CHAR_BUDGET = 4000;

function newTaskLog(ticket) {
  return { ticketKey: ticket.key, title: ticket.title, entries: [] };
}

function logAppend(log, entry) {
  if (entry) log.entries.push(entry);
  return log;
}

function logRender(log) {
  return log.entries.map((e, i) => `(${i + 1}) ${e}`).join('\n');
}

async function logCompressIfNeeded(log) {
  const text = logRender(log);
  if (text.length <= TASKLOG_CHAR_BUDGET) return log;

  if (config.demo.mockExternal || !config.claude.apiKey) {
    log.entries = [`[summary] ${log.entries.length} earlier steps compressed (offline).`];
    return log;
  }
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: config.claude.apiKey });
  const res = await client.messages.create({
    model: config.claude.model,
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content:
          'Summarize this agent task log into a few bullets capturing what was ' +
          `tried and the feedback so far. Keep it tight.\n\n${text}`,
      },
    ],
  });
  const summary = res.content.find((b) => b.type === 'text')?.text || text.slice(0, TASKLOG_CHAR_BUDGET);
  log.entries = [`[compressed summary]\n${summary}`];
  return log;
}

module.exports = {
  getProjectContext,
  searchMemory,
  saveLesson,
  extractLessons,
  newTaskLog,
  logAppend,
  logRender,
  logCompressIfNeeded,
};
