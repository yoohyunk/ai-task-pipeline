// demo-app session/auth configuration
module.exports = {
  // How long a session stays valid without activity.
  SESSION_TTL_MINUTES: 5,
  // Send a keep-alive ping to refresh the session before it expires.
  KEEP_ALIVE: false,
  KEEP_ALIVE_INTERVAL_SECONDS: 60,
};
