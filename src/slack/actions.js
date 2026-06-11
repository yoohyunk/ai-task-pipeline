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
  return app;
}

module.exports = { registerGate1Actions, createSlackApp };
