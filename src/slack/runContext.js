/**
 * Holds the current run's Slack root thread, so every gate message posts as a
 * reply under one thread (one run = one thread) instead of cluttering the
 * channel with separate top-level messages.
 */
let current = null; // { rootTs, channel }

module.exports = {
  set: (v) => {
    current = v;
  },
  get: () => current,
  rootTs: () => (current ? current.rootTs : undefined),
};
