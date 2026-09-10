import { createServer, request as httpRequest } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Minimal static server for the built SPA that ALSO proxies /api/* to the
 * API service — the browser always talks to one origin, so the login and
 * quote endpoints work exactly as they do under Vite's dev proxy.
 */

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DIST = resolve(__dirname, 'dist');
const API_UPSTREAM = process.env.API_UPSTREAM ?? 'http://api:4000';
const PORT = Number(process.env.PORT ?? 5173);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.map': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

function sendFile(res, filePath) {
  readFile(filePath)
    .then((data) => {
      res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream' });
      res.end(data);
    })
    .catch(() => {
      // SPA fallback: unknown paths render the app (client-side routing).
      readFile(join(DIST, 'index.html'))
        .then((data) => {
          res.writeHead(200, { 'Content-Type': MIME['.html'] });
          res.end(data);
        })
        .catch(() => {
          res.writeHead(404);
          res.end('not found');
        });
    });
}

function proxy(req, res) {
  // Strip the /api prefix: the NestJS routes are mounted at /auth, /quotes.
  const upstream = new URL((req.url ?? '/').replace(/^\/api/, '') || '/', API_UPSTREAM);
  const headers = { ...req.headers, host: upstream.host };
  const proxyReq = httpRequest(upstream, { method: req.method, headers }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxyReq.on('error', () => {
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('API upstream unavailable');
  });
  req.pipe(proxyReq);
}

createServer((req, res) => {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname;
  if (path.startsWith('/api/')) {
    proxy(req, res);
    return;
  }
  const target = resolve(DIST, `.${path}`);
  if (!target.startsWith(DIST)) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  sendFile(res, target === DIST ? join(DIST, 'index.html') : target);
}).listen(PORT, () => {
  console.log(`web serving :${PORT} (api upstream ${API_UPSTREAM})`);
});