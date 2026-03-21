/**
 * Security headers middleware — adds hardening headers to every HTTP response.
 * Covers OWASP top recommendations without any external dependencies.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';

const SECURITY_HEADERS: Record<string, string> = {
  // Prevent MIME-type sniffing
  'X-Content-Type-Options': 'nosniff',
  // Block page from being embedded in frames (clickjacking)
  'X-Frame-Options': 'DENY',
  // Legacy XSS filter for older browsers
  'X-XSS-Protection': '1; mode=block',
  // Force HTTPS for 1 year, include subdomains
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  // Restrict resource origins to same-origin only
  'Content-Security-Policy': "default-src 'self'",
  // Send minimal referrer info on cross-origin requests
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // Deny access to sensitive browser APIs
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

/**
 * Apply all security headers to the outgoing response.
 * Call this at the top of each request handler or register as global middleware.
 */
export function applySecurityHeaders(_req: IncomingMessage, res: ServerResponse): void {
  for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(header, value);
  }
}
