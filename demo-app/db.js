// demo-app staging database settings
module.exports = {
  // Alert threshold for disk usage (percent). No alert wired up yet.
  DISK_ALERT_PERCENT: 80,
  // Retain this many old migration snapshots before cleanup.
  SNAPSHOT_RETENTION: 10,
};
