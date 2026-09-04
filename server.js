'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// Só servimos arquivos dentro dessas pastas, por segurança.
const ALLOWED_DIRS = ['public', 'data'];

function resolveSafePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const relative = decoded === '/' ? '/public/index.html' : decoded;
  // Trabalha sempre com barras "/" (padrão de URL), independente do SO,
  // e só então converte para o separador nativo ao juntar com ROOT.
  const posixNormalized = relative.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  const segments = posixNormalized.split('/').filter(Boolean);
  const topDir = segments[0];
  if (!ALLOWED_DIRS.includes(topDir) || segments.includes('..')) return null;
  const fullPath = path.join(ROOT, ...segments);
  if (!fullPath.startsWith(ROOT)) return null;
  return fullPath;
}

const server = http.createServer((req, res) => {
  const fullPath = resolveSafePath(req.url);
  if (!fullPath) {
    res.writeHead(403);
    res.end('Acesso negado');
    return;
  }

  fs.readFile(fullPath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Arquivo não encontrado. Rode "npm run collect" antes de acessar os dados.');
      return;
    }
    const ext = path.extname(fullPath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
