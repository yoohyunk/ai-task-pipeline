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

function getProjectContext() {
  // TODO: return fixed project description string
  return [
    'Project: AI Task Pipeline (generic web app).',
    'Stack: Node.js services, REST APIs, Jira for tracking, Slack for review gates.',
    'Patterns: every external call has try/catch + retry; secrets via env only;',
    'structured tool use for LLM extraction; embeddings for dedup.',
  ].join(' ');
}

async function searchMemory(query) {
  // TODO: embed query, search vector DB, return top-k lessons
  return [];
}

async function saveLesson(taskId, ticketKey, lesson) {
  // TODO: embed lesson, store in vector DB
}

module.exports = { getProjectContext, searchMemory, saveLesson };
