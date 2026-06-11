# Phase B — Coordinated cross-repo changes (roadmap)

> Designed, not built. Build only after Phase 1 runs. This is the part to talk
> through in an interview rather than claim as working.

**Goal:** One item that must change several repos (a backend endpoint plus the
frontend that calls it) is decomposed, ordered, and dispatched, producing linked
PRs across repos.

**Spec:** `docs/team-scale-design.md` section 5 (Phase B).

## Why this is its own phase

Single-repo items never need coordination and flow through one per-repo instance.
A cross-repo item is the only thing that needs a shared coordinator, so it is
deliberately isolated here. Adding it before Phase 1 works would be over-design.

## New components

1. **Planner** — `src/coordinator/plan.js`. Given a cross-repo item and the
   registry, decompose it into per-repo subtasks and order them by the dependency
   graph (backend before frontend).
2. **Epic + child tickets** — `jira.createEpic` and `jira.linkIssues`. The parent
   epic represents the feature; each child is a per-repo subtask linked to it.
3. **Dispatcher** — `src/coordinator/dispatch.js`. Run each child in its owning
   repo's instance in dependency order; link the resulting PRs to the epic and to
   each other.
4. **Plan-review gate** — a human approves the cross-repo split before any agent
   runs. Each child PR still goes through Gate 4.

## Open design decision

The ordering contract. When backend-then-frontend, does the frontend subtask wait
for the backend PR to **merge**, or only for the backend's interface to be
**defined** and read as context (Phase 1's cross-repo read)? The first is safer
and slower; the second is faster but the frontend builds against an unmerged
contract. Decide this before building the dispatcher.

## Rough task outline (fill in when building)

- Planner: prompt + schema that emits ordered per-repo subtasks; tests on
  fixtures (a known cross-repo item → expected split).
- Epic/link helpers in `jira.js`; tests against the mock Jira store.
- Dispatcher state machine (pending → backend running → backend ready → frontend
  running → done), persisted in Redis so it survives restarts.
- The plan-review gate, reusing the existing gate + Slack thread machinery.
