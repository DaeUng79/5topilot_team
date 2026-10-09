import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Separate origin is intentional: the archive uses absolute /assets/... URLs.
const root = fileURLToPath(new URL('../references/simsaimdang/', import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const target = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    const relative = path.relative(root, target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      res.writeHead(403).end(); return;
    }
    let file = target;
    try { if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html'); }
    catch {
      // Client-only routes /compare, /chat, /vendor/... need the SPA shell.
      if (!path.extname(file)) file = path.join(root, 'index.html');
      else { res.writeHead(404).end(); return; }
    }
    const content = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream' });
    res.end(content);
  } catch { res.writeHead(400).end(); }
});
server.listen(4174, '127.0.0.1', () => console.log('Original design: http://127.0.0.1:4174'));
