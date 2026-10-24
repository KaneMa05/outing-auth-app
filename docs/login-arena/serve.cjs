// Isolated, read-only preview. Serves only this concept folder, with no app APIs.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.png':'image/png', '.woff':'font/woff', '.woff2':'font/woff2' };
http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400); return res.end(); }
  const filename = path.resolve(__dirname, '.' + (pathname === '/' ? '/index.html' : pathname));
  const type = types[path.extname(filename)];
  if (!filename.startsWith(__dirname + path.sep) || !type || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'");
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(filename).pipe(res);
}).listen(4341, '127.0.0.1', () => console.log('Login concept: http://127.0.0.1:4341'));
