/**
 * Atlassian Document Format helper. Jira REST API v3 requires ADF for the
 * description field, not plain text.
 */
function toADF(text) {
  return {
    type: 'doc',
    version: 1,
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: text || '' }],
      },
    ],
  };
}

module.exports = { toADF };
