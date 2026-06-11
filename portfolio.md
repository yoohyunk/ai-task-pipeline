# AI Task Pipeline

A prototype that reads team conversations (Slack threads, a meeting transcript,
a calendar event), extracts the action items with an LLM, and turns the approved
ones into deduplicated Jira tickets with a generated PRD. A person approves at
each step. For the simple tickets, an agent makes the code change, opens a pull
request, and revises it from review feedback. I built this on my own to test the
idea. It is not deployed and runs on synthetic data.

## Motivation

Action items get raised in passing across Slack, meetings, and calendar invites,
and a lot of them never make it into a tracker. I wanted to see whether an LLM
could watch those surfaces, propose the work it found, and let a person approve
before anything became a ticket.

## Key design decisions

The reasoning matters more than the feature list, so here is why each piece works
the way it does.

**Source-specific chunking.** Each source has a different natural unit, so I chunk
each one differently instead of running one splitter over everything. A Slack
thread is already a coherent unit, so I keep each thread together (the live reader
also groups un-threaded messages by a 30-minute window). A meeting is one long
transcript that buries several items, so I split it into topic segments on
transition cues like "also" and "one more thing", with a token cap and a safeguard
that never emits a single giant block. A calendar event is one atomic item, so it
becomes one chunk with the description and attendees merged in. A uniform chunker
would either cut a thread in half and lose the back-and-forth that makes an item
clear, or hand the model a whole transcript as one blob so several items collapse
into one.

**Full-context LLM judgment, no keyword pre-filter.** I pass the whole chunk to
the model and ask for implicit items as well as explicit ones, with no regex gate
in front. Most action items are implicit. "We still haven't merged that PR", "that
is a security risk", and "the dashboard is showing wrong data" are all work, and
none of them say "TODO" or "please". A keyword filter keys on the surface form and
drops exactly the items a person would also miss. The cost is more model calls and
a real chance of over-extraction, which is why there is a human gate right after.

**Two-layer dedup, keyword then embedding.** Before creating a ticket I check for
an existing one in two passes. Layer 1 is a JQL keyword search over open issues:
fast, free, and it narrows the field. Layer 2 embeds the new task and each
candidate and compares them by cosine similarity, with thresholds: at or above
0.90 I treat it as a duplicate and skip creation, 0.85 to 0.90 I create it but
flag it for the human at the next gate, below 0.85 I create it normally. Two
layers because embedding every open ticket on every task is slow and costs money,
so the cheap keyword pass narrows to a few candidates and only those get embedded.
Embeddings because titles get reworded ("fix session timeout" versus "users get
logged out too fast") and keyword overlap alone misses semantic duplicates.
Embeddings run on Gemini, not Claude, because Claude has no embedding model.
Results are cached in Redis so a ticket is not re-embedded.

**Blocking human gates with timeouts.** The pipeline stops and waits for a person
at each gate and does not proceed until they approve. This is deliberate. The
extractor over-produces on purpose, so a person prunes false positives before
anything becomes a ticket, and again before tickets are acted on. Making the gate
blocking is what enforces the ordering: the pipeline cannot create Jira tickets
from an unreviewed extraction. Each gate has a timeout that auto-approves so a
forgotten review does not wedge the pipeline forever (24 hours for the task list,
4 hours for tickets). The same gate runs in the terminal, auto-approves for an
offline run, or posts to Slack as interactive buttons.

**Structured extraction via tool use.** I get structured output by forcing a tool
call whose input schema is the task schema, instead of asking for "JSON only" and
parsing the reply. Asking a model for raw JSON is fragile: it adds prose, code
fences, or a trailing comma, and the parse breaks. Forcing a tool call makes the
model fill a typed schema, so the output is structured by construction with no
brittle parsing step. A guard throws if no tool-use block comes back.

The decisions below are downstream of the core path and show the same thinking.

**Isolated git worktrees for parallel agents.** When more than one ticket is
actionable the agents run in parallel, and each does its edit, commit, and push
inside its own git worktree rather than checking out a branch in the shared
working directory. A shared working directory cannot hold two branches at once, so
parallel agents would stomp each other. A worktree gives each agent an isolated
checkout, so they never collide and the main working directory is never left on a
feature branch.

**Conversational editing in Slack threads.** Rather than build a button or a modal
form for every kind of edit, I let a reviewer reply in the gate's Slack thread in
plain language ("drop the third task", "add a PagerDuty requirement to that
ticket's PRD") and have the model apply it. A fixed set of buttons can only express
the edits I anticipated. A thread reply can express anything, and the model maps it
onto the task list or the ticket. Replies route to whichever gate is open.

**Three memory layers, each for a different lifetime.** The agent's memory is split
by how long the information needs to live. Layer 1 is fixed project context that
never changes between tasks. Layer 2 is lessons that persist across tasks: after a
task is done the model extracts a few reusable notes, embeds them, and stores them,
and a new task retrieves the most similar ones. Layer 3 is the in-task log that
only matters within one task, used by the rework loop so each revision sees what
was already tried and what the reviewer asked for, and it gets compressed when it
grows too long. Splitting them this way scopes each retrieval to the right horizon
instead of dumping everything into one context.

## Stack

Node.js, no web framework. Claude via the Anthropic SDK (`claude-sonnet-4-6`) for
extraction, the PRD, the agent edits, and the conversational edits. Gemini via the
Google Generative AI SDK (`gemini-embedding-001`) for dedup embeddings. Slack Bolt
in Socket Mode for the interactive gates. The Jira REST v3 API over axios. The
GitHub CLI (`gh`) for pull requests. Redis for gate state, the embedding cache,
the lesson store, and the ingestion watermark. Every external service has a
deterministic mock fallback, so the whole pipeline runs offline with no keys.

## What runs, and what is limited

Working and verified to run:

- Ingestion from synthetic fixtures, and live ingestion from a real Slack channel
  (history plus thread replies, real display names, incremental by watermark).
- Source-specific chunking.
- Extraction via forced tool use, with a deterministic offline fallback.
- Gate 1 task review in the terminal, auto, or Slack, including thread editing.
- Two-layer dedup with the thresholds above, Redis caching, offline mock embedding.
- Jira ticket creation with a codebase-grounded PRD, plus update and status
  transitions; ticket and PRD editing from a Slack thread reply.
- Gate 2 ticket review, the similarity-warning comparison, and the merge action.
- Rule-based assignment and Gate 3 (auto-skips when confidence is high).
- Agent execution in isolated worktrees, in parallel, opening a real GitHub PR.
- Gate 4 PR review with a rework loop: request changes, the agent revises on the
  same branch from feedback, re-review, up to three cycles, then a real merge and
  a Jira transition to Done.
- Three-layer agent memory, all wired in.
- A scheduled daemon that reads only new messages during business hours.

Limited or simplified, stated plainly:

- The agent only edits a small synthetic target app in the repo, not arbitrary
  real repositories.
- In symbolic mode the agent's revision step only records the feedback rather than
  reasoning about it. The intelligent revision is the live mode, where Claude
  rewrites the file.
- Assignment picks the owner by a rule (the name the conversation gave), so the
  0.9/0.4 confidence is a proxy for "was an owner named", not a calibrated score.
  The workload signal next to it is real: the assignee's live open-issue count
  from Jira. Skill-tag matching from the original spec is not built, and the
  thresholds are placeholders for where a calibrated assignment model would plug
  in.
- No real metrics: it is a prototype on synthetic data.

## Architecture

The diagram (`plan/how_it_works.svg`) shows the full loop: ingest, extract,
Gate 1, dedup, Jira, Gate 2, assign, Gate 3, agent edit, PR, Gate 4, merge, with
the three-layer memory feeding the agent. The core path through Gate 2 is the part
I would point to first. The agent stage beyond it is implemented and was exercised
against real Slack, Jira, and GitHub during development, but it acts on a synthetic
target app, so I treat it as a working extension rather than a production feature.

## Discrepancies to reconcile

For my own reconciliation across the diagram, a resume line, and this write-up:

1. An earlier version of this spec listed the agent executor, PR creation, gates 3
   and 4, and the 3-layer memory as stubbed. The code now implements all of them.
   If a more conservative story is wanted, scope the claim to the core path through
   Gate 2 and call the rest design.
2. Meet chunking is by transition-cue regex plus a token cap, not by silence gap as
   the diagram and spec say. A text transcript has no silence markers.
3. The 30-minute-window grouping for Slack exists only in the live reader for
   un-threaded messages; the fixture chunker keeps each thread as one chunk.
4. The embedding model is `gemini-embedding-001` (3072-dim), not the spec's retired
   `text-embedding-004` (768-dim). Cosine is dimension-agnostic, so behavior holds.
5. Assignment selects the owner by rule (named-owner proxy, 0.9/0.4 confidence,
   not a calibrated score) and reads a real Jira workload signal (open-issue
   count). Skill-tag matching is not built; the thresholds are placeholders for a
   calibrated model.
6. `plan/claude-code-session-prompt.md` still contains the string "Orbit Sales" (in
   an instruction to remove it). If the repo is shared with reviewers, scrub that
   file so there is no client reference anywhere.
7. The package name is `task-pipeline`; the working directory is `ai-task-manager`.
