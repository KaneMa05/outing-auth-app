const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const files = { '/': ['index.html', 'text/html; charset=utf-8'], '/index.html': ['index.html', 'text/html; charset=utf-8'], '/study-share-concept.png': ['study-share-concept.png', 'image/png'] };
http.createServer((req, res) => {
  const route = files[new URL(req.url, 'http://localhost').pathname];
  if (!route || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(404); res.end(); return; }
  fs.readFile(path.join(__dirname, route[0]), (error, data) => {
    if (error) { res.writeHead(500); res.end('Preview unavailable'); return; }
    res.writeHead(200, { 'Content-Type': route[1], 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
}).listen(4318, '127.0.0.1', () => console.log('Study share preview: http://127.0.0.1:4318'));
