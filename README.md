# AI Task Pipeline

An **AI PM agent** that turns team conversations into tracked, reviewed work —
and closes the loop on the simple ones. It listens to your team (Slack / Meet /
calendar), drafts the tickets, dedups and assigns them, writes a codebase-grounded
PRD, then has an agent implement the easy ones and open a PR — with a human
approval gate at every step.

```
ingest (fixtures | live Slack) → extract (Claude) → Gate 1 · task review
   → dedup (Gemini) → Jira ticket + PRD → Gate 2 · ticket review
   → assign (named owner + live workload) → Gate 3
   → agent edits code (worktree) → GitHub PR → Gate 4 · PR review
        (request changes → agent revises → re-review) → merge → Jira Done
```

The agent has a 3-layer memory (fixed project context, cross-task lessons,
in-task rework log).

**Supervised autonomy** — four human gates (terminal, or interactive Slack
buttons + thread editing). Nothing ships without a click.

---

## What it does

- **Ingest** — synthetic fixtures, or **live Slack** (`conversations.history`, real names, threads)
- **Extract** — Claude forced tool use → action items (explicit *and* implicit)
- **Gate 1** — review the task list; in Slack, **edit it by replying in the thread** ("remove #3", "assign to bob")
- **Dedup** — JQL + Gemini embedding similarity (created / possible-dup / duplicate)
- **Jira** — create tickets with a **codebase-grounded PRD** (background / problem / requirements / acceptance criteria), set priority + assignee, transition status
- **Gate 2** — review tickets; **edit the PRD by replying in the thread** ("add a PagerDuty requirement to KAN-28")
- **Assign + Gate 3** — owner from the conversation (named-owner proxy) plus the assignee's **real open-issue load from Jira**; Gate 3 auto-skips when the owner is named and not overloaded
- **Agent** — for actionable tickets, edit the target code in an **isolated git worktree** (symbolic diff, or Claude-written), open a **real GitHub PR**, run multiple tickets **in parallel**
- **Gate 4 + rework loop** — review the PR; **request changes in plain language** → the agent revises the same branch (using its in-task memory) → re-review, up to 3 cycles; approve → **real merge** → Jira **Done**
- **3-layer memory** — fixed project context, cross-task lessons (embedded + retrieved), in-task rework log
- **Scheduled daemon** — read only new messages (watermark), business hours, overnight batched in the morning

## Quick start (offline, no keys)

```bash
npm install
cp .env.example .env        # nothing required in mock mode
npm run demo
```

Runs the whole flow on synthetic fixtures with `MOCK_EXTERNAL=true` (default) —
no real Slack/Jira/GitHub calls, gates in the terminal.

## Run modes

```bash
npm run demo        # interactive terminal gates (GATE_MODE=cli)
npm run demo:auto   # hands-off, gates auto-approve (quick run / CI)
npm run demo:slack  # live: real Slack ingest + services + Slack button gates
npm run watch       # scheduled daemon (incremental, business hours)
npm run reset:demo  # restore demo-app/ to baseline between real-merge runs
```

---

## Live end-to-end (real Slack → Jira → GitHub PR)

### 1. Keys (`.env`)

```
ANTHROPIC_API_KEY=        # Claude — extraction, PRD, agent, conversational edits
GEMINI_API_KEY=           # embedding dedup (free at aistudio.google.com)
JIRA_BASE_URL=            # https://your-site.atlassian.net
JIRA_EMAIL=
JIRA_API_TOKEN=           # id.atlassian.com/manage-profile/security/api-tokens
JIRA_PROJECT_KEY=         # your project key, e.g. KAN
SLACK_BOT_TOKEN=          # xoxb-…
SLACK_APP_TOKEN=          # xapp-…  (Socket Mode)
SLACK_APPROVAL_CHANNEL=   # channel ID, e.g. C0…
SLACK_INGEST_CHANNEL=     # optional — defaults to the approval channel
REDIS_URL=                # optional — defaults to redis://localhost:6379
```

Each service goes live only if its own key is present (set `MOCK_EXTERNAL=false`);
anything missing falls back to mock. So you can enable one service at a time.

### 2. Slack app (api.slack.com/apps)

- **Invite the bot** to the channel: `/invite @your-bot`
- **OAuth → Bot Token Scopes**: `chat:write`, `channels:history`, `channels:read`, `users:read`, `reactions:write`
- **Socket Mode**: ON → create App-Level Token (`xapp-…`, scope `connections:write`) → `SLACK_APP_TOKEN`
- **Interactivity**: ON (no Request URL needed with Socket Mode)
- **Event Subscriptions**: ON → subscribe to bot event **`message.channels`** (enables thread-reply editing)

### 3. GitHub

```bash
gh auth login              # so the agent can open/merge PRs in this repo
```

### 4. Run

```bash
# post your team conversation into the ingest channel, then:
CREATE_REAL_PR=true AGENT_TASK_LIMIT=2 npm run demo:slack
```

A single **run thread** appears in Slack; Gate 1 / 2 / 4 post as replies under it.
- **Gate 1/2**: click `Approve all`, or reply in the thread to edit (tasks / PRDs)
- **Gate 4**: click `Approve & merge` → the PR merges and the ticket moves to Done

> Real merges change `demo-app/` on `main`. Run `npm run reset:demo` before the
> next demo to restore the baseline (so symbolic edits produce real diffs again).

---

## Scheduled daemon

```bash
npm run watch
```

Keeps Socket Mode connected (buttons/edits work anytime) and runs the pipeline
on a schedule, reading **only new messages** since the last run (per-channel
watermark). Defaults: every 2h, weekdays 09:00–18:00 — overnight messages are
processed by the first morning tick. Empty ticks post nothing.

Tunables: `WATCH_INTERVAL_MS`, `WATCH_START_HOUR`, `WATCH_END_HOUR`, `WATCH_DAYS`.

**Deploy**: needs an always-on process (Socket Mode). Cheapest free options —
your own always-on machine + `pm2`, an Oracle Cloud Always-Free VM, or Fly.io;
pair with free [Upstash Redis](https://upstash.com) (`REDIS_URL`) so the
watermark + gate state survive restarts.

---

## Designed / not yet built

Honest about scope. These are designed (some partly coded) but not verified or not
done, so they are not claimed as working:

- **Live Google Meet ingestion** — a real Meet REST API path exists with a fixture
  fallback (`src/ingestion/meetLive.js`), but it is **not verified** against a real
  Workspace (no OAuth keys). The demo uses the fixture.
- **Interactive Slack Gate 3** — the workload signal currently surfaces in the
  terminal; it does not post an interactive Slack gate.
- **Level 2 identity delegation** — acting as the assignee via their own connected
  GitHub/Jira tokens. Designed (token vault + OAuth flow); current attribution is
  Level 1 (the service account acts and credits the person).
- **Team scale (multi-repo)** — one instance per repo, cross-repo read context, and
  Level 1 attribution are planned in [`docs/plans/phase-1-team-scale.md`](docs/plans/phase-1-team-scale.md).
  A coordinator for coordinated cross-repo changes ([Phase B](docs/plans/phase-B-coordinator.md))
  and contract tests for drift ([Phase 2](docs/plans/phase-2-contract-tests.md)) are
  design-only. Rationale: [`docs/team-scale-design.md`](docs/team-scale-design.md).
- **Skill-tag assignment** — only named-owner + workload are built.

## Config reference

| Flag | Default | Meaning |
|------|---------|---------|
| `MOCK_EXTERNAL` | `true` | mock all external services; `false` = live per available key |
| `INGEST_SOURCE` | `fixtures` | `fixtures` or `slack` (live channel) |
| `INGEST_WATERMARK` | `false` | read only new messages since last run (on for `watch`) |
| `GATE_MODE` | `auto` | `auto` (auto-approve) · `cli` (terminal) · `slack` (buttons) |
| `GATE_AUTO_APPROVE_MS` | `8000` | auto-approve delay in `auto` mode |
| `AGENT_MODE` | `symbolic` | `symbolic` (canned diffs) or `live` (Claude writes code) |
| `AGENT_TASK_LIMIT` | `1` | how many tickets the agent processes (in parallel) |
| `CREATE_REAL_PR` | `false` | open a real PR via `gh`, else mock |

---

## Layout

```
src/
  config.js          model constant + env + demo/agent flags
  ingestion/         fixtures + slackLive (watermark) + meetLive (live, unverified)
  extraction/        Claude tool use → tasks · prd.js (codebase-grounded PRD)
  dedup/             JQL + Gemini embedding dedup
  jira/              ticket create / update / transition / workload · ADF (incl. PRD)
  gates/             Gate 1/2/4 (cli·auto·slack) + Gate 3 (workload) + cli prompts
  slack/             Block Kit · Socket Mode actions · converse (thread edits) · run thread
  agent/             assign · executor (worktree, symbolic/live, rework) · editor · summarizer · memory (3-layer)
  github/            PR create + merge via gh (+ mock)
  state/             Redis-backed gate state · watermark (in-memory fallback)
  ui.js              terminal presentation
  orchestrator.js    wires all phases (agent stage runs in parallel)
  demo.js            one-shot entrypoint     watch.js  scheduled daemon
demo-app/            synthetic target codebase the agent edits
fixtures/            synthetic Slack / Meet / calendar data
demo/                copy-paste Slack conversations + meeting transcript (recording props)
docs/                portfolio narrative, team-scale design + phased plans, demo script
scripts/             reset-demo-app.js
plan/                original phase-by-phase build plan + spec
```

## Notes

- **Models**: Claude `claude-sonnet-4-6` (config constant); embeddings `gemini-embedding-001`.
- **Reliability**: external calls wrapped in try/catch + retry; secrets via env only.
- **Offline by default**: every external service has a mock fallback, so the full
  pipeline runs with no keys.
- A grounded write-up of what is verified vs designed is in
  [`portfolio.md`](portfolio.md); the architecture diagram is
  [`plan/how_it_works.svg`](plan/how_it_works.svg).
