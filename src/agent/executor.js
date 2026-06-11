/**
 * Agent task execution.
 *
 *   AGENT_MODE=symbolic — apply a pre-canned change to demo-app/ (no LLM)
 *   AGENT_MODE=live     — Claude rewrites the target file (needs ANTHROPIC_API_KEY)
 *
 * The agent only ever modifies files under demo-app/ (a synthetic target
 * codebase), never the pipeline's own source. Git branch/commit happens only
 * when a real PR will be opened (CREATE_REAL_PR=true); otherwise the change is
 * computed and shown but nothing is written, keeping the repo clean for
 * rehearsals.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const config = require('../config');

const REPO_ROOT = path.resolve(__dirname, '../..');

// Pre-canned symbolic changes keyed by ticket title.
const CHANGES = [
  {
    match: /session ttl|keep-alive|login timeout|session timeout/i,
    file: 'demo-app/config.js',
    apply: (c) =>
      c
        .replace('SESSION_TTL_MINUTES: 5', 'SESSION_TTL_MINUTES: 30')
        .replace('KEEP_ALIVE: false', 'KEEP_ALIVE: true'),
    summary: 'Raise SESSION_TTL_MINUTES 5→30 and enable KEEP_ALIVE so mobile Safari users stop getting logged out.',
  },
  {
    match: /rate limit/i,
    file: 'demo-app/rateLimit.js',
    apply: (c) =>
      c
        .replace('REQUESTS_PER_MINUTE: null', 'REQUESTS_PER_MINUTE: 100')
        .replace('ENABLED: false', 'ENABLED: true'),
    summary: 'Enable API rate limiting at 100 requests/minute per client.',
  },
  {
    match: /disk alert|staging db|snapshot/i,
    file: 'demo-app/db.js',
    apply: (c) =>
      c
        .replace('DISK_ALERT_PERCENT: null', 'DISK_ALERT_PERCENT: 80')
        .replace('SNAPSHOT_RETENTION: 50', 'SNAPSHOT_RETENTION: 10'),
    summary: 'Set a disk-usage alert at 80% and cut snapshot retention 50→10.',
  },
  {
    match: /dashboard|monitoring/i,
    file: 'demo-app/monitoring.js',
    apply: (c) => c.replace("LOG_SOURCE: 'legacy-logger'", "LOG_SOURCE: 'new-logger'"),
    summary: 'Point the error monitoring dashboard at the new logger.',
  },
];

function selectChange(title) {
  return CHANGES.find((ch) => ch.match.test(title || '')) || null;
}

// Whether the symbolic agent has a concrete change for this ticket.
function canHandle(title) {
  return Boolean(selectChange(title));
}

function slug(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^\w]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function git(cmd) {
  return execSync(`git ${cmd}`, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

async function liveRewrite(filePath, currentContent, ticket) {
  const Anthropic = require('@anthropic-ai/sdk');
  const { withRetry } = require('../util/retry');
  const client = new Anthropic({ apiKey: config.claude.apiKey });
  const prompt =
    `You are editing the file ${filePath} to implement this task:\n\n` +
    `Title: ${ticket.title}\nDescription: ${ticket.description}\n\n` +
    `Current file content:\n\`\`\`js\n${currentContent}\n\`\`\`\n\n` +
    `Return ONLY the complete new file content, no explanation, no code fences.`;
  return withRetry(async () => {
    const res = await client.messages.create({
      model: config.claude.model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = res.content.find((b) => b.type === 'text')?.text || '';
    return text.replace(/^```(?:js)?\n?/, '').replace(/\n?```\s*$/, '').trim() + '\n';
  });
}

/**
 * Execute the work for a ticket.
 * @param {object} ticket - { key, title, description, assignee_hint, priority }
 * @param {object} assignment - output of assignAgent()
 * @returns {Promise<{branch, changedFiles, diffSummary, log, applied}>}
 */
async function executeTask(ticket, assignment) {
  const log = [];
  const branch = `agent/${ticket.key}-${slug(ticket.title)}`;
  const change = selectChange(ticket.title);

  // Resolve which file + new content to produce.
  let file;
  let newContent;
  let diffSummary;

  if (config.agent.mode === 'live') {
    file = change ? change.file : 'demo-app/notes.js';
    const abs = path.join(REPO_ROOT, file);
    const current = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '// new file\n';
    log.push(`Claude rewriting ${file} for "${ticket.title}"`);
    newContent = await liveRewrite(file, current, ticket);
    diffSummary = `Claude-generated change to ${file}.`;
  } else if (change) {
    file = change.file;
    const abs = path.join(REPO_ROOT, file);
    const current = fs.readFileSync(abs, 'utf8');
    newContent = change.apply(current);
    diffSummary = change.summary;
    log.push(`Applied symbolic change: ${change.summary}`);
  } else {
    // No canned change — leave a TODO note so the flow still produces a diff.
    file = 'demo-app/notes.js';
    newContent =
      `// TODO (${ticket.key}): ${ticket.title}\n// ${ticket.description}\n`;
    diffSummary = `Added a TODO note for "${ticket.title}" (no automated change available).`;
    log.push(diffSummary);
  }

  const changedFiles = [file];

  // Only touch git/files when a real PR will be opened. Work in an isolated
  // git worktree so multiple agents can run in parallel without stomping the
  // main working dir or each other.
  if (config.agent.createRealPr) {
    const suffix = String(Date.now()).slice(-4);
    const realBranch = `${branch}-${suffix}`;
    const wtPath = path.join(REPO_ROOT, '.worktrees', realBranch.replace(/[^\w-]/g, '_'));
    const msg = `[${ticket.key}] ${ticket.title}\n\n${diffSummary}\n\nThis change was made by an AI agent.`;

    git(`worktree add -q -b ${realBranch} "${wtPath}" main`);
    try {
      fs.writeFileSync(path.join(wtPath, file), newContent);
      execSync(`git add ${file}`, { cwd: wtPath });
      execSync(`git commit -q -m ${JSON.stringify(msg)}`, { cwd: wtPath });
      execSync(`git push -q -u origin ${realBranch}`, { cwd: wtPath });
    } finally {
      git(`worktree remove --force "${wtPath}"`);
    }
    log.push(`Committed ${file} on ${realBranch} (isolated worktree)`);
    return { branch: realBranch, changedFiles, diffSummary, newContent, log, applied: true };
  }

  log.push('(mock PR mode — change computed but not written/committed)');
  return { branch, changedFiles, diffSummary, newContent, log, applied: false };
}

module.exports = { executeTask, canHandle, selectChange, slug };
