# Demo video script (~4-5 min)

Goal: show the working pipeline turning a real team conversation into tracked,
reviewed, executed work, with the design decisions visible. Honest scope: live
Slack, Jira, GitHub PR are real and verified. The meeting transcript is a fixture
prop. Gate 3's workload is a terminal signal, not an interactive block.

Narration (SAY) is written in plain English; adapt as needed.

---

## Before you record (setup)

- [ ] `.env` filled (Anthropic, Gemini, Jira, Slack bot + app token, channel); `gh auth login` done.
- [ ] `npm run reset:demo` (demo-app back to baseline).
- [ ] Clean Jira: delete prior `ai-generated` tickets (keep the `workload-seed` ones — erica is loaded for the Gate 3 moment).
- [ ] Confirm erica's load: she should have ~8 open `workload-seed` issues so Gate 3 flags her.
- [ ] Post the demo conversation into the ingest Slack channel (see below), as separate messages.
- [ ] Open tabs: terminal, the Slack channel, the Jira board, the GitHub repo, and `plan/how_it_works.svg`. Optionally a Google Doc with `demo/meeting-transcript.md` pasted in.
- [ ] Run command ready (do not run yet):
      `CREATE_REAL_PR=true AGENT_MODE=live AGENT_TASK_LIMIT=1 npm run demo:slack`

Demo conversation to post (assigns the work to erica, who is overloaded):

```
We still have no rate limiting on the API and it's a security risk — anyone can hammer the endpoints. Erica, can you add it?
On it, I'll add the rate limiter.
```

---

## Scene 0 — Hook + diagram (0:00–0:20)

- SCREEN: `plan/how_it_works.svg`.
- SAY: "Action items get raised across Slack and meetings and a lot of them never make it into a tracker. This is a prototype that reads those conversations, proposes the work, and lets a person approve at every step. For the simple ones it even opens the pull request. It runs on synthetic data; I built it on my own."

## Scene 1 — The source (0:20–0:45)

- SCREEN: the Slack channel with the posted conversation. Briefly show the Google Doc meeting prop.
- SAY: "Here's a real Slack thread. The pipeline can also read a meeting transcript and a calendar event. I'll run it against this channel live."

## Scene 2 — Ingest + extract (0:45–1:15)

- DO: run `CREATE_REAL_PR=true AGENT_MODE=live AGENT_TASK_LIMIT=1 npm run demo:slack`.
- SCREEN: terminal. Point at `ingest source: LIVE Slack channel` and the per-source task breakdown.
- SAY: "It reads the channel live, and Claude extracts the action items. Notice it's reading the real channel, not a fixture, and it credits where each task came from."

## Scene 3 — Gate 1, edited in Slack (1:15–2:00)

- SCREEN: the Gate 1 message in the Slack run thread.
- DO: reply in the thread, e.g. `make this high priority and assign it to erica` (or `keep just the rate limiting task`). Watch the message update.
- DO: click `Approve all`.
- SAY: "First human gate. Instead of a fixed set of buttons, I can just reply in the thread in plain language and the model applies the edit. The extractor over-produces on purpose, so this is where a person prunes. Then approve."

## Scene 4 — Dedup + Jira ticket with a PRD (2:00–2:35)

- SCREEN: the Jira board, open the created ticket.
- SAY: "It checks for duplicates in two passes, a keyword search then an embedding similarity, then creates the ticket. The body isn't a one-liner, it's a PRD the model grounded in the actual code. It read the real file and references the current values."

## Scene 5 — Gate 2, edit the PRD (2:35–3:00)

- SCREEN: the Gate 2 message in the thread.
- DO: reply `add a requirement to return HTTP 429 with a retry-after header`. Show the ticket's PRD update in Jira.
- DO: click `Approve all`.
- SAY: "Same idea at the ticket gate. I can refine the PRD by replying, and it updates the real Jira ticket."

## Scene 6 — Gate 3 workload signal (3:00–3:20)

- SCREEN: terminal, the Gate 3 line.
- SAY: "Assignment has two signals. Confidence is just a proxy for whether the conversation named an owner. The workload is real: it queries the assignee's open issue count from Jira. Erica is already loaded, so the gate does not auto-skip the assignment. In a fuller build that prompts a reassignment; here it surfaces the signal."

## Scene 7 — Agent, PR, and the rework loop (3:20–4:10)

- SCREEN: terminal, then the GitHub PR.
- SAY: "Now the agent. It works in an isolated git worktree, makes the change, and opens a real pull request."
- SCREEN: the Gate 4 message in the thread.
- DO: reply `change the limit to 50 requests per minute`. Watch the agent revise.
- SAY: "At the PR gate I can request changes in plain language. The agent revises the same branch, and it remembers what it already tried across the revision."
- DO: when the new review posts, click `Approve & merge`.
- SCREEN: the PR merging, the commit diff.
- SAY: "Approve, and it merges for real."

## Scene 8 — Done (4:10–4:30)

- SCREEN: Jira board (ticket now Done) and the merged PR.
- SAY: "The ticket moves to Done, and the agent saves a short lesson from this task so a similar one next time starts with it."

## Scene 9 — The evolution (4:30–5:00)

- SCREEN: `docs/team-scale-design.md` or the diagram.
- SAY: "To take this to a team with several repos, I'd run one instance per repo, keep writes single-repo but let the agent read a neighboring repo for context, and attribute tickets and PRs to the assignee, falling back to acting as them for whoever connects their accounts. Coordinated cross-repo changes need a small coordinator on top, which I designed but didn't build. That's the part I'd talk through rather than claim as working."

---

## After you record (cleanup)

- [ ] Close/delete the demo PR and its branch: `gh pr close <n> --delete-branch`.
- [ ] Delete the run's `ai-generated` Jira tickets.
- [ ] `npm run reset:demo` (demo-app back to baseline).
- [ ] Keep or remove the `workload-seed` tickets depending on whether you'll re-record.

## Honesty reminders (so the video matches the code)

- The meeting transcript is a fixture/prop. Do not claim live Google Meet; that
  path is implemented but unverified.
- Gate 3 surfaces the workload signal in the terminal; it does not interactively
  block in Slack (no Slack Gate 3 UI was built).
- Everything else shown (live Slack read, Jira create/update/transition, the PRD,
  the real PR, the rework loop, the merge, the memory) is real and verified.
