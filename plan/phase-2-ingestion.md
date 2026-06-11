# Phase 2 — Ingestion + Context Builder + Chunking

## Goal
Load synthetic fixtures, normalize each source into a common format,
merge and sort by time, then chunk into context packets ready for the LLM.

## Deliverables
- `src/ingestion/slack.js`
- `src/ingestion/meet.js`
- `src/ingestion/calendar.js`
- `src/ingestion/contextBuilder.js`
- `src/ingestion/index.js` (entry point that runs all three + builds context)

## Common normalized format
Every source produces an array of normalized messages:
```js
{
  source:       'slack' | 'meet' | 'calendar',
  channel:      string,          // #dev, "Sprint Planning", etc.
  timestamp:    ISO string,
  participants: string[],
  lines: [
    { speaker: string, text: string, ts: ISO string }
  ]
}
```

## Chunking rules (per source)

### Slack
- Group by `thread_ts` first (keep threads together)
- If no thread: group messages within a 30-min window
- Topic gap > 30 min = new chunk
- Exclude bot messages and empty strings

### Meet
- One chunk per logical topic segment
- Split on: silence cue in transcript OR speaker changes > 3 in a row on same topic
- Never pass entire transcript as a single chunk
- Max chunk size: 800 tokens (estimate: 1 token ≈ 4 chars)

### Calendar
- One event = one chunk
- Merge event description + attendee list as context

## Context packet shape (output of contextBuilder)
```js
{
  chunkId:      string,          // uuid
  source:       string,
  channel:      string,
  timestamp:    ISO string,
  participants: string[],
  rawText:      string,          // formatted for LLM (see below)
}
```

## rawText format
```
[slack | #dev | 2024-03-14 10:00 | participants: alice, bob]
alice: The login timeout bug is still happening on mobile safari.
bob: We need to increase the session TTL and add a keep-alive ping.
alice: Bob can you take that? It's blocking the demo next week.
bob: On it.
```

## src/ingestion/contextBuilder.js responsibilities
1. Call slack.js, meet.js, calendar.js
2. Collect all normalized messages
3. Sort all chunks by timestamp (chronological)
4. Cross-link: if a calendar event and a meet transcript share the same time window, merge them into one chunk (calendar metadata prepended)
5. Return array of context packets

## src/ingestion/index.js
```js
const { buildContext } = require('./contextBuilder');
const slackFixture    = require('../../fixtures/slack-threads.json');
const meetFixture     = require('../../fixtures/meet-transcript.json');
const calFixture      = require('../../fixtures/calendar-event.json');

async function ingest() {
  const packets = await buildContext({
    slack:    slackFixture,
    meet:     meetFixture,
    calendar: calFixture,
  });
  return packets;
}

module.exports = { ingest };
```

## Acceptance criteria
- [ ] `node src/ingestion/index.js` prints N context packets to stdout
- [ ] Each packet has: chunkId, source, timestamp, participants, rawText
- [ ] rawText is human-readable formatted text (not JSON dump)
- [ ] Slack threads stay together (not split across chunks)
- [ ] Meet transcript produces at least 2 chunks (not one giant block)
- [ ] Calendar event appears as its own chunk
