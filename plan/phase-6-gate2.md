# Phase 6 — Gate 2 (Ticket Review)

## Goal
After Jira tickets are created, send them to Slack for human confirmation.
Handle similarity warnings (0.85–0.90) with side-by-side comparison.
Block until approved. 4h timeout auto-approves.

## Deliverables
- `src/gates/gate2.js`
- Updates to `src/slack/notifier.js` (add Gate 2 message builder)
- Updates to `src/slack/actions.js` (add Gate 2 action handlers)

## Gate state schema (Redis key: `gate2:{gateId}`)
```js
{
  gateId:    string,
  type:      'gate2',
  status:    'pending' | 'approved' | 'rejected',
  tickets:   TicketResult[],   // array of dedupAndCreate results
  createdAt: ISO string,
  timeoutAt: ISO string,       // createdAt + 4h (shorter than gate1)
  approvedBy: string | null,
  messageTs:  string,
  channelId:  string,
}
```

## Slack message — normal ticket
```
*TASK-42 created* ✅
Fix session TTL and add keep-alive ping
Assignee: bob · Priority: High
<https://yourorg.atlassian.net/browse/TASK-42|View in Jira>
```
Actions: `Approve ✅` | `Edit in Jira 🔗` | `Delete ticket 🗑`

## Slack message — similarity warning (`created_with_warning`)
Show both tickets side by side with similarity score:
```
⚠️ *Possible duplicate detected* (87% similar)

*New ticket* — TASK-43
Fix session TTL and add keep-alive ping

*Existing ticket* — TASK-12
Session timeout issue on mobile browsers
<https://...TASK-12|View TASK-12>

What would you like to do?
```
Actions:
- `Keep separate ✅` — approve TASK-43 as distinct
- `Merge → TASK-12 🔗` — delete TASK-43, add comment on TASK-12
- `Delete TASK-43 🗑` — discard the new ticket

## Slack message — duplicate (`status: 'duplicate'`)
No ticket was created, just an info notice:
```
ℹ️ *Skipped (duplicate)* — 93% match with TASK-12
"Fix session TTL and add keep-alive ping"
→ Already tracked: <https://...TASK-12|TASK-12 — Session timeout issue>
```
No approval needed for duplicates — shown for visibility only.

## src/gates/gate2.js interface
```js
/**
 * Run Gate 2 for a batch of dedup results.
 * Resolves when all non-duplicate tickets are confirmed.
 *
 * @param {DedupResult[]} results  - array from dedupAndCreate()
 * @returns {Promise<DedupResult[]>} confirmed results (merges/deletes applied)
 */
async function runGate2(results) { ... }

module.exports = { runGate2 };
```

## Merge action handler
When user clicks "Merge → TASK-12":
1. Delete the new ticket via `DELETE /rest/api/3/issue/{newIssueKey}`
2. Add a comment on TASK-12:
   ```
   [AI pipeline] Similar task merged into this ticket:
   Original: "Fix session TTL and add keep-alive ping" (similarity: 87%)
   Source: slack #dev — 2024-03-14
   ```
3. Update gate state to approved
4. Update Slack message to show "Merged → TASK-12 ✅"

## Timeout handling
Same pattern as Gate 1 but 4h TTL:
```js
timeoutAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString()
```

## Acceptance criteria
- [ ] Gate 2 Slack message appears after ticket creation
- [ ] Normal tickets: approve/edit/delete actions work
- [ ] `created_with_warning`: side-by-side comparison shown with 3 action choices
- [ ] Merge action: deletes new ticket, adds comment on existing, resolves gate
- [ ] Duplicate notices appear as info-only (no approval required)
- [ ] 4h timeout auto-approves pending gate
- [ ] Gate state persists in Redis
