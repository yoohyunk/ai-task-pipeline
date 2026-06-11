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
const { applyTaskEdits } = require('../agent/editor');

const gate1Key = (id) => `gate:${id}`;
const threadKey = (ts) => `thread:${ts}`;

// Record which gate a posted message's thread belongs to.
async function linkThread(messageTs, gateId, type) {
  await store.set(threadKey(messageTs), { gateId, type });
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

/**
 * Register the thread-reply listener on a Bolt app.
 * @param {import('@slack/bolt').App} app
 */
function registerConversation(app) {
  app.event('message', async ({ event, client }) => {
    // only human thread replies with text
    if (!event || event.bot_id || event.subtype || !event.text) return;
    if (!event.thread_ts || event.thread_ts === event.ts) return;

    const map = await store.get(threadKey(event.thread_ts));
    if (!map) return; // not a gate thread

    if (map.type === 'gate1') {
      await handleGate1Reply(event, client, map.gateId).catch(async (err) => {
        await client.chat
          .postMessage({ channel: event.channel, thread_ts: event.thread_ts, text: `⚠️ edit failed: ${err.message}` })
          .catch(() => {});
      });
    }
  });
}

module.exports = { registerConversation, linkThread };
