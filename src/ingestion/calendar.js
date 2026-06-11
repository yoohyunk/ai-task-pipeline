/**
 * Normalize a calendar event into a single chunk.
 *
 * Chunking rules:
 *   - One event = one chunk.
 *   - Merge event description + attendee list as context.
 *
 * The `window` field lets contextBuilder cross-link this event with a Meet
 * transcript that falls in the same time range.
 *
 * @param {object} calFixture - { id, title, start, end, attendees, description }
 * @returns {Array} normalized chunks (length 1)
 */
function normalizeCalendar(calFixture = {}) {
  if (!calFixture || !calFixture.id) return [];

  const attendees = calFixture.attendees || [];
  const text = `${calFixture.description || ''}${
    attendees.length ? `\nAttendees: ${attendees.join(', ')}` : ''
  }`.trim();

  return [
    {
      source: 'calendar',
      channel: calFixture.title,
      timestamp: calFixture.start,
      participants: attendees,
      window: { start: calFixture.start, end: calFixture.end },
      lines: [{ speaker: calFixture.title, text, ts: calFixture.start }],
    },
  ];
}

module.exports = { normalizeCalendar };
