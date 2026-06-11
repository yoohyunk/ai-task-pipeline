const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Retry an async fn with linear backoff (baseMs, 2*baseMs, ...).
 * @param {() => Promise<T>} fn
 * @param {number} retries
 * @param {number} baseMs
 * @returns {Promise<T>}
 */
async function withRetry(fn, retries = 3, baseMs = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === retries - 1) throw err;
      await sleep(baseMs * (i + 1));
    }
  }
}

module.exports = { withRetry, sleep };
