// Barrel export for algo-trade REST API module
export { createServer, stopServer } from './server.js';
export { createAuthMiddleware, createJwt, verifyJwt, generateApiKeyToken } from './auth-middleware.js';
export { createRateLimitMiddleware, checkRateLimit, clearRateLimitState } from './api-rate-limiter-middleware.js';
export {
  handleRequest,
  handleHealth,
  handleStatus,
  handleTrades,
  handlePnl,
  handleStrategyStart,
  handleStrategyStop,
} from './routes.js';
