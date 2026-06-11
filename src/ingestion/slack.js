/**
 * Normalize Slack threads into the common chunk format.
 *
 * Chunking rules:
 *   - Group by thread first (each fixture thread stays together as one chunk).
 *   - Exclude bot messages and empty strings.
 *
 * @param {Array} slackFixture - array of { channel, timestamp, thread: [...] }
 * @returns {Array} normalized chunks
 */
function normalizeSlack(slackFixture = []) {
  const chunks = [];

  for (const thread of slackFixture) {
    const lines = (thread.thread || [])
      .filter((m) => m && typeof m.text === 'string' && m.text.trim() !== '')
      .filter((m) => !/bot$/i.test(m.user || '')) // exclude bot messages
      .map((m) => ({ speaker: m.user, text: m.text.trim(), ts: m.ts }));

    if (lines.length === 0) continue;

    const participants = [...new Set(lines.map((l) => l.speaker))];

    chunks.push({
      source: 'slack',
      channel: thread.channel,
      timestamp: thread.timestamp,
      participants,
      lines,
    });
  }

  return chunks;
}

module.exports = { normalizeSlack };
