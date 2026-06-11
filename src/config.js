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
    // Gates auto-approve after a short delay so `npm run demo` runs end-to-end
    // without a human clicking Slack buttons. Set GATE_AUTO_APPROVE=false to
    // wait for real interaction.
    gateAutoApprove: process.env.GATE_AUTO_APPROVE !== 'false',
    gateAutoApproveMs: parseInt(process.env.GATE_AUTO_APPROVE_MS || '8000', 10),
    // When true, external services with missing keys fall back to mock mode.
    mockExternal: process.env.MOCK_EXTERNAL !== 'false',
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
