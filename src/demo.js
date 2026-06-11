#!/usr/bin/env node
require('dotenv').config();
const config = require('./config');
const { run } = require('./orchestrator');
const store = require('./state/gateStore');
const ui = require('./ui');

async function main() {
  ui.banner('AI Task Pipeline');

  // In Slack gate mode, start a Socket Mode app so the gate buttons are live
  // (no public endpoint / ngrok needed). The action handlers update gate state
  // that the gate poll loops read — same process, so it just works.
  let slackApp = null;
  if (config.demo.gateMode === 'slack') {
    const { createSlackApp } = require('./slack/actions');
    slackApp = createSlackApp();
    if (slackApp) {
      await slackApp.start();
      // One thread per run: post a root message; all gates reply under it.
      const notifier = require('./slack/notifier');
      const runContext = require('./slack/runContext');
      const root = await notifier.getClient().chat.postMessage({
        channel: config.slack.approvalChannel,
        text: '🚀 *AI Task Pipeline* — run started. Gate reviews will appear in this thread; reply here to edit.',
      });
      runContext.set({ rootTs: root.ts, channel: root.channel });
      await store.set(`thread:${root.ts}`, { type: 'run' });
      console.log(ui.dim('  ⚡ Slack Socket Mode connected — one run thread, buttons live\n'));
    } else {
      console.log(
        ui.yellow('  ⚠ GATE_MODE=slack but no Socket Mode app (need MOCK_EXTERNAL=false + SLACK_APP_TOKEN).')
      );
      console.log(ui.yellow('    Buttons will not respond. Use GATE_MODE=cli or =auto instead.\n'));
    }
  }

  try {
    const result = await run();

    ui.blank();
    console.log(ui.green(ui.bold('  ✓ Core path complete')));
    ui.blank();
    const created = result.dedupResults.filter((r) => r.status !== 'duplicate').length;
    console.log(`    Packets   ${result.packets.length}`);
    console.log(`    Tasks     ${result.allTasks.length} extracted · ${result.approvedTasks.length} approved`);
    console.log(`    Tickets   ${created} created`);
    console.log(`    PRs       ${result.prs.length} opened`);
    result.prs.forEach((p) => console.log(ui.dim(`              ${p.prUrl}`)));
    ui.blank();
  } finally {
    if (slackApp) await slackApp.stop();
    await store.close();
    try { require('./gates/cli').closeCli(); } catch { /* not in cli mode */ }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    ui.blank();
    console.error(ui.bold('  ✗ Pipeline error:'), err.message);
    process.exit(1);
  });
