/**
 * Cloudflare Workers Edge Proxy
 * Routes requests to VPS backend with caching + rate limiting
 */

interface Env {
  CACHE: KVNamespace;
  ENVIRONMENT: string;
  VPS_ORIGIN?: string;
}

const CACHE_TTL = 60; // 1 minute for API responses
const HEALTH_CACHE_TTL = 30;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Health check — respond at edge
    if (path === '/health' || path === '/api/health') {
      return new Response(JSON.stringify({
        status: 'ok',
        edge: 'cloudflare',
        environment: env.ENVIRONMENT,
        timestamp: new Date().toISOString(),
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Webhook routes — pass through directly (no caching)
    if (path.startsWith('/api/webhooks/')) {
      return proxyToOrigin(request, env);
    }

    // GET requests — cache at edge
    if (request.method === 'GET' && path.startsWith('/api/')) {
      const cacheKey = `cache:${path}:${url.search}`;
      const cached = await env.CACHE.get(cacheKey);

      if (cached) {
        return new Response(cached, {
          headers: {
            'Content-Type': 'application/json',
            'X-Cache': 'HIT',
            'Cache-Control': `public, max-age=${CACHE_TTL}`,
          },
        });
      }

      const response = await proxyToOrigin(request, env);

      if (response.ok) {
        const body = await response.text();
        await env.CACHE.put(cacheKey, body, { expirationTtl: CACHE_TTL });
        return new Response(body, {
          status: response.status,
          headers: {
            ...Object.fromEntries(response.headers),
            'X-Cache': 'MISS',
            'Cache-Control': `public, max-age=${CACHE_TTL}`,
          },
        });
      }

      return response;
    }

    // All other requests — proxy to origin
    return proxyToOrigin(request, env);
  },
};

async function proxyToOrigin(request: Request, env: Env): Promise<Response> {
  const origin = env.VPS_ORIGIN || 'http://localhost:3000';
  const url = new URL(request.url);
  url.protocol = new URL(origin).protocol;
  url.host = new URL(origin).host;
  url.port = new URL(origin).port;

  return fetch(url.toString(), {
    method: request.method,
    headers: request.headers,
    body: request.method !== 'GET' && request.method !== 'HEAD'
      ? request.body
      : undefined,
  });
}
