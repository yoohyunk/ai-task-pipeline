const { randomUUID } = require('crypto');
const { normalizeSlack } = require('./slack');
const { normalizeMeet } = require('./meet');
const { normalizeCalendar } = require('./calendar');

// "2024-03-14T10:00:00Z" -> "2024-03-14 10:00"
function fmtTime(iso) {
  return String(iso || '').slice(0, 16).replace('T', ' ');
}

// Render a chunk as human-readable text for the LLM (not a JSON dump).
function renderRawText(chunk, prefixMeta) {
  const header = `[${chunk.source} | ${chunk.channel} | ${fmtTime(
    chunk.timestamp
  )} | participants: ${chunk.participants.join(', ')}]`;
  const body = chunk.lines.map((l) => `${l.speaker}: ${l.text}`).join('\n');
  return `${prefixMeta ? `${prefixMeta}\n` : ''}${header}\n${body}`;
}

// Does a timestamp fall within a calendar event's [start, end] window?
function withinWindow(ts, window) {
  if (!window) return false;
  const t = new Date(ts).getTime();
  return t >= new Date(window.start).getTime() && t <= new Date(window.end).getTime();
}

/**
 * Build context packets from raw fixtures.
 *
 *   1. Normalize each source into chunks.
 *   2. Sort all chunks chronologically.
 *   3. Cross-link: a calendar event that shares a time window with a Meet
 *      transcript is merged into that transcript (calendar metadata prepended).
 *   4. Return context packets: { chunkId, source, channel, timestamp,
 *      participants, rawText }.
 *
 * @param {object} fixtures - { slack, meet, calendar }
 * @returns {Promise<Array>} context packets
 */
async function buildContext({ slack, meet, calendar } = {}) {
  const chunks = [
    ...normalizeSlack(slack),
    ...normalizeMeet(meet),
    ...normalizeCalendar(calendar),
  ];

  // chronological order
  chunks.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  // cross-link calendar events into overlapping meet transcripts
  const merged = new Set();
  for (const cal of chunks.filter((c) => c.source === 'calendar')) {
    const meetMatch = chunks.find(
      (c) => c.source === 'meet' && withinWindow(c.timestamp, cal.window)
    );
    if (meetMatch) {
      meetMatch._calMeta = `[linked calendar event: ${cal.channel} (${fmtTime(
        cal.window.start
      )}) — ${cal.lines.map((l) => l.text).join(' ')}]`;
      merged.add(cal);
    }
  }

  return chunks
    .filter((c) => !merged.has(c))
    .map((chunk) => ({
      chunkId: randomUUID(),
      source: chunk.source,
      channel: chunk.channel,
      timestamp: chunk.timestamp,
      participants: chunk.participants,
      rawText: renderRawText(chunk, chunk._calMeta),
    }));
}

module.exports = { buildContext };
