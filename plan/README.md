# AI Task Pipeline — Phase Plan

## Overview

| Phase | Name | Key deliverable | Demo critical |
|-------|------|-----------------|---------------|
| 1 | Scaffold + Fixtures | Project skeleton, synthetic data | ✅ |
| 2 | Ingestion | Context packets from fixtures | ✅ |
| 3 | Extraction | Claude tool use, task list | ✅ |
| 4 | Gate 1 | Slack task review + approval | ✅ |
| 5 | Dedup + Jira | Tickets created | ✅ |
| 6 | Gate 2 | Ticket confirmation + similarity UI | ✅ |
| 7 | Stubs | Agent / memory / PR / Gates 3+4 stubs | architecture only |
| 8 | Orchestrator | `npm run demo` end-to-end | ✅ |

## Build order
Phases are sequential — each depends on the previous.
Phases 7 and 8 can be worked in parallel once Phase 6 is done.

## Files per phase
- `phase-1-scaffold.md`
- `phase-2-ingestion.md`
- `phase-3-extraction.md`
- `phase-4-gate1.md`
- `phase-5-dedup-jira.md`
- `phase-6-gate2.md`
- `phase-7-stubs.md`
- `phase-8-orchestrator.md`

## Demo scope (Phase 1–6 + 8)
Core path runs end-to-end on synthetic fixtures:

```
fixtures → ingest → extract → Gate 1 (Slack) → dedup → Jira create → Gate 2 (Slack)
```

Downstream (agent, PR, Gates 3/4) is stubbed and visible in the codebase
but does not need to run for the demo recording.

## Environment variables needed for demo
```
ANTHROPIC_API_KEY    required — Claude extraction
GEMINI_API_KEY       required — embedding dedup
JIRA_BASE_URL        required — ticket creation
JIRA_EMAIL           required
JIRA_API_TOKEN       required
JIRA_PROJECT_KEY     optional — defaults to TASK
SLACK_BOT_TOKEN      required — Gate 1 + Gate 2 messages
SLACK_SIGNING_SECRET required
SLACK_APPROVAL_CHANNEL required
REDIS_URL            optional — defaults to redis://localhost:6379
```
