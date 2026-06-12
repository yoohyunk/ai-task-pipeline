// demo-app error monitoring dashboard config
module.exports = {
  // Log source the dashboard reads from. Updated to point at the new logger.
  LOG_SOURCE: process.env.LOG_SOURCE || 'new-logger',
  DASHBOARD_REFRESH_SECONDS: process.env.DASHBOARD_REFRESH_SECONDS
    ? parseInt(process.env.DASHBOARD_REFRESH_SECONDS, 10)
    : 30,
};
