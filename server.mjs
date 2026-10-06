import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { refreshCodex } from './read-codex.mjs';
import { syncUsageFile } from './sync.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const files = new Set(['index.html', 'app.css', 'app.js', 'manifest.webmanifest', 'sw.js', 'icon.svg', 'icon-192.png', 'icon-512.png', 'usage.json']);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
export async function startServer({ port = 8221, host = '0.0.0.0', dataPath = path.join(root, 'usage.json'), phoneSync = true } = {}) {
let refreshing;
const refresh = () => refreshing ??= refreshCodex(dataPath).then(result => {
  if (phoneSync) syncUsageFile(dataPath).then(status => console.log(`[Token Eater] Phone sync: ${status}`))
    .catch(() => console.log('[Token Eater] Phone sync unavailable; the local reading is saved.'));
  return result;
}).finally(() => { refreshing = null; });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/mockup.html') {
    res.writeHead(302, { Location: './?preview=1' }); res.end(); return;
  }
  if (url.pathname === '/api/refresh' && req.method === 'POST') {
    let sameOrigin = true;
    try { if (req.headers.origin) sameOrigin = new URL(req.headers.origin).host === req.headers.host; }
    catch { sameOrigin = false; }
    if (!sameOrigin) {
      res.writeHead(403); res.end(); return;
    }
    try {
      await refresh(); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}');
    } catch { res.writeHead(503); res.end('{"ok":false}'); }
    return;
  }
  const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  if (!files.has(name) || !['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(404); res.end('Not found'); return;
  }
  try {
    const content = await fs.readFile(name === 'usage.json' ? dataPath : path.join(root, name));
    res.writeHead(200, { 'Content-Type': mime[path.extname(name)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch { res.writeHead(404); res.end('Not found'); }
});
await refresh();
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(port, host, resolve);
});
const timer = setInterval(() => refresh().catch(() => {}), 15 * 60000);
server.once('close', () => clearInterval(timer));
return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await startServer();
  console.log('Token Eater: http://localhost:8221/');
}
