import { IncomingMessage, ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

let cachedHtml: string | null = null;

export function handleDashboard(_req: IncomingMessage, res: ServerResponse): void {
  if (!cachedHtml) {
    const dir = dirname(fileURLToPath(import.meta.url));
    cachedHtml = readFileSync(join(dir, 'dashboard.html'), 'utf8');
  }
  res.writeHead(200, {
    'Content-Type': 'text/html',
    'Content-Length': Buffer.byteLength(cachedHtml),
  });
  res.end(cachedHtml);
}
