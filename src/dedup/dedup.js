/**
 * 2-layer dedup + Jira ticket creation.
 *
 *   Layer 1: JQL keyword search (fast, free) — find candidate open issues.
 *   Layer 2: Gemini embedding cosine similarity against candidates.
 *
 * Embeddings are cached in Redis (emb:<issueId>, 7-day TTL). Gemini falls back
 * to a deterministic local embedding when MOCK_EXTERNAL is set or no key is
 * present, so dedup math runs offline.
 */
const config = require('../config');
const store = require('../state/gateStore');
const jira = require('../jira/jira');
const { withRetry } = require('../util/retry');

const mockGemini = config.demo.mockExternal || !config.gemini.apiKey;
const EMB_TTL_SECONDS = 7 * 24 * 60 * 60;

// Similarity thresholds
const DUPLICATE_THRESHOLD = 0.9; // >= 0.90 → skip creation
const WARNING_THRESHOLD = 0.85; // 0.85–0.90 → create but flag for Gate 2

function classify(score) {
  if (score >= DUPLICATE_THRESHOLD) return 'duplicate';
  if (score >= WARNING_THRESHOLD) return 'created_with_warning';
  return 'created';
}

function cosineSimilarity(a, b) {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// Deterministic offline embedding: bag-of-words over a fixed hash space.
// Identical text → identical vector (cosine 1.0); overlap → higher cosine.
function mockEmbedding(text) {
  const DIM = 256;
  const v = new Array(DIM).fill(0);
  for (const w of String(text).toLowerCase().split(/\W+/).filter(Boolean)) {
    let h = 0;
    for (let i = 0; i < w.length; i++) h = (h * 31 + w.charCodeAt(i)) >>> 0;
    v[h % DIM] += 1;
  }
  return v;
}

let genAI = null;
async function getEmbedding(text) {
  if (mockGemini) return mockEmbedding(text);
  if (!genAI) {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    genAI = new GoogleGenerativeAI(config.gemini.apiKey);
  }
  return withRetry(async () => {
    // text-embedding-004 was retired; gemini-embedding-001 is the current model.
    const model = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
    const result = await model.embedContent(String(text).slice(0, 2000));
    return result.embedding.values;
  });
}

// Get-or-set embedding cache, keyed by issue id.
async function cachedEmbedding(issueId, text) {
  const key = `emb:${issueId}`;
  const cached = await store.get(key);
  if (cached) return cached;
  const emb = await getEmbedding(text);
  await store.set(key, emb, EMB_TTL_SECONDS);
  return emb;
}

/**
 * Dedup an approved task and create a Jira ticket if it's new.
 * @param {object} task
 * @returns {Promise<{status, issue, issueUrl?, score?, similarTo?, message?}>}
 */
async function dedupAndCreate(task) {
  // ── Layer 1: keyword candidates ──
  const candidates = await jira.jqlSearch(task.title);

  // ── Layer 2: embedding similarity ──
  let best = null; // { issue, score }
  if (candidates.length) {
    const taskEmb = await getEmbedding(`${task.title} ${task.description}`);
    for (const cand of candidates) {
      const candEmb = await cachedEmbedding(
        cand.id,
        `${cand.summary} ${cand.descriptionText || ''}`
      );
      const score = cosineSimilarity(taskEmb, candEmb);
      if (!best || score > best.score) best = { issue: cand, score };
    }
  }

  // Definite duplicate — skip creation
  if (best && best.score >= DUPLICATE_THRESHOLD) {
    return {
      status: 'duplicate',
      issue: best.issue,
      score: best.score,
      message: `${Math.round(best.score * 100)}% match with ${best.issue.key}`,
    };
  }

  // Create the ticket
  const issue = await jira.createTicket(task);
  // Register embedding immediately so the next dedup check can see it
  await cachedEmbedding(issue.id, `${task.title} ${task.description}`);
  const url = jira.issueUrl(issue.key);

  if (best && best.score >= WARNING_THRESHOLD) {
    return {
      status: 'created_with_warning',
      issue,
      issueUrl: url,
      similarTo: { key: best.issue.key, score: best.score },
    };
  }

  return { status: 'created', issue, issueUrl: url, similarTo: null };
}

module.exports = { dedupAndCreate, classify, cosineSimilarity, getEmbedding };

// `node src/dedup/dedup.js` — demonstrate created / duplicate + threshold logic.
if (require.main === module) {
  (async () => {
    console.log(`Dedup mode: gemini=${mockGemini ? 'MOCK' : 'LIVE'} jira=${jira.mockJira ? 'MOCK' : 'LIVE'}\n`);

    const task = {
      title: 'Fix session TTL and add keep-alive ping',
      description: 'Mobile Safari users logged out after 5 mins; increase TTL and add keep-alive.',
      assignee_hint: 'bob',
      priority: 'high',
      source: 'slack',
    };

    const first = await dedupAndCreate(task);
    console.log(`1) new task        -> [${first.status}] ${first.issue.key} (${first.issueUrl})`);

    const again = await dedupAndCreate(task);
    console.log(
      `2) identical re-run -> [${again.status}] ` +
        (again.status === 'duplicate' ? again.message : again.issue.key)
    );

    console.log('\nThreshold classifier:');
    for (const s of [0.95, 0.87, 0.5]) {
      console.log(`   score ${s} -> ${classify(s)}`);
    }

    await store.close();
  })().catch((err) => {
    console.error('Dedup error:', err.message);
    process.exit(1);
  });
}
