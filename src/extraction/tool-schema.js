const extractTasksTool = {
  name: 'extract_tasks',
  description:
    'Extract action items from a conversation chunk. Include explicit requests AND implicit ones (unfinished work, problem statements, soft commitments, post-decision follow-ups).',
  input_schema: {
    type: 'object',
    properties: {
      tasks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'One-line summary, max 60 chars' },
            description: { type: 'string', description: 'Full context and background' },
            assignee_hint: {
              type: ['string', 'null'],
              description:
                'Name mentioned or inferred from conversation flow, null if unknown',
            },
            priority: { type: 'string', enum: ['high', 'medium', 'low'] },
            due_hint: { type: ['string', 'null'], description: 'Mentioned deadline or null' },
            source: { type: 'string', enum: ['slack', 'meet', 'calendar'] },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
            reasoning: {
              type: 'string',
              description:
                'Why this is an action item — especially important for implicit ones',
            },
          },
          required: ['title', 'description', 'priority', 'source', 'confidence', 'reasoning'],
        },
      },
    },
    required: ['tasks'],
  },
};

module.exports = { extractTasksTool };
