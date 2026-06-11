#!/usr/bin/env node
/**
 * Reset demo-app/ to its pristine baseline and commit/push, so a real-merge
 * demo can be run again cleanly. Run between demos:
 *   npm run reset:demo
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

const BASELINE = {
  'demo-app/config.js': `// demo-app session/auth configuration
module.exports = {
  // How long a session stays valid without activity.
  SESSION_TTL_MINUTES: 5,
  // Send a keep-alive ping to refresh the session before it expires.
  KEEP_ALIVE: false,
  KEEP_ALIVE_INTERVAL_SECONDS: 60,
};
`,
  'demo-app/db.js': `// demo-app staging database settings
module.exports = {
  // Alert threshold for disk usage (percent). No alert wired up yet.
  DISK_ALERT_PERCENT: null,
  // Retain this many old migration snapshots before cleanup.
  SNAPSHOT_RETENTION: 50,
};
`,
  'demo-app/rateLimit.js': `// demo-app API rate limiting
module.exports = {
  // Requests per minute per client. null = no limiting (security risk).
  REQUESTS_PER_MINUTE: null,
  ENABLED: false,
};
`,
  'demo-app/monitoring.js': `// demo-app error monitoring dashboard config
module.exports = {
  // Log source the dashboard reads from. Still points at the old logger.
  LOG_SOURCE: 'legacy-logger',
  DASHBOARD_REFRESH_SECONDS: 30,
};
`,
};

let changed = false;
for (const [file, content] of Object.entries(BASELINE)) {
  const abs = path.join(ROOT, file);
  if (fs.readFileSync(abs, 'utf8') !== content) {
    fs.writeFileSync(abs, content);
    changed = true;
    console.log(`reset ${file}`);
  }
}

if (!changed) {
  console.log('demo-app already at baseline — nothing to reset.');
  process.exit(0);
}

execSync('git add demo-app', { cwd: ROOT });
execSync('git commit -q -m "chore: reset demo-app to baseline for next demo"', { cwd: ROOT });
try {
  execSync('git push -q origin main', { cwd: ROOT });
  console.log('committed + pushed baseline reset.');
} catch {
  console.log('committed baseline reset (push skipped/failed).');
}
