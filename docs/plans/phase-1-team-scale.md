# Phase 1 — Team scale (executable)

> REQUIRED SUB-SKILL: use superpowers:executing-plans or subagent-driven-development.
> Steps use checkbox (`- [ ]`) syntax. This phase is buildable end to end.

**Goal:** Run the pipeline per repo, let the agent read a neighboring repo for
context, and attribute tickets and PRs to the assignee (Level 1).

**Spec:** `docs/team-scale-design.md`. **Stack:** Node.js + built-in `node:test`.

---

## Task 0: Test runner

**Files:** Modify `package.json`; Create `test/registry.test.js`

- [ ] **Step 1:** add `"test": "node --test test/"` to package.json scripts.
- [ ] **Step 2:** add a smoke test:

```js
const { test } = require('node:test');
const assert = require('node:assert');
test('node:test runs', () => { assert.equal(1 + 1, 2); });
```

- [ ] **Step 3:** Run `npm test` (expect 1 passing).
- [ ] **Step 4:** `git add package.json test/ && git commit -m "test: add node:test runner"`.

## Task 1: Repo registry

**Files:** Create `repos.json`, `src/registry.js`, `test/registry.test.js`

- [ ] **Step 1 — failing test:**

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { getRepo } = require('../src/registry');
test('getRepo returns the entry for REPO_ID', () => {
  const r = getRepo('frontend', { frontend: { channel: 'C1', jiraProject: 'FE', remote: 'org/fe', dependsOn: ['backend'] } });
  assert.equal(r.jiraProject, 'FE');
  assert.deepEqual(r.dependsOn, ['backend']);
});
test('getRepo throws on unknown id', () => { assert.throws(() => getRepo('nope', {})); });
```

- [ ] **Step 2:** `npm test` — expect FAIL (no `../src/registry`).
- [ ] **Step 3 — implement** `src/registry.js`:

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

`repos.json`:

```json
{
  "backend":  { "channel": "C_BACKEND",  "jiraProject": "BE", "remote": "org/backend",  "dependsOn": [],          "roster": "roster.json" },
  "frontend": { "channel": "C_FRONTEND", "jiraProject": "FE", "remote": "org/frontend", "dependsOn": ["backend"], "roster": "roster.json" }
}
```

- [ ] **Step 4:** `npm test` (pass) and commit.

## Task 2: Select the repo from config

**Files:** Modify `src/config.js`; Test `test/config-repo.test.js`

- [ ] **Step 1 — test:** with `REPO_ID=frontend` and a `repos.json` fixture,
  `config.slack.ingestChannel === 'C_FRONTEND'` and `config.jira.project === 'FE'`.
- [ ] **Step 2:** run, expect fail.
- [ ] **Step 3 — implement:** in `config.js`, when `process.env.REPO_ID` is set,
  call `getRepo(REPO_ID)` and override `slack.ingestChannel`, `jira.project`, and add
  `config.repo = { id, remote, dependsOn }`. With `REPO_ID` unset, keep today's
  single-repo behavior.
- [ ] **Step 4:** run (pass), commit.

## Task 3: Agent targets a configurable repo

**Files:** Modify `src/agent/executor.js`; Create `src/agent/workspace.js`; Test `test/workspace.test.js`

- [ ] **Step 1 — test:** `ensureWorkspace({ id:'t', remote:<local bare repo> })`
  returns a path containing the repo's files.
- [ ] **Step 2:** run, expect fail.
- [ ] **Step 3 — implement** `ensureWorkspace`: `git clone` if absent, else
  `git fetch && git checkout main && git pull`; return the path under
  `.workspaces/<id>`. Point the executor's worktree base at this path when
  `config.repo` is set; keep `demo-app` as the fallback for the no-`REPO_ID` demo.
- [ ] **Step 4:** run (pass), commit.

## Task 4: Cross-repo read context

**Files:** Create `src/agent/crossRepoContext.js`; Modify `src/agent/executor.js`; Test `test/crossRepoContext.test.js`

- [ ] **Step 1 — test:** given a dependency workspace with `routes/api.js`,
  `gatherDependencyContext({ dependsOn:['backend'] })` returns a string containing
  that file's contents.
- [ ] **Step 2:** run, expect fail.
- [ ] **Step 3 — implement** `gatherDependencyContext`: for each dependency, ensure
  its workspace (Task 3), read interface globs (default
  `['**/routes/**','**/*.openapi.*','**/types/**']`, size-capped), return a labeled
  block. Append it to the prompt in `executor.liveRewrite`.
- [ ] **Step 4:** run (pass), commit.

## Task 5: Team roster

**Files:** Create `roster.json`, `src/roster.js`; Test `test/roster.test.js`

- [ ] **Step 1 — test:** `resolve('erica')` returns
  `{ jiraAccountId, githubLogin, gitName, gitEmail }`; unknown returns `null`.
- [ ] **Step 2:** run, expect fail.
- [ ] **Step 3 — implement** a lookup over `roster.json`, matching by name/alias
  (case-insensitive):

```json
{
  "erica":  { "jiraAccountId": "712020:xxxx", "githubLogin": "yoohyunk", "gitName": "Erica Kim", "gitEmail": "erica@example.com" },
  "angelo": { "jiraAccountId": "712020:yyyy", "githubLogin": "angelo",   "gitName": "Angelo A.", "gitEmail": "angelo@example.com" }
}
```

- [ ] **Step 4:** run (pass), commit.

## Task 6: Identity L1 — Jira reporter attribution

**Files:** Modify `src/jira/jira.js`; Test `test/jira-attribution.test.js`

- [ ] **Step 1 — test:** with a stubbed roster, `buildFields({ assignee_hint:'erica', ... })`
  includes `reporter: { id: '712020:xxxx' }` and `assignee: { accountId: '712020:xxxx' }`.
- [ ] **Step 2:** run, expect fail.
- [ ] **Step 3 — implement:** extract `buildFields(task)` in `jira.js`; set `reporter`
  from `roster.resolve(task.assignee_hint).jiraAccountId` when present. Comment the
  "Modify Reporter" permission requirement.
- [ ] **Step 4:** run (pass), commit.

## Task 7: Identity L1 — PR git author + co-author

**Files:** Modify `src/agent/executor.js`, `src/github/pr.js`; Test `test/pr-attribution.test.js`

- [ ] **Step 1 — test:** `buildBody(ticket, summary, ..., { gitName:'Erica Kim', gitEmail:'erica@example.com' })`
  contains `Co-authored-by: Erica Kim <erica@example.com>`.
- [ ] **Step 2:** run, expect fail.
- [ ] **Step 3 — implement:** in the executor commit, pass
  `--author="<gitName> <gitEmail>"` from the roster; in `buildBody`, append the
  `Co-authored-by` trailer when an author is provided.
- [ ] **Step 4:** run (pass), commit.

## Task 8: Wire roster attribution through the orchestrator

**Files:** Modify `src/orchestrator.js`

- [ ] **Step 1:** resolve `roster.resolve(ticket.assignee_hint)` in `processTicket`
  and thread it into `executeTask` / `createPR`.
- [ ] **Step 2 — manual verify:** run one live ticket with `CREATE_REAL_PR=true` for
  a roster member; confirm the Jira reporter is the person and the PR commit is
  authored by them.
- [ ] **Step 3:** commit.

---

Designed but not in this phase: Level 2 delegation (token vault + OAuth),
skill-tag assignment. See the design doc.
