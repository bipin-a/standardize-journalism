export const TOOLS = [
  {
    name: 'count_records',
    description: 'Count records (meetings, motions, projects, lobbyist activities). Use sum_amount for money-flow totals.',
    parameters: {
      dataset: {
        type: 'string',
        enum: ['capital', 'council', 'lobbyist'],
        description: 'Which dataset to query'
      },
      recordType: {
        type: 'string',
        enum: ['meetings', 'motions', 'projects', 'activities', 'registrations'],
        description: 'What to count'
      },
      years: {
        type: 'array',
        items: { type: 'number' },
        description: 'Years to include (defaults to latest)'
      },
      filters: {
        type: 'object',
        properties: {
          ward: { type: 'number' },
          category: { type: 'string' },
          councillor: { type: 'string' },
          subject: { type: 'string' }
        }
      }
    }
  },
  {
    name: 'sum_amount',
    description: 'Sum spending amounts (capital or money-flow)',
    parameters: {
      dataset: {
        type: 'string',
        enum: ['capital', 'money-flow'],
        description: 'Which dataset'
      },
      flowType: {
        type: 'string',
        enum: ['revenue', 'expenditure'],
        description: 'Required when dataset = money-flow'
      },
      years: {
        type: 'array',
        items: { type: 'number' }
      },
      groupBy: {
        type: 'string',
        enum: ['total', 'ward', 'category', 'program', 'label'],
        description: 'How to group results'
      },
      filters: {
        type: 'object',
        properties: {
          ward: { type: 'number' },
          category: { type: 'string' }
        }
      }
    }
  },
  {
    name: 'budget_balance',
    description: 'Compute budget surplus or deficit (revenue minus expenditure) for a year',
    parameters: {
      year: { type: 'number' }
    }
  },
  {
    name: 'compare_years',
    description: 'Compare metrics across years',
    parameters: {
      dataset: {
        type: 'string',
        enum: ['capital', 'council', 'money-flow', 'lobbyist']
      },
      metric: {
        type: 'string',
        enum: ['total', 'count', 'pass_rate', 'meeting_count', 'average'],
        description: 'What to compare'
      },
      flowType: {
        type: 'string',
        enum: ['revenue', 'expenditure'],
        description: 'Required when dataset = money-flow'
      },
      years: {
        type: 'array',
        items: { type: 'number' },
        minItems: 2
      },
      filters: {
        type: 'object'
      }
    }
  },
  {
    name: 'council_metrics',
    description: 'Get council decision metrics (pass rate, meeting count, motions passed/failed)',
    parameters: {
      year: {
        type: 'number',
        description: 'Year to summarize (defaults to latest)'
      },
      metric: {
        type: 'string',
        enum: ['pass_rate', 'meeting_count', 'total_motions', 'motions_passed', 'motions_failed'],
        description: 'Which council metric to return'
      }
    }
  },
  {
    name: 'top_k',
    description: 'Get top K items by a metric',
    parameters: {
      dataset: {
        type: 'string',
        enum: ['capital', 'council', 'lobbyist', 'money-flow']
      },
      metric: {
        type: 'string',
        enum: ['spending', 'projects', 'motions', 'activity']
      },
      groupBy: {
        type: 'string',
        enum: ['ward', 'category', 'program', 'councillor', 'subject', 'label']
      },
      flowType: {
        type: 'string',
        enum: ['revenue', 'expenditure'],
        description: 'Required when dataset = money-flow'
      },
      year: { type: 'number' },
      k: { type: 'number', default: 5 }
    }
  },
  {
    name: 'procurement_metrics',
    description: 'Fetch procurement totals and concentration from /api/metric',
    parameters: {
      year: { type: 'number' },
      mode: {
        type: 'string',
        enum: ['all', 'competitive', 'noncompetitive'],
        description: 'Which portion of /api/metric to summarize'
      }
    }
  },
  {
    name: 'get_motion_details',
    description: 'Fetch motion details from council voting records (agenda title, vote description, meeting date, outcome)',
    parameters: {
      year: { type: 'number' },
      motionId: { type: 'string' },
      meetingDate: { type: 'string' },
      titleContains: { type: 'string' }
    }
  },
  {
    name: 'glossary_lookup',
    description: 'Look up definitions for city budget terms and line items',
    parameters: {
      term: {
        type: 'string',
        description: 'Term to define (optional; inferred from the question if omitted)'
      }
    }
  },
  {
    name: 'web_lookup',
    description: 'Fetch official public information from allowlisted government sites when local data is missing',
    parameters: {
      query: {
        type: 'string',
        description: 'Search query or topic to look up'
      },
      url: {
        type: 'string',
        description: 'Direct URL to fetch (must be on allowlisted domains)'
      }
    }
  }
]
