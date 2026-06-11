/**
 * Jira REST API v3 client. Falls back to an in-memory mock store when
 * MOCK_EXTERNAL is set or credentials are missing, so the pipeline can create
 * "tickets" and run dedup offline.
 */
const axios = require('axios');
const config = require('../config');
const { toADF } = require('./adf');
const { withRetry } = require('../util/retry');

const mockJira = config.demo.mockExternal || !config.jira.token || !config.jira.baseUrl;

const jiraHeaders = {
  Authorization:
    'Basic ' +
    Buffer.from(`${config.jira.email}:${config.jira.token}`).toString('base64'),
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

// high -> High, etc.
function mapPriority(p) {
  return { high: 'High', medium: 'Medium', low: 'Low' }[p] || 'Medium';
}

function issueUrl(key) {
  const base = mockJira ? 'https://mock.atlassian.net' : config.jira.baseUrl;
  return `${base}/browse/${key}`;
}

function extractKeywords(title) {
  const stopwords = new Set([
    'please', 'can', 'you', 'the', 'a', 'an', 'to', 'of', 'and', 'for', 'in', 'on', 'is',
    'it', 'we', 'should', 'need', 'fix', 'add', 'update', 'check', 'review',
  ]);
  return title
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^\w가-힣]/g, ''))
    .filter((w) => w.length > 2 && !stopwords.has(w))
    .slice(0, 5);
}

// ── in-memory mock store ─────────────────────────────────────────────────
let mockSeq = 0;
const mockTickets = []; // { id, key, summary, descriptionText, status, deleted }

function mockCreate(task) {
  mockSeq += 1;
  const issue = {
    id: String(10000 + mockSeq),
    key: `${config.jira.project}-${mockSeq}`,
    summary: task.title,
    descriptionText: task.description,
    status: 'To Do',
    deleted: false,
  };
  mockTickets.push(issue);
  return issue;
}

function mockSearch(title) {
  const kws = extractKeywords(title);
  if (!kws.length) return [];
  return mockTickets.filter(
    (t) =>
      !t.deleted &&
      !['Done', 'Closed', "Won't Do"].includes(t.status) &&
      kws.some((k) => `${t.summary} ${t.descriptionText}`.toLowerCase().includes(k))
  );
}

// ── public API ───────────────────────────────────────────────────────────

// name hint -> Jira accountId (cached). Returns null in mock mode.
const accountCache = {};
async function resolveAccountId(nameHint) {
  if (!nameHint || mockJira) return null;
  if (accountCache[nameHint]) return accountCache[nameHint];
  return withRetry(async () => {
    const { data } = await axios.get(
      `${config.jira.baseUrl}/rest/api/3/user/search?query=${encodeURIComponent(nameHint)}`,
      { headers: jiraHeaders }
    );
    const id = data?.[0]?.accountId || null;
    if (id) accountCache[nameHint] = id;
    return id;
  });
}

// Layer 1 dedup input: keyword JQL search for open issues.
async function jqlSearch(title) {
  if (mockJira) return mockSearch(title);
  const keywords = extractKeywords(title);
  if (!keywords.length) return [];

  const jql =
    `project = "${config.jira.project}" AND text ~ "${keywords.join(' ')}" ` +
    `AND status NOT IN (Done, Closed, "Won't Do") ORDER BY created DESC`;
  return withRetry(async () => {
    // New endpoint — the legacy /rest/api/3/search was removed (HTTP 410).
    const { data } = await axios.get(`${config.jira.baseUrl}/rest/api/3/search/jql`, {
      headers: jiraHeaders,
      params: { jql, maxResults: 20, fields: 'summary,description,status' },
    });
    return (data.issues || []).map((i) => ({
      id: i.id,
      key: i.key,
      summary: i.fields?.summary || '',
      descriptionText: '',
      status: i.fields?.status?.name || '',
    }));
  });
}

async function createTicket(task) {
  if (mockJira) return mockCreate(task);

  const accountId = await resolveAccountId(task.assignee_hint);
  const fields = {
    project: { key: config.jira.project },
    summary: task.title,
    description: toADF(task.description),
    issuetype: { name: 'Task' },
    priority: { name: mapPriority(task.priority) },
    labels: [task.source, 'ai-generated'],
    ...(accountId && { assignee: { accountId } }),
  };
  return withRetry(async () => {
    const { data } = await axios.post(
      `${config.jira.baseUrl}/rest/api/3/issue`,
      { fields },
      { headers: jiraHeaders }
    );
    return { id: data.id, key: data.key, summary: task.title, descriptionText: task.description };
  });
}

async function deleteIssue(key) {
  if (mockJira) {
    const t = mockTickets.find((x) => x.key === key);
    if (t) t.deleted = true;
    return;
  }
  return withRetry(() =>
    axios.delete(`${config.jira.baseUrl}/rest/api/3/issue/${key}`, { headers: jiraHeaders })
  );
}

// Move an issue to a target status by matching an available transition by the
// destination status name (or transition name). No-op + warn if none matches.
async function transitionIssue(key, targetStatusName) {
  if (mockJira) {
    console.log(`   [Jira mock] ${key} → ${targetStatusName}`);
    return true;
  }
  return withRetry(async () => {
    const { data } = await axios.get(
      `${config.jira.baseUrl}/rest/api/3/issue/${key}/transitions`,
      { headers: jiraHeaders }
    );
    const want = targetStatusName.toLowerCase();
    const t = (data.transitions || []).find(
      (x) => x.to?.name?.toLowerCase() === want || x.name?.toLowerCase() === want
    );
    if (!t) {
      console.warn(`   [Jira] no transition to "${targetStatusName}" for ${key}`);
      return false;
    }
    await axios.post(
      `${config.jira.baseUrl}/rest/api/3/issue/${key}/transitions`,
      { transition: { id: t.id } },
      { headers: jiraHeaders }
    );
    return true;
  });
}

async function addComment(key, text) {
  if (mockJira) {
    console.log(`   [Jira mock] comment on ${key}: ${text.replace(/\n/g, ' ')}`);
    return;
  }
  return withRetry(() =>
    axios.post(
      `${config.jira.baseUrl}/rest/api/3/issue/${key}/comment`,
      { body: toADF(text) },
      { headers: jiraHeaders }
    )
  );
}

module.exports = {
  mockJira,
  mapPriority,
  issueUrl,
  extractKeywords,
  resolveAccountId,
  jqlSearch,
  createTicket,
  deleteIssue,
  addComment,
  transitionIssue,
};
