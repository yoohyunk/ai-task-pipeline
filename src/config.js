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
    // App-level token (xapp-...) enables Socket Mode → buttons work with no
    // public endpoint / ngrok.
    appToken: process.env.SLACK_APP_TOKEN,
    // Channel to read source conversations from in live ingestion mode.
    // Defaults to the approval channel.
    ingestChannel: process.env.SLACK_INGEST_CHANNEL || process.env.SLACK_APPROVAL_CHANNEL,
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
    // Where task source conversations come from:
    //   'fixtures' (default) — synthetic JSON in fixtures/
    //   'slack'              — live messages from the ingest channel
    ingestSource: process.env.INGEST_SOURCE || 'fixtures',
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

// Each external service goes live only when MOCK_EXTERNAL=false AND its own
// credentials are present; otherwise that service falls back to mock. This lets
// you enable services one at a time (e.g. real Jira while extraction stays
// mock) without needing every key at once. So no key is strictly required —
// we only warn when running live without a Claude key.
if (!config.demo.mockExternal && !config.claude.apiKey) {
  console.warn(
    '[config] MOCK_EXTERNAL=false but no ANTHROPIC_API_KEY — extraction will use mock output.'
  );
}

module.exports = config;
