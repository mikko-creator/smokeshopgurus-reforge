// serve.mjs — preview the built site from a clone, with nothing installed.
//
// The repo carries dist/, so anyone with access can look at the real thing
// without a build, a package manager or the site-reforge skill. Node builtins
// only, no dependencies.
//
//   node tools/serve.mjs            # http://127.0.0.1:8788
//   node tools/serve.mjs --port 9000 --root dist
//
// It resolves a bare path to that directory's index.html, which is how the
// build is laid out (every page is <path>/index.html) and how a real host will
// serve it. Without that, every link in the site 404s locally and the preview
// looks broken when it is not.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const arg = (name, dflt) => {
  const i = process.argv.indexOf('--' + name);
  return i > -1 ? process.argv[i + 1] : dflt;
};
const PORT = Number(arg('port', 8788));
const ROOT = path.resolve(arg('root', 'dist'));

if (!fs.existsSync(ROOT)) {
  console.error('no such directory: ' + ROOT);
  process.exit(2);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new url.URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400); res.end('bad request'); return;
  }

  // Resolve INSIDE the root and verify it stayed there. A request for
  // /../../secrets must not escape the directory being served.
  let file = path.resolve(ROOT, '.' + pathname);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
    res.writeHead(403); res.end('forbidden'); return;
  }

  try {
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      file = path.join(file, 'index.html');
    }
  } catch { /* fall through to the 404 */ }

  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('404 — ' + pathname);
      return;
    }
    res.writeHead(200, {
      'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(buf);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('serving ' + ROOT);
  console.log('  http://127.0.0.1:' + PORT + '/');
  console.log('  ctrl-c to stop');
});
