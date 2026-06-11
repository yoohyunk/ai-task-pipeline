# AI Task Pipeline

Ingest team conversations (Slack, Meet, calendar), extract action items with
Claude, run them through human approval gates, dedup against existing work, and
create Jira tickets — end to end.

```
fixtures → ingest → extract (Claude) → Gate 1 (Slack)
        → dedup → Jira create → Gate 2 (Slack)
        → [agent · PR · Gates 3/4 — stubbed]
```

## Quick start

```bash
npm install
cp .env.example .env      # fill in ANTHROPIC_API_KEY (+ optional Gemini/Jira/Slack/Redis)
npm run demo
```

The demo runs the full core path on synthetic fixtures. With `MOCK_EXTERNAL=true`
(default) and `GATE_AUTO_APPROVE=true` (default) it runs offline end-to-end —
only `ANTHROPIC_API_KEY` is strictly required. Provide real keys to hit live
Slack / Jira / Gemini.

## Environment

See `.env.example`. Required: `ANTHROPIC_API_KEY`. Everything else is optional
and falls back to mock mode when missing.

## Layout

```
src/
  config.js          model constant + env + demo flags
  ingestion/         normalize sources → context packets
  extraction/        Claude forced tool use → tasks
  gates/             Gate 1/2 (Slack review) + Gate 3/4 stubs
  slack/             Block Kit message builders + action handlers
  state/             Redis-backed gate state
  dedup/             JQL + Gemini embedding dedup
  jira/              ticket creation + ADF
  agent/             assign / execute / memory / summarize (stubs)
  github/            PR creation (stub)
  orchestrator.js    wires all phases
  demo.js            `npm run demo` entrypoint
fixtures/            synthetic Slack / Meet / calendar data
plan/                phase-by-phase build plan + spec
```

## Build plan

Phase docs live in [`plan/`](./plan/). See [`plan/README.md`](./plan/README.md)
for the phase overview.
