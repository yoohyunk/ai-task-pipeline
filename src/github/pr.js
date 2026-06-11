/**
 * PR creation.
 *
 * CREATE_REAL_PR=true → push the agent branch and open a real PR via `gh`.
 * Otherwise → render the PR body to the console (mock), keeping the repo clean.
 *
 * Branch naming: agent/{TICKET_KEY}-{slug} (set by the executor)
 * PR title: [{TICKET_KEY}] {ticket.title}
 */
const path = require('path');
const { execSync } = require('child_process');
const config = require('../config');

const REPO_ROOT = path.resolve(__dirname, '../..');

function git(cmd) {
  return execSync(`git ${cmd}`, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
}

function buildBody(ticket, summary, testResults, changedFiles) {
  return [
    '> This PR was created by an AI agent.',
    '',
    `**What**: ${summary.what}`,
    `**Why**: ${summary.why}`,
    `**How**: ${summary.how}`,
    `**What to check**: ${summary.checkPoints}`,
    `**What's left**: ${summary.remaining}`,
    '',
    `Changed files: ${changedFiles.join(', ')}`,
    `Tests: ${testResults || 'n/a'}`,
    '',
    `Jira: ${ticket.key}`,
  ].join('\n');
}

/**
 * @param {object} opts - { branch, ticket, summary, testResults, changedFiles }
 * @returns {Promise<{ prNumber, prUrl, branch }>}
 */
async function createPR({ branch, ticket, summary, testResults, changedFiles = [] }) {
  const title = `[${ticket.key}] ${ticket.title}`;
  const body = buildBody(ticket, summary, testResults, changedFiles);

  if (!config.agent.createRealPr) {
    console.log('\n📦 [PR mock] would open PR:');
    console.log(`   title: ${title}`);
    console.log(`   branch: ${branch}`);
    body.split('\n').forEach((l) => console.log(`   │ ${l}`));
    return { prNumber: null, prUrl: `https://github.com/mock/pull/0 (mock)`, branch, changedFiles };
  }

  // Real PR via gh.
  git(`push -q -u origin ${branch}`);
  let prUrl;
  try {
    prUrl = execSync(
      `gh pr create --base main --head ${branch} --title ${JSON.stringify(title)} --body ${JSON.stringify(body)}`,
      { cwd: REPO_ROOT, encoding: 'utf8' }
    ).trim().split('\n').pop();
  } finally {
    // Restore the working tree to main regardless of outcome.
    git('checkout -q main');
  }
  const prNumber = Number((prUrl.match(/\/pull\/(\d+)/) || [])[1]) || null;
  return { prNumber, prUrl, branch, changedFiles };
}

module.exports = { createPR, buildBody };
