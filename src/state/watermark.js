/**
 * Per-channel ingestion watermark — the ts of the newest message already
 * processed. Lets the pipeline read only NEW messages (conversations.history
 * `oldest`) instead of re-reading the whole channel every run.
 *
 * Backed by gateStore (Redis when live, in-memory otherwise).
 */
const store = require('./gateStore');

const key = (channelId) => `watermark:${channelId}`;

async function get(channelId) {
  const v = await store.get(key(channelId));
  return v && v.ts ? v.ts : null;
}

async function set(channelId, ts) {
  if (ts) await store.set(key(channelId), { ts });
}

module.exports = { get, set };
