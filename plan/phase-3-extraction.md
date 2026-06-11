# Phase 3 — Claude Extraction (Tool Use)

## Goal
Pass context packets to Claude and extract structured action items using
forced tool use — no "respond JSON only" fragility.

## Deliverables
- `src/extraction/extractor.js`
- `src/extraction/tool-schema.js`  (task extraction tool definition)

## Tool definition (src/extraction/tool-schema.js)
```js
const extractTasksTool = {
  name: 'extract_tasks',
  description: 'Extract action items from a conversation chunk. Include explicit requests AND implicit ones (unfinished work, problem statements, soft commitments, post-decision follow-ups).',
  input_schema: {
    type: 'object',
    properties: {
      tasks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title:         { type: 'string', description: 'One-line summary, max 60 chars' },
            description:   { type: 'string', description: 'Full context and background' },
            assignee_hint: { type: ['string', 'null'], description: 'Name mentioned or inferred from conversation flow, null if unknown' },
            priority:      { type: 'string', enum: ['high', 'medium', 'low'] },
            due_hint:      { type: ['string', 'null'], description: 'Mentioned deadline or null' },
            source:        { type: 'string', enum: ['slack', 'meet', 'calendar'] },
            confidence:    { type: 'string', enum: ['high', 'medium', 'low'] },
            reasoning:     { type: 'string', description: 'Why this is an action item — especially important for implicit ones' },
          },
          required: ['title', 'description', 'priority', 'source', 'confidence', 'reasoning'],
        },
      },
    },
    required: ['tasks'],
  },
};

module.exports = { extractTasksTool };
```

## src/extraction/extractor.js

### System prompt
```
You are an expert at extracting action items from team conversations.
Recognize not only explicit requests ("please do X") but also:
- Unfinished work mentioned in passing ("we haven't done X yet", "still pending")
- Problem statements (a situation someone needs to resolve)
- Implicit follow-ups after a decision ("let's go with X" → someone needs to execute)
- Soft commitments ("I think we should check X", "probably need to look into Y")
- Question-form tasks ("shouldn't we verify X before shipping?")

If no assignee is explicitly named, infer from conversational context.
If a task has no clear owner, set assignee_hint to null.
```

### API call pattern
```js
const response = await claude.messages.create({
  model:      config.claude.model,
  max_tokens: 1024,
  system:     SYSTEM_PROMPT,
  tools:      [extractTasksTool],
  tool_choice: { type: 'tool', name: 'extract_tasks' },  // force tool use
  messages: [{
    role:    'user',
    content: `Extract action items from this conversation:\n\n${packet.rawText}`,
  }],
});

// safe extraction — tool_use block is guaranteed by tool_choice: forced
const toolBlock = response.content.find(b => b.type === 'tool_use');
if (!toolBlock) throw new Error('Claude returned no tool_use block');
const tasks = toolBlock.input.tasks;
```

### Retry logic
```js
async function extractWithRetry(packet, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await extract(packet);
    } catch (err) {
      if (i === retries - 1) throw err;
      await sleep(1000 * (i + 1));  // 1s, 2s, 3s
    }
  }
}
```

### Output
Array of task objects matching the tool schema, with `chunkId` and `source` attached:
```js
[
  {
    title:         'Fix session TTL and add keep-alive ping',
    description:   'Mobile Safari users are being logged out after 5 mins. Bob committed to increasing session TTL and adding a keep-alive ping.',
    assignee_hint: 'bob',
    priority:      'high',
    due_hint:      'end of week',
    source:        'slack',
    confidence:    'high',
    reasoning:     'Explicit assignment: "Bob can you take that?"',
    chunkId:       'abc123',
  },
  ...
]
```

## Acceptance criteria
- [ ] `node src/extraction/extractor.js` runs against all fixtures and prints extracted tasks
- [ ] Uses tool_choice forced — no JSON parsing fragility
- [ ] Implicit tasks are captured (e.g. carol's DB disk issue → task even though no one said "please do X")
- [ ] Retry logic wraps every Claude API call
- [ ] No API keys hardcoded
