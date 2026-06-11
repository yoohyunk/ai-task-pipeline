# Team-scale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:executing-plans or
> subagent-driven-development to implement Phase 1 task by task. Steps use
> checkbox (`- [ ]`) syntax. Phases B and 2 are roadmap only, not executable here.

**Goal:** Evolve the single-repo prototype so a team can run it per repo, attribute
tickets and PRs to the assignee, and let the agent read a neighboring repo for
context.

**Architecture:** One instance per repo (write is single-repo). A small registry
maps a repo to its channel, Jira project, dependencies, and team roster. The agent
pulls a dependency repo's interface as read-only context. Identity is Level 1
attribution (service account acts, person is credited), with Level 2 delegation
left as a designed extension.

**Tech stack:** Node.js, built-in `node:test` runner (no new dependency), the
existing Anthropic / Gemini / Slack / Jira / gh / Redis stack.

Spec: `docs/team-scale-design.md`.

---

## Phase 1 (executable)

### Task 0: Test runner

**Files:**
- Create: `test/registry.test.js`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Add a test script**

In `package.json` scripts, add:

```json
"test": "node --test test/"
```

- [ ] **Step 2: Add a smoke test**

`test/registry.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');

test('node:test runs', () => {
  assert.equal(1 + 1, 2);
});
```

- [ ] **Step 3: Run it**

Run: `npm test`
Expected: 1 test passing.

- [ ] **Step 4: Commit**

```bash
git add package.json test/registry.test.js
git commit -m "test: add node:test runner"
```

### Task 1: Repo registry

A repo's wiring (channel, Jira project, git remote, dependencies, roster) lives in
one place, selected by `REPO_ID`.

**Files:**
- Create: `repos.json`, `src/registry.js`, `test/registry.test.js`

- [ ] **Step 1: Write the failing test**

`test/registry.test.js` (replace the smoke test):

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { getRepo } = require('../src/registry');

test('getRepo returns the entry for REPO_ID', () => {
  const r = getRepo('frontend', { frontend: { channel: 'C1', jiraProject: 'FE', remote: 'org/fe', dependsOn: ['backend'] } });
  assert.equal(r.jiraProject, 'FE');
  assert.deepEqual(r.dependsOn, ['backend']);
});

test('getRepo throws on unknown id', () => {
  assert.throws(() => getRepo('nope', {}));
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `npm test`
Expected: FAIL (cannot find `../src/registry`).

- [ ] **Step 3: Implement**

`src/registry.js`:

```js
const fs = require('fs');
const path = require('path');

function loadAll() {
  const p = path.resolve(__dirname, '..', 'repos.json');
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {};
}

function getRepo(repoId, all = loadAll()) {
  const entry = all[repoId];
  if (!entry) throw new Error(`Unknown REPO_ID: ${repoId}`);
  return entry;
}

module.exports = { getRepo, loadAll };
```

`repos.json` (example):

```json
{
  "backend":  { "channel": "C_BACKEND",  "jiraProject": "BE", "remote": "org/backend",  "dependsOn": [],          "roster": "roster.json" },
  "frontend": { "channel": "C_FRONTEND", "jiraProject": "FE", "remote": "org/frontend", "dependsOn": ["backend"], "roster": "roster.json" }
}
```

- [ ] **Step 4: Run it, expect pass. Commit.**

```bash
npm test && git add src/registry.js repos.json test/registry.test.js && git commit -m "feat: repo registry keyed by REPO_ID"
```

### Task 2: Select the repo from config

`config.js` resolves the active repo from `REPO_ID` so ingest channel, Jira
project, and the agent's target repo all come from the registry instead of being
hardcoded.

**Files:**
- Modify: `src/config.js` (add a `repo` block sourced from the registry when
  `REPO_ID` is set)
- Test: `test/config-repo.test.js`

- [ ] **Step 1: Test** — with `REPO_ID=frontend` and a `repos.json` fixture,
  `config.slack.ingestChannel === 'C_FRONTEND'` and `config.jira.project === 'FE'`.
- [ ] **Step 2: Run, expect fail.**
- [ ] **Step 3: Implement** — in `config.js`, if `process.env.REPO_ID`, call
  `getRepo(REPO_ID)` and override `slack.ingestChannel`, `jira.project`, and a new
  `config.repo = { id, remote, dependsOn }`. When `REPO_ID` is unset, keep today's
  single-repo behavior.
- [ ] **Step 4: Run, expect pass. Commit.**

### Task 3: Agent targets a configurable repo

Today the executor edits `demo-app/` in this repo. Generalize it to clone/check
out the active repo (`config.repo.remote`) into a workspace and edit there, so an
instance can own a real repo.

**Files:**
- Modify: `src/agent/executor.js` (resolve the working repo from `config.repo`
  rather than the hardcoded `REPO_ROOT`/`demo-app`)
- Create: `src/agent/workspace.js` (clone-or-update a repo into `.workspaces/<id>`)
- Test: `test/workspace.test.js` (clone a local bare repo fixture, assert the
  working copy exists)

- [ ] **Step 1: Test** — `ensureWorkspace({id:'t', remote:<local bare repo>})`
  returns a path that contains the repo's files.
- [ ] **Step 2: Run, expect fail.**
- [ ] **Step 3: Implement** `ensureWorkspace`: `git clone` if absent, else
  `git fetch && git checkout main && git pull`; return the path. Point the
  executor's worktree base at this path when `config.repo` is set; keep the
  `demo-app` path as the fallback for the no-`REPO_ID` demo.
- [ ] **Step 4: Run, expect pass. Commit.**

### Task 4: Cross-repo read context

When the active repo declares `dependsOn`, pull the dependency repo's interface
files into the agent prompt.

**Files:**
- Create: `src/agent/crossRepoContext.js`
- Modify: `src/agent/executor.js` (include the context in `liveRewrite`)
- Test: `test/crossRepoContext.test.js`

- [ ] **Step 1: Test** — given a dependency workspace containing `routes/api.js`,
  `gatherDependencyContext({dependsOn:['backend']})` returns a string containing
  that file's contents.
- [ ] **Step 2: Run, expect fail.**
- [ ] **Step 3: Implement** `gatherDependencyContext`: for each dependency, ensure
  its workspace (Task 3), read a configured set of interface globs (default
  `['**/routes/**','**/*.openapi.*','**/types/**']`, capped in size), and return a
  labeled block. In `executor.liveRewrite`, append the block to the prompt.
- [ ] **Step 4: Run, expect pass. Commit.**

### Task 5: Team roster

Map a person to their attribution identities.

**Files:**
- Create: `roster.json`, `src/roster.js`
- Test: `test/roster.test.js`

- [ ] **Step 1: Test** — `resolve('erica')` returns
  `{ jiraAccountId, githubLogin, gitName, gitEmail }`; unknown returns `null`.
- [ ] **Step 2: Run, expect fail.**
- [ ] **Step 3: Implement** a lookup over `roster.json`, matching by name or alias
  (case-insensitive). `roster.json` example:

```json
{
  "erica":  { "jiraAccountId": "712020:xxxx", "githubLogin": "yoohyunk", "gitName": "Erica Kim", "gitEmail": "erica@example.com" },
  "angelo": { "jiraAccountId": "712020:yyyy", "githubLogin": "angelo",   "gitName": "Angelo A.", "gitEmail": "angelo@example.com" }
}
```

- [ ] **Step 4: Run, expect pass. Commit.**

### Task 6: Identity L1 — Jira reporter attribution

The created ticket shows the assignee as reporter, not the operator.

**Files:**
- Modify: `src/jira/jira.js` (`createTicket` sets `reporter` from the roster)
- Test: `test/jira-attribution.test.js`

- [ ] **Step 1: Test** — with a stubbed roster, the fields object built for
  `createTicket({assignee_hint:'erica', ...})` includes
  `reporter: { id: '712020:xxxx' }` and `assignee: { accountId: '712020:xxxx' }`.
  (Test the field-builder, not a live call: extract `buildFields(task)` so it is
  unit-testable.)
- [ ] **Step 2: Run, expect fail.**
- [ ] **Step 3: Implement** — extract `buildFields(task)` in `jira.js`; set
  `reporter` from `roster.resolve(task.assignee_hint).jiraAccountId` when present.
  Document the "Modify Reporter" permission requirement in a comment.
- [ ] **Step 4: Run, expect pass. Commit.**

### Task 7: Identity L1 — PR git author + co-author

The PR's commit is authored by the assignee, and the PR body credits them.

**Files:**
- Modify: `src/agent/executor.js` (commit with the person's git author)
- Modify: `src/github/pr.js` (`buildBody` adds a `Co-authored-by` trailer)
- Test: `test/pr-attribution.test.js`

- [ ] **Step 1: Test** — `buildBody(ticket, summary, ..., { gitName:'Erica Kim', gitEmail:'erica@example.com' })`
  contains `Co-authored-by: Erica Kim <erica@example.com>`.
- [ ] **Step 2: Run, expect fail.**
- [ ] **Step 3: Implement** — in the executor commit, pass
  `--author="<gitName> <gitEmail>"` (from the roster) to `git commit`. In
  `buildBody`, append the `Co-authored-by` trailer when an author is provided.
- [ ] **Step 4: Run, expect pass. Commit.**

### Task 8: Wire roster attribution through the orchestrator

**Files:**
- Modify: `src/orchestrator.js` (resolve the roster entry once per ticket; pass it
  to `executeTask`/`createPR`)
- Test: covered by Tasks 6 and 7 unit tests; manual end-to-end check below.

- [ ] **Step 1:** resolve `roster.resolve(ticket.assignee_hint)` in `processTicket`
  and thread it into the executor and PR creation.
- [ ] **Step 2: Manual verify** — run one live ticket with `CREATE_REAL_PR=true`
  for a roster member; confirm the Jira reporter is the person and the PR commit
  is authored by them.
- [ ] **Step 3: Commit.**

---

## Phase B (roadmap, not executed here): coordinated cross-repo changes

Build only after Phase 1 runs. New pieces:

1. A planner (`src/coordinator/plan.js`) that, given a cross-repo item and the
   registry, decomposes it into per-repo subtasks and orders them by the
   dependency graph.
2. A parent epic plus linked child tickets (`jira.linkIssues`).
3. A dispatcher that runs each child in its owning repo's instance in order and
   links the resulting PRs.
4. A plan-review gate before any agent runs.
5. Resolve the ordering contract: frontend waits for the backend PR to merge,
   versus only for the backend interface to be defined and read as context.

## Phase 2 (roadmap): contract tests for cross-repo drift

Generate a consumer-driven contract test from the backend interface that the
frontend runs in CI, so drift the agent introduces is caught. Standard API-first
pattern applied to the split repos.

## Designed, not in any executable task

Level 2 delegation (per-user OAuth token vault and connect flow) and skill-tag
based assignment. See `docs/team-scale-design.md` sections 4.4 and 6.
