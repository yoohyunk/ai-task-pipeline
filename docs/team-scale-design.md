# Team-scale evolution — design

How the single-operator prototype evolves into something a team with several
repos can use, with tickets and PRs attributed to the assigned person. This is a
design document. Phase 1 is buildable; the rest is designed and labeled as such.

## 1. Baseline (what exists today)

One process, one `.env`, one Slack channel mapped to one Jira project and one
repo, and one operator's credentials. State keys are global (`gate:`, `emb:`,
`lessons`, `watermark:`). Tickets are created with the operator's Jira token and
PRs with the operator's `gh` auth. So nothing is attributed to the person the
work belongs to, and there is no notion of more than one project.

## 2. Goal

A team running several repos (for example a backend and a frontend) should be
able to point the pipeline at all of them, have each ticket and PR attributed to
the assignee, and have the agent understand enough of a neighboring repo to do
its work. Memory should not bleed across projects.

## 3. Core decisions

### 3.1 Instance per repo, not a shared multi-tenant system

Run one instance of the pipeline per repo, each watching that repo's channel,
rather than building one system that namespaces every team's data. Separate
processes and configs make tenancy isolation, per-project memory, and per-repo
routing fall out for free. The cost is N deployments to run and no built-in
cross-project view, which the next two decisions address. For a team with a
handful of repos this is simpler and the isolation is stronger than shared state.

### 3.2 Write is single-repo, read is cross-repo

"A repo owns its writes" and "an agent can read other repos" are different
things. A frontend task commits to the frontend repo (single-repo write), but it
may need to read the backend repo to call a new endpoint correctly (cross-repo
read). So each instance owns one repo's writes, and the agent pulls relevant
slices of a declared dependency repo (routes, types, an OpenAPI surface) into its
prompt as read-only context. This keeps the instance-per-repo model while solving
"the frontend needs to see the backend to call it."

### 3.3 Identity: hybrid attribution then delegation

See section 4. Default to attributing work to the person (cheap, no per-user
auth). Upgrade to acting as the person for those who connect their accounts.

### 3.4 A coordinator only for coordinated cross-repo changes

A single item that must change two repos (backend endpoint plus the frontend
that calls it) needs a thin coordinator above the per-repo instances. Single-repo
items never touch it. See section 5, Phase B.

## 4. Identity: ticket attribution and PR attribution

The hard part of "the assignee creates the ticket and the PR" is that acting as a
person requires that person's credentials. We split it into two levels and fall
back automatically.

### 4.1 Two levels

- **Level 1, attribution (default).** A service account does the action but
  attributes it to the person. No per-user auth. Always available.
- **Level 2, delegation (opt-in).** The person connects their GitHub and Jira
  once, and the pipeline acts with their token, so the platform records them as
  the real author. Used only for people who have connected.

### 4.2 Ticket creation (Jira)

- **L1:** the service account creates the ticket and sets `reporter` and
  `assignee` to the resolved person, so Jira shows them as the reporter and owner.
  The recorded creator is the service account. Requires the service account to
  have the "Modify Reporter" permission.
- **L2:** if the person has connected Jira (3-legged OAuth), create the ticket
  with their access token, so Jira records them as the actual creator. Fall back
  to L1 if they have not connected or the token is stale.

### 4.3 PR creation (GitHub)

- **L1:** the agent makes the commit with the person's name and email as the git
  author, so GitHub shows the commit as authored by them, and adds a
  `Co-authored-by: <person>` trailer. The branch is pushed and the PR is opened by
  the service identity (a bot account or a GitHub App). The PR is clearly marked
  as agent-created and credits the person.
- **L2:** if the person has connected GitHub, push and open the PR with their
  user token (or a GitHub App user-to-server token), so GitHub records them as the
  PR author. Fall back to L1.

### 4.4 Token vault and connect flow (for L2)

A per-user token store, encrypted at rest, keyed by the person's identity in the
team roster. A one-time "connect your accounts" flow: the pipeline DMs the person
a link, they authorize GitHub and Jira with the minimal scopes, and the tokens
(with refresh) land in the vault. The pipeline refreshes them and revokes on
request.

### 4.5 Resolution logic

At assignment time: resolve the assignee in the team roster, check the vault. If
connected tokens exist, use Level 2 for that person; otherwise Level 1. The two
paths produce the same ticket and PR, differing only in the recorded actor. This
is what makes the hybrid safe: the system never blocks on someone not having
connected.

## 5. Phases

### Phase 1 (buildable now)

- Per-repo instance: the registry maps a repo to its channel, Jira project, and
  team roster, and an instance runs against one repo.
- Cross-repo read context: declare repo dependencies; the agent pulls the
  dependency repo's relevant interface files into its prompt.
- Identity Level 1 attribution for tickets and PRs (reporter, assignee, git
  author, co-author trailer).
- Level 2 delegation can follow for connected users without changing the flow.

### Phase B (designed, not built): coordinated cross-repo changes

For an item that spans repos: a planning step decomposes it into per-repo
subtasks, orders them by the dependency graph (backend before frontend), creates
a parent epic with linked child tickets, dispatches each child to the owning
repo's instance in order, and links the resulting PRs. A new gate lets a person
approve the cross-repo split before any agent runs; each PR still goes through the
PR review gate. The open design question is the ordering contract: whether the
frontend subtask waits for the backend PR to merge, or only for the backend's
interface to be defined and read as context.

### Phase 2 (designed, not built): contract tests for cross-repo drift

To keep the backend and frontend from drifting after they are split, treat the
backend's interface as a contract and generate a consumer-driven contract test
the frontend runs in CI. This is the standard API-first / consumer-driven
contract pattern from microservices, applied to catch drift the agent might
introduce.

## 6. Explicitly not built

Phase B (the coordinator), Phase 2 (contract tests), Level 2 delegation (the
token vault and OAuth flows), and skill-tag based assignment. These are designed
here and would be described as design, not as working code.

## 7. How this maps to the prototype

The current prototype is the single-instance, single-repo, operator-identity
case. This document is the evolution narrative: what changes to reach team scale,
what is cheap (instance per repo, read context, attribution), and what is real
engineering deferred behind a clear interface (delegation, the coordinator,
contract tests).
