# Phase 1 — Project Scaffold + Synthetic Fixtures

## Goal
Runnable project skeleton with all dependencies installed and synthetic data
ready to feed into the pipeline.

## Deliverables
- `task-pipeline/` directory initialized (git init, npm init)
- All dependencies installed
- `.env.example` with every required key
- `src/config.js` with MODEL constant + env validation
- `fixtures/` folder with synthetic data files

## Directory structure after this phase
```
task-pipeline/
├── src/
│   └── config.js
├── fixtures/
│   ├── slack-threads.json
│   ├── meet-transcript.json
│   └── calendar-event.json
├── .env.example
├── .env                  (gitignored)
├── .gitignore
├── package.json
└── README.md
```

## Dependencies to install
```bash
npm install @anthropic-ai/sdk @google/generative-ai @redis/client \
            axios dotenv @slack/bolt
npm install --save-dev nodemon
```

## src/config.js
```js
require('dotenv').config();

const config = {
  claude: {
    model: 'claude-sonnet-4-6',          // single constant, swap here only
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
  },
  jira: {
    baseUrl: process.env.JIRA_BASE_URL,
    email:   process.env.JIRA_EMAIL,
    token:   process.env.JIRA_API_TOKEN,
    project: process.env.JIRA_PROJECT_KEY || 'TASK',
  },
  slack: {
    botToken:      process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    approvalChannel: process.env.SLACK_APPROVAL_CHANNEL,
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
};

// fail fast if critical keys are missing
const required = ['ANTHROPIC_API_KEY'];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing required env var: ${key}`);
}

module.exports = config;
```

## Synthetic fixtures

### fixtures/slack-threads.json
Two threads — one with explicit task, one with implicit.
```json
[
  {
    "channel": "#dev",
    "timestamp": "2024-03-14T10:00:00Z",
    "thread": [
      { "user": "alice", "text": "The login timeout bug is still happening on mobile safari. Users are getting logged out after 5 mins.", "ts": "1710410400.000" },
      { "user": "bob",   "text": "Yeah I saw that too. We need to increase the session TTL and add a keep-alive ping.", "ts": "1710410460.000" },
      { "user": "alice", "text": "Bob can you take that? It's blocking the demo next week.", "ts": "1710410520.000" },
      { "user": "bob",   "text": "On it.", "ts": "1710410580.000" }
    ]
  },
  {
    "channel": "#infra",
    "timestamp": "2024-03-14T14:30:00Z",
    "thread": [
      { "user": "carol", "text": "Staging DB is running out of disk, we're at 87% capacity.", "ts": "1710426600.000" },
      { "user": "dave",  "text": "We should probably clean up the old migration snapshots and set up an alert at 80%.", "ts": "1710426660.000" },
      { "user": "carol", "text": "Agreed. And probably worth bumping the volume too before the next release.", "ts": "1710426720.000" }
    ]
  },
  {
    "channel": "#product",
    "timestamp": "2024-03-14T16:00:00Z",
    "thread": [
      { "user": "eve",   "text": "We decided in the meeting to go with the new onboarding flow for v2.", "ts": "1710432000.000" },
      { "user": "frank", "text": "Great. Someone needs to update the Figma specs and brief the frontend team.", "ts": "1710432060.000" },
      { "user": "eve",   "text": "I can do the Figma update, can you brief frontend Frank?", "ts": "1710432120.000" },
      { "user": "frank", "text": "Sure.", "ts": "1710432180.000" }
    ]
  }
]
```

### fixtures/meet-transcript.json
```json
{
  "meeting": "Sprint Planning — Week 11",
  "date": "2024-03-14T09:00:00Z",
  "participants": ["alice", "bob", "carol", "dave"],
  "transcript": [
    { "speaker": "alice", "text": "Let's talk about the auth service refactor. We haven't merged that PR yet and it's been sitting for two weeks." },
    { "speaker": "bob",   "text": "I know, I still need to add integration tests before it can go in. I'll get to it by end of week." },
    { "speaker": "carol", "text": "Also the API rate limiting we discussed last sprint — that's still not implemented. It's a security risk." },
    { "speaker": "dave",  "text": "I can pick that up. Should probably document the limits in the API docs too once it's done." },
    { "speaker": "alice", "text": "Good. One more thing — the error monitoring dashboard hasn't been updated since we switched to the new logger. It's showing wrong data." },
    { "speaker": "bob",   "text": "That's on me, I'll fix the dashboard config this sprint." }
  ]
}
```

### fixtures/calendar-event.json
```json
{
  "id": "evt_001",
  "title": "Q2 Planning — Engineering",
  "start": "2024-03-15T10:00:00Z",
  "end": "2024-03-15T11:30:00Z",
  "attendees": ["alice", "bob", "carol", "dave", "eve"],
  "description": "Review Q2 roadmap. Topics: API v2 launch readiness, infra scaling plan, onboarding flow redesign, security audit follow-up items."
}
```

## Acceptance criteria
- [ ] `node -e "require('./src/config.js')"` exits 0 with ANTHROPIC_API_KEY set
- [ ] All fixture files load cleanly with `JSON.parse`
- [ ] `.env.example` documents every key used in config.js
