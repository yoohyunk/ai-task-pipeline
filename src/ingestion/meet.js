/**
 * Normalize a Meet transcript into multiple topic-segment chunks.
 *
 * Chunking rules:
 *   - One chunk per logical topic segment (never the whole transcript as one).
 *   - Start a new segment on a topic-transition cue ("also", "one more thing", ...)
 *     or when the running segment would exceed MAX_TOKENS (~800).
 *
 * @param {object} meetFixture - { meeting, date, participants, transcript: [...] }
 * @returns {Array} normalized chunks (>= 1)
 */
const MAX_TOKENS = 800;
const TRANSITION_CUE =
  /^\s*(also|one more thing|another thing|next|moving on|on another note|lastly|finally)\b/i;

// rough token estimate: 1 token ≈ 4 chars
const estTokens = (text) => Math.ceil(text.length / 4);

function normalizeMeet(meetFixture = {}) {
  const transcript = meetFixture.transcript || [];
  const segments = [];
  let current = [];
  let currentChars = 0;

  const flush = () => {
    if (current.length) {
      segments.push(current);
      current = [];
      currentChars = 0;
    }
  };

  for (const line of transcript) {
    if (!line || !line.text || !line.text.trim()) continue;
    const text = line.text.trim();

    const startsNewTopic = TRANSITION_CUE.test(text) && current.length > 0;
    const wouldOverflow =
      current.length > 0 && estTokens(`${currentChars} ${text}`) > MAX_TOKENS;

    if (startsNewTopic || wouldOverflow) flush();

    current.push({ speaker: line.speaker, text, ts: meetFixture.date });
    currentChars += text.length;
  }
  flush();

  // Guarantee we never emit a single giant block: if the heuristic produced
  // exactly one segment with multiple speakers, split roughly in half.
  if (segments.length === 1 && segments[0].length > 2) {
    const only = segments.pop();
    const mid = Math.ceil(only.length / 2);
    segments.push(only.slice(0, mid), only.slice(mid));
  }

  return segments.map((lines) => ({
    source: 'meet',
    channel: meetFixture.meeting,
    timestamp: meetFixture.date,
    participants: [...new Set(lines.map((l) => l.speaker))],
    lines,
  }));
}

module.exports = { normalizeMeet };
