/**
 * Slack Bolt action handlers for the gates.
 *
 * These wire interactive buttons/overflow menus/modals to gate state in Redis.
 * They are only exercised when a Bolt app is actually running (real interactive
 * mode). The demo path uses GATE_AUTO_APPROVE and never starts a server, but
 * the handlers exist so the architecture is complete and a public endpoint
 * (or Socket Mode) can be wired up later.
 */
const config = require('../config');
const store = require('../state/gateStore');
const notifier = require('./notifier');

const gate1Key = (id) => `gate:${id}`;

// "approve_<gateId>_<idx>" -> { verb, gateId, idx }
function parseOverflow(value) {
  const m = /^(approve|edit|remove)_(.+)_(\d+)$/.exec(value);
  if (!m) return null;
  return { verb: m[1], gateId: m[2], idx: Number(m[3]) };
}

/**
 * Register Gate 1 handlers on a Bolt app instance.
 * @param {import('@slack/bolt').App} app
 */
function registerGate1Actions(app) {
  // Approve all
  app.action('gate1_approve_all', async ({ ack, body, action }) => {
    await ack();
    const gateId = action.value;
    const next = await store.update(gate1Key(gateId), {
      status: 'approved',
      approvedBy: body.user?.id || 'user',
    });
    if (next) await notifier.updateGate1(next);
  });

  // Reject all
  app.action('gate1_reject_all', async ({ ack, body, action }) => {
    await ack();
    const gateId = action.value;
    const next = await store.update(gate1Key(gateId), {
      status: 'rejected',
      approvedBy: body.user?.id || 'user',
    });
    if (next) await notifier.updateGate1(next);
  });

  // Per-task overflow: approve / edit / remove
  app.action(/^task_action_\d+$/, async ({ ack, body, action, client }) => {
    await ack();
    const selected = parseOverflow(action.selected_option?.value || '');
    if (!selected) return;
    const { verb, gateId, idx } = selected;
    const state = await store.get(gate1Key(gateId));
    if (!state) return;

    if (verb === 'edit') {
      await client.views.open({
        trigger_id: body.trigger_id,
        view: notifier.buildEditModal(gateId, idx, state.tasks[idx]),
      });
      return;
    }

    if (verb === 'remove') {
      const tasks = state.tasks.filter((_, i) => i !== idx);
      const next = await store.update(gate1Key(gateId), { tasks });
      if (next) await notifier.updateGate1(next);
      return;
    }

    if (verb === 'approve') {
      // single-item approve is a no-op on the list; full approval happens via
      // "Approve all". Marking is left to the operator clicking Approve all.
      await notifier.updateGate1(state);
    }
  });

  // Edit modal submit: save edited task back to Redis
  app.view(/^gate1_edit_(.+)_(\d+)$/, async ({ ack, view, body }) => {
    await ack();
    const m = /^gate1_edit_(.+)_(\d+)$/.exec(view.callback_id);
    if (!m) return;
    const gateId = m[1];
    const idx = Number(m[2]);
    const state = await store.get(gate1Key(gateId));
    if (!state) return;

    const v = view.state.values;
    const edited = {
      ...state.tasks[idx],
      title: v.title.value.value,
      description: v.description.value.value,
      assignee_hint: v.assignee_hint.value.value || null,
      priority: v.priority.value.selected_option.value,
    };
    const tasks = state.tasks.map((t, i) => (i === idx ? edited : t));
    const next = await store.update(gate1Key(gateId), { tasks });
    if (next) await notifier.updateGate1(next);
  });
}

const gate2Key = (id) => `gate2:${id}`;

// "<gateId>_<idx>" -> { gateId, idx }
function parseGate2Value(value) {
  const m = /^(.+)_(\d+)$/.exec(value || '');
  if (!m) return null;
  return { gateId: m[1], idx: Number(m[2]) };
}

/**
 * Register Gate 2 handlers on a Bolt app instance.
 * @param {import('@slack/bolt').App} app
 */
function registerGate2Actions(app) {
  // Approve all remaining tickets
  app.action('gate2_approve_all', async ({ ack, body, action }) => {
    await ack();
    const next = await store.update(gate2Key(action.value), {
      status: 'approved',
      approvedBy: body.user?.id || 'user',
    });
    if (next) await notifier.updateGate2(next);
  });

  // Per-ticket approve / keep-separate are no-ops on the list (kept as-is)
  app.action(/^gate2_(approve|keep)_\d+$/, async ({ ack }) => {
    await ack();
  });

  // Delete a ticket
  app.action(/^gate2_delete_\d+$/, async ({ ack, action }) => {
    await ack();
    const parsed = parseGate2Value(action.value);
    if (!parsed) return;
    const state = await store.get(gate2Key(parsed.gateId));
    if (!state) return;
    const t = state.tickets[parsed.idx];
    if (t && t.issue?.key) {
      const jira = require('../jira/jira');
      await jira.deleteIssue(t.issue.key);
      t._removed = true;
    }
    await store.set(gate2Key(parsed.gateId), state);
    await notifier.updateGate2(state);
  });

  // Merge new ticket into the existing similar one
  app.action(/^gate2_merge_\d+$/, async ({ ack, action }) => {
    await ack();
    const parsed = parseGate2Value(action.value);
    if (!parsed) return;
    const { applyMerge } = require('../gates/gate2');
    const state = await applyMerge(parsed.gateId, parsed.idx);
    if (state) await notifier.updateGate2(state);
  });
}

/**
 * Create a Bolt app (only used in real interactive mode). Returns null in mock
 * mode or when credentials are missing.
 */
function createSlackApp() {
  if (notifier.mockSlack || !config.slack.signingSecret) return null;
  const { App } = require('@slack/bolt');
  const app = new App({
    token: config.slack.botToken,
    signingSecret: config.slack.signingSecret,
  });
  registerGate1Actions(app);
  registerGate2Actions(app);
  return app;
}

module.exports = { registerGate1Actions, registerGate2Actions, createSlackApp };
