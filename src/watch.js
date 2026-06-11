#!/usr/bin/env node
/**
 * Scheduled ingestion daemon.
 *
 * Keeps the Socket Mode app up (so gate buttons / thread edits work anytime),
 * and on a schedule reads only NEW messages (watermark), extracts tasks, and
 * posts gates for review. Runs during business hours only; overnight messages
 * are picked up by the first morning tick.
 *
 *   npm run watch
 *
 * Env: WATCH_INTERVAL_MS (default 2h), WATCH_START_HOUR (9), WATCH_END_HOUR (18),
 *      WATCH_DAYS (1-5 = Mon–Fri).
 */
require('dotenv').config();
const config = require('./config');
const { run } = require('./orchestrator');
const { createSlackApp } = require('./slack/actions');
const notifier = require('./slack/notifier');
const runContext = require('./slack/runContext');
const store = require('./state/gateStore');
const ui = require('./ui');

const INTERVAL_MS = parseInt(process.env.WATCH_INTERVAL_MS || String(2 * 60 * 60 * 1000), 10);
const START_HOUR = parseInt(process.env.WATCH_START_HOUR || '9', 10);
const END_HOUR = parseInt(process.env.WATCH_END_HOUR || '18', 10);
const DAYS = (process.env.WATCH_DAYS || '1,2,3,4,5').split(',').map(Number);

let busy = false;

function inBusinessHours(d) {
  return DAYS.includes(d.getDay()) && d.getHours() >= START_HOUR && d.getHours() < END_HOUR;
}

async function tick() {
  if (busy) {
    console.log(ui.dim('  …previous run still awaiting review, skipping this tick'));
    return;
  }
  const now = new Date();
  if (!inBusinessHours(now)) {
    console.log(ui.dim(`  ${now.toLocaleString()} — outside business hours, skip`));
    return;
  }

  busy = true;
  // One thread per run.
  const root = await notifier.getClient().chat.postMessage({
    channel: config.slack.approvalChannel,
    text: '🚀 *AI Task Pipeline* — scheduled run. New tasks (if any) will appear in this thread.',
  });
  runContext.set({ rootTs: root.ts, channel: root.channel });
  await store.set(`thread:${root.ts}`, { type: 'run' });

  try {
    const result = await run();
    if (result.allTasks.length === 0) {
      // nothing new — remove the root so the channel stays clean
      await notifier.getClient().chat.delete({ channel: root.channel, ts: root.ts }).catch(() => {});
    }
  } catch (err) {
    console.error(ui.dim(`  run failed: ${err.message}`));
  } finally {
    busy = false;
  }
}

(async () => {
  const app = createSlackApp();
  if (!app) {
    console.error('watch needs real Slack (MOCK_EXTERNAL=false) + SLACK_APP_TOKEN');
    process.exit(1);
  }
  await app.start();
  ui.banner('AI Task Pipeline — watch');
  console.log(
    ui.dim(
      `  every ${Math.round(INTERVAL_MS / 60000)} min · ${START_HOUR}:00–${END_HOUR}:00 · days [${DAYS}]\n`
    )
  );
  await tick(); // run once at startup
  setInterval(tick, INTERVAL_MS);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
