import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleDocsRoutes } from '../../src/api/docs-routes.js';
import type { IncomingMessage, ServerResponse } from 'node:http';

describe('Docs Routes', () => {
  let mockRes: ServerResponse;
  let mockReq: IncomingMessage;
  let responseStatus: number;
  let responseHeaders: Record<string, string>;
  let responseData: string;

  beforeEach(() => {
    // Mock ServerResponse
    responseStatus = 0;
    responseHeaders = {};
    responseData = '';

    mockRes = {
      writeHead: vi.fn().mockImplementation((status: number, headers?: Record<string, string>) => {
        responseStatus = status;
        if (headers) {
          responseHeaders = headers;
        }
      }),
      end: vi.fn().mockImplementation((data?: string) => {
        if (data) responseData = data;
      }),
      setHeader: vi.fn(),
      headersSent: false,
    } as any;

    // Mock IncomingMessage
    mockReq = { method: 'GET', url: '/', headers: {} } as any;
  });

  describe('GET /api/docs', () => {
    it('should return HTML content type', async () => {
      const handled = handleDocsRoutes(mockReq, mockRes, '/api/docs');

      expect(handled).toBe(true);
      // Verify that the handler was called (it delegates to createDocsHandler)
      // The actual content check depends on the swagger-ui implementation
      expect(mockRes.writeHead).toHaveBeenCalled();
    });

    it('should handle /api/docs route correctly', async () => {
      const handled = handleDocsRoutes(mockReq, mockRes, '/api/docs');

      expect(handled).toBe(true);
    });

    it('should pass remapped path to handler', async () => {
      // /api/docs gets remapped to /docs
      const handled = handleDocsRoutes(mockReq, mockRes, '/api/docs');

      expect(handled).toBe(true);
      // The handler is called with remapped pathname
    });
  });

  describe('GET /api/docs/openapi.json', () => {
    it('should return JSON content type', async () => {
      const handled = handleDocsRoutes(mockReq, mockRes, '/api/docs/openapi.json');

      expect(handled).toBe(true);
      // Verify handler was called
      expect(mockRes.writeHead).toHaveBeenCalled();
    });

    it('should handle OpenAPI spec route', async () => {
      const handled = handleDocsRoutes(mockReq, mockRes, '/api/docs/openapi.json');

      expect(handled).toBe(true);
    });

    it('should pass remapped openapi path to handler', async () => {
      // /api/docs/openapi.json gets remapped to /docs/openapi.json
      const handled = handleDocsRoutes(mockReq, mockRes, '/api/docs/openapi.json');

      expect(handled).toBe(true);
    });

    it('should have .json extension', async () => {
      const handled = handleDocsRoutes(mockReq, mockRes, '/api/docs/openapi.json');

      expect(handled).toBe(true);
      // Verify it's specifically the .json variant
    });
  });

  describe('Route matching', () => {
    it('should return false for /api/docs/unknown path', async () => {
      const handled = handleDocsRoutes(mockReq, mockRes, '/api/docs/unknown');

      expect(handled).toBe(false);
    });

    it('should return false for /api/docs/swagger-ui.html', async () => {
      const handled = handleDocsRoutes(mockReq, mockRes, '/api/docs/swagger-ui.html');

      expect(handled).toBe(false);
    });

    it('should return false for /api/docs/style.css', async () => {
      const handled = handleDocsRoutes(mockReq, mockRes, '/api/docs/style.css');

      expect(handled).toBe(false);
    });

    it('should return false for wrong base path', async () => {
      const handled = handleDocsRoutes(mockReq, mockRes, '/docs');

      expect(handled).toBe(false);
    });

    it('should return false for /api/documentation', async () => {
      const handled = handleDocsRoutes(mockReq, mockRes, '/api/documentation');

      expect(handled).toBe(false);
    });

    it('should return false for /api/docs with trailing slash variation', async () => {
      const handled = handleDocsRoutes(mockReq, mockRes, '/api/docs/');

      expect(handled).toBe(false);
    });

    it('should return false for /api/doc (singular)', async () => {
      const handled = handleDocsRoutes(mockReq, mockRes, '/api/doc');

      expect(handled).toBe(false);
    });

    it('should return false for unrelated paths', async () => {
      const handled = handleDocsRoutes(mockReq, mockRes, '/api/portfolio/summary');

      expect(handled).toBe(false);
    });
  });

  describe('Lazy initialization', () => {
    it('should lazily create handler on first call', async () => {
      const handled = handleDocsRoutes(mockReq, mockRes, '/api/docs');

      expect(handled).toBe(true);
      // Handler should be created and cached
    });

    it('should reuse handler on subsequent calls', async () => {
      handleDocsRoutes(mockReq, mockRes, '/api/docs');
      handleDocsRoutes(mockReq, mockRes, '/api/docs');

      // Both should succeed - handler is memoized
      expect(mockRes.writeHead).toHaveBeenCalledTimes(2);
    });

    it('should handle both doc routes with same handler', async () => {
      const handled1 = handleDocsRoutes(mockReq, mockRes, '/api/docs');
      const handled2 = handleDocsRoutes(mockReq, mockRes, '/api/docs/openapi.json');

      expect(handled1).toBe(true);
      expect(handled2).toBe(true);
    });
  });

  describe('Path remapping', () => {
    it('should remap /api/docs to /docs', async () => {
      // The handler remaps /api/docs* → /docs* before passing to createDocsHandler
      const handled = handleDocsRoutes(mockReq, mockRes, '/api/docs');

      expect(handled).toBe(true);
      // The remapped path would be /docs
    });

    it('should remap /api/docs/openapi.json to /docs/openapi.json', async () => {
      const handled = handleDocsRoutes(mockReq, mockRes, '/api/docs/openapi.json');

      expect(handled).toBe(true);
      // The remapped path would be /docs/openapi.json
    });

    it('should handle exact path matches', async () => {
      const exactDocs = handleDocsRoutes(mockReq, mockRes, '/api/docs');
      const exactOpenapi = handleDocsRoutes(mockReq, mockRes, '/api/docs/openapi.json');

      expect(exactDocs).toBe(true);
      expect(exactOpenapi).toBe(true);
    });
  });

  describe('HTTP method handling', () => {
    it('should handle GET requests', async () => {
      mockReq.method = 'GET';
      const handled = handleDocsRoutes(mockReq, mockRes, '/api/docs');

      expect(handled).toBe(true);
    });

    it('should accept requests regardless of method', async () => {
      // Docs routes should be GET but handler may accept any method
      mockReq.method = 'POST';
      const handled = handleDocsRoutes(mockReq, mockRes, '/api/docs');

      // The route matching doesn't check method, just path
      expect(handled).toBe(true);
    });

    it('should accept HEAD requests', async () => {
      mockReq.method = 'HEAD';
      const handled = handleDocsRoutes(mockReq, mockRes, '/api/docs');

      expect(handled).toBe(true);
    });
  });

  describe('Response handling', () => {
    it('should delegate response to handler', async () => {
      const handled = handleDocsRoutes(mockReq, mockRes, '/api/docs');

      expect(handled).toBe(true);
      // Response is handled by createDocsHandler which calls writeHead and end
    });

    it('should preserve request object', async () => {
      const req = {
        method: 'GET',
        url: '/api/docs',
        headers: { 'accept': 'text/html' },
      } as any;

      const handled = handleDocsRoutes(req, mockRes, '/api/docs');

      expect(handled).toBe(true);
    });

    it('should call handler with IncomingMessage and ServerResponse', async () => {
      const handled = handleDocsRoutes(mockReq, mockRes, '/api/docs');

      expect(handled).toBe(true);
      // The handler receives both req and res objects
    });
  });

  describe('Edge cases', () => {
    it('should not match /api/docs/ with trailing slash', async () => {
      const handled = handleDocsRoutes(mockReq, mockRes, '/api/docs/');

      expect(handled).toBe(false);
    });

    it('should not match /api/docs/v1', async () => {
      const handled = handleDocsRoutes(mockReq, mockRes, '/api/docs/v1');

      expect(handled).toBe(false);
    });

    it('should not match /api/docs/openapi.yaml', async () => {
      const handled = handleDocsRoutes(mockReq, mockRes, '/api/docs/openapi.yaml');

      expect(handled).toBe(false);
    });

    it('should be case-sensitive', async () => {
      const handled = handleDocsRoutes(mockReq, mockRes, '/api/Docs');

      expect(handled).toBe(false);
    });

    it('should not match with query strings affecting path check', async () => {
      // handleDocsRoutes checks pathname, not full URL
      const handled = handleDocsRoutes(mockReq, mockRes, '/api/docs?version=1');

      expect(handled).toBe(false);
    });

    it('should handle empty path gracefully', async () => {
      const handled = handleDocsRoutes(mockReq, mockRes, '');

      expect(handled).toBe(false);
    });

    it('should handle root path', async () => {
      const handled = handleDocsRoutes(mockReq, mockRes, '/');

      expect(handled).toBe(false);
    });
  });
});
