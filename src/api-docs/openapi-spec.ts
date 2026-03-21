// OpenAPI 3.0 specification for algo-trade RaaS platform
// Auto-describes all REST endpoints: /api/*, /admin/*, /docs/*

/** OpenAPI 3.0 document shape (subset sufficient for codegen/Swagger UI) */
export interface OpenApiDocument {
  openapi: string;
  info: { title: string; version: string; description: string };
  servers: Array<{ url: string; description: string }>;
  security: Array<Record<string, string[]>>;
  components: {
    securitySchemes: Record<string, unknown>;
    schemas: Record<string, unknown>;
  };
  paths: Record<string, unknown>;
}

// ─── Reusable schema fragments ────────────────────────────────────────────────

const ErrorSchema = {
  type: 'object',
  properties: {
    error: { type: 'string', example: 'Not Found' },
    message: { type: 'string' },
  },
  required: ['error'],
};

const StrategyNameEnum = {
  type: 'string',
  enum: ['cross-market-arb', 'market-maker', 'grid-trading', 'dca-bot', 'funding-rate-arb'],
};

const StrategyActionResponse = {
  type: 'object',
  properties: {
    ok: { type: 'boolean', example: true },
    strategy: { ...StrategyNameEnum },
    action: { type: 'string', example: 'started' },
  },
  required: ['ok', 'strategy', 'action'],
};

const TradeSchema = {
  type: 'object',
  description: 'Single executed trade record',
  properties: {
    id: { type: 'string' },
    strategy: { type: 'string' },
    side: { type: 'string', enum: ['buy', 'sell'] },
    amount: { type: 'string' },
    price: { type: 'string' },
    fees: { type: 'string' },
    timestamp: { type: 'integer', format: 'int64' },
  },
};

const StrategyListingSchema = {
  type: 'object',
  description: 'Marketplace strategy listing',
  properties: {
    id: { type: 'string', example: 'strat-001' },
    name: { type: 'string', example: 'Grid Master Pro' },
    description: { type: 'string' },
    category: { type: 'string', enum: ['arbitrage', 'market-making', 'trend', 'dca', 'funding'] },
    author: { type: 'string' },
    priceUsdc: { type: 'number', example: 49.99 },
    downloads: { type: 'integer', example: 120 },
    rating: { type: 'number', example: 4.5 },
    createdAt: { type: 'integer', format: 'int64' },
    updatedAt: { type: 'integer', format: 'int64' },
  },
  required: ['id', 'name', 'description', 'category', 'author', 'priceUsdc'],
};

// ─── Path definitions ─────────────────────────────────────────────────────────

const apiPaths = {
  '/api/health': {
    get: {
      tags: ['Public'],
      summary: 'Health check',
      description: 'Returns server liveness and uptime. No auth required.',
      security: [],
      responses: {
        200: {
          description: 'Server is healthy',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status: { type: 'string', example: 'ok' },
                  timestamp: { type: 'integer', format: 'int64', example: 1700000000000 },
                  uptime: { type: 'integer', description: 'Uptime in ms', example: 3600000 },
                },
              },
            },
          },
        },
      },
    },
  },

  '/api/status': {
    get: {
      tags: ['Engine'],
      summary: 'Engine status',
      description: 'Returns running strategies, trade counts, and server uptime.',
      responses: {
        200: {
          description: 'Engine status object',
          content: { 'application/json': { schema: { type: 'object' } } },
        },
        401: { description: 'Missing or invalid X-API-Key' },
      },
    },
  },

  '/api/trades': {
    get: {
      tags: ['Engine'],
      summary: 'Recent trades',
      description: 'Returns last 100 executed trades from the trade log.',
      responses: {
        200: {
          description: 'Trade list',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  trades: { type: 'array', items: TradeSchema },
                  count: { type: 'integer' },
                },
              },
            },
          },
        },
      },
    },
  },

  '/api/pnl': {
    get: {
      tags: ['Engine'],
      summary: 'P&L summary',
      description: 'Aggregates total fees paid and trade counts broken down by strategy.',
      responses: {
        200: {
          description: 'PnL summary',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  totalFees: { type: 'string', example: '0.001234' },
                  tradeCount: { type: 'integer', example: 42 },
                  tradesByStrategy: {
                    type: 'object',
                    additionalProperties: { type: 'integer' },
                    example: { 'grid-trading': 20, 'dca-bot': 22 },
                  },
                },
              },
            },
          },
        },
      },
    },
  },

  '/api/strategy/start': {
    post: {
      tags: ['Strategy'],
      summary: 'Start a strategy',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { name: StrategyNameEnum },
              required: ['name'],
            },
          },
        },
      },
      responses: {
        200: { description: 'Strategy started', content: { 'application/json': { schema: StrategyActionResponse } } },
        400: { description: 'Invalid strategy name', content: { 'application/json': { schema: ErrorSchema } } },
        500: { description: 'Engine error', content: { 'application/json': { schema: ErrorSchema } } },
      },
    },
  },

  '/api/strategy/stop': {
    post: {
      tags: ['Strategy'],
      summary: 'Stop a strategy',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { name: StrategyNameEnum },
              required: ['name'],
            },
          },
        },
      },
      responses: {
        200: { description: 'Strategy stopped', content: { 'application/json': { schema: StrategyActionResponse } } },
        400: { description: 'Invalid strategy name', content: { 'application/json': { schema: ErrorSchema } } },
        500: { description: 'Engine error', content: { 'application/json': { schema: ErrorSchema } } },
      },
    },
  },

  '/api/marketplace': {
    get: {
      tags: ['Marketplace'],
      summary: 'List marketplace strategies',
      parameters: [
        { name: 'q', in: 'query', description: 'Keyword search', schema: { type: 'string' } },
        { name: 'category', in: 'query', description: 'Filter by category', schema: { type: 'string' } },
        { name: 'sortBy', in: 'query', description: 'Sort field', schema: { type: 'string', enum: ['downloads', 'rating', 'price', 'newest'] } },
      ],
      responses: {
        200: {
          description: 'Strategy listings',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  listings: { type: 'array', items: StrategyListingSchema },
                  count: { type: 'integer' },
                },
              },
            },
          },
        },
      },
    },
    post: {
      tags: ['Marketplace'],
      summary: 'Publish a strategy',
      description: 'Creates a new listing in the marketplace.',
      requestBody: {
        required: true,
        content: { 'application/json': { schema: StrategyListingSchema } },
      },
      responses: {
        201: { description: 'Strategy published', content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' }, id: { type: 'string' } } } } } },
        400: { description: 'Validation failed', content: { 'application/json': { schema: ErrorSchema } } },
        500: { description: 'Server error', content: { 'application/json': { schema: ErrorSchema } } },
      },
    },
  },

  '/api/marketplace/{id}/purchase': {
    post: {
      tags: ['Marketplace'],
      summary: 'Purchase a strategy',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { userId: { type: 'string', example: 'user-abc-123' } },
              required: ['userId'],
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Purchase recorded',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  ok: { type: 'boolean' },
                  purchaseId: { type: 'string' },
                  strategyId: { type: 'string' },
                  userId: { type: 'string' },
                  priceUsdc: { type: 'number' },
                },
              },
            },
          },
        },
        400: { description: 'Invalid request', content: { 'application/json': { schema: ErrorSchema } } },
        404: { description: 'Strategy not found', content: { 'application/json': { schema: ErrorSchema } } },
      },
    },
  },

  '/admin/users': {
    get: {
      tags: ['Admin'],
      summary: 'List all users',
      security: [{ AdminKey: [] }],
      responses: {
        200: { description: 'User list' },
        401: { description: 'Invalid X-Admin-Key' },
      },
    },
  },

  '/admin/system': {
    get: {
      tags: ['Admin'],
      summary: 'System overview stats',
      security: [{ AdminKey: [] }],
      responses: {
        200: { description: 'System stats including engine, users, uptime' },
        401: { description: 'Invalid X-Admin-Key' },
      },
    },
  },

  '/admin/maintenance': {
    post: {
      tags: ['Admin'],
      summary: 'Toggle maintenance mode',
      security: [{ AdminKey: [] }],
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { enabled: { type: 'boolean', description: 'If omitted, toggles current state' } },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Maintenance mode updated',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { ok: { type: 'boolean' }, maintenanceMode: { type: 'boolean' } },
              },
            },
          },
        },
        401: { description: 'Invalid X-Admin-Key' },
      },
    },
  },
};

// ─── Public export ────────────────────────────────────────────────────────────

/** Returns the complete OpenAPI 3.0 specification as a plain object */
export function getOpenApiSpec(): OpenApiDocument {
  return {
    openapi: '3.0.3',
    info: {
      title: 'Algo-Trade RaaS API',
      version: '1.0.0',
      description:
        'Remote-as-a-Service API for the algo-trade platform. ' +
        'Provides endpoints for engine control, strategy management, ' +
        'marketplace operations, and admin functions.',
    },
    servers: [
      { url: 'http://localhost:3000', description: 'Local dev server' },
      { url: 'https://api.algo-trade.io', description: 'Production' },
    ],
    security: [{ ApiKey: [] }],
    components: {
      securitySchemes: {
        ApiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API key for authenticated /api/* endpoints',
        },
        AdminKey: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Admin-Key',
          description: 'Admin key required for all /admin/* endpoints',
        },
      },
      schemas: {
        Error: ErrorSchema,
        Trade: TradeSchema,
        StrategyListing: StrategyListingSchema,
        StrategyActionResponse: StrategyActionResponse,
      },
    },
    paths: apiPaths,
  };
}
