/**
 * Mock extraction — deterministic stand-in for the Claude call so the full
 * pipeline runs offline (MOCK_EXTERNAL=true). Each packet is matched by
 * distinctive substrings and returns the same tasks a good extraction would.
 *
 * Returns tasks WITHOUT chunkId/source attached; the extractor attaches those.
 */
function mockExtract(packet) {
  const text = (packet.rawText || '').toLowerCase();
  const tasks = [];

  if (text.includes('session ttl') || text.includes('login timeout')) {
    tasks.push({
      title: 'Fix session TTL and add keep-alive ping',
      description:
        'Mobile Safari users are logged out after ~5 minutes. Bob committed to increasing the session TTL and adding a keep-alive ping. Flagged as blocking next week’s demo.',
      assignee_hint: 'bob',
      priority: 'high',
      due_hint: 'next week',
      source: 'slack',
      confidence: 'high',
      reasoning: 'Explicit assignment: "Bob can you take that?" plus a deadline.',
    });
  }

  if (text.includes('staging db') || text.includes('out of disk')) {
    tasks.push({
      title: 'Clean up staging DB snapshots and add 80% disk alert',
      description:
        'Staging DB is at 87% capacity. Dave proposed cleaning up old migration snapshots and setting up a disk alert at 80%.',
      assignee_hint: 'dave',
      priority: 'high',
      due_hint: null,
      source: 'slack',
      confidence: 'high',
      reasoning: 'Dave proposed concrete remediation for the disk problem.',
    });
    tasks.push({
      title: 'Bump staging DB volume before next release',
      description:
        'Carol suggested increasing the staging DB volume before the next release to avoid hitting the disk limit again.',
      assignee_hint: 'carol',
      priority: 'medium',
      due_hint: 'before next release',
      source: 'slack',
      confidence: 'medium',
      reasoning: 'Implicit task: "probably worth bumping the volume too".',
    });
  }

  if (text.includes('auth service refactor')) {
    tasks.push({
      title: 'Merge auth service refactor PR',
      description:
        'The auth service refactor PR has been open for two weeks. Bob needs to add integration tests before it can be merged.',
      assignee_hint: 'bob',
      priority: 'medium',
      due_hint: 'end of week',
      source: 'meet',
      confidence: 'high',
      reasoning: 'Bob committed: "I’ll get to it by end of week".',
    });
  }

  if (text.includes('rate limiting')) {
    tasks.push({
      title: 'Implement API rate limiting',
      description:
        'API rate limiting discussed last sprint is still not implemented and is flagged as a security risk. Dave to pick it up and document the limits in the API docs.',
      assignee_hint: 'dave',
      priority: 'high',
      due_hint: null,
      source: 'meet',
      confidence: 'high',
      reasoning: 'Dave volunteered: "I can pick that up"; flagged as a security risk.',
    });
  }

  if (text.includes('error monitoring dashboard') || text.includes('dashboard config')) {
    tasks.push({
      title: 'Fix error monitoring dashboard config',
      description:
        'The error monitoring dashboard has not been updated since switching to the new logger and is showing wrong data. Bob owns the fix this sprint.',
      assignee_hint: 'bob',
      priority: 'medium',
      due_hint: 'this sprint',
      source: 'meet',
      confidence: 'high',
      reasoning: 'Bob committed: "I’ll fix the dashboard config this sprint".',
    });
  }

  if (text.includes('figma')) {
    tasks.push({
      title: 'Update Figma specs for onboarding v2',
      description:
        'The team decided to go with the new onboarding flow for v2. Eve to update the Figma specs.',
      assignee_hint: 'eve',
      priority: 'medium',
      due_hint: null,
      source: 'slack',
      confidence: 'high',
      reasoning: 'Eve committed: "I can do the Figma update".',
    });
    tasks.push({
      title: 'Brief frontend team on onboarding v2',
      description:
        'The frontend team needs to be briefed on the new onboarding flow for v2. Frank agreed to handle it.',
      assignee_hint: 'frank',
      priority: 'medium',
      due_hint: null,
      source: 'slack',
      confidence: 'high',
      reasoning: 'Frank agreed ("Sure") after Eve asked him to brief frontend.',
    });
  }

  return tasks;
}

module.exports = { mockExtract };
