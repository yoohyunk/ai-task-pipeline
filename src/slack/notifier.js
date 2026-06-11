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
// When status !== 'pending' the gate is resolved: drop all buttons and show a
// result banner so it can't be clicked again.
function buildGate1Blocks(gateId, tasks, status = 'pending', approvedBy) {
  const resolved = status !== 'pending';
  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: '📋 Gate 1 — Review extracted tasks' },
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `${tasks.length} tasks · gate \`${gateId}\`` }],
    },
  ];

  if (resolved) {
    const by = approvedBy ? ` by <@${approvedBy}>` : '';
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: status === 'approved' ? `✅ *Approved*${by}` : `❌ *Rejected*${by}`,
      },
    });
  }
  blocks.push({ type: 'divider' });

  tasks.forEach((task, idx) => {
    const section = {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          `*${task.title}*\n${task.description}\n` +
          `Assignee: ${task.assignee_hint || 'TBD'} · Priority: ${task.priority} · Source: ${task.source}`,
      },
    };
    if (!resolved) {
      section.accessory = {
        type: 'overflow',
        action_id: `task_action_${idx}`,
        options: [
          { text: { type: 'plain_text', text: '✅ Approve this item' }, value: `approve_${gateId}_${idx}` },
          { text: { type: 'plain_text', text: '✏️ Edit' }, value: `edit_${gateId}_${idx}` },
          { text: { type: 'plain_text', text: '🗑 Remove' }, value: `remove_${gateId}_${idx}` },
        ],
      };
    }
    blocks.push(section);
  });

  if (!resolved) {
    blocks.push({
      type: 'actions',
      elements: [
        { type: 'button', text: { type: 'plain_text', text: 'Approve all ✅' }, style: 'primary', action_id: 'gate1_approve_all', value: gateId },
        { type: 'button', text: { type: 'plain_text', text: 'Reject all ❌' }, style: 'danger', action_id: 'gate1_reject_all', value: gateId },
      ],
    });
  }

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

// ── Gate 2 (ticket review) blocks ────────────────────────────────────────
function pct(score) {
  return `${Math.round(score * 100)}%`;
}

function buildGate2TicketBlocks(gateId, ticket, idx, resolved = false) {
  // Skipped duplicate — info only, no actions
  if (ticket.status === 'duplicate') {
    return [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            `ℹ️ *Skipped (duplicate)* — ${pct(ticket.score)} match with ${ticket.issue.key}\n` +
            `"${ticket.issue.summary}"\n→ Already tracked: <${issueUrlSafe(ticket.issue.key)}|${ticket.issue.key}>`,
        },
      },
    ];
  }

  // Possible duplicate — side-by-side comparison + 3 choices
  if (ticket.status === 'created_with_warning') {
    const b = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            `⚠️ *Possible duplicate detected* (${pct(ticket.similarTo.score)} similar)\n\n` +
            `*New ticket* — ${ticket.issue.key}\n${ticket.issue.summary}\n\n` +
            `*Existing ticket* — ${ticket.similarTo.key}\n` +
            `<${issueUrlSafe(ticket.similarTo.key)}|View ${ticket.similarTo.key}>`,
        },
      },
    ];
    if (!resolved) {
      b.push({
        type: 'actions',
        elements: [
          { type: 'button', text: { type: 'plain_text', text: 'Keep separate ✅' }, style: 'primary', action_id: `gate2_keep_${idx}`, value: `${gateId}_${idx}` },
          { type: 'button', text: { type: 'plain_text', text: `Merge → ${ticket.similarTo.key} 🔗` }, action_id: `gate2_merge_${idx}`, value: `${gateId}_${idx}` },
          { type: 'button', text: { type: 'plain_text', text: 'Delete 🗑' }, style: 'danger', action_id: `gate2_delete_${idx}`, value: `${gateId}_${idx}` },
        ],
      });
    }
    return b;
  }

  // Normal created ticket
  const b = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          `*${ticket.issue.key} created* ✅\n${ticket.issue.summary}\n` +
          `<${issueUrlSafe(ticket.issue.key)}|View in Jira>`,
      },
    },
  ];
  if (!resolved) {
    b.push({
      type: 'actions',
      elements: [
        { type: 'button', text: { type: 'plain_text', text: 'Approve ✅' }, style: 'primary', action_id: `gate2_approve_${idx}`, value: `${gateId}_${idx}` },
        { type: 'button', text: { type: 'plain_text', text: 'Delete ticket 🗑' }, style: 'danger', action_id: `gate2_delete_${idx}`, value: `${gateId}_${idx}` },
      ],
    });
  }
  return b;
}

function buildGate2Blocks(gateId, tickets, status = 'pending') {
  const resolved = status !== 'pending';
  const created = tickets.filter((t) => t.status !== 'duplicate').length;
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: '🎫 Gate 2 — Review created tickets' } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `${created} tickets created · gate \`${gateId}\`` }] },
  ];
  if (resolved) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: '✅ *Confirmed*' } });
  }
  blocks.push({ type: 'divider' });
  tickets.forEach((t, idx) => {
    blocks.push(...buildGate2TicketBlocks(gateId, t, idx, resolved));
    blocks.push({ type: 'divider' });
  });
  if (!resolved) {
    blocks.push({
      type: 'actions',
      elements: [
        { type: 'button', text: { type: 'plain_text', text: 'Approve all ✅' }, style: 'primary', action_id: 'gate2_approve_all', value: gateId },
      ],
    });
  }
  return blocks;
}

// issue URL without importing jira (avoid cycle): build from config
function issueUrlSafe(key) {
  const mock = config.demo.mockExternal || !config.jira.token || !config.jira.baseUrl;
  const base = mock ? 'https://mock.atlassian.net' : config.jira.baseUrl;
  return `${base}/browse/${key}`;
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
    blocks: buildGate1Blocks(gateState.gateId, gateState.tasks, gateState.status, gateState.approvedBy),
  });
}

function renderGate2ToConsole(tickets) {
  const lines = ['\n🔔 [Slack mock] Gate 2 — ticket review:'];
  tickets.forEach((t) => {
    if (t.status === 'duplicate') {
      lines.push(`   ℹ️ skipped (duplicate ${pct(t.score)}) "${t.issue.summary}" → ${t.issue.key}`);
    } else if (t.status === 'created_with_warning') {
      lines.push(
        `   ⚠️ ${t.issue.key} created — possible dup (${pct(t.similarTo.score)}) vs ${t.similarTo.key}` +
          '  [Keep separate ✅] [Merge 🔗] [Delete 🗑]'
      );
    } else {
      lines.push(`   ✅ ${t.issue.key} created — ${t.issue.summary}`);
    }
  });
  lines.push('   [Approve all ✅]   ← auto-approving for demo');
  return lines.join('\n');
}

async function sendGate2(gateState) {
  const blocks = buildGate2Blocks(gateState.gateId, gateState.tickets);
  if (mockSlack) {
    console.log(renderGate2ToConsole(gateState.tickets));
    return { channel: config.slack.approvalChannel || 'mock-channel', ts: `mock-${gateState.gateId}` };
  }
  const created = gateState.tickets.filter((t) => t.status !== 'duplicate').length;
  const res = await getClient().chat.postMessage({
    channel: config.slack.approvalChannel,
    text: `Gate 2 — review ${created} created tickets`,
    blocks,
  });
  return { channel: res.channel, ts: res.ts };
}

async function updateGate2(gateState) {
  if (mockSlack) return;
  await getClient().chat.update({
    channel: gateState.channelId,
    ts: gateState.messageTs,
    text: `Gate 2 — ${gateState.status}`,
    blocks: buildGate2Blocks(gateState.gateId, gateState.tickets, gateState.status),
  });
}

// ── Agent PR review (Gate 4) ─────────────────────────────────────────────
function buildAgentReviewBlocks(ticket, pr, summary, assignment) {
  const prTitle = `[${ticket.key}] ${ticket.title}`;
  return [
    { type: 'header', text: { type: 'plain_text', text: '🤖 Agent finished a task — review needed' } },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          `*${ticket.key} — ${ticket.title}*\n` +
          `*What*: ${summary.what}\n` +
          `*How*: ${summary.how}\n` +
          `*Changed files*: \`${(pr.changedFiles || []).join('`, `')}\`\n` +
          `*What to check*: ${summary.checkPoints}\n` +
          `*Assignee*: ${assignment?.assignee || 'TBD'} — please review`,
      },
    },
    { type: 'section', text: { type: 'mrkdwn', text: `:link: <${pr.prUrl}|${prTitle}>` } },
    {
      type: 'actions',
      elements: [
        { type: 'button', text: { type: 'plain_text', text: 'Approve & merge ✅' }, style: 'primary', action_id: `gate4_approve_${ticket.key}`, value: ticket.key },
        { type: 'button', text: { type: 'plain_text', text: 'Request changes 🔁' }, action_id: `gate4_changes_${ticket.key}`, value: ticket.key },
      ],
    },
  ];
}

function renderAgentReviewConsole(ticket, pr, summary, assignment) {
  return [
    '\n🔔 [Slack mock] 🤖 Agent finished a task — review needed:',
    `   ${ticket.key} — ${ticket.title}`,
    `   What:  ${summary.what}`,
    `   How:   ${summary.how}`,
    `   Files: ${(pr.changedFiles || []).join(', ')}`,
    `   PR:    ${pr.prUrl}`,
    `   Assignee: ${assignment?.assignee || 'TBD'}`,
    '   [Approve & merge ✅] [Request changes 🔁]',
  ].join('\n');
}

async function sendAgentReview(ticket, pr, summary, assignment) {
  if (mockSlack) {
    console.log(renderAgentReviewConsole(ticket, pr, summary, assignment));
    return;
  }
  await getClient().chat.postMessage({
    channel: config.slack.approvalChannel,
    text: `Agent finished ${ticket.key} — PR ready for review`,
    blocks: buildAgentReviewBlocks(ticket, pr, summary, assignment),
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
  buildGate2Blocks,
  sendGate2,
  updateGate2,
  buildAgentReviewBlocks,
  sendAgentReview,
  sendTimeoutNotice,
};
