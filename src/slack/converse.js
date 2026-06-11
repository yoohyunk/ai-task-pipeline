/**
 * Conversational gate editing over Slack threads.
 *
 * Reply in the thread of a gate message ("lower #3 to low", "remove the figma
 * task", "assign rate limiting to bob") and Claude applies the edit, updates
 * the gate message, and replies in-thread to confirm.
 *
 * Requires the Slack app to subscribe to the `message.channels` bot event
 * (Event Subscriptions) so thread replies arrive over Socket Mode.
 */
const store = require('../state/gateStore');
const notifier = require('./notifier');
const jira = require('../jira/jira');
const { prdToADF } = require('../jira/adf');
const { applyTaskEdits, applyTicketEdits } = require('../agent/editor');

const gate1Key = (id) => `gate:${id}`;
const gate2Key = (id) => `gate2:${id}`;
const threadKey = (ts) => `thread:${ts}`;

// Record which gate a posted message's thread belongs to (per-gate-thread mode).
async function linkThread(messageTs, gateId, type) {
  await store.set(threadKey(messageTs), { gateId, type });
}

// One-thread-per-run mode: remember which gate is currently editable so replies
// in the run thread route to it.
async function setActiveGate(rootTs, type, gateId) {
  await store.set(`activegate:${rootTs}`, { type, gateId });
}

// Track Gate 4 PRs awaiting review so a thread reply can request changes.
async function addActiveGate4(rootTs, ticketKey) {
  const k = `activegate4:${rootTs}`;
  const cur = (await store.get(k)) || { keys: [] };
  if (!cur.keys.includes(ticketKey)) cur.keys.push(ticketKey);
  await store.set(k, cur);
}
async function removeActiveGate4(rootTs, ticketKey) {
  const k = `activegate4:${rootTs}`;
  const cur = (await store.get(k)) || { keys: [] };
  cur.keys = cur.keys.filter((x) => x !== ticketKey);
  await store.set(k, cur);
}

// A reply while PRs are in review = "request changes". Match by ticket key in
// the text, or use the only pending one. Returns true if it handled the reply.
async function handleGate4Reply(event, client, rootTs) {
  const cur = (await store.get(`activegate4:${rootTs}`)) || { keys: [] };
  if (!cur.keys.length) return false;
  const m = (event.text || '').match(/\b([A-Z][A-Z0-9]+-\d+)\b/);
  const target =
    m && cur.keys.includes(m[1]) ? m[1] : cur.keys.length === 1 ? cur.keys[0] : null;
  if (!target) return false;
  await store.update(`gate4:${target}`, { status: 'changes', feedback: event.text });
  await client.reactions
    .add({ channel: event.channel, timestamp: event.ts, name: 'hammer_and_wrench' })
    .catch(() => {});
  await client.chat
    .postMessage({ channel: event.channel, thread_ts: event.thread_ts, text: `🛠 ${target}: revising per your feedback…` })
    .catch(() => {});
  return true;
}

async function handleGate1Reply(event, client, gateId) {
  const state = await store.get(gate1Key(gateId));
  if (!state || state.status !== 'pending') {
    await client.chat.postMessage({
      channel: event.channel,
      thread_ts: event.thread_ts,
      text: 'This gate is already resolved — nothing to edit.',
    });
    return;
  }

  // ack with a reaction (best-effort; needs reactions:write)
  await client.reactions
    .add({ channel: event.channel, timestamp: event.ts, name: 'hourglass_flowing_sand' })
    .catch(() => {});

  const { tasks, summary } = await applyTaskEdits(state.tasks, event.text);
  await store.update(gate1Key(gateId), { tasks });
  const updated = await store.get(gate1Key(gateId));
  await notifier.updateGate1(updated);

  await client.chat.postMessage({
    channel: event.channel,
    thread_ts: event.thread_ts,
    text: `✏️ ${summary}  _(${tasks.length} tasks now — review above)_`,
  });
}

async function handleGate2Reply(event, client, gateId) {
  const state = await store.get(gate2Key(gateId));
  if (!state) return;

  await client.reactions
    .add({ channel: event.channel, timestamp: event.ts, name: 'hourglass_flowing_sand' })
    .catch(() => {});

  const live = state.tickets.filter((t) => t.status !== 'duplicate' && !t._removed);
  const views = live.map((t) => ({
    key: t.issue.key,
    title: t.issue.summary,
    priority: t._task && t._task.priority,
    prd: t._task && t._task.prd,
  }));

  const { changed, summary } = await applyTicketEdits(views, event.text);

  for (const c of changed) {
    const t = state.tickets.find((x) => x.issue.key === c.key);
    if (!t) continue;
    const fields = {};
    if (c.title) {
      t.issue.summary = c.title;
      fields.summary = c.title;
    }
    if (c.priority && t._task) t._task.priority = c.priority;
    if (c.prd) {
      t._task = t._task || {};
      t._task.prd = c.prd;
      fields.description = prdToADF(c.prd, t._task);
    }
    if (c.priority) fields.priority = { name: jira.mapPriority(c.priority) };
    if (Object.keys(fields).length) await jira.updateIssue(c.key, fields);
  }

  await store.set(gate2Key(gateId), state);
  await notifier.updateGate2(state);

  await client.chat.postMessage({
    channel: event.channel,
    thread_ts: event.thread_ts,
    text: changed.length ? `✏️ ${summary}` : `No matching ticket to edit — ${summary}`,
  });
}

/**
 * Register the thread-reply listener on a Bolt app.
 * @param {import('@slack/bolt').App} app
 */
function registerConversation(app) {
  app.event('message', async ({ event, client }) => {
    // only human thread replies with text
    if (!event || event.bot_id || event.subtype || !event.text) return;
    if (!event.thread_ts || event.thread_ts === event.ts) return;

    let map = await store.get(threadKey(event.thread_ts));
    // run-thread mode: replies land on the run root → route to the active gate
    if (map && map.type === 'run') {
      // a PR in review takes precedence — reply = request changes
      if (await handleGate4Reply(event, client, event.thread_ts)) return;
      map = await store.get(`activegate:${event.thread_ts}`);
    }
    if (!map || !map.gateId) return; // not an editable gate thread right now

    const handler = map.type === 'gate2' ? handleGate2Reply : handleGate1Reply;
    await handler(event, client, map.gateId).catch(async (err) => {
      await client.chat
        .postMessage({ channel: event.channel, thread_ts: event.thread_ts, text: `⚠️ edit failed: ${err.message}` })
        .catch(() => {});
    });
  });
}

module.exports = {
  registerConversation,
  linkThread,
  setActiveGate,
  addActiveGate4,
  removeActiveGate4,
};
