/**
 * Slack Block Kit message builders + senders for the gates.
 * In mock mode (MOCK_EXTERNAL or no bot token) messages are rendered to the
 * console instead of posted, so the pipeline runs without a live Slack app.
 */
const config = require('../config');

const mockSlack = config.demo.mockExternal || !config.slack.botToken;

let webClient = null;
function getClient() {
  if (!webClient) {
    const { WebClient } = require('@slack/web-api');
    webClient = new WebClient(config.slack.botToken);
  }
  return webClient;
}

// ── Gate 1 (task review) blocks ──────────────────────────────────────────
function buildGate1Blocks(gateId, tasks) {
  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: '📋 Gate 1 — Review extracted tasks' },
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `${tasks.length} tasks extracted · gate \`${gateId}\`` }],
    },
    { type: 'divider' },
  ];

  tasks.forEach((task, idx) => {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          `*${task.title}*\n${task.description}\n` +
          `Assignee: ${task.assignee_hint || 'TBD'} · Priority: ${task.priority} · Source: ${task.source}`,
      },
      accessory: {
        type: 'overflow',
        action_id: `task_action_${idx}`,
        options: [
          { text: { type: 'plain_text', text: '✅ Approve this item' }, value: `approve_${gateId}_${idx}` },
          { text: { type: 'plain_text', text: '✏️ Edit' }, value: `edit_${gateId}_${idx}` },
          { text: { type: 'plain_text', text: '🗑 Remove' }, value: `remove_${gateId}_${idx}` },
        ],
      },
    });
  });

  blocks.push({
    type: 'actions',
    elements: [
      { type: 'button', text: { type: 'plain_text', text: 'Approve all ✅' }, style: 'primary', action_id: 'gate1_approve_all', value: gateId },
      { type: 'button', text: { type: 'plain_text', text: 'Reject all ❌' }, style: 'danger', action_id: 'gate1_reject_all', value: gateId },
    ],
  });

  return blocks;
}

// Edit modal opened on ✏️ Edit
function buildEditModal(gateId, idx, task) {
  return {
    type: 'modal',
    callback_id: `gate1_edit_${gateId}_${idx}`,
    title: { type: 'plain_text', text: 'Edit task' },
    submit: { type: 'plain_text', text: 'Save' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      { type: 'input', block_id: 'title', label: { type: 'plain_text', text: 'Title' }, element: { type: 'plain_text_input', action_id: 'value', initial_value: task.title } },
      { type: 'input', block_id: 'description', label: { type: 'plain_text', text: 'Description' }, element: { type: 'plain_text_input', action_id: 'value', multiline: true, initial_value: task.description } },
      { type: 'input', block_id: 'assignee_hint', optional: true, label: { type: 'plain_text', text: 'Assignee' }, element: { type: 'plain_text_input', action_id: 'value', initial_value: task.assignee_hint || '' } },
      {
        type: 'input',
        block_id: 'priority',
        label: { type: 'plain_text', text: 'Priority' },
        element: {
          type: 'static_select',
          action_id: 'value',
          initial_option: { text: { type: 'plain_text', text: task.priority }, value: task.priority },
          options: ['high', 'medium', 'low'].map((p) => ({ text: { type: 'plain_text', text: p }, value: p })),
        },
      },
    ],
  };
}

// ── console rendering for mock mode ──────────────────────────────────────
function renderTasksToConsole(label, tasks) {
  const lines = [`\n🔔 [Slack mock] ${label} — ${tasks.length} tasks:`];
  tasks.forEach((t, i) => {
    lines.push(
      `   ${i + 1}. ${t.title}  (${t.priority} · ${t.assignee_hint || 'TBD'} · ${t.source})`
    );
  });
  lines.push('   [Approve all ✅] [Reject all ❌]   ← auto-approving for demo');
  return lines.join('\n');
}

// ── senders ──────────────────────────────────────────────────────────────
async function sendGate1(gateState) {
  const blocks = buildGate1Blocks(gateState.gateId, gateState.tasks);
  if (mockSlack) {
    console.log(renderTasksToConsole('Gate 1 — task review', gateState.tasks));
    return { channel: config.slack.approvalChannel || 'mock-channel', ts: `mock-${gateState.gateId}` };
  }
  const res = await getClient().chat.postMessage({
    channel: config.slack.approvalChannel,
    text: `Gate 1 — review ${gateState.tasks.length} extracted tasks`,
    blocks,
  });
  return { channel: res.channel, ts: res.ts };
}

async function updateGate1(gateState) {
  if (mockSlack) return;
  await getClient().chat.update({
    channel: gateState.channelId,
    ts: gateState.messageTs,
    text: `Gate 1 — ${gateState.status}`,
    blocks: buildGate1Blocks(gateState.gateId, gateState.tasks),
  });
}

async function sendTimeoutNotice(channelId, gateId, reason = 'timeout') {
  const text = `⏰ Gate \`${gateId}\` auto-approved (${reason}).`;
  if (mockSlack) {
    console.log(`\n🔔 [Slack mock] ${text}`);
    return;
  }
  await getClient().chat.postMessage({ channel: channelId, text });
}

module.exports = {
  mockSlack,
  getClient,
  buildGate1Blocks,
  buildEditModal,
  sendGate1,
  updateGate1,
  sendTimeoutNotice,
};
