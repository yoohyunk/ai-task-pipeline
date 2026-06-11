# AI Task Pipeline

Ingest team conversations (Slack, Meet, calendar), extract action items with
Claude, run them through human approval gates, dedup against existing work, and
create Jira tickets — end to end.

```
ingest (fixtures | live Slack) → extract (Claude) → Gate 1 (review)
   → dedup (Gemini) → Jira create → Gate 2 (review)
   → assign → Gate 3 → agent edits demo-app → GitHub PR → Gate 4 (review) → Jira Done
```

Gates run in the terminal (`cli`), auto-approve (`auto`), or as interactive
Slack buttons (`slack`, via Socket Mode — no ngrok).

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

## Run modes

```bash
npm run demo        # interactive terminal gates (GATE_MODE=cli)
npm run demo:auto   # hands-off, gates auto-approve (good for a quick run / CI)
npm run demo:slack  # live: read real Slack, real services, Slack button gates
```

## Real end-to-end usage (live Slack → Jira → GitHub PR)

Runs against your actual Slack channel, real Claude/Gemini/Jira, interactive
Slack buttons, and opens a real GitHub PR.

**One-time setup**

1. `.env` — fill `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `JIRA_BASE_URL/EMAIL/API_TOKEN`,
   `JIRA_PROJECT_KEY` (your project key, e.g. `KAN`), `SLACK_BOT_TOKEN`,
   `SLACK_APPROVAL_CHANNEL`.
2. Slack app (api.slack.com/apps):
   - Invite the bot to the channel: `/invite @your-bot`
   - Bot scopes: `chat:write`, `channels:history`, `channels:read`, `users:read`
   - **Socket Mode** ON → create App-Level Token (`xapp-…`, scope `connections:write`)
     → add as `SLACK_APP_TOKEN` in `.env`; turn **Interactivity** ON
3. `gh auth login` so the agent can open PRs in this repo.

**Run**

```bash
# 1. Post your team conversation into the ingest channel
#    (defaults to SLACK_APPROVAL_CHANNEL; set SLACK_INGEST_CHANNEL for a separate one)
# 2. Run live, opening real PRs for up to 2 tickets:
CREATE_REAL_PR=true AGENT_TASK_LIMIT=2 npm run demo:slack
```

Then in Slack: click **Approve all** on Gate 1 and Gate 2, and **Approve & merge**
on each Gate 4 (agent PR) message. Buttons only respond while the process is
running. The terminal shows the active ingest source so you can confirm it's
reading live Slack (`ingest source: LIVE Slack channel …`).

Flags you can mix: `INGEST_SOURCE=slack|fixtures`, `GATE_MODE=cli|auto|slack`,
`CREATE_REAL_PR=true|false`, `AGENT_MODE=symbolic|live`, `AGENT_TASK_LIMIT=N`,
`MOCK_EXTERNAL=true|false`.

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
| Interactive Slack buttons | `GATE_MODE=slack` | Slack bot token + `SLACK_APP_TOKEN` (Socket Mode — no ngrok) |
| Read your real Slack channel | `INGEST_SOURCE=slack` | bot in channel + `channels:history` scope |
| Open real GitHub PRs | `CREATE_REAL_PR=true` | `gh auth login` |

With `MOCK_EXTERNAL=false`, each service goes live **only if its own
credentials are present** and otherwise falls back to mock — so you can enable
them one at a time (e.g. real Jira while extraction stays mock). No key is
strictly required; you just get a warning if you run live without a Claude key.
The interactive Slack handlers live in `src/slack/actions.js` and are wired
through `createSlackApp()`.

Example — real Jira only, everything else mock:

```bash
# fill JIRA_* in .env, then:
MOCK_EXTERNAL=false npm run demo
```

```bash
# fastest live test — real Claude, everything else mock, gates auto-approve
MOCK_EXTERNAL=false ANTHROPIC_API_KEY=sk-ant-... npm run demo
```

## Layout

```
src/
  config.js          model constant + env + demo/agent flags
  ingestion/         normalize sources → context packets (fixtures + slackLive)
  extraction/        Claude forced tool use → tasks (+ mock)
  gates/             Gate 1/2/4 review (cli / auto / slack) + Gate 3 + cli prompts
  slack/             Block Kit builders + Socket Mode action handlers
  state/             Redis-backed gate state (in-memory fallback)
  dedup/             JQL + Gemini embedding dedup
  jira/              ticket create / transition / ADF
  agent/             assign · execute (symbolic/live) · summarize · memory(stub)
  github/            PR creation via gh (+ mock)
  ui.js              terminal presentation helpers
  orchestrator.js    wires all phases
  demo.js            entrypoint (starts Socket Mode app in slack gate mode)
demo-app/            synthetic target codebase the agent edits
fixtures/            synthetic Slack / Meet / calendar data
demo/                copy-paste Slack conversations for recording
plan/                phase-by-phase build plan + spec
```

## Build plan

Phase docs live in [`plan/`](./plan/). See [`plan/README.md`](./plan/README.md)
for the phase overview.
