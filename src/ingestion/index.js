const config = require('../config');
const { buildContext } = require('./contextBuilder');
const slackFixture = require('../../fixtures/slack-threads.json');
const calFixture = require('../../fixtures/calendar-event.json');

/**
 * Load source conversations and build context packets.
 *
 *   INGEST_SOURCE=fixtures (default) — synthetic JSON in fixtures/
 *   INGEST_SOURCE=slack             — live messages from the ingest channel
 *
 * @returns {Promise<Array>} context packets
 */
async function ingest() {
  if (config.demo.ingestSource === 'slack') {
    const { fetchSlackThreads } = require('./slackLive');
    const slack = await fetchSlackThreads();
    // Live mode reads Slack only; meet/calendar can also be posted to the
    // channel and will arrive as slack threads. (meet/calendar omitted → empty)
    return buildContext({ slack });
  }

  // Meet auto-upgrades to the live Google Meet API when OAuth keys are present;
  // otherwise it returns the fixture (the demo path).
  const { fetchMeetTranscript } = require('./meetLive');
  const meet = await fetchMeetTranscript();
  return buildContext({
    slack: slackFixture,
    meet,
    calendar: calFixture,
  });
}

module.exports = { ingest };

// Allow `node src/ingestion/index.js` to print packets for inspection.
if (require.main === module) {
  ingest()
    .then((packets) => {
      console.log(`\nsource: ${config.demo.ingestSource}\n${packets.length} context packets:\n`);
      packets.forEach((p, i) => {
        console.log(`── packet ${i + 1}/${packets.length} ` + '─'.repeat(40));
        console.log(`chunkId: ${p.chunkId}`);
        console.log(`source:  ${p.source}  |  channel: ${p.channel}`);
        console.log(`time:    ${p.timestamp}  |  participants: ${p.participants.join(', ')}`);
        console.log(`rawText:\n${p.rawText}\n`);
      });
    })
    .catch((err) => {
      console.error('Ingestion error:', err.message);
      process.exit(1);
    });
}
