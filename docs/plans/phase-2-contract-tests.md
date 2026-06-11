# Phase 2 — Contract tests for cross-repo drift (roadmap)

> Designed, not built. Follows Phase B.

**Goal:** Once the backend and frontend are split across repos, keep them from
drifting by treating the backend interface as a contract and generating a
consumer-driven contract test the frontend runs in CI.

**Spec:** `docs/team-scale-design.md` section 5 (Phase 2).

## Why

The agent edits one repo at a time. When it changes a backend endpoint, nothing
forces the frontend to stay in sync. This is the standard microservices problem,
so the standard answer applies: API-first / consumer-driven contracts. Encoding
it here means drift the agent introduces is caught in CI rather than at runtime.

## Shape

1. Derive the contract from the backend interface (the same surface Phase 1 reads
   for cross-repo context: routes, types, an OpenAPI spec).
2. Generate a consumer-driven contract test for the frontend that asserts the
   calls it makes match the contract.
3. Run it in the frontend's CI. A backend change that breaks the contract fails
   the frontend's check, which the rework loop (Gate 4) can then act on.

## Rough task outline (fill in when building)

- A contract extractor over the backend's declared interface globs.
- A generator that emits the frontend contract test (framework TBD by the target
  repo's stack).
- CI wiring in the frontend repo; a failing contract surfaces as PR feedback the
  agent revises against.
