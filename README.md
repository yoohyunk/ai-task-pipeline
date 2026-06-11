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

See `.env.example`. With the defaults (`MOCK_EXTERNAL=true`) nothing is required
and the demo runs fully offline. Everything falls back to mock mode when missing.

## Switching from mock to live

The pipeline ships in mock mode so it runs with no keys. To hit real services,
edit `.env`:

| Want | Set | Also need |
|------|-----|-----------|
| Real Claude extraction | `MOCK_EXTERNAL=false` | `ANTHROPIC_API_KEY` |
| + real Jira tickets | `MOCK_EXTERNAL=false` | `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` |
| + real embedding dedup | `MOCK_EXTERNAL=false` | `GEMINI_API_KEY` |
| Wait for real Slack clicks | `GATE_AUTO_APPROVE=false` | Slack bot token + a running Bolt server (Socket Mode or a public endpoint via ngrok) for button callbacks |

`MOCK_EXTERNAL=false` makes `ANTHROPIC_API_KEY` mandatory; the other services
each fall back to mock independently if their keys are absent, so you can enable
them one at a time. The interactive Slack handlers live in
`src/slack/actions.js` and are wired through `createSlackApp()`.

```bash
# fastest live test — real Claude, everything else mock, gates auto-approve
MOCK_EXTERNAL=false ANTHROPIC_API_KEY=sk-ant-... npm run demo
```

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
