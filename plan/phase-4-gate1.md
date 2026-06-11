# Phase 4 — Gate 1 (Task List Review)

## Goal
Send extracted tasks to Slack for human review. Block pipeline until
approved. Support approve / edit (modal) / remove per item. Timeout auto-approves.

## Deliverables
- `src/gates/gate1.js`
- `src/slack/notifier.js`     (Block Kit message builder)
- `src/slack/actions.js`      (Slack Bolt action handlers)
- `src/state/gateStore.js`    (Redis-backed gate state)

## Gate state schema (Redis key: `gate:{gateId}`)
```js
{
  gateId:    string,           // uuid
  type:      'gate1',
  status:    'pending' | 'approved' | 'rejected',
  tasks:     Task[],           // current task list (may be edited)
  createdAt: ISO string,
  timeoutAt: ISO string,       // createdAt + 24h
  approvedBy: string | null,
  messageTs:  string,          // Slack message ts for updating
  channelId:  string,
}
```

## Slack message structure (Block Kit)
One section block per task + overflow action menu:
```js
// Per task block
{
  type: 'section',
  text: {
    type: 'mrkdwn',
    text: `*${task.title}*\n${task.description}\nAssignee: ${task.assignee_hint || 'TBD'} · Priority: ${task.priority} · Source: ${task.source}`,
  },
  accessory: {
    type: 'overflow',
    action_id: `task_action_${idx}`,
    options: [
      { text: { type: 'plain_text', text: '✅ Approve this item' }, value: `approve_${idx}` },
      { text: { type: 'plain_text', text: '✏️ Edit'              }, value: `edit_${idx}`    },
      { text: { type: 'plain_text', text: '🗑 Remove'            }, value: `remove_${idx}`  },
    ],
  },
}

// Footer: approve all / reject all
{
  type: 'actions',
  elements: [
    { type: 'button', text: { type: 'plain_text', text: 'Approve all ✅' }, style: 'primary', action_id: 'gate1_approve_all', value: gateId },
    { type: 'button', text: { type: 'plain_text', text: 'Reject all ❌'  }, style: 'danger',  action_id: 'gate1_reject_all',  value: gateId },
  ],
}
```

## Edit modal (opened on ✏️ Edit)
```js
{
  type: 'modal',
  callback_id: `gate1_edit_${gateId}_${idx}`,
  title: { type: 'plain_text', text: 'Edit task' },
  submit: { type: 'plain_text', text: 'Save' },
  blocks: [
    { type: 'input', block_id: 'title',         label: { type: 'plain_text', text: 'Title'       }, element: { type: 'plain_text_input', initial_value: task.title       } },
    { type: 'input', block_id: 'description',   label: { type: 'plain_text', text: 'Description' }, element: { type: 'plain_text_input', multiline: true, initial_value: task.description } },
    { type: 'input', block_id: 'assignee_hint', label: { type: 'plain_text', text: 'Assignee'    }, element: { type: 'plain_text_input', initial_value: task.assignee_hint || '' } },
    // priority static_select
  ],
}
```

## Timeout handling
```js
// Check timeout on every gate poll
async function checkTimeout(gateId) {
  const state = await gateStore.get(gateId);
  if (state.status !== 'pending') return;
  if (new Date() > new Date(state.timeoutAt)) {
    await gateStore.update(gateId, { status: 'approved', approvedBy: 'timeout' });
    await notifier.sendTimeoutNotice(state.channelId, gateId);
  }
}
// Run via setInterval every 5 min, or on each action handler call
```

## src/gates/gate1.js interface
```js
/**
 * Run Gate 1. Sends Slack message, waits for approval.
 * Resolves with approved task list.
 * Rejects if explicitly rejected by human (not timeout).
 *
 * @param {Task[]} tasks
 * @returns {Promise<Task[]>} approved and possibly edited tasks
 */
async function runGate1(tasks) { ... }

module.exports = { runGate1 };
```

## Polling vs webhook
For the demo, use a simple polling loop (check Redis every 5s, max 24h):
```js
async function waitForGate(gateId, pollIntervalMs = 5000) {
  while (true) {
    await checkTimeout(gateId);
    const state = await gateStore.get(gateId);
    if (state.status === 'approved') return state.tasks;
    if (state.status === 'rejected') throw new GateRejectedError(gateId);
    await sleep(pollIntervalMs);
  }
}
```

## Acceptance criteria
- [ ] Slack message appears with all extracted tasks
- [ ] Overflow menu works: approve single / edit (modal) / remove
- [ ] "Approve all" resolves the gate and pipeline continues
- [ ] Edited tasks are saved back to Redis before approval
- [ ] After 24h with no action, gate auto-approves and notifies channel
- [ ] Gate state survives process restart (Redis, not in-memory)
