# Phase 7 — Downstream Stubs (Agent, Memory, PR, Gates 3/4)

## Goal
Establish the full architecture with clear interfaces and TODO markers.
Nothing here needs to run for the demo — but the file structure and
function signatures must exist so the orchestrator can wire everything together.

## Deliverables
- `src/agent/assign.js`
- `src/agent/executor.js`
- `src/agent/memory.js`
- `src/agent/summarizer.js`
- `src/github/pr.js`
- `src/gates/gate3.js`
- `src/gates/gate4.js`

---

## src/agent/assign.js
```js
/**
 * TODO: Implement AI agent auto-assignment.
 *
 * Uses Claude to select the most appropriate assignee based on:
 * - Team member skill tags
 * - Current workload (Jira open issue count)
 * - Ticket priority
 *
 * Returns { assignee, reason, confidence (0–1) }
 * Gate 3 is skipped if confidence > 0.85 AND workload < 70% AND priority != critical.
 *
 * @param {object} ticket  - Jira ticket object
 * @param {object[]} team  - Array of { username, skills, openIssues }
 * @returns {Promise<{ assignee: string, reason: string, confidence: number }>}
 */
async function assignAgent(ticket, team) {
  // TODO: implement
  throw new Error('assignAgent not implemented');
}

module.exports = { assignAgent };
```

---

## src/agent/executor.js
```js
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
```

---

## src/agent/memory.js
```js
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
  return '[Project context — TODO]';
}

async function searchMemory(query) {
  // TODO: embed query, search vector DB, return top-k lessons
  return [];
}

async function saveLesson(taskId, ticketKey, lesson) {
  // TODO: embed lesson, store in vector DB
}

module.exports = { getProjectContext, searchMemory, saveLesson };
```

---

## src/agent/summarizer.js
```js
/**
 * TODO: Implement post-task work summary generation.
 *
 * Uses Claude to produce a human-readable summary of what the agent did.
 * Output is used in:
 *   - PR body
 *   - Gate 4 Slack DM to assignee
 *
 * Summary must cover:
 *   1. What was done? (non-technical, 1–2 sentences)
 *   2. Why this approach? (decision rationale, alternatives considered)
 *   3. How was it done? (technical changes)
 *   4. What to check? (specific spots assignee should review)
 *   5. What's left? (things agent couldn't do, needs human)
 *
 * @param {object} ticket
 * @param {string[]} changedFiles
 * @param {string} diffSummary
 * @param {string[]} agentLog
 * @returns {Promise<{ what, why, how, checkPoints, remaining }>}
 */
async function generateSummary(ticket, changedFiles, diffSummary, agentLog) {
  // TODO: implement
  throw new Error('generateSummary not implemented');
}

module.exports = { generateSummary };
```

---

## src/github/pr.js
```js
/**
 * TODO: Implement automatic PR creation.
 *
 * Branch naming: agent/{TICKET_KEY}-{slug}
 * PR title: [{TICKET_KEY}] {ticket.title}
 * PR body: summary (from summarizer.js) + test results + Jira link
 * Always includes: "> This PR was created by an AI agent."
 *
 * On PR approve + merge:
 *   - Jira webhook automatically marks ticket as Done
 *   - Triggers Gate 4 resolution
 *
 * @param {object} opts
 * @param {string} opts.branch
 * @param {object} opts.ticket
 * @param {object} opts.summary    - output of generateSummary()
 * @param {string} opts.testResults
 * @returns {Promise<{ prNumber, prUrl, branch }>}
 */
async function createPR({ branch, ticket, summary, testResults }) {
  // TODO: implement
  throw new Error('createPR not implemented');
}

module.exports = { createPR };
```

---

## src/gates/gate3.js
```js
/**
 * TODO: Implement Gate 3 — agent assignment review.
 *
 * EARLY STAGE ONLY — remove once assignment confidence is consistently high.
 *
 * Auto-skip conditions (all must be true):
 *   - assignment.confidence > 0.85
 *   - assignee.currentLoad < 0.70
 *   - ticket.priority !== 'critical'
 *
 * If not auto-skipped:
 *   - Send Slack message showing proposed assignee + reason
 *   - Actions: Approve / Reassign (dropdown)
 *   - Timeout: 2h → auto-approve
 *
 * @param {object} ticket
 * @param {object} assignment   - output of assignAgent()
 * @returns {Promise<object>}   - confirmed assignment
 */
async function runGate3(ticket, assignment) {
  // TODO: implement
  // For now, auto-approve everything
  console.log('[Gate 3 STUB] Auto-approving assignment:', assignment.assignee);
  return assignment;
}

module.exports = { runGate3 };
```

---

## src/gates/gate4.js
```js
/**
 * TODO: Implement Gate 4 — assignee PR review.
 *
 * Triggered when agent completes work and PR is created.
 *
 * Flow:
 *   1. Send DM to assignee: work summary + PR link + changed files
 *      Summary must be good enough to judge "looks right / doesn't" from Slack alone
 *   2. Actions:
 *      - Approve → PR merges → Jira auto-Done
 *      - Request changes (Case 1) → agent reads PR comments, revises, re-notifies
 *      - Take over manually (Case 2) → branch ownership transferred to assignee
 *      - Reject → agent reworks from scratch
 *
 * Rework cycle limit: MAX_REWORK_CYCLES = 3
 *   If exceeded: agent gives up, transfers branch, notifies assignee.
 *   Notification: "The agent attempted 3 times but could not resolve the feedback.
 *                  Manual intervention required."
 *
 * Rework notification format: [Rework N/3] Agent applied feedback: {summary of changes}
 *
 * Timeout: 48h → auto-approve
 *
 * @param {object} ticket
 * @param {object} pr         - output of createPR()
 * @param {object} summary    - output of generateSummary()
 * @returns {Promise<'approved' | 'taken_over'>}
 */
const MAX_REWORK_CYCLES = 3;

async function runGate4(ticket, pr, summary) {
  // TODO: implement
  console.log('[Gate 4 STUB] Auto-approving PR:', pr?.prUrl || 'no PR');
  return 'approved';
}

module.exports = { runGate4, MAX_REWORK_CYCLES };
```

## Acceptance criteria
- [ ] All stub files exist and export the expected function signatures
- [ ] Each file has a clear TODO comment explaining what to implement
- [ ] Gate 3 stub auto-approves (so demo flow isn't blocked)
- [ ] Gate 4 stub auto-approves (so demo flow isn't blocked)
- [ ] Orchestrator can import all stubs without errors
