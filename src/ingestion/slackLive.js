/**
 * Live Slack ingestion — read real messages from a channel and return them in
 * the same shape as fixtures/slack-threads.json, so the rest of the pipeline is
 * unchanged.
 *
 *   - Pulls conversations.history (+ replies for threads)
 *   - Drops bot/system/empty messages (so the pipeline's own gate posts are
 *     never ingested)
 *   - If a message body is "name: text" (pasted transcript style), uses `name`
 *     as the speaker; otherwise resolves the real Slack display name
 *   - Groups by thread, or by 30-minute window for un-threaded messages
 */
const config = require('../config');

let webClient = null;
function client() {
  if (!webClient) {
    const { WebClient } = require('@slack/web-api');
    webClient = new WebClient(config.slack.botToken);
  }
  return webClient;
}

const nameCache = {};
async function resolveName(userId) {
  if (!userId) return 'unknown';
  if (nameCache[userId]) return nameCache[userId];
  try {
    const r = await client().users.info({ user: userId });
    const p = r.user.profile || {};
    const name = p.display_name || r.user.real_name || r.user.name || userId;
    nameCache[userId] = name;
    return name;
  } catch {
    return userId;
  }
}

async function channelName(channelId) {
  try {
    const r = await client().conversations.info({ channel: channelId });
    return `#${r.channel.name}`;
  } catch {
    return channelId;
  }
}

function isIngestible(m) {
  if (!m || m.type !== 'message' || m.bot_id || m.subtype) return false;
  const text = (m.text || '').trim();
  if (!text) return false;
  // Skip messages that are only mentions/links (e.g. channel-join artifacts).
  if (/^(<@\w+>\s*)+$/.test(text)) return false;
  return true;
}

// Produce a line in the SAME shape as fixtures/slack-threads.json ({ user, text,
// ts }) so normalizeSlack (which reads `user`) picks up the speaker.
// "alice: the bug is back" → { user: 'alice', text: 'the bug is back' }
async function toLine(m) {
  const match = /^\s*([A-Za-z][\w .-]{0,30}?):\s+(.+)$/s.exec(m.text.trim());
  if (match) return { user: match[1].trim(), text: match[2].trim(), ts: m.ts };
  const user = (await resolveName(m.user)) || 'teammate';
  return { user, text: m.text.trim(), ts: m.ts };
}

/**
 * Fetch source threads from the ingest channel.
 * @returns {Promise<Array>} fixture-shaped slack threads
 */
async function fetchSlackThreads(channelId = config.slack.ingestChannel) {
  if (!channelId) throw new Error('No ingest channel configured (SLACK_INGEST_CHANNEL / SLACK_APPROVAL_CHANNEL)');
  const c = client();
  const chan = await channelName(channelId);

  const hist = await c.conversations.history({ channel: channelId, limit: 200 });
  let messages = (hist.messages || []).slice();

  // Expand thread replies for any parent that has them.
  for (const m of hist.messages || []) {
    if (m.thread_ts && m.reply_count > 0 && m.thread_ts === m.ts) {
      const rep = await c.conversations.replies({ channel: channelId, ts: m.thread_ts, limit: 200 });
      messages.push(...(rep.messages || []).filter((r) => r.ts !== m.ts));
    }
  }

  // De-dupe, keep ingestible, sort oldest→newest.
  const seen = new Set();
  messages = messages
    .filter((m) => isIngestible(m) && !seen.has(m.ts) && seen.add(m.ts))
    .sort((a, b) => Number(a.ts) - Number(b.ts));

  // Group by thread_ts, or 30-min window for un-threaded messages.
  const groups = new Map();
  for (const m of messages) {
    const key = m.thread_ts || `w${Math.floor(Number(m.ts) / 1800)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  }

  const threads = [];
  for (const group of groups.values()) {
    const lines = [];
    for (const m of group) lines.push(await toLine(m));
    threads.push({
      channel: chan,
      timestamp: new Date(Number(group[0].ts) * 1000).toISOString(),
      thread: lines,
    });
  }
  return threads;
}

module.exports = { fetchSlackThreads };
