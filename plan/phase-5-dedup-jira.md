# Phase 5 — Jira Dedup + Ticket Creation

## Goal
For each approved task: run 2-layer dedup check, create Jira ticket if new,
cache embedding, return result with status (created / created_with_warning / duplicate).

## Deliverables
- `src/dedup/dedup.js`
- `src/jira/jira.js`
- `src/jira/adf.js`     (Atlassian Document Format helper)

## Layer 1 — JQL keyword search (fast, free)
```js
function extractKeywords(title) {
  const stopwords = new Set([
    'please','can','you','the','a','an','to','of','and','for','in','on','is',
    'it','we','should','need','fix','add','update','check','review',
  ]);
  return title
    .toLowerCase()
    .split(/\s+/)
    .map(w => w.replace(/[^\w가-힣]/g, ''))
    .filter(w => w.length > 2 && !stopwords.has(w))
    .slice(0, 5);
}

async function jqlSearch(title) {
  const keywords = extractKeywords(title);
  if (!keywords.length) return [];

  const jql = encodeURIComponent(
    `project = "${config.jira.project}" AND text ~ "${keywords.join(' ')}" ` +
    `AND status NOT IN (Done, Closed, "Won't Do") ORDER BY created DESC`
  );
  const { data } = await axios.get(
    `${config.jira.baseUrl}/rest/api/3/search?jql=${jql}&maxResults=20&fields=summary,description,status`,
    { headers: jiraHeaders }
  );
  return data.issues || [];
}
```

## Layer 2 — Gemini embedding similarity
```js
const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(config.gemini.apiKey);

async function getEmbedding(text) {
  const model = genAI.getGenerativeModel({ model: 'text-embedding-004' });
  const result = await model.embedContent(text.slice(0, 2000));
  return result.embedding.values;  // 768-dim vector
}

function cosineSimilarity(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}
```

## Redis embedding cache
- Key: `emb:{issueId}`
- TTL: 7 days
- Get-or-set pattern: check cache first, only call Gemini on miss

## Similarity thresholds
| Score | Decision |
|-------|----------|
| >= 0.90 | Definite duplicate — skip creation |
| 0.85–0.90 | Possible duplicate — create but flag for Gate 2 |
| < 0.85 | New ticket — create normally |

## Return statuses
```js
{ status: 'created',              issue, issueUrl, similarTo: null }
{ status: 'created_with_warning', issue, issueUrl, similarTo: { key, score } }
{ status: 'duplicate',            issue, score,    message }
```

## src/jira/adf.js — Atlassian Document Format
Jira REST API v3 requires ADF for description field, not plain text:
```js
function toADF(text) {
  return {
    type: 'doc',
    version: 1,
    content: [{
      type: 'paragraph',
      content: [{ type: 'text', text: text || '' }],
    }],
  };
}
module.exports = { toADF };
```

## Ticket creation fields
```js
{
  fields: {
    project:     { key: config.jira.project },
    summary:     task.title,
    description: toADF(task.description),
    issuetype:   { name: 'Task' },
    priority:    { name: mapPriority(task.priority) },   // high→High etc.
    labels:      [task.source, 'ai-generated'],
    ...(accountId && { assignee: { accountId } }),
  },
}
```

## Assignee resolution
```js
// name hint → Jira accountId
// cache results in memory (accountCache) to avoid repeat API calls
async function resolveAccountId(nameHint) {
  if (!nameHint) return null;
  if (accountCache[nameHint]) return accountCache[nameHint];
  const { data } = await axios.get(
    `${config.jira.baseUrl}/rest/api/3/user/search?query=${encodeURIComponent(nameHint)}`,
    { headers: jiraHeaders }
  );
  const id = data?.[0]?.accountId || null;
  if (id) accountCache[nameHint] = id;
  return id;
}
```

## Post-creation: embed + cache
```js
// Register new ticket's embedding immediately so next dedup check sees it
const emb = await getEmbedding(`${task.title} ${task.description}`);
await redis.setEx(`emb:${newIssue.id}`, 60*60*24*7, JSON.stringify(emb));
```

## src/dedup/dedup.js main export
```js
/**
 * @param {Task} approvedTask
 * @returns {Promise<{ status, issue, issueUrl?, score?, similarTo?, message? }>}
 */
async function dedupAndCreate(approvedTask) { ... }

module.exports = { dedupAndCreate };
```

## Acceptance criteria
- [ ] `node src/dedup/dedup.js` creates a ticket for a new task
- [ ] Running it again with identical title returns `status: 'duplicate'`
- [ ] Score 0.85–0.90 returns `status: 'created_with_warning'` with `similarTo`
- [ ] Embedding is cached after creation (Redis key `emb:{issueId}`)
- [ ] ADF description renders in Jira (no plain-text rejection)
- [ ] All Jira + Gemini calls wrapped in try/catch + retry
