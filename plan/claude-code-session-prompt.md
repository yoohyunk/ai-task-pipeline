Build the AI Task Pipeline from the attached CLAUDE.md. Treat it as the source
of truth EXCEPT for the changes below.

---

## Spec overrides

1. SKIP the entire "Git commit history" section. Do NOT backdate commits. Commit
   normally with real dates as you build.

2. Decouple from Orbit Sales completely — this is a standalone project:
   - Repo/dir name: task-pipeline (not orbit-task-pipeline)
   - Jira project key: generic placeholder via env (e.g. TASK), never ORBIT
   - Do NOT reference or deploy to Orbit's EC2/ALB. Assume a generic local/dev
     environment. Drop the ALB routing assumptions.
   - In Memory Layer 1 and all examples, replace "Orbit Sales", "orbit-shop-app",
     "orbit-woo-app", "ORBIT-142-woo-webhook" with neutral generic examples.

3. Model string override:
   - CLAUDE.md says `claude-sonnet-4-5` — this is outdated.
   - Use `claude-sonnet-4-6` as the MODEL constant.
   - Keep it as a single config constant so it's easy to swap later.

---

## Scope for this pass (prototype for a demo, synthetic data)

Implement the CORE path end-to-end and runnable:

  ingestion (synthetic fixtures, not live APIs)
  → context builder + chunking
  → Claude extraction
  → Gate 1
  → dedup
  → Jira ticket create
  → Gate 2

STUB the heavier downstream with interface signatures + clear TODO markers:
  - agent executor
  - 3-layer memory
  - PR creation
  - gates 3 and 4

Architecture must be visible but these do not need to run for the demo.

Provide synthetic fixtures:
  - 2-3 fake Slack threads
  - 1 fake Meet transcript
  - 1 calendar event

So the whole core path runs offline and is filmable.

---

## Technical requirements

**Model**: `claude-sonnet-4-6` as a config constant in src/config.js (or equivalent).

**Extraction**: use tool use (one tool, input_schema = the task schema,
forced tool_choice) for reliable structured output instead of "respond JSON only"
+ parse. If text-JSON is kept for any reason, add strict safe parsing.

**Embeddings**: do NOT route through Claude. Dedup stays on Gemini
text-embedding-004 per spec. Claude has no embedding model.

**Error handling**: all external calls need try/catch + retry per spec.
Secrets via env only, never hardcoded.

**Reversible**: feature branch, isolated commits.

---

## Deliverable

Runnable core path on synthetic data + one command:

  npm run demo

That command runs the full flow through Gate 1 and ticket creation so it can be
screen-recorded.

---

## Reference: Claude SDK usage pattern

```js
const Anthropic = require('@anthropic-ai/sdk');
const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Tool use (preferred for extraction)
const response = await claude.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  tools: [{ name: 'extract_tasks', description: '...', input_schema: { ... } }],
  tool_choice: { type: 'tool', name: 'extract_tasks' },
  messages: [{ role: 'user', content: userPrompt }],
});
const tasks = response.content.find(b => b.type === 'tool_use').input.tasks;
```
