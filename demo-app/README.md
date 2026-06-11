# demo-app

A tiny synthetic application that the AI agent modifies when it "executes" a
Jira ticket. This is **not** the pipeline's own code — it's a stand-in target
codebase so the agent → PR → Gate 4 flow has real files to change.

Files map to the topics in `fixtures/`:

| File | Topic |
|------|-------|
| `config.js` | session TTL / keep-alive (login timeout bug) |
| `db.js` | staging DB disk alert |
| `rateLimit.js` | API rate limiting |
| `monitoring.js` | error monitoring dashboard |
