const { buildContext } = require('./contextBuilder');
const slackFixture = require('../../fixtures/slack-threads.json');
const meetFixture = require('../../fixtures/meet-transcript.json');
const calFixture = require('../../fixtures/calendar-event.json');

/**
 * Load synthetic fixtures and build context packets for the pipeline.
 * @returns {Promise<Array>} context packets
 */
async function ingest() {
  return buildContext({
    slack: slackFixture,
    meet: meetFixture,
    calendar: calFixture,
  });
}

module.exports = { ingest };

// Allow `node src/ingestion/index.js` to print packets for inspection.
if (require.main === module) {
  ingest()
    .then((packets) => {
      console.log(`\n${packets.length} context packets:\n`);
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
