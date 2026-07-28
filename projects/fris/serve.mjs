// @ts-check
// Tiny zero-dependency static server for the multi-file browser build.
// (The single file FRIS-Standalone.html needs no server — just double-click it.)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { platform } from 'node:os';

const dir = fileURLToPath(new URL('.', import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
const port = Number(process.env.PORT || 8080);

createServer(async (req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/') p = '/index.html';
  const fp = join(dir, normalize(p).replace(/^(\.\.[/\\])+/, ''));
  if (!fp.startsWith(dir)) { res.writeHead(403); res.end('Forbidden'); return; }
  try {
    const data = await readFile(fp);
    res.writeHead(200, { 'Content-Type': MIME[extname(fp)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${port}`;
  console.log(`FRIS browser build → ${url}  (Ctrl+C to stop)`);
  const opener = platform() === 'win32' ? ['cmd', ['/c', 'start', '', url]] : platform() === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  setTimeout(() => { try { spawn(opener[0], opener[1], { stdio: 'ignore', detached: true }).unref(); } catch { /* open manually */ } }, 500);
});
