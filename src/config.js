require('dotenv').config();

const config = {
  claude: {
    model: 'claude-sonnet-4-6', // single constant, swap here only
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
  },
  jira: {
    baseUrl: process.env.JIRA_BASE_URL,
    email: process.env.JIRA_EMAIL,
    token: process.env.JIRA_API_TOKEN,
    project: process.env.JIRA_PROJECT_KEY || 'TASK',
  },
  slack: {
    botToken: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    approvalChannel: process.env.SLACK_APPROVAL_CHANNEL,
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  demo: {
    // How human approval gates behave:
    //   'auto'  — auto-approve after a short delay (hands-off)
    //   'cli'   — interactive terminal prompts (approve/edit/remove)
    //   'slack' — real Slack message + poll for button clicks
    gateMode: process.env.GATE_MODE || 'auto',
    // 'auto' mode: auto-approve after a short delay so the demo runs end-to-end
    // without a human. Set GATE_AUTO_APPROVE=false to wait for real interaction.
    gateAutoApprove: process.env.GATE_AUTO_APPROVE !== 'false',
    gateAutoApproveMs: parseInt(process.env.GATE_AUTO_APPROVE_MS || '8000', 10),
    // When true, external services with missing keys fall back to mock mode.
    mockExternal: process.env.MOCK_EXTERNAL !== 'false',
  },
  agent: {
    // 'symbolic' — apply pre-canned diffs to demo-app/ (no LLM, offline)
    // 'live'     — Claude generates the code change (needs ANTHROPIC_API_KEY)
    mode: process.env.AGENT_MODE || 'symbolic',
    // How many confirmed tickets the agent processes (keeps demo PR noise low)
    taskLimit: parseInt(process.env.AGENT_TASK_LIMIT || '1', 10),
    // When true, open a real GitHub PR via `gh`; otherwise render the PR to console
    createRealPr: process.env.CREATE_REAL_PR === 'true',
  },
};

// fail fast if critical keys are missing.
// In mock mode (MOCK_EXTERNAL=true, the default) the pipeline runs offline,
// so no real keys are required. Set MOCK_EXTERNAL=false to require live keys.
const required = config.demo.mockExternal ? [] : ['ANTHROPIC_API_KEY'];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing required env var: ${key}`);
}

module.exports = config;
